import {
  authState,
  BASE,
  chkWait,
  saveFindings,
  sleep,
  text,
  Video,
} from "./lib.mjs";

const v = new Video("13-排他制御", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
// 別の人（経理）の画面。録画には映らない、もう1つのブラウザ
const ctxB = await v.browser.newContext({
  storageState: await authState("demo-keiri@example.com"),
  viewport: { width: 1440, height: 900 },
  locale: "ja-JP",
});
const pageB = await ctxB.newPage();
pageB.setDefaultTimeout(20_000);
const banner = () =>
  page.getByText(/編集中です|画面を閉じました|編集権を取得できません/).first();

await v.say(
  "この動画では、排他制御を説明します。同じ画面を、2人が同時に編集して、お互いの入力を上書きしてしまうことを、防ぐ仕組みです。対象は、受注一覧と工事計画、売上管理表、支払い予定表の3画面です。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1000);
  }
);

await v.say(
  "いま、経理の担当者が、売上管理表を開いて、編集を始めました。",
  async (p) => {
    await pageB.goto(`${BASE}/receipts`);
    await pageB.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(2500);
    await v.quiet(1500);
  }
);

await v.say(
  "私が、同じ売上管理表を開きます。画面の上に、経理の担当者が編集中です、と表示されました。この間、私は、閲覧だけができます。",
  async (p) => {
    await p.getByRole("link", { name: "売上管理表" }).first().click();
    await p.waitForURL(/receipts/);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(2500);
  }
);
await chkWait("他の人が編集中だと、画面に編集中の表示が出る", async () =>
  (await text(page)).includes("編集中です")
);

await v.say(
  "入金ステータスや備考の入力は、できなくなります。アップロードや、新規登録のボタンも、同じです。",
  async (p) => {
    await v.quiet(2500);
  }
);
await chkWait(
  "編集中の間は、入金ステータスの選択が無効になる",
  async () =>
    await page
      .locator("tbody tr")
      .first()
      .getByRole("combobox")
      .last()
      .isDisabled()
      .catch(() => false)
);

await v.say(
  "編集中の表示は、相手が、画面を閉じるか、15分間、何も操作しないと、自動で解除されます。では、経理の担当者が、画面を閉じます。",
  async (p) => {
    await pageB.close({ runBeforeUnload: true });
    await sleep(2000);
  }
);

await v.say(
  "相手が画面を閉じると、20秒ほどで、編集していた人が、画面を閉じました、と表示されます。再読み込みすると、すぐに、私が、編集できるようになります。",
  async (p) => {
    await p.reload();
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(2500);
  }
);
await chkWait(
  "再読み込みすると、編集できるようになる",
  async () =>
    !(
      (await text(page)).includes("編集中です") ||
      (await page
        .locator("tbody tr")
        .first()
        .getByRole("combobox")
        .last()
        .isDisabled()
        .catch(() => true))
    )
);

await v.say(
  "工事計画は、案件ごとに、排他制御がかかります。別の案件なら、同時に編集できます。以上で、排他制御の説明を終わります。",
  async (p) => {
    await v.quiet(2500);
  }
);
await ctxB.close();
saveFindings("13");
await v.close();
