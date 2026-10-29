import {
  authState,
  BASE,
  chk,
  chkWait,
  helpers,
  saveFindings,
  sleep,
  Video,
} from "./lib.mjs";

const v = new Video("10-履歴詳細", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick } = helpers(page);
const D = () => page.locator("[role=dialog]").last();

await v.say(
  "この動画では、履歴詳細の使い方を説明します。各画面での、作成、更新、削除の操作が、すべて記録されます。まず、顧客マスタで、電話番号を1件変えてみます。",
  async (p) => {
    await p.goto(`${BASE}/customers`);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(800);
    await rowOf("洛北ハウジング").locator("td").nth(1).click();
    await sleep(1000);
    await D().locator("input[type=tel]").fill("075-999-0001");
    await v.quiet(500);
    await D().getByRole("button", { name: "保存" }).click();
    await sleep(1800);
  }
);
await v.say(
  "履歴詳細を開きます。いま変更した内容が、一番上に、新しい順で表示されます。",
  async (p) => {
    await p
      .locator("[role=dialog]")
      .first()
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
    await p
      .getByRole("link", { name: "履歴詳細" })
      .first()
      .click()
      .catch(async () => {
        await p.getByRole("button", { name: "マスタ設定" }).click();
      });
    await p.waitForURL(/history/);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1200);
  }
);
await chkWait("変更した内容が、履歴の一番上に記録される", async () => {
  const t = await page.locator("tbody tr").first().innerText();
  return t.includes("洛北ハウジング") && t.includes("電話");
});

await v.say(
  "各行には、日時、操作、種別、対象、変更内容、操作者が表示されます。変更内容は、変更前と変更後の値が、文章で残ります。",
  async (p) => {
    await v.quiet(3500);
  }
);
{
  const h = await page.locator("thead").innerText();
  chk(
    "履歴に、日時・操作・種別・対象・変更内容・操作者の列がある",
    ["日時", "操作", "種別", "対象", "変更内容", "操作者"].every((k) =>
      h.includes(k)
    )
  );
}

await v.say(
  "対象画面で、絞り込めます。たとえば、アカウントだけを選ぶと、アカウントの停止や再開の履歴だけが表示されます。",
  async (p) => {
    await pick(p.getByRole("combobox").nth(0), "アカウント");
    await sleep(2500);
  }
);
await chkWait("対象画面で絞り込める", async () => {
  const rows = page.locator("tbody tr");
  const n = await rows.count();
  if (n === 0) {
    return false;
  }
  const t = await page.locator("tbody").innerText();
  return t.includes("アカウント");
});

await v.say(
  "操作でも、絞り込めます。作成、更新、削除から選びます。",
  async (p) => {
    await pick(p.getByRole("combobox").nth(0), "すべて");
    await sleep(1200);
    await p.getByRole("combobox").nth(1).click();
    await sleep(600);
    console.log("OPS", await p.getByRole("option").allInnerTexts());
    await p.getByRole("option", { name: "削除", exact: true }).click();
    await sleep(2500);
  }
);
await chkWait("操作で絞り込める", async () => {
  const t = await page.locator("tbody").innerText();
  return t.includes("削除") && !t.includes("更新");
});

await v.say(
  "件数が多いときは、次の件を表示で、続きを読み込みます。履歴は、自動では削除されず、すべて残ります。",
  async (p) => {
    await p.getByRole("combobox").nth(1).click();
    await sleep(600);
    await p.getByRole("option", { name: "すべて" }).first().click();
    await sleep(1800);
    await p
      .getByRole("button", { name: /次の\d+件を表示/ })
      .click()
      .catch(() => {});
    await sleep(1500);
  }
);
await v.say(
  "なお、閲覧のみのロールは、履歴詳細を見られません。経理と一般社員には、権限のある機能の履歴だけが表示されます。以上で、履歴詳細の説明を終わります。",
  null
);
saveFindings("10");
await v.close();
