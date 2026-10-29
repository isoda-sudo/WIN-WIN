import {
  authState,
  BASE,
  chk,
  chkWait,
  helpers,
  saveFindings,
  sleep,
  text,
  Video,
  waitIdle,
} from "./lib.mjs";

const v = new Video("11-アカウント発行", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick, closeDlg } = helpers(page);
const D = () => page.locator("[role=dialog]").last();
const acct = (t) => page.locator("tbody tr", { hasText: t }).last();

await v.say(
  "この動画では、アカウント発行の使い方を説明します。新しい利用者の招待と、既存アカウントの管理を、ここで行います。管理者だけが開けます。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 800);
    await p.getByRole("link", { name: "アカウント発行" }).first().click();
    await p.getByText("招待発行フォーム").waitFor({ timeout: 20_000 });
    await sleep(1200);
  }
);
await chkWait("アカウント発行が開く", async () =>
  (await text(page)).includes("招待発行フォーム")
);

await v.say(
  "権限は、管理者、経理、一般社員、閲覧のみ、税理士・社労士の、5種類です。それぞれ、使える画面が違います。",
  async (p) => {
    await v.quiet(3500);
  }
);
{
  const t = await text(page);
  chk(
    "権限の5種類が表示される",
    ["管理者", "経理", "一般社員", "閲覧のみ", "税理士・社労士"].every((k) =>
      t.includes(k)
    )
  );
}

await v.say(
  "氏名と、メールアドレスを入力し、権限を選んで、招待メールを送信します。",
  async (p) => {
    await p
      .locator("main input")
      .nth(0)
      .pressSequentially("デモ 次郎", { delay: 60 });
    await p.locator("main input[type=email]").fill("jiro@demo-corp.example.jp");
    await p.getByRole("radio", { name: /一般社員/ }).click();
    await v.quiet(600);
    await p.getByRole("button", { name: "招待メールを送信" }).click();
    await sleep(3000);
  }
);
await chkWait(
  "招待を発行でき、発行済み招待に表示される",
  async () => (await rowOf("jiro@demo-corp").count()) === 1
);

await v.say(
  "招待を受けた人には、登録用のリンクが、メールで届きます。リンクは、画面からコピーすることもできます。有効期限は、2日間です。",
  async (p) => {
    await v.quiet(3000);
  }
);
{
  const t = await text(page);
  chk(
    "発行済み招待に、権限・状態・有効期限が表示される",
    t.includes("一般社員") && t.includes("有効")
  );
}

await v.say(
  "招待を取り消したいときは、行の右の、取り消しのボタンを押します。",
  async (p) => {
    const b = rowOf("jiro@demo-corp").getByRole("button").last();
    await b.click();
    await sleep(1000);
    const a = p.getByRole("alertdialog");
    if (
      await a
        .waitFor({ timeout: 2000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await a.getByRole("button").last().click();
    }
    await sleep(1800);
  }
);
await chkWait(
  "招待を取り消せる",
  async () => (await rowOf("jiro@demo-corp").count()) === 0
);

await v.say(
  "登録済みのアカウントの一覧です。権限は、ここから変更できます。小林さんを、一般社員から、経理に変えてみます。",
  async (p) => {
    await v.quiet(1000);
    await pick(acct("小林 靖昌").getByRole("combobox").first(), "経理");
    await sleep(2500);
  }
);
await chkWait("権限を変更できる", async () =>
  (await acct("小林 靖昌").innerText()).includes("経理")
);

await v.say(
  "停止を押すと、そのアカウントは、ログインできなくなります。データは残り、再開を押すと、元に戻ります。アカウントの削除は、できません。",
  async (p) => {
    await acct("玉木 宏明").getByRole("button", { name: "停止" }).click();
    await sleep(1000);
    const a = p.getByRole("alertdialog");
    if (
      await a
        .waitFor({ timeout: 2000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await a.getByRole("button", { name: /停止/ }).click();
    }
    await sleep(2200);
  }
);
await chkWait("停止すると、ボタンが再開に変わる", async () =>
  (await acct("玉木 宏明").innerText()).includes("再開")
);
await v.say("再開を押して、元に戻します。", async (p) => {
  await acct("玉木 宏明").getByRole("button", { name: "再開" }).click();
  await sleep(1000);
  const a = p.getByRole("alertdialog");
  if (
    await a
      .waitFor({ timeout: 2000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await a.getByRole("button", { name: /再開/ }).click();
  }
  await sleep(2200);
});
await chkWait("再開すると、有効に戻る", async () =>
  (await acct("玉木 宏明").innerText()).includes("停止")
);

await v.say(
  "メール署名の欄では、そのアカウントでメールを送るとき、本文の末尾に付く署名を、登録できます。",
  async (p) => {
    await acct("小林 靖昌")
      .getByRole("button", { name: /登録|編集/ })
      .first()
      .click();
    await sleep(1200);
    await D()
      .locator("textarea")
      .fill("株式会社WIN WIN\n小林 靖昌\nTEL 075-777-1236");
    await v.quiet(600);
    await D().getByRole("button", { name: "保存" }).click();
    await sleep(2000);
  }
);
await chkWait("メール署名を登録できる", async () =>
  (await acct("小林 靖昌").innerText()).includes("編集")
);

await v.say(
  "2段階認証の欄には、設定の状況が表示されます。スマホを失くした人は、管理者が、ここから2段階認証をリセットできます。リセットすると、次のログインで、設定し直します。以上で、アカウント発行の説明を終わります。",
  async (p) => {
    await v.quiet(3500);
  }
);
saveFindings("11");
await v.close();
