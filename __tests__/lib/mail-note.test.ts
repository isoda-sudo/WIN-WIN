import { describe, expect, it } from "vitest";
import { appendNoReplyNote, NO_REPLY_NOTE } from "~/lib/mail-note";

describe("appendNoReplyNote", () => {
  it("本文の最後（署名のあと）に、空行を1つ空けて注意書きを付ける", () => {
    expect(appendNoReplyNote("本文\n\n署名\n")).toBe(
      `本文\n\n署名\n\n${NO_REPLY_NOTE}`
    );
  });

  it("本文が空なら注意書きだけになる", () => {
    expect(appendNoReplyNote(undefined)).toBe(NO_REPLY_NOTE);
    expect(appendNoReplyNote("  \n")).toBe(NO_REPLY_NOTE);
  });
});
