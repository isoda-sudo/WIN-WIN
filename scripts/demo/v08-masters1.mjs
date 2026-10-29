import {
  authState,
  BASE,
  chkWait,
  helpers,
  saveFindings,
  sleep,
  text,
  Video,
  waitIdle,
} from "./lib.mjs";

const v = new Video("08-マスタ（顧客・発注先・工種）", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick, closeDlg } = helpers(page);
const TXT =
  "input:not([type=number]):not([type=email]):not([type=tel]):not([type=url]):not([type=checkbox]):not([type=hidden])";
const D = () => page.locator("[role=dialog]").last();
const confirmDelete = async (p) => {
  const a = p.getByRole("alertdialog");
  if (
    await a
      .waitFor({ timeout: 2500 })
      .then(() => true)
      .catch(() => false)
  ) {
    await a.getByRole("button", { name: /削除/ }).click();
  }
  await sleep(2000);
};
const settle = async (p) => {
  await p
    .locator("[role=dialog]")
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
  await sleep(300);
};
const openMenu = async (name) => {
  if (
    !(await page.getByRole("link", { name, exact: true }).first().isVisible())
  ) {
    await page.getByRole("button", { name: "マスタ設定" }).click();
    await sleep(600);
  }
  await page.getByRole("link", { name, exact: true }).first().click();
  await page.locator("tbody tr").first().waitFor({ timeout: 20_000 });
  await sleep(800);
};

await v.say(
  "この動画では、マスタ設定のうち、顧客、発注先、工種の、3つのマスタの使い方を説明します。マスタの編集は、管理者だけができます。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 800);
    await p.getByRole("button", { name: "マスタ設定" }).click();
    await sleep(800);
  }
);

await v.say(
  "まず、顧客マスタです。案件の相手方になる、顧客企業を管理します。",
  async (p) => {
    await openMenu("顧客マスタ");
  }
);
await chkWait("顧客マスタが開く", async () =>
  (await text(page)).includes("顧客マスタ")
);

await v.say(
  "新規顧客登録を押して、企業名、担当者名、メールアドレスを入力します。この3つは必須です。",
  async (p) => {
    await p.getByRole("button", { name: "新規顧客登録" }).click();
    await sleep(1000);
    const f = D();
    const t = f.locator(TXT);
    await t.nth(0).pressSequentially("株式会社デモ建設", { delay: 60 });
    await t.nth(1).pressSequentially("営業部", { delay: 60 });
    await t.nth(2).pressSequentially("山田 太郎", { delay: 60 });
    await f
      .locator("input[type=email]")
      .first()
      .fill("yamada@demo-kensetsu.example.jp");
    await f.locator("input[type=tel]").fill("075-000-1234");
  }
);
await v.say(
  "郵便番号を入れて、住所を検索を押すと、住所が自動で入ります。",
  async (p) => {
    await D().getByPlaceholder("000-0000").fill("6040924");
    await D().getByRole("button", { name: "住所を検索" }).click();
    await sleep(2000);
  }
);
await v.say(
  "メールの宛先になる担当者は、TOとCCに、最大10名まで登録できます。ここでは省略して、登録します。",
  async (p) => {
    await v.quiet(1200);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2000);
  }
);
await chkWait(
  "顧客を登録できる",
  async () => (await rowOf("株式会社デモ建設").count()) === 1
);

await v.say(
  "行を押すと、内容を編集できます。電話番号を変えて、保存します。不要な顧客は、削除もできます。",
  async (p) => {
    await rowOf("株式会社デモ建設").locator("td").nth(1).click();
    await sleep(1200);
    await D().locator("input[type=tel]").fill("075-111-2222");
    await v.quiet(600);
    await D().getByRole("button", { name: "保存" }).click();
    await sleep(2000);
  }
);
await chkWait("顧客を編集して保存できる", async () =>
  (await rowOf("株式会社デモ建設").innerText()).includes("075-111-2222")
);
await v.say(
  "削除します。確認のメッセージのあとに、一覧から消えます。",
  async (p) => {
    await settle(p);
    await rowOf("株式会社デモ建設").locator("td").nth(1).click();
    await sleep(1200);
    await D().getByRole("button", { name: "削除" }).click();
    await sleep(1000);
    await confirmDelete(p);
  }
);
await chkWait(
  "顧客を削除できる",
  async () => (await rowOf("株式会社デモ建設").count()) === 0
);

await v.say(
  "次は、発注先マスタです。工事を発注する、協力会社や仕入先を管理します。",
  async (p) => {
    await openMenu("発注先マスタ");
  }
);
await chkWait("発注先マスタが開く", async () =>
  (await text(page)).includes("発注先マスタ")
);

await v.say(
  "新規発注先登録では、会社名のほか、対応できる工種を、タグで選びます。ここでは、防水工事と、外構工事を選びます。",
  async (p) => {
    await p.getByRole("button", { name: "新規発注先登録" }).click();
    await sleep(1000);
    const f = D();
    const t = f.locator(TXT);
    await t.nth(0).pressSequentially("デモ防水工業株式会社", { delay: 50 });
    await f.locator("label", { hasText: "防水工事" }).first().click();
    await sleep(300);
    await f.locator("label", { hasText: "外構工事" }).first().click();
    await sleep(500);
  }
);
await v.say(
  "振込先の銀行は、銀行マスタから選びます。銀行を選ぶと、その銀行の支店を、一覧から選べます。口座番号と名義も入力します。",
  async (p) => {
    const f = D();
    await pick(f.getByRole("combobox").nth(0), "京都銀行");
    await sleep(800);
    await f.getByRole("button", { name: /支店を選択/ }).click();
    await sleep(1000);
    const q = p.getByPlaceholder(
      "支店名（漢字・ひらがな）で絞り込み／一覧に無ければ入力"
    );
    await q.pressSequentially("四条", { delay: 120 });
    await sleep(1200);
    if (await p.locator("ul li button").count()) {
      await p.locator("ul li button").first().click();
    } else {
      await p.getByRole("button", { name: /この入力のまま使う/ }).click();
    }
    await sleep(600);
  }
);
await v.say(
  "支払条件は、締め日と、支払日を選びます。ここで決めた条件で、発注の支払期日が、自動で計算されます。登録します。",
  async (p) => {
    await v.quiet(1500);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2500);
  }
);
await chkWait(
  "発注先を登録できる",
  async () => (await rowOf("デモ防水工業").count()) === 1
);
await v.say(
  "発注先も、行を押して編集や削除ができます。ただし、発注に使われている発注先は、削除できません。",
  async (p) => {
    await settle(p);
    await rowOf("デモ防水工業").locator("td").nth(1).click();
    await sleep(1200);
    await D().getByRole("button", { name: "削除" }).click();
    await sleep(1000);
    await confirmDelete(p);
  }
);
await chkWait(
  "発注先を削除できる",
  async () => (await rowOf("デモ防水工業").count()) === 0
);

await v.say(
  "最後に、工種マスタです。コードは、自動で採番されます。",
  async (p) => {
    await openMenu("工種マスタ");
  }
);
await chkWait("工種マスタが開く", async () =>
  (await text(page)).includes("工種マスタ")
);
await v.say(
  "新規工種登録で、工種名称と、備考を入力して、登録します。",
  async (p) => {
    await p.getByRole("button", { name: "新規工種登録" }).click();
    await sleep(1000);
    await D()
      .locator(TXT)
      .nth(1)
      .pressSequentially("太陽光発電工事", { delay: 60 });
    await D().locator("textarea").fill("パネル設置、パワコン、配線。");
    await v.quiet(600);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2000);
  }
);
await v.say(
  "一覧は、20件ずつ表示されます。次の件を表示で、続きを読み込めます。編集と削除は、行を押して行います。",
  async (p) => {
    await p.getByRole("button", { name: /次の\d+件を表示/ }).click();
    await sleep(1200);
  }
);
await chkWait("工種を登録できる（コードが自動採番される）", async () =>
  /\d{5}/.test(await rowOf("太陽光発電工事").innerText())
);
await v.say("不要になった工種は、行を押して、削除します。", async (p) => {
  await settle(p);
  await rowOf("太陽光発電工事").locator("td").nth(1).click();
  await sleep(1200);
  await D().getByRole("button", { name: "削除" }).click();
  await sleep(1000);
  await confirmDelete(p);
});
await chkWait(
  "工種を削除できる",
  async () => (await rowOf("太陽光発電工事").count()) === 0
);
await v.say("以上で、顧客、発注先、工種マスタの説明を終わります。", null);
saveFindings("08");
await v.close();
