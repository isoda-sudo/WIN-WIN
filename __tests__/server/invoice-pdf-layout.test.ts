import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { orders, projects } from "~/server/db/schema";
import { COMPANY } from "~/server/pdf/company";
import {
  BOTTOM_MARGIN_PT,
  buildInvoicePDF,
  CONTENT_BOTTOM_Y,
  type CustomLineItem,
} from "~/server/pdf/document";

// 振込先の解決はDB（自社口座マスタ）を読むので、レイアウトの単体テストでは既定値に差し替える
vi.mock("~/server/pdf/invoice-bank", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/server/pdf/invoice-bank")>();
  return {
    ...actual,
    resolveInvoiceBank: () => Promise.resolve(actual.DEFAULT_INVOICE_BANK),
  };
});

type ProjectRow = typeof projects.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

const A4_HEIGHT = 841.89;
const PAGE_RE = /\/Type\s*\/Page[^s]/g;

interface Drawn {
  /** 描画物の下端y（text は描画後のカーソル位置、rect は y+h） */
  bottom: number;
  page: number;
  text?: string;
  x?: number;
  y?: number;
}

/** テスト専用: PDFKit の text / rect 呼び出しを記録する */
function recordDrawing(): { drawn: Drawn[]; restore: () => void } {
  const drawn: Drawn[] = [];
  const pages = new Map<unknown, number>();
  // 1ページに収まる帳票はA4で描画後に用紙高さを詰めて描き直すため、最後の描画（最終出力）だけを残す
  let current: unknown;
  const track = (doc: unknown) => {
    if (doc !== current) {
      current = doc;
      drawn.length = 0;
      pages.clear();
    }
  };
  const pageIndex = (page: unknown): number => {
    if (!pages.has(page)) {
      pages.set(page, pages.size);
    }
    return pages.get(page) as number;
  };
  const proto = PDFDocument.prototype as unknown as Record<
    string,
    (...a: unknown[]) => unknown
  >;
  const origText = proto.text as (...a: unknown[]) => PDFKit.PDFDocument;
  const origRect = proto.rect as (...a: unknown[]) => PDFKit.PDFDocument;
  proto.text = function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    track(this);
    const res = origText.apply(this, args);
    drawn.push({
      bottom: this.y,
      page: pageIndex(this.page),
      text: String(args[0]),
      x: args[1] as number,
      y: args[2] as number,
    });
    return res;
  };
  proto.rect = function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    track(this);
    drawn.push({
      bottom: (args[1] as number) + (args[3] as number),
      page: pageIndex(this.page),
    });
    return origRect.apply(this, args);
  };
  return {
    drawn,
    restore: () => {
      proto.text = origText as unknown as (...a: unknown[]) => unknown;
      proto.rect = origRect as unknown as (...a: unknown[]) => unknown;
    },
  };
}

function project(): ProjectRow {
  return {
    id: 1,
    name: "テスト工事",
    client: "テスト顧客",
    clientCompany: "株式会社テスト",
  } as ProjectRow;
}

function frozenFor(n: number) {
  const items: CustomLineItem[] = Array.from({ length: n }, (_, i) => ({
    name: `工事項目${i + 1}`,
    price: 1000,
    qty: 1,
    unit: "式",
  }));
  const subtotal = n * 1000;
  return {
    dueDate: new Date("2026-11-30"),
    invoiceDate: new Date("2026-10-31"),
    items,
    subtotal,
    tax: subtotal / 10,
    total: subtotal + subtotal / 10,
  };
}

function pageCount(buf: Buffer): number {
  return buf.toString("latin1").match(PAGE_RE)?.length ?? 0;
}

const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) {
    r();
  }
  vi.restoreAllMocks();
});

async function render(n: number) {
  const rec = recordDrawing();
  restores.push(rec.restore);
  const buf = await buildInvoicePDF(
    project(),
    [] as OrderRow[],
    null,
    "WW-202610-001-001",
    frozenFor(n)
  );
  return { buf, drawn: rec.drawn };
}

describe("invoice PDF layout", () => {
  it("bottom margin is at least 10mm（大きすぎないよう12mmに縮小）", () => {
    expect(BOTTOM_MARGIN_PT).toBeGreaterThanOrEqual(28.3);
    expect(CONTENT_BOTTOM_Y).toBeLessThanOrEqual(A4_HEIGHT - 28.3);
  });

  it.each([
    1, 5,
  ])("keeps %i items on one page above the bottom margin", async (n) => {
    const { buf, drawn } = await render(n);
    expect(pageCount(buf)).toBe(1);
    const lowest = Math.max(...drawn.map((d) => d.bottom));
    expect(lowest).toBeLessThanOrEqual(A4_HEIGHT - BOTTOM_MARGIN_PT);
  });

  it("keeps the margin on every page when items overflow to more pages", async () => {
    const { buf, drawn } = await render(40);
    expect(pageCount(buf)).toBeGreaterThan(1);
    for (const d of drawn) {
      expect(d.bottom).toBeLessThanOrEqual(A4_HEIGHT - BOTTOM_MARGIN_PT);
    }
  });

  it("prints the issuer block exactly once and drops the legal-name duplicate", async () => {
    const { drawn } = await render(1);
    const texts = drawn.flatMap((d) => (d.text ? [d.text] : []));
    expect(texts.filter((t) => t === COMPANY.name)).toHaveLength(1);
    expect(
      texts.filter((t) => t.includes(`登録番号　${COMPANY.regNo}`))
    ).toHaveLength(1);
    expect(texts.some((t) => t.includes(COMPANY.legalName))).toBe(false);
  });
});
