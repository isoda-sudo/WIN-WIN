/** 全ての送信メールの末尾に付ける注意書き（送信専用アドレスのため、返信しても届かない）。 */
export const NO_REPLY_NOTE = "※こちらのアドレスは送信専用アドレスです。";

const TRAILING_SPACE_RE = /\s+$/;

/** 本文の最後に、送信専用アドレスの注意書きを足す（本文が空なら注意書きだけ）。 */
export function appendNoReplyNote(text: string | undefined): string {
  const body = (text ?? "").replace(TRAILING_SPACE_RE, "");
  return body ? `${body}\n\n${NO_REPLY_NOTE}` : NO_REPLY_NOTE;
}
