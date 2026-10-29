// 初回表示のコンパイル待ちが録画に映らないよう、全画面を先に1回ずつ開いておく
import { authState, BASE } from "./lib.mjs";

const { cookies } = await authState("hiromu.umeda@sun-asterisk.com");
const ck = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
for (const r of [
  "/projects",
  "/orders-list",
  "/reporting/customers",
  "/reporting/vendors",
  "/customers",
  "/vendors",
  "/categories",
  "/banks",
  "/payment-categories",
  "/receipt-categories",
  "/company-accounts",
  "/receipts",
  "/payment",
  "/history",
  "/invite",
  "/security",
  "/login",
  "/login/verify",
  "/forgot-password",
]) {
  const t = Date.now();
  const res = await fetch(BASE + r, {
    headers: { cookie: ck },
    redirect: "manual",
  });
  console.log(r, res.status, Date.now() - t, "ms");
}
