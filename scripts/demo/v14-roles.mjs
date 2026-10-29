import { authState, BASE, chk, saveFindings, sleep, Video } from "./lib.mjs";

const v = new Video("14-ロール別の見え方", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const asUser = async (email) => {
  const { cookies } = await authState(email);
  await v.context.clearCookies();
  await v.context.addCookies(cookies);
  await page.goto(`${BASE}/projects`);
  await page.locator("tbody tr").first().waitFor({ timeout: 20_000 });
  await sleep(1500);
};
const nav = async () =>
  (
    await page
      .locator("aside, nav")
      .first()
      .innerText()
      .catch(() => "")
  ).replace(/\s+/g, " ");
const has = async (label) => (await nav()).includes(label);

await v.say(
  "この動画では、ロールごとの、画面の見え方を説明します。ロールは、管理者、経理、一般社員、閲覧のみ、税理士・社労士の、5種類です。まず、管理者です。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1500);
    await p.getByRole("button", { name: "マスタ設定" }).click();
    await sleep(800);
  }
);
chk(
  "管理者は、アカウント発行・履歴詳細・売上管理表・支払い予定表がすべて見える",
  (await has("アカウント発行")) &&
    (await has("履歴詳細")) &&
    (await has("売上管理表")) &&
    (await has("支払い予定表"))
);

await v.say(
  "次に、経理です。請求、支払い、入金を管理するロールです。売上管理表と、支払い予定表が使えます。マスタは、見るだけで、編集できません。アカウント発行は、表示されません。",
  async (p) => {
    await asUser("demo-keiri@example.com");
    await p
      .getByRole("button", { name: "マスタ設定" })
      .click()
      .catch(() => {});
    await sleep(1500);
  }
);
chk(
  "経理は、売上管理表・支払い予定表・履歴が見え、アカウント発行は見えない",
  (await has("売上管理表")) &&
    (await has("支払い予定表")) &&
    (await has("履歴詳細")) &&
    !(await has("アカウント発行"))
);
await v.say(
  "顧客マスタを開くと、新規登録のボタンが、ありません。",
  async (p) => {
    await p.getByRole("link", { name: "顧客マスタ" }).first().click();
    await p.waitForURL(/customers/);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(2000);
  }
);
chk(
  "経理は、顧客マスタに新規登録のボタンが無い",
  (await page.getByRole("button", { name: "新規顧客登録" }).count()) === 0
);

await v.say(
  "一般社員です。案件と工事計画を操作するロールです。売上管理表と、支払い予定表は、表示されません。履歴詳細は、権限のある範囲だけ見られます。",
  async (p) => {
    await asUser("demo-staff@example.com");
    await p
      .getByRole("button", { name: "マスタ設定" })
      .click()
      .catch(() => {});
    await sleep(1500);
  }
);
chk(
  "一般社員は、売上管理表・支払い予定表が見えず、履歴は見える",
  !((await has("売上管理表")) || (await has("支払い予定表"))) &&
    (await has("履歴詳細"))
);

await v.say(
  "閲覧のみです。書き込みは、できません。受注一覧と、工事計画、マスタ、レポーティングを、見るだけです。履歴詳細も、表示されません。",
  async (p) => {
    await asUser("demo-viewer@example.com");
    await p
      .getByRole("button", { name: "マスタ設定" })
      .click()
      .catch(() => {});
    await sleep(1500);
  }
);
chk(
  "閲覧のみは、履歴詳細・売上管理表・支払い予定表が見えない",
  !(
    (await has("履歴詳細")) ||
    (await has("売上管理表")) ||
    (await has("支払い予定表"))
  )
);
await v.say(
  "受注一覧でも、行を追加するボタンが、ありません。行を押しても、編集に入れません。",
  async (p) => {
    await v.quiet(2500);
  }
);
chk(
  "閲覧のみは、受注一覧に行を追加のボタンが無い",
  (await page.getByRole("button", { name: "行を追加" }).count()) === 0
);

await v.say(
  "最後に、税理士・社労士です。受注一覧、工事計画、売上管理表、支払い予定表、レポーティングを、見るだけです。マスタと履歴は、見られません。顧客の個人情報や、口座の全桁も、表示されません。通知も、届きません。",
  async (p) => {
    await asUser("demo-tax@example.com");
    await sleep(1000);
  }
);
chk(
  "税理士は、売上管理表・支払い予定表が見え、マスタ・履歴は見えない",
  (await has("売上管理表")) &&
    (await has("支払い予定表")) &&
    !(await has("マスタ設定")) &&
    !(await has("履歴詳細"))
);
chk(
  "税理士には、通知のベルが出ない",
  (await page
    .locator("header")
    .getByRole("button", { name: "通知" })
    .count()) === 0
);
await v.say("以上で、ロール別の見え方の説明を終わります。", null);
saveFindings("14");
await v.close();
