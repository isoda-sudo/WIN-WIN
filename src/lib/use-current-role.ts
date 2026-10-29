"use client";

import {
  canReadMaster,
  canSeeUnmaskedBank,
  isReadOnlyRole,
  isTaxAdvisor,
} from "~/lib/roles";
import { api } from "~/trpc/react";

/**
 * ログイン中ユーザーのロール由来の画面制御フラグ（users.me を共有キャッシュで利用）。
 * ロール確定前（ready=false）は読み取り専用・マスタ取得不可として扱い、
 * 編集UIの一瞬の出現や禁止されたprocedureの呼び出しを防ぐ。
 */
export function useCurrentRole() {
  const { data: me } = api.users.me.useQuery();
  const role = me?.role;
  return {
    canReadMasterData: me !== undefined && canReadMaster(role),
    canSeeBank: me !== undefined && canSeeUnmaskedBank(role),
    isReadOnly: me === undefined || isReadOnlyRole(role),
    isTaxAdvisor: isTaxAdvisor(role),
    ready: me !== undefined,
    role,
  };
}
