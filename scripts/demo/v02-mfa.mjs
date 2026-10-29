import {
  BASE,
  chk,
  chkWait,
  rawSleep,
  saveFindings,
  sleep,
  text,
  totp,
  Video,
  waitIdle,
} from "./lib.mjs";

const EMAIL = "demo-tax@example.com"; // 2段階認証の流れを見せる確認用アカウント（録画用の複製DBのみ）
const v = new Video("02-2段階認証");
const page = await v.open();
const login = async (email = EMAIL) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("testpass123");
  await page.getByRole("button", { name: "ログイン" }).click();
};
const logout = async () => {
  await page
    .locator("header")
    .getByRole("button", { name: "ログアウト" })
    .click();
  await page.waitForURL(/login/);
  await waitIdle(page, 600);
};
/** 同じ時間枠のコードは再利用できないため、前回と違う枠のコードが出るまで待つ。 */
let lastCode = "";
const freshCode = async (secret) => {
  for (let i = 0; i < 70; i++) {
    const c = totp(secret);
    if (c !== lastCode) {
      lastCode = c;
      return c;
    }
    await rawSleep(1000);
  }
  throw new Error("新しいコードが出ません");
};
let secret = "";
let recovery = [];

await v.say(
  "この動画では、2段階認証の使い方を説明します。2段階認証は、パスワードに加えて、スマホの認証アプリの6桁のコードでログインする仕組みです。まず、ログインします。",
  async () => {
    await login();
    await page.waitForURL(/projects|reporting/, { timeout: 30_000 });
    await waitIdle(page, 800);
  }
);

await v.say(
  "右上の盾のアイコンから、セキュリティ設定を開きます。2段階認証は、いまは未設定です。",
  async () => {
    await page
      .locator("header")
      .getByRole("link", { name: "セキュリティ設定" })
      .click();
    await page.waitForURL(/security/);
    await waitIdle(page, 1000);
  }
);
await chkWait("セキュリティ設定で、2段階認証が未設定と表示される", async () =>
  (await text(page)).includes("未設定")
);

await v.say(
  "設定するには、2段階認証を設定する、を押します。QRコードと、手入力用のセットアップキーが表示されます。スマホのGoogle Authenticatorなどで、QRコードを読み取ります。",
  async () => {
    await page.getByRole("button", { name: "2段階認証を設定する" }).click();
    await sleep(2500);
    secret = (await text(page))
      .match(/(?:[A-Z2-7]{4} ){7}[A-Z2-7]{4}/)[0]
      .replace(/ /g, "");
  }
);
chk(
  "設定開始でQRコードとセットアップキーが表示される",
  secret.length === 32 &&
    (await page.locator("main img, main svg, main canvas").first().isVisible())
);

await v.say(
  "アプリに表示された6桁のコードを入力して、設定を完了するを押します。",
  async () => {
    await page.getByPlaceholder("123456").fill(await freshCode(secret));
    await page.getByRole("button", { name: "設定を完了する" }).click();
    await page
      .getByText("リカバリーコード")
      .first()
      .waitFor({ timeout: 15_000 });
  }
);
recovery = (await text(page)).match(/[A-Z0-9]{5}-[A-Z0-9]{5}/g) ?? [];
chk(
  "設定完了でリカバリーコードが8件表示される",
  recovery.length === 8,
  `${recovery.length}件`
);

await v.say(
  "リカバリーコードが8件表示されます。スマホを失くしたときに、1回ずつ使えるコードです。この画面を閉じると、二度と表示されません。印刷するか、パスワード管理アプリなどに保管してください。保管しました、を押して進みます。",
  async () => {
    await v.untilEnd(-300);
    await page.getByRole("button", { name: "保管しました" }).click();
    await sleep(1200);
  }
);
chk(
  "2段階認証が有効になり、リカバリーコード残りが8件と表示される",
  (await text(page)).includes("有効") && (await text(page)).includes("8件")
);

await v.say(
  "設定が済むと、状態が有効になります。登録しているスマホは1台目で、リカバリーコードの残りは8件です。スマホは、1人2台まで登録できます。",
  async () => {
    await page.locator("main").first().hover();
    await v.quiet(1500);
  }
);

await v.say(
  "ここで、ログアウトして、ログインし直します。パスワードを入力すると、続けて、認証コードの入力画面が出ます。",
  async () => {
    await logout();
    await login();
    await page.waitForURL(/verify/, { timeout: 15_000 });
    await waitIdle(page, 800);
  }
);
chk(
  "2段階認証が有効なアカウントは、パスワードの次にコード入力画面へ進む",
  page.url().includes("/verify"),
  page.url()
);

await v.say(
  "コードを間違えると、あと何回まで入力できるかが表示されます。連続で間違えると、一定時間、ロックされます。",
  async () => {
    await page.getByPlaceholder("123456").fill("000000");
    await page.getByRole("button", { name: "確認" }).click();
    await page.getByText(/コードが正しくありません/).waitFor({ timeout: 8000 });
  }
);
chk(
  "誤ったコードで残り回数が表示される",
  /あと\d回/.test(await text(page, "body"))
);

await v.say(
  "アプリに表示されている、正しい6桁のコードを入力して、確認を押すと、ログインできます。",
  async () => {
    await page.getByPlaceholder("123456").fill(await freshCode(secret));
    await page.getByRole("button", { name: "確認" }).click();
    await page.waitForURL(/projects|reporting/, { timeout: 20_000 });
    await waitIdle(page, 800);
  }
);
chk(
  "正しいコードでログインできる",
  /projects|reporting/.test(page.url()),
  page.url()
);

await v.say(
  "スマホが使えないときは、コード入力画面の下にある、スマホが使えない場合、を押して、リカバリーコードでログインできます。もう一度、ログアウトして試します。",
  async () => {
    await logout();
    await login();
    await page.waitForURL(/verify/, { timeout: 15_000 });
    await waitIdle(page, 600);
    await page.getByText("スマホが使えない場合").first().click();
    await sleep(800);
  }
);

await v.say(
  "リカバリーコードを1つ入力します。このコードは、1回しか使えません。",
  async () => {
    await page
      .getByPlaceholder(/XXXXX|-/)
      .first()
      .fill(recovery[0])
      .catch(async () => {
        await page.locator("input").first().fill(recovery[0]);
      });
    await page
      .getByRole("button", { name: /確認|ログイン/ })
      .first()
      .click();
    await page.waitForURL(/security|projects|reporting/, { timeout: 20_000 });
    await waitIdle(page, 1000);
  }
);
chk(
  "リカバリーコードでログインできる",
  /security|projects|reporting/.test(page.url()),
  page.url()
);

await v.say(
  "リカバリーコードでログインすると、セキュリティ設定が開き、新しいスマホへの移行方法が案内されます。",
  async () => {
    await page.goto(`${BASE}/security`);
    await waitIdle(page, 1000);
  }
);
chk("リカバリーコードの残りが7件になる", (await text(page)).includes("7件"));
chk(
  "リカバリーコードでログインした直後は、案内が表示される",
  /リカバリーコード/.test(await text(page))
);

await v.say(
  "機種変更のときは、新しいスマホを追加してから、古いスマホを削除します。スマホを追加、を押し、見分けるための名前を入れて、QRコードを表示します。",
  async () => {
    await page.getByRole("button", { name: "スマホを追加" }).click();
    await sleep(800);
    await page.getByPlaceholder("例: 新しいiPhone").fill("新しいiPhone");
    await page.getByRole("button", { name: "QRコードを表示" }).click();
    await sleep(2500);
  }
);
const secret2 = ((await text(page)).match(/(?:[A-Z2-7]{4} ){7}[A-Z2-7]{4}/) ?? [
  "",
])[0].replace(/ /g, "");
chk(
  "スマホの追加で、新しいセットアップキーが表示される",
  secret2.length === 32 && secret2 !== secret
);

await v.say(
  "新しいスマホで読み取ったコードを入力すると、2台目として登録されます。",
  async () => {
    await page.getByPlaceholder("123456").fill(await freshCode(secret2));
    await page
      .getByRole("button", { name: /設定を完了|追加/ })
      .first()
      .click();
    await sleep(3500);
  }
);
await chkWait("2台目が登録される（2/2台）", async () =>
  /2\/2台/.test(await text(page))
);
chk(
  "2台登録済みだと、スマホを追加のボタンが押せない",
  !(await page
    .getByRole("button", { name: "スマホを追加" })
    .isEnabled()
    .catch(() => false))
);

await v.say(
  "2台登録すると、これ以上は追加できません。古いスマホは、削除から外せます。削除するときは、残すほうのスマホのコードの入力が必要です。",
  async () => {
    await v.quiet(2000);
  }
);
chk(
  "スマホが2台のとき、各スマホに削除ボタンがある",
  (await page.getByRole("button", { name: "削除" }).count()) >= 2
);

await v.say(
  "1台目を削除します。確認のダイアログで、2台目のコードを入力します。",
  async () => {
    await page.getByRole("button", { name: "削除" }).first().click();
    await sleep(1200);
    await page.getByPlaceholder("123456").fill(await freshCode(secret2));
    await page.getByRole("button", { name: "削除する" }).click();
    await sleep(3500);
  }
);
chk("1台目を削除すると、1/2台になる", /1\/2台/.test(await text(page)));
chk(
  "最後の1台には削除ボタンが出ない",
  (await page.getByRole("button", { name: "削除" }).count()) === 0
);

await v.say(
  "残った1台には、削除のボタンが出ません。2段階認証を無効にできるのは、管理者だけです。画面の下の説明のとおり、やめる場合は管理者に依頼します。",
  async () => {
    await v.quiet(1500);
  }
);
chk(
  "本人が2段階認証をやめる操作は無く、管理者への案内がある",
  (await text(page)).includes("管理者に依頼")
);

await v.say(
  "リカバリーコードは、使い切ったり、失くしたりしたときに、再発行できます。再発行すると、古いコードは使えなくなります。",
  async () => {
    await page
      .getByRole("button", { name: "リカバリーコードを再発行" })
      .click();
    await sleep(1200);
    await page.getByPlaceholder("123456").fill(await freshCode(secret2));
    await page
      .getByRole("button", { name: /^再発行|再発行する/ })
      .last()
      .click();
    await page.getByText("保管しました").waitFor({ timeout: 15_000 });
  }
);
chk(
  "リカバリーコードを再発行すると、新しい8件が表示される",
  ((await text(page)).match(/[A-Z0-9]{5}-[A-Z0-9]{5}/g) ?? []).length === 8
);
await page.getByRole("button", { name: "保管しました" }).click();
await sleep(800);

// 管理者による2段階認証のリセット
await v.say(
  "次に、管理者の操作です。スマホとリカバリーコードをすべて失った人は、管理者が2段階認証をリセットします。管理者でログインし直します。",
  async () => {
    await logout();
    await login("hiromu.umeda@sun-asterisk.com");
    await page.waitForURL(/projects|reporting/, { timeout: 30_000 });
    await page.goto(`${BASE}/invite`);
    await waitIdle(page, 1500);
  }
);
await v.say(
  "アカウント発行の画面の、登録済みアカウントの表に、2段階認証の列があります。2段階認証を設定している人には、有効と、リセットのボタンが表示されます。",
  async () => {
    await page
      .getByRole("row", { name: new RegExp(EMAIL) })
      .scrollIntoViewIfNeeded();
    await v.quiet(1500);
  }
);
const row = page.getByRole("row", { name: new RegExp(EMAIL) });
chk(
  "アカウント一覧の2段階認証の列に「有効」と「リセット」が出る",
  (await row.innerText()).includes("有効") &&
    (await row.getByRole("button", { name: "リセット" }).isVisible())
);

await v.say(
  "リセットを押すと、確認のダイアログが出ます。実行すると、その人の2段階認証が解除されます。",
  async () => {
    await row.getByRole("button", { name: "リセット" }).click();
    await sleep(1500);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /リセット/ })
      .click();
    await sleep(2500);
  }
);
chk(
  "リセットすると、その人の2段階認証が無効になる",
  !(await row.innerText()).includes("リセット")
);

await v.say(
  "リセットされた人は、次回から、パスワードだけでログインできます。必要なら、セキュリティ設定から、もう一度、設定し直せます。",
  async () => {
    await logout();
    await login();
    await page.waitForURL(/projects|reporting/, { timeout: 30_000 });
    await waitIdle(page, 800);
  }
);
chk(
  "リセット後は、パスワードだけでログインできる",
  /projects|reporting/.test(page.url()),
  page.url()
);
await v.say("以上で、2段階認証の説明を終わります。", null);
saveFindings("02");
await v.close();
