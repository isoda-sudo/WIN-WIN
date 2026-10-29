import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { currentFiscalPeriod, fiscalPeriodOfMonth } from "~/lib/fiscal-period";
import {
  buildConcentration,
  type ConcentrationResult,
} from "~/lib/reporting-concentration";
import {
  aggregateByCustomer,
  buildMonthlyTrend,
  buildProfitProjectRows,
  buildTrend,
  customerNameOf,
  isProfitTargetStatus,
  type MonthlyTrendPoint,
  type ProfitCustomerRow,
  type ProfitProjectRow,
  type TrendPoint,
} from "~/lib/reporting-profit";
import { currentYearMonth } from "~/lib/year-month";
import { createTRPCRouter, reportingProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { orders, projects } from "~/server/db/schema";

const periodInput = z.number().int().min(2000).max(2200).optional();

/** 案件の期（決算年）。引渡月が未設定・不正なら null。 */
function periodOfProject(deliveryMonth: string | null): number | null {
  return deliveryMonth ? fiscalPeriodOfMonth(deliveryMonth) : null;
}

/** 非削除・オーダー移行/失注以外の案件に紐づく発注を、案件の期で絞って返す。 */
async function loadTargetOrders(period: number) {
  const rows = await db
    .select({
      category: orders.category,
      decided: orders.decided,
      deliveryMonth: projects.deliveryMonth,
      projectId: orders.projectId,
      status: projects.status,
      vendor: orders.vendor,
    })
    .from(orders)
    .innerJoin(projects, eq(projects.id, orders.projectId))
    .where(isNull(projects.deletedAt));
  return rows.filter(
    (r) =>
      isProfitTargetStatus(r.status) &&
      periodOfProject(r.deliveryMonth) === period
  );
}

export interface CustomerProfitabilityResult {
  availablePeriods: number[];
  customers: ProfitCustomerRow[];
  period: number;
  projects: ProfitProjectRow[];
}

export interface CustomerTrendResult {
  currentPeriod: number;
  /** 絞り込みに使える顧客名（案件のある顧客）。 */
  customers: string[];
  /** 選択した期の月別（4月→3月）。period を渡したときだけ。 */
  monthly: MonthlyTrendPoint[] | null;
  points: TrendPoint[];
}

export interface VendorConcentrationResult extends ConcentrationResult {
  availablePeriods: number[];
  category: string | null;
  period: number;
}

export const reportingRouter = createTRPCRouter({
  /**
   * 顧客別・案件別の粗利率。粗利 = 売上(projects.amount) − 発注の決定金額と振込手数料の合計。
   * 非削除・オーダー移行/失注以外の案件を、引渡月の期で絞る。
   */
  customerProfitability: reportingProcedure
    .input(z.object({ period: periodInput }).optional())
    .query(async ({ input }): Promise<CustomerProfitabilityResult> => {
      const period = input?.period ?? currentFiscalPeriod();
      const [projectRows, costRows] = await Promise.all([
        db
          .select({
            amount: projects.amount,
            client: projects.client,
            clientCompany: projects.clientCompany,
            deliveryMonth: projects.deliveryMonth,
            id: projects.id,
            name: projects.name,
            projectNo: projects.projectNo,
            status: projects.status,
          })
          .from(projects)
          .where(isNull(projects.deletedAt)),
        db
          .select({
            cost: sql<number>`coalesce(sum(coalesce(${orders.decided}, 0) + coalesce(${orders.transferFee}, 0)), 0)::float8`,
            projectId: orders.projectId,
          })
          .from(orders)
          .groupBy(orders.projectId),
      ]);
      const costByProject = new Map(
        costRows.map((c) => [c.projectId, Number(c.cost)])
      );
      const targets = projectRows.filter((p) => isProfitTargetStatus(p.status));
      const availablePeriods = [
        ...new Set(
          targets
            .map((p) => periodOfProject(p.deliveryMonth))
            .filter((v): v is number => v !== null)
        ),
      ].sort((a, b) => b - a);
      const rows = buildProfitProjectRows(
        targets
          .filter((p) => periodOfProject(p.deliveryMonth) === period)
          .map((p) => ({
            client: p.client,
            clientCompany: p.clientCompany,
            cost: costByProject.get(p.id) ?? 0,
            id: p.id,
            name: p.name,
            projectNo: p.projectNo,
            revenue: p.amount,
          }))
      );
      return {
        availablePeriods,
        customers: aggregateByCustomer(rows),
        period,
        projects: rows,
      };
    }),

  /**
   * 顧客別の5年推移（過去3年・今期・来期の見込み）。売上＝契約金額、粗利＝売上−発注の決定金額合計。
   * customer 指定でその顧客だけに絞る。原価は返さない（画面にも出さない）。
   */
  customerTrend: reportingProcedure
    .input(
      z
        .object({
          customer: z.string().nullish(),
          month: z.number().int().min(1).max(12).nullish(),
          period: z.number().int().nullish(),
        })
        .optional()
    )
    .query(async ({ input }): Promise<CustomerTrendResult> => {
      const currentPeriod = currentFiscalPeriod();
      const [projectRows, costRows] = await Promise.all([
        db
          .select({
            amount: projects.amount,
            client: projects.client,
            clientCompany: projects.clientCompany,
            deliveryMonth: projects.deliveryMonth,
            id: projects.id,
            status: projects.status,
          })
          .from(projects)
          .where(isNull(projects.deletedAt)),
        db
          .select({
            cost: sql<number>`coalesce(sum(coalesce(${orders.decided}, 0) + coalesce(${orders.transferFee}, 0)), 0)::float8`,
            projectId: orders.projectId,
          })
          .from(orders)
          .groupBy(orders.projectId),
      ]);
      const costByProject = new Map(
        costRows.map((c) => [c.projectId, Number(c.cost)])
      );
      const targets = projectRows
        .filter((p) => isProfitTargetStatus(p.status))
        .map((p) => ({
          client: p.client,
          clientCompany: p.clientCompany,
          cost: costByProject.get(p.id) ?? 0,
          month: p.deliveryMonth ? Number(p.deliveryMonth.split("-")[1]) : null,
          period: periodOfProject(p.deliveryMonth),
          revenue: p.amount,
        }));
      const customers = [
        ...new Set(targets.map((p) => customerNameOf(p))),
      ].sort((a, b) => a.localeCompare(b, "ja"));
      return {
        currentPeriod,
        customers,
        monthly: input?.period
          ? buildMonthlyTrend(
              targets,
              input.period,
              currentYearMonth(),
              input.customer?.trim() || null
            )
          : null,
        points: buildTrend(
          targets,
          currentPeriod,
          input?.customer?.trim() || null,
          input?.month ?? null
        ),
      };
    }),

  /**
   * 発注先別の発注金額・件数の偏り。発注先なしの発注は除外。
   * category 指定時は orders.category（工種名）で絞る。
   */
  vendorConcentration: reportingProcedure
    .input(
      z
        .object({
          category: z.string().nullish(),
          period: periodInput,
        })
        .optional()
    )
    .query(async ({ input }): Promise<VendorConcentrationResult> => {
      const period = input?.period ?? currentFiscalPeriod();
      const category = input?.category?.trim() || null;
      const periodOrders = await loadTargetOrders(period);
      const scoped = category
        ? periodOrders.filter((o) => o.category === category)
        : periodOrders;
      const monthRows = await db
        .selectDistinct({ deliveryMonth: projects.deliveryMonth })
        .from(projects)
        .where(and(isNull(projects.deletedAt)));
      const availablePeriods = [
        ...new Set(
          monthRows
            .map((m) => periodOfProject(m.deliveryMonth))
            .filter((v): v is number => v !== null)
        ),
      ].sort((a, b) => b - a);
      return {
        ...buildConcentration(
          scoped.map((o) => ({ amount: o.decided, vendor: o.vendor }))
        ),
        availablePeriods,
        category,
        period,
      };
    }),
});
