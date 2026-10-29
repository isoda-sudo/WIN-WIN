import { NextResponse } from "next/server";
import { canSeeUnmaskedBank, isTaxAdvisor } from "~/lib/roles";
import type { AuthedUser } from "./session";

const FORBIDDEN_BODY = { error: "この操作を行う権限がありません" };

/**
 * 税理士・社労士（tax_advisor）に開放しないRoute Handler用。顧客情報を含む帳票PDF
 * （見積書・請求書・注文書）や、DBへの書き込みを伴う生成処理を弾く。
 * 認証（401）チェックの直後に呼ぶ。拒否時は403のレスポンスを返す。
 */
export function denyTaxAdvisor(user: AuthedUser): NextResponse | null {
  return isTaxAdvisor(user.role)
    ? NextResponse.json(FORBIDDEN_BODY, { status: 403 })
    : null;
}

/** 全銀CSVなど、非マスクの口座情報を扱うRoute Handler用（admin/accountingのみ）。 */
export function denyUnlessBankAccess(user: AuthedUser): NextResponse | null {
  return canSeeUnmaskedBank(user.role)
    ? null
    : NextResponse.json(FORBIDDEN_BODY, { status: 403 });
}
