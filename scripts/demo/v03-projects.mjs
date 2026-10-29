import path from "node:path";
import {
  authState,
  BASE,
  chk,
  chkWait,
  saveFindings,
  sleep,
  Video,
  waitIdle,
} from "./lib.mjs";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const v = new Video("03-受注一覧", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const rowOf = (t) => page.locator("tbody tr", { hasText: t }).first();
const rows = () => page.locator("tbody tr").count();
const pick = async (combo, name) => {
  await combo.click();
  await sleep(400);
  await page.getByRole("option", { name }).first().click();
  await sleep(300);
};
const closeDlg = async () => {
  const d = page.locator("[role=dialog],[role=alertdialog]").first();
  if (!(await d.count())) {
    return;
  }
  const named = d
    .getByRole("button", { name: /^(閉じる|キャンセル)$/ })
    .first();
  if (await named.count()) {
    await named.click({ force: true });
  } else {
    await d
      .getByRole("button", { name: "Close" })
      .first()
      .click({ force: true });
  }
  await sleep(800);
  if (await page.locator("[role=dialog],[role=alertdialog]").count()) {
    await page.keyboard.press("Escape");
    await sleep(600);
  }
};

await v.say(
  "この動画では、受注一覧の使い方を、すべて説明します。受注一覧は、案件の一覧と、進行の管理、書類の管理、請求書の発行を行う、中心の画面です。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1500);
  }
);
chk("受注一覧に、案件が表示される", (await rows()) > 5, `${await rows()}行`);

await v.say(
  "上のタブは、会計期です。三月決算のため、四月から翌年三月までが、一期です。第六期を押すと、前の期の案件が表示されます。第七期に戻します。",
  async (p) => {
    const n7 = await rows();
    await p.getByRole("tab", { name: "第6期" }).click();
    await sleep(1500);
    chk(
      "期のタブを切り替えると、案件の一覧が変わる",
      (await rows()) !== n7,
      `第6期 ${await rows()}行 / 第7期 ${n7}行`
    );
    await v.quiet(1500);
    await p.getByRole("tab", { name: "第7期" }).click();
    await sleep(1200);
  }
);

await v.say(
  "引渡月で絞り込めます。七月を選びます。続けて、ステータスでも絞り込めます。請求書発行済みを選びます。",
  async (p) => {
    await pick(p.getByRole("combobox").nth(0), "7月");
    await v.quiet(1200);
    await pick(p.getByRole("combobox").nth(1), "請求書発行済み");
    await v.quiet(1500);
    chk(
      "引渡月とステータスで絞り込める",
      (await rows()) >= 1 && (await rows()) < 10,
      `${await rows()}行`
    );
  }
);
await v.say(
  "絞り込みを、すべてに戻します。次に、検索欄に、宝ヶ池と入力します。案件ID、工事名、発注元で検索できます。",
  async (p) => {
    await pick(p.getByRole("combobox").nth(0), "すべての月");
    await pick(p.getByRole("combobox").nth(1), "すべてのステータス");
    await p
      .getByPlaceholder("案件ID・工事名・発注元で検索")
      .pressSequentially("宝ヶ池", { delay: 120 });
    await sleep(1500);
    chk(
      "検索で、一致する案件だけになる",
      (await rows()) <= 4 && (await rows()) >= 1,
      `${await rows()}行`
    );
    await p.getByPlaceholder("案件ID・工事名・発注元で検索").fill("");
    await sleep(800);
  }
);

await v.say(
  "表示項目のボタンで、表の列を、出したり隠したりできます。備考を出してみます。選択は、ブラウザに記憶されます。",
  async (p) => {
    await p.getByRole("button", { name: "表示項目" }).click();
    await sleep(800);
    await p.locator("label", { hasText: "備考" }).last().click();
    await sleep(1200);
    chk(
      "表示項目で、備考の列が表示される",
      (await p.locator("th").allInnerTexts()).some((t) => t.includes("備考"))
    );
    await v.quiet(1000);
    await p.locator("label", { hasText: "備考" }).last().click();
    await sleep(600);
    await p.keyboard.press("Escape");
  }
);

await v.say(
  "案件を追加します。表の下の、行を追加、を押します。工事名、発注元、工期、引渡月を入力します。",
  async (p) => {
    await p.getByRole("button", { name: "行を追加" }).click();
    await sleep(1200);
    const row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "保存" }) })
      .first();
    await row
      .locator("input")
      .first()
      .pressSequentially("デモ新築工事", { delay: 90 });
    await pick(row.getByRole("combobox").nth(0), "株式会社京洛ホテルズ");
    const dates = row.locator("input[type=date]");
    await dates.nth(0).fill("2026-11-02");
    await dates.nth(1).fill("2027-01-29");
    await pick(row.getByRole("combobox").nth(1), "2027");
    await pick(row.getByRole("combobox").nth(2), "1");
    await v.quiet(800);
  }
);
await v.say(
  "ステータスは、未対応から始まります。保存を押すと、案件IDが自動で採番されます。",
  async (p) => {
    const row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "保存" }) })
      .first();
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
  }
);
await chkWait(
  "新しい案件が登録され、案件IDが採番される",
  async () =>
    (await rowOf("デモ新築工事").count()) >= 1 &&
    /WW\d{2}-\d{3}/.test(await rowOf("デモ新築工事").innerText())
);

await v.say(
  "登録した案件の行を押すと、その場で編集できます。工事名を、少し変えてみます。契約金額は、工事計画の入力から自動で入るため、ここでは入力できません。",
  async (p) => {
    await rowOf("デモ新築工事").locator("td").nth(1).click();
    await sleep(1200);
    const row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "保存" }) })
      .first();
    const name = row.locator("input").first();
    await name.fill("");
    await name.pressSequentially("デモ新築工事（第1期）", { delay: 80 });
    await v.quiet(800);
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
  }
);
await chkWait(
  "工事名を編集して保存できる",
  async () => (await rowOf("デモ新築工事（第1期）").count()) >= 1
);

await v.say(
  "ステータスは、未対応、提案中、見積書提出済み、失注を、行の中から、手で切り替えられます。契約済み以降は、契約書のアップロード、請求書の発行、売上管理表の入金ステータスで、自動で進みます。ここでは、提案中に変えます。",
  async (p) => {
    await rowOf("デモ新築工事（第1期）").locator("td").nth(1).click();
    await sleep(1000);
    const row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "保存" }) })
      .first();
    await pick(row.getByRole("combobox").last(), "提案中");
    await v.quiet(600);
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
  }
);
await chkWait("ステータスを提案中に変更できる", async () =>
  (await rowOf("デモ新築工事（第1期）").innerText()).includes("提案中")
);

// 操作列
await v.say(
  "右の、操作の列には、書類のボタンが並びます。見積書のボタンを押すと、見積書のPDFをアップロードできます。ファイルをここへドロップするか、クリックして選びます。",
  async (p) => {
    const r = rowOf("デモ新築工事（第1期）");
    await r.getByRole("button", { name: /見積書/ }).click();
    await sleep(1500);
    await p
      .locator("[role=dialog] input[type=file]")
      .setInputFiles(path.join(DIR, "見積書サンプル.pdf"));
    await v.quiet(1200);
  }
);
await v.say(
  "アップロードを押すと、見積書が登録され、ステータスは、見積書提出済みに進みます。",
  async (p) => {
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "アップロード" })
      .click();
    await sleep(3000);
  }
);
await chkWait(
  "見積書をアップロードすると、ステータスが見積書提出済みに進む",
  async () =>
    (await rowOf("デモ新築工事（第1期）").innerText()).includes(
      "見積書提出済み"
    )
);

await v.say(
  "契約書のボタンは、締結済みか未締結かを示します。未締結のボタンを押して、契約書のPDFをアップロードすると、ステータスが、契約済みに進みます。",
  async (p) => {
    const r = rowOf("デモ新築工事（第1期）");
    await r.getByRole("button", { name: "未締結" }).click();
    await sleep(1500);
    await p
      .locator("[role=dialog] input[type=file]")
      .setInputFiles(path.join(DIR, "契約書サンプル.pdf"));
    await v.quiet(800);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "アップロード" })
      .click();
    await sleep(3000);
  }
);
await chkWait(
  "契約書をアップロードすると、締結済みになり、契約済みに進む",
  async () =>
    (await rowOf("デモ新築工事（第1期）").innerText()).includes("契約済み") &&
    (await rowOf("デモ新築工事（第1期）")
      .getByRole("button", { name: "締結済み" })
      .count()) === 1
);

await v.say(
  "契約書が登録されると、ボタンが、締結済みに変わります。押すと、契約書を確認できます。ここから削除もできます。閉じるで戻ります。",
  async (p) => {
    await rowOf("デモ新築工事（第1期）")
      .getByRole("button", { name: "締結済み" })
      .click();
    await sleep(2000);
    await v.quiet(1500);
    await closeDlg();
  }
);

await v.say(
  "報告書は、工事完了の報告書を保管する、任意の書類です。報告書のボタンから、PDFをアップロードします。",
  async (p) => {
    await rowOf("デモ新築工事（第1期）")
      .getByRole("button", { name: "報告書" })
      .click();
    await sleep(1500);
    await p
      .locator("[role=dialog] input[type=file]")
      .setInputFiles(path.join(DIR, "報告書サンプル.pdf"));
    await v.quiet(600);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "アップロード" })
      .click();
    await sleep(3000);
  }
);
await chkWait(
  "報告書をアップロードできる",
  async () =>
    (await rowOf("デモ新築工事（第1期）")
      .getByRole("button", { name: "報告書" })
      .count()) === 1
);

await v.say(
  "請求書のボタンを押すと、請求書の作成画面が開きます。明細と、税込の合計、入金口座が表示されます。プレビューを見ながら、PDFで保存、分割請求で保存、メール送信、ダウンロードができます。",
  async (p) => {
    await rowOf("デモ新築工事（第1期）")
      .getByRole("button", { name: "請求書" })
      .click();
    await sleep(3000);
    await v.quiet(2000);
  }
);
chk(
  "請求書の作成画面に、保存・分割保存・メール送信・ダウンロードがある",
  await Promise.all(
    ["PDFで保存", "PDFで保存（分割請求）", "メール送信", "ダウンロード"].map(
      (n) =>
        page
          .getByRole("dialog")
          .getByRole("button", { name: n, exact: true })
          .count()
    )
  ).then((a) => a.every((x) => x >= 1))
);
await closeDlg();

await v.say(
  "工事計画のボタンで、その案件の、発注の明細の画面に移ります。工事計画の使い方は、次の動画で説明します。",
  async (p) => {
    await rowOf("デモ新築工事（第1期）")
      .getByRole("link", { name: "工事計画" })
      .click();
    await p.waitForURL(/orders-list/);
    await waitIdle(p, 1500);
  }
);
chk(
  "工事計画のボタンで、その案件の工事計画に移動する",
  page.url().includes("projectId="),
  page.url()
);
await page.goto(`${BASE}/projects`);
await waitIdle(page, 1500);

await v.say(
  "確定のボタンは、管理者が、引渡月の末日を過ぎた案件に対して使います。確定すると、その案件の金額とステータスが固定され、解除のボタンに変わります。解除で、元に戻せます。",
  async (p) => {
    const r = rowOf("リゾート客室棟");
    await r.getByRole("button", { name: "確定", exact: true }).click();
    await sleep(2500);
    await chkWait(
      "確定すると、ボタンが解除に変わる",
      async () => (await r.getByRole("button", { name: "解除" }).count()) === 1
    );
    await v.quiet(1500);
    await r.getByRole("button", { name: "解除" }).click();
    await sleep(2500);
    await chkWait(
      "解除すると、確定に戻る",
      async () =>
        (await r.getByRole("button", { name: "確定", exact: true }).count()) ===
        1
    );
  }
);

await v.say(
  "案件を削除するには、行を押して編集に入り、右の、削除を押します。確認のダイアログで、削除を選びます。確定（ロック）されていない案件は、契約書などの有無に関わらず、削除できます。確定された案件は、編集に入れないため、削除できません。削除用の案件を、新しく作って、削除します。",
  async (p) => {
    await p.getByRole("button", { name: "行を追加" }).click();
    await sleep(1200);
    let row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "保存" }) })
      .first();
    await row
      .locator("input")
      .first()
      .pressSequentially("削除用の案件", { delay: 80 });
    await pick(row.getByRole("combobox").nth(0), "株式会社京洛ホテルズ");
    await pick(row.getByRole("combobox").nth(1), "2027");
    await pick(row.getByRole("combobox").nth(2), "2");
    await row.getByRole("button", { name: "保存" }).click();
    await sleep(2500);
    await rowOf("削除用の案件").locator("td").nth(1).click();
    await sleep(1200);
    row = p
      .locator("tbody tr")
      .filter({ has: p.getByRole("button", { name: "削除" }) })
      .first();
    await row.getByRole("button", { name: "削除" }).click();
    await sleep(1200);
    await p
      .getByRole("alertdialog")
      .getByRole("button", { name: /削除/ })
      .click();
    await sleep(2500);
  }
);
await chkWait(
  "案件を削除すると、一覧から消える",
  async () => (await rowOf("削除用の案件").count()) === 0
);
await v.say("以上で、受注一覧の説明を終わります。", null);
saveFindings("03");
await v.close();
