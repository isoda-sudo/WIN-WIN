import { BASE, chk, saveFindings, Video, waitIdle } from "./lib.mjs";

const v = new Video("01-ログインと基本操作");
const page = await v.open();

await v.say(
  "この動画では、物件管理システムの、ログイン、ログアウト、ヘッダーの基本操作を説明します。まず、ログイン画面です。",
  async (p) => {
    await p.goto(`${BASE}/login`);
    await waitIdle(p);
  }
);
chk(
  "ログイン画面にメール・パスワード欄とログインボタンがある",
  (await page.getByLabel("メールアドレス").isVisible()) &&
    (await page.getByLabel("パスワード").isVisible()) &&
    (await page.getByRole("button", { name: "ログイン" }).isVisible())
);

await v.say(
  "パスワードを間違えると、エラーが表示されます。ここでは、わざと違うパスワードを入力します。",
  async (p) => {
    await p.getByLabel("メールアドレス").fill("hiromu.umeda@sun-asterisk.com");
    await p.getByLabel("パスワード").fill("wrong-password");
    await p.getByRole("button", { name: "ログイン" }).click();
    await p.getByText("正しくありません").waitFor({ timeout: 8000 });
  }
);
chk(
  "誤ったパスワードで、エラーメッセージが出る",
  await page.getByText("正しくありません").isVisible()
);

await v.say(
  "パスワードを忘れた場合は、こちらのリンクから、再設定のメールを依頼できます。",
  async (p) => {
    await p.getByRole("link", { name: "パスワードをお忘れですか" }).click();
    await p.waitForURL(/forgot-password/);
    await waitIdle(p);
  }
);
chk(
  "パスワード再設定の依頼画面が開く",
  page.url().includes("/forgot-password"),
  page.url()
);

await v.say(
  "再設定の依頼画面です。メールアドレスを入力して送信すると、再設定用のリンクが届きます。ログイン画面に戻ります。",
  async (p) => {
    await p
      .getByLabel(/メール/)
      .first()
      .fill("hiromu.umeda@sun-asterisk.com");
    await p.goBack();
    await waitIdle(p);
  }
);

await v.say("正しいパスワードで、ログインします。", async (p) => {
  await p.getByLabel("メールアドレス").fill("hiromu.umeda@sun-asterisk.com");
  await p.getByLabel("パスワード").fill("testpass123");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForURL(/\/projects/, { timeout: 30_000 });
  await waitIdle(p, 1500);
});
chk(
  "ログインすると、受注一覧が開く",
  page.url().includes("/projects"),
  page.url()
);

await v.say(
  "ログインすると、受注一覧が開きます。画面右上に、通知のベル、ログイン中のアカウント、セキュリティ設定、ダークモードの切り替え、ログアウトのボタンが並びます。",
  async (p) => {
    await p.locator("header").hover();
  }
);
for (const name of ["通知", "セキュリティ設定", "ログアウト"]) {
  chk(
    `ヘッダーに「${name}」がある`,
    await page
      .locator("header")
      .getByRole(name === "セキュリティ設定" ? "link" : "button", { name })
      .first()
      .isVisible()
  );
}
chk(
  "ヘッダーにダークモード切替がある",
  await page.locator("header button[aria-label*='モード']").isVisible()
);

await v.say(
  "ダークモードの切り替えボタンを押すと、画面が暗い配色になります。もう一度押すと、元に戻ります。",
  async (p) => {
    await p.locator("header button[aria-label*='モード']").click();
    await v.quiet(1800);
    chk(
      "ダークモードに切り替わる",
      await p.evaluate(() =>
        document.documentElement.classList.contains("dark")
      )
    );
    await p.locator("header button[aria-label*='モード']").click();
    await v.quiet(1200);
    chk(
      "ライトモードに戻る",
      await p.evaluate(
        () => !document.documentElement.classList.contains("dark")
      )
    );
  }
);

await v.say(
  "左のサイドバーには、権限に応じたメニューが並びます。管理者は、すべてのメニューを使えます。",
  async (p) => {
    await p.locator("aside").hover();
    await v.quiet(1200);
  }
);

await v.say(
  "存在しないページを開くと、このようなページが表示されます。ボタンから、受注一覧に戻れます。",
  async (p) => {
    await p.goto(`${BASE}/not-found-sample`);
    await waitIdle(p);
  }
);
chk(
  "存在しないURLで404画面が出る",
  await page.getByText("ページが見つかりません").isVisible()
);
await v.say(
  "ログアウトは、右上のボタンから行います。押すと、ログイン画面に戻ります。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1200);
    await p
      .locator("header")
      .getByRole("button", { name: "ログアウト" })
      .click();
    await p.waitForURL(/\/login/, { timeout: 15_000 });
    await waitIdle(p);
  }
);
chk(
  "ログアウトするとログイン画面に戻る",
  page.url().includes("/login"),
  page.url()
);
await v.say("以上で、ログインと基本操作の説明を終わります。", null);
saveFindings("01");
await v.close();
