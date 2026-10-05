// 顧客・発注先マスタのTO担当者/CC関係者に共通の型。メール送信フォームの
// 宛先選択肢として使う（各最大MAX_CONTACTS件）。
export interface EmailContact {
  email: string;
  name: string;
  title?: string;
}

export const MAX_CONTACTS = 10;

export function emptyContact(): EmailContact {
  return { name: "", email: "", title: "" };
}

/** DBのjsonbカラム（unknown）を安全にEmailContact[]へ変換する。 */
export function toContactList(value: unknown): EmailContact[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null
    )
    .map((v) => ({
      name: typeof v.name === "string" ? v.name : "",
      email: typeof v.email === "string" ? v.email : "",
      title: typeof v.title === "string" ? v.title : "",
    }));
}
