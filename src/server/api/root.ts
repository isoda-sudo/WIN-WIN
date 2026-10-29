import { auditLogsRouter } from "~/server/api/routers/audit-logs";
import { banksRouter } from "~/server/api/routers/banks";
import { categoriesRouter } from "~/server/api/routers/categories";
import { companyRouter } from "~/server/api/routers/company";
import { companyAccountsRouter } from "~/server/api/routers/company-accounts";
import { customersRouter } from "~/server/api/routers/customers";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { editLocksRouter } from "~/server/api/routers/edit-locks";
import { estimateFilesRouter } from "~/server/api/routers/estimate-files";
import { invitationsRouter } from "~/server/api/routers/invitations";
import { invoicesRouter } from "~/server/api/routers/invoices";
import { mfaRouter } from "~/server/api/routers/mfa";
import { ordersRouter } from "~/server/api/routers/orders";
import { paymentCategoriesRouter } from "~/server/api/routers/payment-categories";
import { paymentsRouter } from "~/server/api/routers/payments";
import { projectDocumentsRouter } from "~/server/api/routers/project-documents";
import { projectsRouter } from "~/server/api/routers/projects";
import { receiptCategoriesRouter } from "~/server/api/routers/receipt-categories";
import { receiptsRouter } from "~/server/api/routers/receipts";
import { recurringPaymentsRouter } from "~/server/api/routers/recurring-payments";
import { recurringReceiptsRouter } from "~/server/api/routers/recurring-receipts";
import { reportingRouter } from "~/server/api/routers/reporting";
import { transferFeeRulesRouter } from "~/server/api/routers/transfer-fee-rules";
import { usersRouter } from "~/server/api/routers/users";
import { vendorsRouter } from "~/server/api/routers/vendors";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auditLogs: auditLogsRouter,
  banks: banksRouter,
  categories: categoriesRouter,
  company: companyRouter,
  companyAccounts: companyAccountsRouter,
  customers: customersRouter,
  dashboard: dashboardRouter,
  editLocks: editLocksRouter,
  estimateFiles: estimateFilesRouter,
  projectDocuments: projectDocumentsRouter,
  reporting: reportingRouter,
  invitations: invitationsRouter,
  invoices: invoicesRouter,
  mfa: mfaRouter,
  orders: ordersRouter,
  paymentCategories: paymentCategoriesRouter,
  payments: paymentsRouter,
  projects: projectsRouter,
  receiptCategories: receiptCategoriesRouter,
  receipts: receiptsRouter,
  recurringPayments: recurringPaymentsRouter,
  recurringReceipts: recurringReceiptsRouter,
  transferFeeRules: transferFeeRulesRouter,
  users: usersRouter,
  vendors: vendorsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.projects.list();
 *       ^? Project[]
 */
export const createCaller = createCallerFactory(appRouter);
