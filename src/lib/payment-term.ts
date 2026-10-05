// 発注先マスタの支払条件（締め日・支払日）から支払期日を自動計算する。
// 従来は自由記述の文字列を既知パターンとだけ突き合わせていたが、
// 締め日・支払日をプルダウンの構造化データにしたことで全組み合わせを
// 計算できるようになった。

import { isHoliday } from "japanese-holidays";

// 年末年始休業（法律上の祝日ではないが、実務上の休業日として扱う）。
// 「1月5日が日曜日」のようなレアケース（前営業日繰上げがさらに連休と重なる等）
// は自動対応の対象外とし、手動での調整運用に委ねる。
const YEAR_END_START_MONTH = 12;
const YEAR_END_START_DAY = 29;
const NEW_YEAR_END_MONTH = 1;
const NEW_YEAR_END_DAY = 3;
const SUNDAY = 0;
const SATURDAY = 6;

function isYearEndNewYearHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (
    (month === YEAR_END_START_MONTH && day >= YEAR_END_START_DAY) ||
    (month === NEW_YEAR_END_MONTH && day <= NEW_YEAR_END_DAY)
  );
}

function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === SUNDAY || dayOfWeek === SATURDAY) {
    return false;
  }
  if (isYearEndNewYearHoliday(date)) {
    return false;
  }
  return !isHoliday(date);
}

/** 支払期日が土日・祝日・年末年始の場合、直前の営業日まで繰り上げる。 */
function toPrecedingBusinessDay(date: Date): Date {
  const adjusted = new Date(date);
  while (!isBusinessDay(adjusted)) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted;
}

// 締め日は「引渡月末締め」に一本化されているため、選択肢は月末のみ。
// 旧データ（15日締め等）が残っていても、この技術的なドメインには含めない
// （画面上に選択肢として出さず、計算上も常に月末締めとして扱う）。
export const PAYMENT_CLOSING_DAYS = ["末"] as const;
export type PaymentClosingDay = (typeof PAYMENT_CLOSING_DAYS)[number];
const DEFAULT_CLOSING_DAY: PaymentClosingDay = "末";

export const PAYMENT_DUE_DAYS = ["5", "10", "15", "20", "25", "末"] as const;
export type PaymentDueDay = (typeof PAYMENT_DUE_DAYS)[number];
const DEFAULT_DUE_DAY: PaymentDueDay = "末";

// 発注先マスタ・工事計画・支払管理の各画面で新規に選択できる支払日は
// 「5日」「15日」「末日」の3種類のみ（旧データの10日/20日/25日払いは
// withCurrentValueで表示だけ維持し、新規選択肢には出さない）。
export const PAYMENT_DUE_DAY_CHOICES = ["5", "15", "末"] as const;

/** 選択肢に無い現在値（旧データ）を末尾に加えて表示だけ維持する。 */
export function withCurrentValue<T extends string>(
  options: readonly T[],
  current: T
): readonly T[] {
  return options.includes(current) ? options : [...options, current];
}

// 支払月（起算月から何ヶ月後に払うか）: "1"=翌月払い、"2"=翌々月払い
export const PAYMENT_DUE_MONTH_OFFSETS = ["1", "2"] as const;
export type PaymentDueMonthOffset = (typeof PAYMENT_DUE_MONTH_OFFSETS)[number];
const DEFAULT_DUE_MONTH_OFFSET: PaymentDueMonthOffset = "1";

function normalizeClosingDay(
  value: string | null | undefined
): PaymentClosingDay {
  return (PAYMENT_CLOSING_DAYS as readonly string[]).includes(value ?? "")
    ? (value as PaymentClosingDay)
    : DEFAULT_CLOSING_DAY;
}

function normalizeDueDay(value: string | null | undefined): PaymentDueDay {
  return (PAYMENT_DUE_DAYS as readonly string[]).includes(value ?? "")
    ? (value as PaymentDueDay)
    : DEFAULT_DUE_DAY;
}

function normalizeDueMonthOffset(
  value: string | null | undefined
): PaymentDueMonthOffset {
  return (PAYMENT_DUE_MONTH_OFFSETS as readonly string[]).includes(value ?? "")
    ? (value as PaymentDueMonthOffset)
    : DEFAULT_DUE_MONTH_OFFSET;
}

/**
 * 締め日・支払日から表示用ラベルを組み立てる（例: "末","末" → "月末締翌月末払い"）。
 * monthOffsetを省略すると翌月払い（従来通り）になる。
 */
export function paymentTermLabel(
  closingDay: string | null | undefined,
  dueDay: string | null | undefined,
  monthOffset?: string | null
): string {
  const closing = normalizeClosingDay(closingDay);
  const due = normalizeDueDay(dueDay);
  const offset = normalizeDueMonthOffset(monthOffset);
  const closingLabel = closing === "末" ? "月末" : `${closing}日`;
  const offsetLabel = offset === "2" ? "翌々月" : "翌月";
  const dueLabel = due === "末" ? "末" : `${due}日`;
  return `${closingLabel}締${offsetLabel}${dueLabel}払い`;
}

// 逆引き専用の締め日候補。締め日は常に月末締め固定だが、旧データ
// （15日締め等）のラベルからも支払月・支払日だけは正しく復元できるように、
// 正規化を通さない生の文字列比較でここだけ旧値も試す。
const LEGACY_CLOSING_DAYS_FOR_PARSING = ["15", "末"] as const;

function rawPaymentTermLabel(
  closingDay: string,
  dueDay: string,
  monthOffset: string
): string {
  const closingLabel = closingDay === "末" ? "月末" : `${closingDay}日`;
  const offsetLabel = monthOffset === "2" ? "翌々月" : "翌月";
  const dueLabel = dueDay === "末" ? "末" : `${dueDay}日`;
  return `${closingLabel}締${offsetLabel}${dueLabel}払い`;
}

/**
 * 表示ラベル文字列から支払月・支払日を逆引きする（工事計画詳細の発注編集で、
 * 既存の支払条件をプルダウンの初期値に変換するために使う）。締め日は常に
 * 月末締め固定として返す（旧データのラベルでも支払月・支払日だけは正しく
 * 復元し、締め日は自動的に月末締めへ揃える）。一致しない場合は既定値
 * （月末締め/翌月/月末払い）を返す。
 */
export function parsePaymentTermLabel(label: string | null | undefined): {
  closingDay: PaymentClosingDay;
  dueDay: PaymentDueDay;
  monthOffset: PaymentDueMonthOffset;
} {
  for (const closingDay of LEGACY_CLOSING_DAYS_FOR_PARSING) {
    for (const monthOffset of PAYMENT_DUE_MONTH_OFFSETS) {
      for (const dueDay of PAYMENT_DUE_DAYS) {
        if (rawPaymentTermLabel(closingDay, dueDay, monthOffset) === label) {
          return { closingDay: DEFAULT_CLOSING_DAY, dueDay, monthOffset };
        }
      }
    }
  }
  return {
    closingDay: DEFAULT_CLOSING_DAY,
    dueDay: DEFAULT_DUE_DAY,
    monthOffset: DEFAULT_DUE_MONTH_OFFSET,
  };
}

function lastDayOfMonth(year: number, monthIndex0: number): Date {
  // monthIndex0+1 の月の 0 日目 = monthIndex0 月の末日
  return new Date(year, monthIndex0 + 1, 0);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 締め日・支払日（発注先マスタの登録値）と起算日から支払期日を計算する。
 * 締め日は常に月末締めとして扱う。monthOffsetを省略すると翌月払い（従来通り）になる。
 * 計算結果が土日・祝日・年末年始（12/29〜1/3）にあたる場合は、直前の
 * 営業日まで自動的に繰り上げる（「1月5日が日曜日」のような繰上げ後も
 * 別の休日に重なるレアケースは対象外とし、手動運用で調整する）。
 * 締め日・支払日のどちらか一方でも未設定（旧・自由記述時代のデータで
 * 移行未対応）の場合は自動計算せず null を返す（工事計画・支払管理画面
 * での手動入力に委ねる）。
 */
export function calcPaymentDueDate(
  closingDay: string | null | undefined,
  dueDay: string | null | undefined,
  anchor: Date = new Date(),
  monthOffset?: string | null
): string | null {
  if (!(closingDay && dueDay)) {
    return null;
  }
  const due = normalizeDueDay(dueDay);
  const offset = normalizeDueMonthOffset(monthOffset);

  const year = anchor.getFullYear();
  const closingMonth0 = anchor.getMonth();
  const dueMonth0 = closingMonth0 + Number(offset);

  const rawDueDate =
    due === "末"
      ? lastDayOfMonth(year, dueMonth0)
      : new Date(year, dueMonth0, Number(due));

  return toIsoDate(toPrecedingBusinessDay(rawDueDate));
}

/**
 * 支払条件（締め日・支払月・支払日）のプルダウンを変更した際に、表示ラベルと
 * 支払期日を併せて組み立てる。起算日は「本日」（発注先マスタ選択時の自動計算
 * と同じ基準）。工事計画詳細・支払管理の両方から共通で利用する。
 */
export function nextPaymentTermFields(
  closingDay: string,
  dueDay: string,
  monthOffset: string
): { payment: string; paymentDate: string } {
  return {
    payment: paymentTermLabel(closingDay, dueDay, monthOffset),
    paymentDate:
      calcPaymentDueDate(closingDay, dueDay, new Date(), monthOffset) ?? "",
  };
}
