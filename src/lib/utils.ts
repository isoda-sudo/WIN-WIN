import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 一覧の備考欄などで使う文字数ベースの省略。CSSのtruncate（幅ベース）だと
 * 文字種によって見える文字数が変わってしまうため、文字数を揃えたい箇所で使う。
 */
export function truncateChars(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
