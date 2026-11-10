import type { vendors } from "~/server/db/schema";

type VendorRow = typeof vendors.$inferSelect;

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

const HIRAGANA_RE = /[\u3041-\u3096]/g;
const CSV_SPECIAL_RE = /[",\r\n]/;
const QUOTE_RE = /"/g;

/** ひらがな → 全角カタカナ（支店データの読みが、ひらがなで保存されているため）。 */
function hiraganaToKatakana(input: string): string {
  return input.replace(HIRAGANA_RE, (ch) =>
    String.fromCodePoint((ch.codePointAt(0) ?? 0) + 0x60)
  );
}

/** 読み（ひらがな・全角カナ）を、全銀形式の半角カタカナにする。 */
export function toZenginKana(input: string): string {
  return toHalfWidthKatakana(hiraganaToKatakana(input));
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

function csvField(v: string): string {
  // 仕様書（総合振込csv修正内容1103）どおり、文字列も引用符なし。区切りや引用符を含む場合だけ囲む
  return CSV_SPECIAL_RE.test(v) ? `"${v.replace(QUOTE_RE, '""')}"` : v;
}

function buildRecord(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/** 銀行・支店のコードと半角カナの名称（全銀形式で必要。銀行マスタ・支店データから引く）。 */
export interface BankRef {
  bankCode: string;
  bankKana: string;
  branchCode: string;
  branchKana: string;
}

export const EMPTY_BANK_REF: BankRef = {
  bankCode: "",
  bankKana: "",
  branchCode: "",
  branchKana: "",
};

/** 振込元（依頼人）の情報。ヘッダーレコードに入る。 */
export interface OriginatorInfo extends BankRef {
  accountNumber: string;
  accountType: string;
  /** 振込依頼人コード（会社コード・10桁） */
  code: string;
  /** 依頼人名（半角カナ） */
  name: string;
}

const EMPTY_ORIGINATOR: OriginatorInfo = {
  ...EMPTY_BANK_REF,
  code: "",
  name: "",
  accountType: "",
  accountNumber: "",
};

/**
 * 総合振込CSV（全銀協フォーマットのカンマ区切り版）の本文を組み立てる。
 * 並びは「総合振込csv修正内容1103.xlsx」のとおり。
 *  1行目 ヘッダー: 1,21,0,会社コード,依頼人名,振込日MMDD,出金元の銀行コード,銀行名,支店コード,支店名,科目,口座番号,（空白）
 *  データ行: 2,銀行コード,銀行名,支店コード,支店名,0000,科目,口座番号,受取人名,金額,0,0000000000,（空白）,7,（空白）,（空白）
 *  トレーラー: 8,合計件数,合計金額,（空白）　　エンド: 9,（空白）
 * 銀行名・支店名・受取人名は半角カナ。
 */
export function buildZenginTransferCsv(
  items: {
    vendor: string;
    amount: number;
    vendorRow: VendorRow | null;
    bankRef?: BankRef;
  }[],
  transferDate: Date,
  originator: Partial<OriginatorInfo> = {}
): string {
  const o = { ...EMPTY_ORIGINATOR, ...originator };
  const mmdd = `${String(transferDate.getMonth() + 1).padStart(2, "0")}${String(
    transferDate.getDate()
  ).padStart(2, "0")}`;

  const header = buildRecord([
    RECORD_KIND_HEADER,
    TENSAKI_KUBUN,
    CODE_KUBUN,
    o.code,
    o.name,
    mmdd,
    o.bankCode,
    o.bankKana,
    o.branchCode,
    o.branchKana,
    o.accountType,
    o.accountNumber,
    "",
  ]);

  const dataLines = items.map(({ vendor, amount, vendorRow, bankRef }) => {
    const ref = bankRef ?? EMPTY_BANK_REF;
    return buildRecord([
      RECORD_KIND_DATA,
      ref.bankCode,
      ref.bankKana,
      ref.branchCode,
      ref.branchKana,
      HANDOUT_KIJO_BANGO,
      bankTypeCode(vendorRow?.bankType ?? null),
      vendorRow?.bankNumber || "",
      toHalfWidthKatakana(vendorRow?.bankHolder || vendor),
      String(Math.round(amount)),
      SHINKI_CODE,
      KOKYAKU_BANGO_1_PLACEHOLDER,
      "",
      EDI_KUBUN,
      "",
      "",
    ]);
  });

  const total = items.reduce((s, it) => s + Math.round(it.amount), 0);
  const trailer = buildRecord([
    RECORD_KIND_TRAILER,
    String(items.length),
    String(total),
    "",
  ]);
  const end = buildRecord([RECORD_KIND_END, ""]);

  return `${[header, ...dataLines, trailer, end].join("\r\n")}\r\n`;
}
