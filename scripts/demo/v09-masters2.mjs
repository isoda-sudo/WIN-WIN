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

const v = new Video("09-マスタ（銀行・種別・区分・自社口座）", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick, closeDlg } = helpers(page);
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
  await sleep(1800);
};
const settle = async (p) => {
  await p
    .locator("[role=dialog]")
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
  await sleep(300);
};
const drag = async (p, handle, targetRow) => {
  const a = await handle.boundingBox();
  const b = await targetRow.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  const ty = b.y + 4;
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(a.x + a.width / 2, a.y + (ty - a.y) * (i / 12));
    await sleep(30);
  }
  await p.mouse.up();
  await sleep(1500);
};
const openMenu = async (name, wait = "tbody tr") => {
  await page
    .locator("[role=dialog],[role=alertdialog]")
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});
  await sleep(300);
  if (
    !(await page.getByRole("link", { name, exact: true }).first().isVisible())
  ) {
    await page.getByRole("button", { name: "マスタ設定" }).click();
    await sleep(600);
  }
  await page.getByRole("link", { name, exact: true }).first().click();
  await page.locator(wait).first().waitFor({ timeout: 20_000 });
  await sleep(800);
};

await v.say(
  "この動画では、マスタ設定の残りの画面、銀行、支払い種別、収入区分、自社口座と、振込手数料の使い方を説明します。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 800);
    await p.getByRole("button", { name: "マスタ設定" }).click();
    await sleep(800);
  }
);

await v.say(
  "銀行マスタです。発注先や自社口座の、銀行名の選択肢になる銀行を管理します。主要銀行、地方銀行などの区分があります。",
  async (p) => {
    await openMenu("銀行マスタ");
  }
);
await chkWait("銀行マスタが開く", async () =>
  (await text(page)).includes("銀行マスタ")
);

await v.say(
  "支店データを最新化のボタンで、任意のタイミングに、自動連携の支店を、最新にできます。結果は、追加や変更の件数で表示されます。",
  async (p) => {
    await settle(p);
    await p.getByRole("button", { name: "支店データを最新化" }).click();
    await sleep(1500);
    await p
      .locator("[role=alertdialog],[role=dialog]")
      .last()
      .getByRole("button", { name: /最新化|実行|はい|OK/ })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await sleep(4000);
  }
);

await v.say(
  "新規銀行登録で、区分、銀行名、銀行コードを入力します。銀行コードを入れると、支店を、頭文字から選べるようになります。",
  async (p) => {
    await p.getByRole("button", { name: "新規銀行登録" }).click();
    await sleep(1000);
    await pick(D().getByRole("combobox").first(), "地方銀行");
    await D()
      .getByPlaceholder("例：三菱UFJ銀行")
      .pressSequentially("デモ信用金庫", { delay: 60 });
    await D().getByPlaceholder("例：0005").fill("1999");
    await v.quiet(600);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2000);
  }
);
await chkWait(
  "銀行を登録できる",
  async () => (await rowOf("デモ信用金庫").count()) === 1
);

await v.say(
  "支店の管理では、一覧に無い支店を、手動で追加できます。手動の支店は、支店データを最新化しても、消えません。",
  async (p) => {
    await settle(p);
    await rowOf("デモ信用金庫")
      .getByRole("button", { name: "支店の管理" })
      .click();
    await sleep(1500);
    await D()
      .locator("input")
      .first()
      .pressSequentially("デモ本店営業部", { delay: 60 });
    await v.quiet(500);
    await D().getByRole("button", { name: "支店を追加" }).click();
    await sleep(1800);
  }
);
await chkWait("手動で支店を追加できる", async () =>
  (await D().innerText()).includes("デモ本店営業部")
);
await closeDlg();

await v.say("使わなくなった銀行は、行を押して、削除します。", async (p) => {
  await settle(p);
  await rowOf("デモ信用金庫").locator("td").nth(1).click();
  await sleep(1200);
  await D()
    .getByRole("button", { name: "削除" })
    .click()
    .catch(() => {});
  await sleep(800);
  await confirmDelete(p);
});
await chkWait(
  "銀行を削除できる",
  async () => (await rowOf("デモ信用金庫").count()) === 0
);

await v.say(
  "次は、支払い種別マスタです。支払い予定表の、工事外の支払いで使う種別を管理します。行頭のハンドルをドラッグして、並び順を変えられます。",
  async (p) => {
    await openMenu("支払い種別マスタ");
  }
);
await v.say("新規種別登録で、種別の名称を入力して、登録します。", async (p) => {
  await p.getByRole("button", { name: "新規種別登録" }).click();
  await sleep(1000);
  await D()
    .getByPlaceholder(/賃料/)
    .pressSequentially("デモ会費", { delay: 80 });
  await v.quiet(500);
  await D().getByRole("button", { name: "登録", exact: true }).click();
  await sleep(2000);
});
await chkWait(
  "支払い種別を登録できる",
  async () => (await rowOf("デモ会費").count()) === 1
);
await v.say(
  "ハンドルをつかんで、上へ動かすと、並び順が変わります。",
  async (p) => {
    await drag(
      p,
      rowOf("デモ会費").getByRole("button", { name: "ドラッグして並び替え" }),
      p.locator("tbody tr").first()
    );
  }
);
await chkWait("ドラッグで並び順を変えられる", async () =>
  (await page.locator("tbody tr").first().innerText()).includes("デモ会費")
);
await v.say("不要な種別は、行を押して、削除します。", async (p) => {
  await settle(p);
  await rowOf("デモ会費").locator("td").nth(1).click();
  await sleep(1200);
  await D().getByRole("button", { name: "削除" }).click();
  await sleep(800);
  await confirmDelete(p);
});
await chkWait(
  "支払い種別を削除できる",
  async () => (await rowOf("デモ会費").count()) === 0
);

await v.say(
  "収入区分マスタです。売上管理表の、工事外売上で使う区分を管理します。並び順は、売上管理表の区分ブロックの順になります。",
  async (p) => {
    await openMenu("収入区分マスタ");
  }
);
await v.say(
  "使い方は、支払い種別と同じです。区分を登録して、ドラッグで並べ替えます。",
  async (p) => {
    await p.getByRole("button", { name: "新規区分登録" }).click();
    await sleep(1000);
    await D()
      .getByPlaceholder(/賃貸収入/)
      .pressSequentially("補助金収入", { delay: 80 });
    await v.quiet(500);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2000);
    await settle(p);
    await rowOf("補助金収入").locator("td").nth(1).click();
    await sleep(1200);
    await D().getByRole("button", { name: "削除" }).click();
    await sleep(800);
    await confirmDelete(p);
  }
);
await chkWait(
  "収入区分を登録・削除できる",
  async () => (await rowOf("補助金収入").count()) === 0
);

await v.say(
  "最後に、自社口座と、振込手数料のマスタです。支払元の自社口座を、最大10件まで管理します。",
  async (p) => {
    await openMenu("自社口座・手数料", "text=自社口座を追加");
  }
);
await v.say(
  "自社口座を追加で、表示名、銀行、支店、預金種別、口座番号、名義を入力します。口座は、請求書の振込先にも印字されます。",
  async (p) => {
    await p.getByRole("button", { name: "自社口座を追加" }).click();
    await sleep(1000);
    await D()
      .getByPlaceholder(/メイン口座/)
      .pressSequentially("デモ予備口座", { delay: 60 });
    await pick(D().getByRole("combobox").first(), "京都銀行");
    await D()
      .getByRole("button", { name: /支店を選択/ })
      .click();
    await sleep(1000);
    const q = p.getByPlaceholder(
      "支店名（漢字・ひらがな）で絞り込み／一覧に無ければ入力"
    );
    await q.pressSequentially("四条", { delay: 100 });
    await sleep(1200);
    if (await p.locator("ul li button").count()) {
      await p.locator("ul li button").first().click();
    } else {
      await p.getByRole("button", { name: /この入力のまま使う/ }).click();
    }
    await sleep(600);
    await pick(D().getByRole("combobox").nth(1), "普通");
    const inputs = D().locator("input:not([type=hidden])");
    const n = await inputs.count();
    await D()
      .getByPlaceholder(/ウィン/)
      .pressSequentially("カ）デモ", { delay: 60 });
  }
);
await v.say(
  "デフォルトの口座は、支払い登録のときの、初期の支払元になります。登録して、デフォルトを切り替えます。",
  async (p) => {
    await v.quiet(800);
    await D().getByRole("button", { name: "登録", exact: true }).click();
    await sleep(2500);
  }
);
await chkWait("自社口座を登録できる", async () =>
  (await text(page)).includes("デモ予備口座")
);

await v.say(
  "口座ごとに、振込手数料のルールを持ちます。宛先が同一銀行か他行か、金額の範囲ごとに、手数料を決めます。手数料は、支払いの登録時に自動で計算され、あとから変えても、算出済みの支払いには、反映されません。",
  async (p) => {
    const card = p.locator("div", { hasText: "デモ予備口座" }).last();
    await p.getByRole("button", { name: "ルール追加" }).last().click();
    await sleep(1000);
    const f = D();
    const nums = f.locator("input[type=number]");
    await nums.nth(0).fill("0");
    await nums.nth(1).fill("30000");
    await nums.nth(2).fill("330");
    await v.quiet(600);
    await f.getByRole("button", { name: "追加", exact: true }).click();
    await sleep(2000);
  }
);
await chkWait("振込手数料のルールを追加できる", async () =>
  (await text(page)).includes("¥330")
);

await v.say(
  "不要になった口座は、削除します。使用中の口座は、削除できません。",
  async (p) => {
    await settle(p);
    await p.getByRole("button", { name: "削除", exact: true }).last().click();
    await sleep(1000);
    await confirmDelete(p);
  }
);
await v.say("以上で、マスタ設定の説明を終わります。", null);
saveFindings("09");
await v.close();
