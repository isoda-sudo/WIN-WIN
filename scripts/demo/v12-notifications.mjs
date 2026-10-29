import {
  authState,
  BASE,
  chk,
  chkWait,
  saveFindings,
  sleep,
  Video,
} from "./lib.mjs";

const v = new Video("12-通知", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const bell = () => page.locator("header").getByRole("button", { name: "通知" });
const pop = () => page.locator("[data-slot=popover-content]").last();
const unread = async () => {
  const t = await pop()
    .innerText()
    .catch(() => "");
  return Number(t.match(/未開封\s*(\d+)/)?.[1] ?? 0);
};

await v.say(
  "この動画では、通知の使い方を説明します。画面の右上の、ベルのマークに、未開封の通知の数が表示されます。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1500);
  }
);
await chkWait("ベルのマークに、未開封の件数が表示される", async () =>
  /\d+/.test(
    await bell()
      .innerText()
      .catch(() => "")
  )
);

await v.say(
  "ベルを押すと、通知の一覧が開きます。支払期日の超過、入金期日の超過、着工前の契約未締結など、対応が必要なことが、並びます。",
  async (p) => {
    await bell().click();
    await sleep(1500);
    await v.quiet(2500);
  }
);
await chkWait("通知の一覧が開き、種類ごとの通知が表示される", async () => {
  const t = await pop().innerText();
  return t.includes("支払期日超過") && t.includes("詳細を見る");
});

await v.say(
  "上のタブで、すべてと、未開封を切り替えられます。未開封は、背景の色で、見分けられます。",
  async (p) => {
    await pop()
      .getByRole("button", { name: /^未開封/ })
      .click();
    await sleep(1500);
    await pop().getByRole("button", { name: "すべて", exact: true }).click();
    await sleep(1200);
  }
);

await v.say(
  "通知は、条件を満たしている間は、毎朝10時に、未開封に戻って、もう一度届きます。解決すると、通知は消えます。",
  async (p) => {
    await v.quiet(3500);
  }
);

await v.say(
  "開封済みにするを押すと、その通知は、既読になります。未開封の件数が、ひとつ減ります。",
  async (p) => {
    const before = await unread();
    page.__before = before;
    await pop()
      .getByRole("button", { name: "開封済みにする", exact: true })
      .first()
      .click();
    await sleep(1800);
  }
);
await chkWait(
  "開封済みにすると、未開封の件数が減る",
  async () => (await unread()) === (page.__before ?? 0) - 1
);

await v.say(
  "詳細を見るを押すと、その通知の対象のデータまで、移動します。支払期日の超過なら、支払い予定表の、その支払いが、絞り込まれて表示されます。",
  async (p) => {
    await pop()
      .getByRole("link", { name: "詳細を見る" })
      .first()
      .click()
      .catch(async () => {
        await pop().getByText("詳細を見る").first().click();
      });
    await p.waitForURL(/payment|receipts|orders-list|projects/, {
      timeout: 15_000,
    });
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(2000);
  }
);
chk(
  "詳細を見るで、対象の画面へ移動する",
  /payment|receipts|orders-list|projects/.test(page.url()),
  page.url()
);
await chkWait(
  "移動先は、その通知のデータに絞り込まれている",
  async () => (await page.locator("tbody tr").count()) <= 3
);

await v.say("すべて開封済みにするで、一度に、既読にできます。", async (p) => {
  await bell().click();
  await sleep(1200);
  await pop().getByRole("button", { name: "すべて開封済みにする" }).click();
  await sleep(2000);
});
await chkWait(
  "すべて開封済みにすると、未開封が0件になる",
  async () => (await unread()) === 0
);
await v.say("以上で、通知の説明を終わります。", null);
saveFindings("12");
await v.close();
