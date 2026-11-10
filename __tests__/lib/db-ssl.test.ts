import { describe, expect, it } from "vitest";
import { dbSslOption } from "~/lib/db-ssl";

const remote = "postgresql://u:p@aws-1.pooler.supabase.com:6543/postgres";

describe("dbSslOption", () => {
  it("本番で、リモートのDBで、sslmode 指定が無ければ require", () => {
    expect(dbSslOption(remote, "production")).toBe("require");
  });
  it("開発・テストでは、変えない", () => {
    expect(dbSslOption(remote, "development")).toBeUndefined();
    expect(dbSslOption(remote, "test")).toBeUndefined();
  });
  it("接続文字列に sslmode があれば、それに従う", () => {
    expect(
      dbSslOption(`${remote}?sslmode=disable`, "production")
    ).toBeUndefined();
    expect(
      dbSslOption(`${remote}?sslmode=require`, "production")
    ).toBeUndefined();
  });
  it("ローカルのDBは、変えない", () => {
    expect(
      dbSslOption("postgresql://u:p@localhost:5432/db", "production")
    ).toBeUndefined();
    expect(
      dbSslOption("postgresql://u:p@127.0.0.1:5432/db", "production")
    ).toBeUndefined();
  });
  it("不正なURLは、変えない", () => {
    expect(dbSslOption("not a url", "production")).toBeUndefined();
  });
});
