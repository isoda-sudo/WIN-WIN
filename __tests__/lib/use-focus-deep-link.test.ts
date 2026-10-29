import { describe, expect, it } from "vitest";
import { focusHref } from "~/lib/use-focus-deep-link";

describe("focusHref", () => {
  it("対象が無ければリンクだけを返す", () => {
    expect(focusHref("/payment", [])).toBe("/payment");
  });
  it("対象を focus パラメータに載せる（複数はカンマ区切り）", () => {
    expect(focusHref("/payment", ["order-628"], "2026-08")).toBe(
      "/payment?focus=order-628&q=628&month=2026-08"
    );
    expect(focusHref("/projects", ["project-1", "project-2"])).toBe(
      "/projects?focus=project-1%2Cproject-2"
    );
  });
});
