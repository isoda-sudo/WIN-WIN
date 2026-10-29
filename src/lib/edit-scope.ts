/**
 * いま開いている画面の排他制御の範囲（scope）と、この画面（ブラウザのタブ）の識別子。
 * 更新系のAPI呼び出しにヘッダで付け、サーバー側で「他の人が編集中なら拒否」を判定する。
 */
let currentScope: string | null = null;
let clientId: string | null = null;

const STORAGE_KEY = "edit-lock-client-id";

/** タブごとの識別子（タブを閉じるまで同じ。同じユーザーが別タブで開いたときの区別に使う）。 */
export function getEditClientId(): string {
  if (clientId) {
    return clientId;
  }
  let id: string | null = null;
  try {
    id = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // 使えないときは、画面を開いている間だけの識別子にする
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // 保存できなくても動作には影響しない
    }
  }
  clientId = id;
  return id;
}

export function setEditScope(scope: string | null): void {
  currentScope = scope;
}

export function editScopeHeaders(): Record<string, string> {
  return currentScope
    ? {
        "x-edit-client": getEditClientId(),
        "x-edit-scope": currentScope,
      }
    : {};
}
