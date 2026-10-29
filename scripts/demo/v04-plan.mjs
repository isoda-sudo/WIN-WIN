import path from "node:path";
import {
  authState,
  BASE,
  chk,
  chkWait,
  saveFindings,
  sleep,
  text,
  Video,
  waitIdle,
} from "./lib.mjs";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const v = new Video("04-工事計画", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const rowOf = (t) => page.locator("tbody tr", { hasText: t }).first();
const pick = async (combo, name) => {
  await combo.click();
  await sleep(400);
  await page.getByRole("option", { name }).first().click();
  await sleep(300);
};
const closeDlg = async () => {
  for (let i = 0; i < 3; i++) {
    const d = page.locator("[role=dialog],[role=alertdialog]").first();
    if (!(await d.count())) {
      return;
    }
    const btn = d
      .getByRole("button", { name: /^(閉じる|キャンセル|Close)$/ })
      .first();
    if (await btn.count()) {
      await btn.click({ force: true, timeout: 3000 }).catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
    await sleep(900);
  }
};
const editingRow = () =>
  page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "保存" }) })
    .first();

await v.say(
  "この動画では、工事計画の使い方を説明します。工事計画は、案件ごとに、外注先への発注の明細を管理する画面です。受注一覧の、工事計画のボタンから開きます。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1500);
    await rowOf("リゾート客室棟")
      .getByRole("link", { name: "工事計画" })
      .click();
    await p.waitForURL(/orders-list/);
    await waitIdle(p, 2000);
  }
);
chk(
  "工事計画が、案件ごとに開く",
  page.url().includes("projectId="),
  page.url()
);

await v.say(
  "上部には、案件名と工期、売上高、外注費の合計、想定利益額、想定粗利率が表示されます。外注費の合計には、振込手数料が含まれます。予定と決定の、二つの金額で見られます。",
  async (p) => {
    await p.locator("main").first().hover();
    await v.quiet(2500);
  }
);
chk(
  "サマリに、売上高・外注費合計（振込手数料込み）・想定利益額・想定粗利率がある",
  (await text(page)).includes("振込手数料込み") &&
    (await text(page)).includes("想定利益額") &&
    (await text(page)).includes("想定粗利率")
);

await v.say(
  "売上高の、予定と決定の金額は、ここで入力します。受注一覧の金額は、この入力が自動で反映されます。決定の金額を、五千五百万円に変えてみます。",
  async (p) => {
    const input = p.locator("input").filter({ hasText: "" }).nth(0);
    const boxes = p
      .locator("main input[inputmode], main input[type=number], main input")
      .filter({ has: p.locator(":scope") });
    const decided = p.locator("main").first().locator("input").nth(1);
    await decided.fill("55000000");
    await decided.press("Enter");
    await decided.blur();
    await sleep(2500);
  }
);
await chkWait(
  "売上高（決定）を変更すると、想定粗利率などが再計算される",
  async () => (await text(page)).includes("36.0%")
);

await v.say(
  "工種、ステータス、キーワードで、明細を絞り込めます。表示項目で、工事場所や担当者などの列も、出せます。",
  async (p) => {
    await p.getByRole("button", { name: "表示項目" }).click();
    await sleep(800);
    await p
      .locator("label", { hasText: "工事場所" })
      .first()
      .click({ timeout: 3000 });
    await sleep(1200);
    await p.keyboard.press("Escape");
    await p
      .getByPlaceholder("工事内容・発注先で検索")
      .pressSequentially("電気", { delay: 120 });
    await sleep(1500);
    const q = p.getByPlaceholder("工事内容・発注先で検索");
    await q.click();
    await p.keyboard.press("Control+A");
    await p.keyboard.press("Meta+A");
    await p.keyboard.press("Backspace");
    await sleep(800);
    await chkWait(
      "検索を空に戻すと全件に戻る",
      async () => (await q.inputValue()) === ""
    );
  }
);

await v.say(
  "発注を追加します。表の下の、行を追加を押し、工種、発注先、備考、見積額、予定金額、決定金額を入力して、保存します。",
  async (p) => {
    await p.getByRole("button", { name: "行を追加" }).click();
    await sleep(1200);
    const row = editingRow();
    await pick(row.getByRole("combobox").nth(0), "防水工事");
    await pick(row.getByRole("combobox").nth(1), "株式会社ミヤコ防水");
    const inputs = row.locator("input");
    await inputs.nth(0).pressSequentially("屋上防水の追加工事", { delay: 70 });
    await inputs.nth(1).fill("1200000");
    await inputs.nth(2).fill("1100000");
    await inputs.nth(3).fill("1050000");
    await v.quiet(800);
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
  }
);
await chkWait("発注が追加され、支払IDが採番される", async () =>
  /WW\d{2}-\d{3}-\d{3}/.test(await rowOf("屋上防水の追加工事").innerText())
);

await v.say(
  "行を押すと、その場で編集できます。ステータスを、決定済みから、発注完了に進めます。",
  async (p) => {
    await rowOf("屋上防水の追加工事").locator("td").nth(1).click();
    await sleep(1200);
    const row = editingRow();
    await pick(row.getByRole("combobox").last(), "発注完了");
    await v.quiet(600);
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
  }
);
await chkWait("ステータスを発注完了に変更できる", async () =>
  (await rowOf("屋上防水の追加工事").innerText()).includes("発注完了")
);

await v.say(
  "注文書のボタンを押すと、注文書のプレビューが開きます。ダウンロードや、発注先へのメール送信ができます。",
  async (p) => {
    await rowOf("屋上防水の追加工事")
      .getByRole("button", { name: "注文書" })
      .click();
    await sleep(3500);
    await v.quiet(2500);
  }
);
chk(
  "注文書のプレビューが開く",
  (await page.locator("[role=dialog]").count()) >= 1
);
chk(
  "注文書に、ダウンロードとメール送信がある",
  (await page
    .getByRole("dialog")
    .getByRole("button", { name: /ダウンロード|メール送信/ })
    .count()) >= 1
);
await closeDlg();

const uploadDoc = async (btnName, file) => {
  await rowOf("屋上防水の追加工事")
    .getByRole("button", { name: btnName })
    .click();
  await sleep(1500);
  await page.getByRole("button", { name: "書類（PDF）を選ぶ" }).click();
  await sleep(1200);
  await page
    .locator("[role=dialog] input[type=file]")
    .first()
    .setInputFiles(path.join(DIR, file));
  await sleep(1800);
};
const fillMeta = async (date, amount) => {
  const d = page.getByRole("dialog").filter({ hasText: "情報を入力" }).first();
  const dt = d.locator("input[type=date]");
  if (await dt.count()) {
    await dt.first().fill(date);
  }
  const am = d.locator("input[type=text]");
  if (await am.count()) {
    await am.first().fill(amount);
  }
  await v.quiet(700);
  await d.getByRole("button", { name: "アップロード", exact: true }).click();
  await sleep(3500);
};
await v.say(
  "請書は、発注先から受け取る書類です。請書をアップロードのボタンを押し、書類のPDFを選びます。スマホで撮影して、PDFにすることもできます。",
  async () => {
    await uploadDoc(/請書をアップロード/, "請書サンプル.pdf");
  }
);
await v.say(
  "書類の日付と金額を入力して、登録します。ファイル名は、日付、取引先、金額、書類名の形に、自動で整います。",
  async () => {
    await fillMeta("2026-10-20", "1155000");
  }
);
await chkWait(
  "請書をアップロードすると、アップロード済みになる",
  async () =>
    (await rowOf("屋上防水の追加工事")
      .locator("button[title^='請書（アップロード済み']")
      .count()) >= 1
);

await v.say(
  "請求書も、同じように、請求書をアップロードのボタンから登録します。",
  async () => {
    await uploadDoc(/請求書をアップロード/, "請求書サンプル.pdf");
    await fillMeta("2026-10-25", "1155000");
  }
);
await chkWait(
  "請求書をアップロードすると、アップロード済みになる",
  async () =>
    (await rowOf("屋上防水の追加工事")
      .locator("button[title^='請求書（アップロード済み']")
      .count()) >= 1
);

await v.say(
  "アップロードした書類は、アップロード済みのボタンから、いつでも確認できます。不要な場合は、ここから差し替えや削除もできます。",
  async () => {
    await rowOf("屋上防水の追加工事")
      .locator("button[title^='請書（アップロード済み']")
      .first()
      .click();
    await sleep(3000);
    await v.quiet(1500);
  }
);
await closeDlg();

await v.say(
  "追加した発注を、削除します。行を押して編集に入り、削除を押して、確認します。",
  async (p) => {
    await rowOf("屋上防水の追加工事").locator("td").nth(1).click();
    await sleep(1200);
    await editingRow().getByRole("button", { name: "削除" }).click();
    await sleep(1200);
    await p
      .getByRole("alertdialog")
      .getByRole("button", { name: /削除/ })
      .click();
    await sleep(2500);
  }
);
await chkWait(
  "発注を削除すると、一覧から消える",
  async () => (await rowOf("屋上防水の追加工事").count()) === 0
);

await v.say(
  "右上の、CSV出力で、この案件の発注の一覧を、ダウンロードできます。",
  async (p) => {
    const [dl] = await Promise.all([
      p.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
      p.getByRole("button", { name: "CSV出力" }).click(),
    ]);
    chk(
      "CSV出力でファイルがダウンロードされる",
      Boolean(dl),
      dl ? dl.suggestedFilename() : "ダウンロードなし"
    );
    await v.quiet(1000);
  }
);

await v.say(
  "確定、ロックのボタンは、管理者が、引渡月の末日を過ぎた案件に対して使います。確定すると、金額やステータスの編集ができなくなり、確定済みと表示されます。",
  async (p) => {
    await p
      .getByRole("button", { name: "確定（ロック）", exact: true })
      .click();
    await sleep(2500);
  }
);
await chkWait("確定すると、ボタンが解除に変わる", async () =>
  (await text(page)).includes("確定（ロック）を解除")
);
await v.say(
  "確定した案件では、行を追加するボタンなども使えません。解除すると、元に戻ります。",
  async (p) => {
    await v.quiet(1500);
    await p.getByRole("button", { name: /解除/ }).first().click();
    await sleep(2500);
  }
);
await chkWait(
  "解除すると、編集できる状態に戻る",
  async () => !(await text(page)).includes("確定（ロック）を解除")
);
await v.say("以上で、工事計画の説明を終わります。", null);
saveFindings("04");
await v.close();
