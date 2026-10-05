/**
 * ステータス文字列 → 色クラスの対応表。旧app（status-utils.js の STATUS_MAP）を
 * 一次情報として、shadcnのセマンティックトークンでは表現できない
 * 成功(緑)/注意(黄)/危険(赤)の3色を、直接のTailwindユーティリティで再現する。
 * 4画面（受注一覧/工事計画/支払管理/売上・入金管理）が個別に色を持つと変更漏れの
 * 原因になるため、旧appと同じ思想でこの1ファイルに集約する。
 */

const NEUTRAL = "bg-muted text-muted-foreground";
const SUCCESS =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
const WARNING =
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
const DANGER = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
const INFO = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
const LEMON =
  "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-300";

// 受注一覧（projects.status）。契約進捗・入金状況・請求書発行状況は
// データモデル上は1本のステータスとして並列に持ち、プルダウンで直接
// 切り替えられるようにする（自動合成はしない）。
export const PROJECT_STATUS_CLASS: Record<string, string> = {
  未対応: NEUTRAL,
  提案中: INFO,
  見積確認中: INFO,
  // 契約済み：バッジ・行背景ともにレモン黄色（projectRowClassと合わせる）
  受注: LEMON,
  請求書発行済み: INFO,
  // 行全体の背景（レモン黄色、projectRowClass）とは独立して、バッジ自体は薄緑にする
  一部入金済み: SUCCESS,
  全額入金済み: SUCCESS,
  失注: DANGER,
  // 引渡月変更に伴う複製元（旧案件ID）。手動選択はさせず、複製処理からのみ付与される
  オーダー移行: NEUTRAL,
};

/**
 * 受注一覧・売上入金管理の行全体の背景色（バッジの色=PROJECT_STATUS_CLASSとは独立）。
 * 未対応・提案中・見積確認中はデフォルト（白背景・"" ）のまま。
 */
export function projectRowClass(status: string | null | undefined): string {
  switch (status) {
    case "受注": // 契約済み
      return "bg-yellow-50 dark:bg-yellow-950/30";
    case "請求書発行済み":
      return "bg-blue-50 dark:bg-blue-950/30";
    case "一部入金済み":
      return "bg-yellow-50 dark:bg-yellow-950/30";
    case "全額入金済み":
    case "失注":
      return "bg-muted/70 text-muted-foreground/70";
    default:
      return "";
  }
}

// ステータスの進行順（失注・オーダー移行は対象外＝自動遷移を一切行わない）。
const STATUS_ORDER = [
  "未対応",
  "提案中",
  "見積確認中",
  "受注",
  "請求書発行済み",
  "一部入金済み",
  "全額入金済み",
];
const NO_AUTO_TRANSITION = new Set(["失注", "オーダー移行"]);

// 契約済み以降のprojects.status値（受注以降のいずれか＝既に契約が成立している）。
const CONTRACTED_STATUSES = new Set([
  "受注",
  "請求書発行済み",
  "一部入金済み",
  "全額入金済み",
]);

/**
 * 売上・入金管理画面の「契約」表示は、入金状況（payStatus）と情報が重複するため
 * 「契約済み」か「なし」のシンプルな2値のみとする（未対応/提案中/見積確認中/失注は
 * 「なし」扱い）。
 */
export function isContracted(status: string | null | undefined): boolean {
  return Boolean(status && CONTRACTED_STATUSES.has(status));
}

export function simplifiedContractLabel(
  status: string | null | undefined
): string {
  return isContracted(status) ? "契約済み" : "なし";
}

export function simplifiedContractClass(
  status: string | null | undefined
): string {
  return isContracted(status)
    ? SUCCESS
    : "border bg-background text-muted-foreground";
}

/**
 * 契約書アップロード／請求書発行に伴う自動ステータス遷移の後戻り防止ガード。
 * 現在のステータスが遷移先より既に先に進んでいる場合はfalse（自動遷移をスキップ）。
 */
export function shouldAutoAdvance(
  current: string | null | undefined,
  target: string
): boolean {
  if (current && NO_AUTO_TRANSITION.has(current)) {
    return false;
  }
  const curIdx = current ? STATUS_ORDER.indexOf(current) : -1;
  const targetIdx = STATUS_ORDER.indexOf(target);
  return targetIdx > curIdx;
}

// 契約進捗（projects.status）の表示名。データモデル・選択肢の値（PROJECT_STATUS_CLASS
// のキー等）は既存のまま維持し、画面表示のラベルのみをここで変更する。
const PROJECT_STATUS_DISPLAY_LABEL: Record<string, string> = {
  見積確認中: "見積もり提出済み",
  受注: "契約済み",
};

export function projectStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return "-";
  }
  return PROJECT_STATUS_DISPLAY_LABEL[status] ?? status;
}

// 工事計画（orders.status）
export const ORDER_STATUS_CLASS: Record<string, string> = {
  未処理: NEUTRAL,
  見積待ち: WARNING,
  決定済み: INFO,
  発注完了: SUCCESS,
  支払済み: SUCCESS,
};

// 支払管理（orders.paymentStatus / misc_payments.status）
export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  未払い: DANGER,
  部分払い: WARNING,
  支払済み: SUCCESS,
};

// 売上・入金管理（受注一覧のpayStatus相当 / misc_receipts.status）
export const RECEIPT_STATUS_CLASS: Record<string, string> = {
  入金済: SUCCESS,
  一部入金: WARNING,
  未入金: DANGER,
};

export function statusClass(
  map: Record<string, string>,
  status: string | null | undefined,
  fallback = NEUTRAL
): string {
  if (!status) {
    return fallback;
  }
  return map[status] ?? fallback;
}

/**
 * 工事計画の一覧行の状態（旧app buildOrderRow 相当）。
 * - locked: ステータスが「支払済み」＝グレー表示・ステータス編集不可
 * 請書・請求書の未送付/送付済みは、行全体の色付けではなく各ファイル
 * アイコン自体の色（未アップロード=赤、アップロード済み=緑）で表す。
 */
export function orderRowState(status: string | null | undefined): {
  locked: boolean;
  className: string;
} {
  const locked = status === "支払済み";
  return {
    locked,
    className: locked ? "bg-muted/60 text-muted-foreground/70" : "",
  };
}
