import { excelText, needsExcelText } from "~/server/csv/csv-escape";
import type { vendors } from "~/server/db/schema";

type VendorRow = typeof vendors.$inferSelect;

export interface TransferItem {
  amount: number;
  vendor: string;
}

const RECORD_KIND_HEADER = "1";
const RECORD_KIND_DATA = "2";
const RECORD_KIND_TRAILER = "8";
const RECORD_KIND_END = "9";
const TENSAKI_KUBUN = "21"; // 総合振込
const CODE_KUBUN = "0"; // JIS
const HANDOUT_KIJO_BANGO = "0000"; // 手形交換所番号（総合振込では未使用）
const SHINKI_CODE = "0"; // 新規コード（変更なし）
const KOKYAKU_BANGO_1_PLACEHOLDER = "0000000000";
const EDI_KUBUN = "7";

// 全角カタカナ(U+30A1-U+30FC) -> 半角カタカナ(U+FF61-U+FF9F) の変換表。
// 濁点/半濁点付き文字は「基底文字＋濁点/半濁点」の2文字に分解する
// （全銀・銀行間データの半角カナは濁点を独立した1文字として扱うため）。
const FULLWIDTH_KATAKANA_MAP: Record<string, string> = {
  ァ: "ｧ",
  ア: "ｱ",
  ィ: "ｨ",
  イ: "ｲ",
  ゥ: "ｩ",
  ウ: "ｳ",
  ェ: "ｪ",
  エ: "ｴ",
  ォ: "ｫ",
  オ: "ｵ",
  カ: "ｶ",
  ガ: "ｶﾞ",
  キ: "ｷ",
  ギ: "ｷﾞ",
  ク: "ｸ",
  グ: "ｸﾞ",
  ケ: "ｹ",
  ゲ: "ｹﾞ",
  コ: "ｺ",
  ゴ: "ｺﾞ",
  サ: "ｻ",
  ザ: "ｻﾞ",
  シ: "ｼ",
  ジ: "ｼﾞ",
  ス: "ｽ",
  ズ: "ｽﾞ",
  セ: "ｾ",
  ゼ: "ｾﾞ",
  ソ: "ｿ",
  ゾ: "ｿﾞ",
  タ: "ﾀ",
  ダ: "ﾀﾞ",
  チ: "ﾁ",
  ヂ: "ﾁﾞ",
  ッ: "ｯ",
  ツ: "ﾂ",
  ヅ: "ﾂﾞ",
  テ: "ﾃ",
  デ: "ﾃﾞ",
  ト: "ﾄ",
  ド: "ﾄﾞ",
  ナ: "ﾅ",
  ニ: "ﾆ",
  ヌ: "ﾇ",
  ネ: "ﾈ",
  ノ: "ﾉ",
  ハ: "ﾊ",
  バ: "ﾊﾞ",
  パ: "ﾊﾟ",
  ヒ: "ﾋ",
  ビ: "ﾋﾞ",
  ピ: "ﾋﾟ",
  フ: "ﾌ",
  ブ: "ﾌﾞ",
  プ: "ﾌﾟ",
  ヘ: "ﾍ",
  ベ: "ﾍﾞ",
  ペ: "ﾍﾟ",
  ホ: "ﾎ",
  ボ: "ﾎﾞ",
  ポ: "ﾎﾟ",
  マ: "ﾏ",
  ミ: "ﾐ",
  ム: "ﾑ",
  メ: "ﾒ",
  モ: "ﾓ",
  ャ: "ｬ",
  ヤ: "ﾔ",
  ュ: "ｭ",
  ユ: "ﾕ",
  ョ: "ｮ",
  ヨ: "ﾖ",
  ラ: "ﾗ",
  リ: "ﾘ",
  ル: "ﾙ",
  レ: "ﾚ",
  ロ: "ﾛ",
  ワ: "ﾜ",
  ヲ: "ｦ",
  ン: "ﾝ",
  ヴ: "ｳﾞ",
  ー: "ｰ",
  "、": "､",
  "。": "｡",
  "「": "｢",
  "」": "｣",
  "・": "･",
  "　": " ",
};

/** 全角カタカナ・全角記号を半角カタカナに変換する（未対応文字はそのまま残す）。 */
export function toHalfWidthKatakana(input: string): string {
  let out = "";
  for (const ch of input) {
    out += FULLWIDTH_KATAKANA_MAP[ch] ?? ch;
  }
  return out;
}

function bankTypeCode(bankType: string | null): string {
  if (bankType === "普通") {
    return "1";
  }
  if (bankType === "当座") {
    return "2";
  }
  return "";
}

function csvField(v: string, quote: boolean, excelSafe: boolean): string {
  // Excel用: 先頭が0の数字列（口座番号・日付・コード等）は ="..." で文字列として開かせ、桁を落とさない
  if (excelSafe && needsExcelText(v)) {
    return excelText(v);
  }
  return quote ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildRecord(fields: [string, boolean][], excelSafe: boolean): string {
  return fields.map(([v, quote]) => csvField(v, quote, excelSafe)).join(",");
}

export interface OriginatorInfo {
  accountNumber: string;
  accountType: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  code: string;
  name: string;
}

const EMPTY_ORIGINATOR: OriginatorInfo = {
  code: "",
  name: "",
  bankCode: "",
  bankName: "",
  branchCode: "",
  branchName: "",
  accountType: "",
  accountNumber: "",
};

/**
 * 全銀協 総合振込フォーマット（カンマ区切り変形版）のCSV本文を組み立てる。
 * 振込元（委託者）情報は現状アプリに保存先が無いため空欄で出力し、利用者が
 * 手元で補完する前提とする。発注先側も銀行コード・支店コードはマスタに
 * 存在しないため空欄、銀行名・支店名は登録済みの値をそのまま（全角）出力する。
 */
export function buildZenginTransferCsv(
  items: { vendor: string; amount: number; vendorRow: VendorRow | null }[],
  transferDate: Date,
  originator: Partial<OriginatorInfo> = {},
  options: { excelSafe?: boolean } = {}
): string {
  const excelSafe = options.excelSafe === true;
  const o = { ...EMPTY_ORIGINATOR, ...originator };
  const mmdd = `${String(transferDate.getMonth() + 1).padStart(2, "0")}${String(
    transferDate.getDate()
  ).padStart(2, "0")}`;

  const header = buildRecord(
    [
      [RECORD_KIND_HEADER, false],
      [TENSAKI_KUBUN, false],
      [CODE_KUBUN, false],
      [o.code, false],
      [o.name, true],
      [mmdd, false],
      [o.bankCode, false],
      [o.bankName, true],
      [o.branchCode, false],
      [o.branchName, true],
      [o.accountType, false],
      [o.accountNumber, false],
      [" ", true],
    ],
    excelSafe
  );

  const dataLines = items.map(({ vendor, amount, vendorRow }) => {
    const bankName = vendorRow?.bankName || "";
    const branchName = vendorRow?.bankBranch || "";
    const accountType = bankTypeCode(vendorRow?.bankType ?? null);
    const accountNumber = vendorRow?.bankNumber || "";
    const holderName = toHalfWidthKatakana(vendorRow?.bankHolder || vendor);
    return buildRecord(
      [
        [RECORD_KIND_DATA, false],
        ["", false], // 銀行コード（発注先マスタに未登録のため空欄）
        [bankName, true],
        ["", false], // 支店コード（発注先マスタに未登録のため空欄）
        [branchName, true],
        [HANDOUT_KIJO_BANGO, false],
        [accountType, false],
        [accountNumber, false],
        [holderName, true],
        [String(Math.round(amount)), false],
        [SHINKI_CODE, true],
        [KOKYAKU_BANGO_1_PLACEHOLDER, true],
        ["", true],
        [EDI_KUBUN, false],
        [" ", true],
        [" ", true],
      ],
      excelSafe
    );
  });

  const total = items.reduce((s, it) => s + Math.round(it.amount), 0);
  const trailer = buildRecord(
    [
      [RECORD_KIND_TRAILER, false],
      [String(items.length), false],
      [String(total), false],
      [" ", true],
    ],
    excelSafe
  );
  const end = buildRecord(
    [
      [RECORD_KIND_END, false],
      [" ", true],
    ],
    excelSafe
  );

  return `${[header, ...dataLines, trailer, end].join("\r\n")}\r\n`;
}
