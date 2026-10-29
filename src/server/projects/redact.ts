import { canSeeClientPersonalInfo } from "~/lib/roles";

interface ClientPersonalInfo {
  clientAddress?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
}

/**
 * 顧客の個人情報（電話・メール・住所）を、閲覧権限のないロール（税理士・社労士）
 * 向けにnull化して返す。案件行を返す全てのprocedureで通すこと。
 * 会社名（clientCompany）・顧客名（client）は表示に必要なため残す。
 */
export function redactClientPersonalInfo<T extends ClientPersonalInfo>(
  role: string | null | undefined,
  row: T
): T {
  if (canSeeClientPersonalInfo(role)) {
    return row;
  }
  return {
    ...row,
    clientAddress: null,
    clientEmail: null,
    clientPhone: null,
  };
}
