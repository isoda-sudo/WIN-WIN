/**
 * ステータス文字列 → 色クラスの対応表。旧app（status-utils.js の STATUS_MAP）を
 * 一次情報として、shadcnのセマンティックトークンでは表現できない
 * 成功(緑)/注意(黄)/危険(赤)の3色を、直接のTailwindユーティリティで再現する。
 * 4画面（受注一覧/工事計画/支払管理/売上管理表）が個別に色を持つと変更漏れの
 * 原因になるため、旧appと同じ思想でこの1ファイルに集約する。
 */

// 背景は *-200、文字は *-900 の組み合わせでコントラストを確保する（ダークは暗背景+明文字）。
/** 一覧の行をグレーにする背景（支払済み・入金済・全額入金済み・失注）。文字は読める濃さを保つ。 */
const GREY_ROW_CLASS = "bg-muted-foreground/15 text-foreground/80";
/** オーダー移行などの確定行（グレーより一段薄い）。 */
const LOCKED_ROW_CLASS = "bg-muted-foreground/10 text-foreground/80";

const NEUTRAL =
  "bg-gray-200 text-gray-900 dark:bg-gray-700/60 dark:text-gray-100";
const SUCCESS =
  "bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100";
const WARNING =
  "bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-100";
const DANGER = "bg-red-200 text-red-900 dark:bg-red-800/60 dark:text-red-100";
const INFO = "bg-blue-200 text-blue-900 dark:bg-blue-800/60 dark:text-blue-100";
const TEAL = "bg-teal-200 text-teal-900 dark:bg-teal-800/60 dark:text-teal-100";
const LEMON =
  "bg-yellow-200 text-yellow-900 dark:bg-yellow-800/60 dark:text-yellow-100";

/** 受注一覧・売上管理表の行ホバー時の強調。背景色は変えず、赤に近いオレンジの枠だけを出す。 */
/** 期日を過ぎて未入金・未払いの行は、行全体を薄い赤にする（売上管理表・支払い予定表）。 */
export const OVERDUE_ROW_CLASS =
  "bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-950/60";

export const PROJECT_ROW_HOVER_CLASS =
  "hover:outline-solid hover:outline-2 hover:-outline-offset-2 hover:outline-[#ff4500]";

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
  // 分割請求の一部が入金された状態（最後の請求書以外は入金済み）
  分割入金済み: TEAL,
  全額入金済み: SUCCESS,
  失注: DANGER,
  // 引渡月変更に伴う複製元（旧案件ID）。手動選択はさせず、複製処理からのみ付与される
  オーダー移行: NEUTRAL,
};

/**
 * 受注一覧・売上管理表の行全体の背景色（バッジの色=PROJECT_STATUS_CLASSとは独立）。
 * 未対応・提案中・見積確認中はデフォルト（白背景・"" ）のまま。
 */
export function projectRowClass(status: string | null | undefined): string {
  switch (status) {
    case "受注": // 契約済み
      return "bg-yellow-50 dark:bg-yellow-950/30";
    case "請求書発行済み":
    case "分割入金済み":
      return "bg-blue-50 dark:bg-blue-950/30";
    case "全額入金済み":
    case "失注":
      return GREY_ROW_CLASS;
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
  "分割入金済み",
  "全額入金済み",
];
/** 見積書のダウンロード／メール送信で進む先（画面表示は「見積書提出済み」）。 */
export const ESTIMATE_SUBMITTED_STATUS = "見積確認中";

const NO_AUTO_TRANSITION = new Set(["失注", "オーダー移行"]);

// 契約済み以降のprojects.status値（受注以降のいずれか＝既に契約が成立している）。
const CONTRACTED_STATUSES = new Set([
  "受注",
  "請求書発行済み",
  "分割入金済み",
  "全額入金済み",
]);

/**
 * 売上管理表画面の「契約」表示は、入金状況（payStatus）と情報が重複するため
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
  見積確認中: "見積書提出済み",
  受注: "契約済み",
};

export function projectStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return "-";
  }
  return PROJECT_STATUS_DISPLAY_LABEL[status] ?? status;
}

// 受注一覧で手動設定できる初期段階のステータス（DB値）。契約済み以降は
// 契約書アップロード・請求書発行・入金ステータスの変更で進むため手動では選ばせない。
export const MANUAL_STATUS_OPTIONS = [
  "未対応",
  "提案中",
  "見積確認中",
  "失注",
] as const;

const MANUAL_STATUS_SET: ReadonlySet<string> = new Set(MANUAL_STATUS_OPTIONS);

export function isManualStatus(status: string | null | undefined): boolean {
  return Boolean(status && MANUAL_STATUS_SET.has(status));
}

/**
 * 現在のステータスが手動変更可能な段階か。未設定は可。契約済み・請求書発行済み・
 * 入金済み・オーダー移行は自動遷移のみ（手動不可）。
 */
export function canChangeStatusManually(
  current: string | null | undefined
): boolean {
  return !current || MANUAL_STATUS_SET.has(current);
}

/**
 * UIのプルダウン用の選択肢。手動変更可能な段階なら MANUAL_STATUS_OPTIONS、
 * 契約済み以降なら現在値のみ（変更不可）を返す。
 */
export function manualStatusOptionsFor(
  current: string | null | undefined
): readonly string[] {
  if (canChangeStatusManually(current)) {
    return MANUAL_STATUS_OPTIONS;
  }
  return current ? [current] : MANUAL_STATUS_OPTIONS;
}

/**
 * 手動のステータス変更を検証する。許可なら null、不可ならエラーメッセージ（日本語）。
 * 同じ値への「変更」は変更なしとして許可する。
 */
export function manualStatusChangeError(
  current: string | null | undefined,
  next: string | null | undefined
): string | null {
  if (next === "" && (current ?? "") !== "") {
    return "ステータスを空にすることはできません";
  }
  if (!next || next === (current ?? "")) {
    return null;
  }
  if (!canChangeStatusManually(current)) {
    return "契約済み以降のステータスは手動では変更できません。契約書のアップロード、請求書の発行、売上管理表の入金ステータスで更新されます";
  }
  if (!isManualStatus(next)) {
    return "手動で設定できるステータスは 未対応・提案中・見積書提出済み・失注 のみです。契約済み以降は契約書のアップロード、請求書の発行、売上管理表の入金ステータスで更新されます";
  }
  return null;
}

// 工事計画（orders.status）
export const ORDER_STATUS_CLASS: Record<string, string> = {
  未処理: NEUTRAL,
  見積待ち: WARNING,
  決定済み: INFO,
  発注完了: SUCCESS,
  支払済み: SUCCESS,
};

// 支払管理（orders.paymentStatus / misc_payments.status）。DB値は「未払い」のまま、
// 画面表示も「未払い」（黄）。支払済みはグレー。
export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  未払い: LEMON,
  予定: LEMON,
  支払済み: NEUTRAL,
};

/** 支払い予定表の行全体の背景。支払済みの行はグレーにする。 */
export function paymentRowClass(status: string | null | undefined): string {
  return normalizePaymentStatus(status) === "支払済み" ? GREY_ROW_CLASS : "";
}

/**
 * 支払ステータスは「未払い」「支払済み」の2つだけ。空・旧値・内部値「予定」は未払いとして扱う。
 */
export function normalizePaymentStatus(
  status: string | null | undefined
): "未払い" | "支払済み" {
  return status === "支払済み" ? "支払済み" : "未払い";
}

/** 絞り込みの選択肢の表示名（「すべて」はそのまま、他は支払ステータスの表示名）。 */
export function paymentFilterLabel(option: string): string {
  return option === "すべて" ? option : paymentStatusLabel(option);
}

/** 支払ステータスの表示名（未払い / 支払済み の2つ）。 */
export function paymentStatusLabel(status: string | null | undefined): string {
  return normalizePaymentStatus(status);
}

// 売上管理表（受注一覧のpayStatus相当）。入金ステータスは
// 「未入金」「分割入金済」「入金済」の3つ（工事外売上は「未入金」「入金済」の2つ）。支払予定表（PAYMENT_STATUS_CLASS）と配色を揃える：
// 未入金=黄、入金済=グレー。
export const RECEIPT_STATUS_CLASS: Record<string, string> = {
  未入金: LEMON,
  分割入金済: TEAL,
  入金済: NEUTRAL,
};

/**
 * 入金ステータスは「未入金」「入金済」の2つだけ。空・旧値（一部入金など）は未入金として扱う。
 */
export function normalizeReceiptStatus(
  status: string | null | undefined
): "未入金" | "入金済" {
  return status === "入金済" ? "入金済" : "未入金";
}

/** 売上管理表の行全体の背景。入金済の行はグレーにする（paymentRowClass と同じ）。 */
export function receiptRowClass(status: string | null | undefined): string {
  return normalizeReceiptStatus(status) === "入金済" ? GREY_ROW_CLASS : "";
}

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
    className: locked ? LOCKED_ROW_CLASS : "",
  };
}
