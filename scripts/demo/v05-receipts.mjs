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

const v = new Video("05-売上管理表", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick, closeDlg } = helpers(page);

await v.say(
  "この動画では、売上管理表の使い方を説明します。工事の入金状況と、賃貸収入や備品売上などの、工事外の売上を、ここで管理します。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1200);
    await p.getByRole("link", { name: "売上管理表" }).first().click();
    await p.waitForURL(/receipts/);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1500);
  }
);
chk(
  "売上管理表が開き、工事売上と工事外売上のタブがある",
  (await text(page)).includes("工事売上") &&
    (await text(page)).includes("工事外売上")
);

await v.say(
  "上部には、当月の入金予定額、入金実績額、未入金の件数が表示されます。前月と翌月のボタンで、月を切り替えられます。",
  async (p) => {
    await v.quiet(1500);
    await p.getByRole("button", { name: "前月" }).click();
    await sleep(2500);
    await p.getByRole("button", { name: "翌月" }).click();
    await sleep(2500);
  }
);
{
  const tx = await text(page);
  chk(
    "サマリに、当月入金予定額・実績額・未入金件数がある",
    ["当月入金予定額", "当月入金実績額", "当月未入金件数"].every((k) =>
      tx.includes(k)
    )
  );
}
await chkWait(
  "月を戻すと、元の月の一覧が表示される",
  async () => (await page.locator("tbody tr").count()) >= 1
);

await v.say(
  "入金ステータス、入金期日の範囲、キーワードで、一覧を絞り込めます。ここでは、防災倉庫で検索してみます。",
  async (p) => {
    await p
      .getByPlaceholder("案件ID・工事名・発注者で検索")
      .pressSequentially("防災倉庫", { delay: 120 });
    await sleep(1800);
  }
);
await chkWait(
  "キーワード検索で、該当の案件だけが表示される",
  async () => (await page.locator("tbody tr").count()) === 1
);

await v.say(
  "表示項目のボタンで、備考や入金先口座などの列を、出したり隠したりできます。",
  async (p) => {
    await p.getByRole("button", { name: "表示項目" }).click();
    await sleep(1200);
    await p.keyboard.press("Escape");
    await sleep(600);
  }
);

await v.say(
  "行の案件名を押すと、売上と入金の明細が開きます。請負金額、入金額、入金日のほか、案件の情報を確認できます。工事計画へも、ここから移動できます。",
  async (p) => {
    await rowOf("防災倉庫").locator("td").nth(2).click();
    await sleep(2500);
    await v.quiet(1500);
  }
);
chk(
  "明細に、請負金額・入金ステータス・入金額・入金日が表示される",
  (await page.locator("[role=dialog]").first().innerText()).includes("入金額")
);
await closeDlg();

await v.say(
  "入金先の口座は、自社口座マスタから選びます。変更すると、その場で保存されます。",
  async (p) => {
    await pick(
      rowOf("防災倉庫").getByRole("combobox").first(),
      "メイン口座（京都銀行 四条）"
    );
    await sleep(2000);
  }
);
await chkWait("入金先口座を変更できる", async () =>
  (await rowOf("防災倉庫").innerText()).includes("メイン口座")
);

await v.say(
  "入金ステータスは、未入金、分割入金済、入金済から選べます。工事代金を分けて受け取った場合は、分割入金済にします。",
  async (p) => {
    await pick(rowOf("防災倉庫").getByRole("combobox").last(), "分割入金済");
    await sleep(2500);
  }
);
await chkWait("ステータスを分割入金済に変更できる", async () =>
  (await rowOf("防災倉庫").innerText()).includes("分割入金済")
);

await v.say(
  "全額が入金されたら、入金済に変更します。すると、入金額に、契約金額が記録され、入金日が入ります。",
  async (p) => {
    await pick(rowOf("防災倉庫").getByRole("combobox").last(), "入金済");
    await sleep(2500);
  }
);
await chkWait(
  "入金済にすると、入金額が契約金額になる",
  async () =>
    (await rowOf("防災倉庫").innerText()).includes(
      "¥15,600,000\t¥15,600,000"
    ) ||
    (await rowOf("防災倉庫").innerText())
      .replace(/\s+/g, " ")
      .includes("¥15,600,000 ¥15,600,000")
);

await v.say(
  "備考の欄には、入金に関するメモを、自由に残せます。入力して、カーソルを外すと、保存されます。",
  async (p) => {
    const cell = rowOf("防災倉庫").locator("td").last();
    await cell.click();
    await sleep(600);
    const box = rowOf("防災倉庫").locator("input, textarea").last();
    await box.pressSequentially("10月末に全額入金を確認", { delay: 90 });
    await box.blur();
    await sleep(2500);
  }
);
await chkWait("備考を入力して保存できる", async () =>
  (await rowOf("防災倉庫").locator("input").last().inputValue()).includes(
    "全額入金を確認"
  )
);

await v.say(
  "右上の、CSV出力で、表示している一覧を、ファイルに書き出せます。",
  async (p) => {
    const [dl] = await Promise.all([
      p.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
      p.getByRole("button", { name: "CSV出力" }).click(),
    ]);
    chk(
      "売上管理表のCSVがダウンロードされる",
      Boolean(dl),
      dl ? dl.suggestedFilename() : "ダウンロードなし"
    );
    await v.quiet(1000);
  }
);

await v.say(
  "次に、工事外売上のタブです。賃貸収入、備品売上、利息など、工事以外の売上を管理します。",
  async (p) => {
    const q = p.getByPlaceholder("案件ID・工事名・発注者で検索");
    await q.click();
    await p.keyboard.press("Meta+A");
    await p.keyboard.press("Backspace");
    await sleep(800);
    await p.getByRole("tab", { name: "工事外売上" }).click();
    await sleep(2500);
  }
);
chk(
  "工事外売上は、区分ごとに小計が表示される",
  (await text(page)).includes("小計")
);

await v.say(
  "新規登録のボタンで、単発の売上を登録します。区分、名称、入金元、金額、入金予定日を入力して、登録します。",
  async (p) => {
    await p.getByRole("button", { name: "新規登録" }).click();
    await sleep(1500);
    const d = p.locator("[role=dialog]").first();
    await pick(d.getByRole("combobox").first(), "備品売上");
    const t = d.locator(
      "input:not([type=number]):not([type=date]):not([type=hidden])"
    );
    await t.nth(0).pressSequentially("古い什器の売却", { delay: 80 });
    await t.nth(1).pressSequentially("株式会社リサイクル商会", { delay: 60 });
    await d.locator("input[type=number]").fill("48000");
    await d.locator("input[type=date]").fill("2026-10-31");
    await v.quiet(800);
    await d.getByRole("button", { name: "登録", exact: true }).click();
    await sleep(3000);
  }
);
await chkWait("工事外売上を登録でき、売上IDが採番される", async () =>
  /WS\d{2}-\d{2}-\d{3}/.test(await rowOf("古い什器の売却").innerText())
);

await v.say(
  "登録した売上も、入金されたら、ステータスを入金済に変更します。",
  async (p) => {
    await pick(rowOf("古い什器の売却").getByRole("combobox").last(), "入金済");
    await sleep(2500);
  }
);
await chkWait("工事外売上の入金ステータスを変更できる", async () =>
  (await rowOf("古い什器の売却").innerText()).includes("入金済")
);

await v.say(
  "毎月、決まって入る収入は、定期売上登録から、登録します。登録済みの定期売上の、一覧が開きます。",
  async (p) => {
    await p.getByRole("button", { name: "定期売上登録" }).click();
    await sleep(2000);
    await v.quiet(1500);
  }
);
chk(
  "定期売上の一覧に、賃貸収入などの定期項目がある",
  (await page.locator("[role=dialog]").first().innerText()).includes("月極賃料")
);

await v.say(
  "新規登録で、名称、区分、入金元、金額、毎月の入金日を、設定します。登録すると、毎月、工事外売上に、自動で行が作られます。",
  async (p) => {
    await p
      .locator("[role=dialog]")
      .first()
      .getByRole("button", { name: "新規登録" })
      .click();
    await sleep(1500);
    await v.quiet(1500);
    const f = p.locator("[role=dialog]").last();
    await f
      .locator("#rrec-name")
      .pressSequentially("駐車場 追加区画 賃料", { delay: 70 });
    await pick(f.getByRole("combobox").nth(0), "賃貸収入");
    await f.locator("#rrec-amount").fill("33000");
    await f
      .locator("#rrec-payer")
      .pressSequentially("株式会社東山パーキング", { delay: 50 });
    await pick(f.getByRole("combobox").nth(1), "毎月（毎月発生）");
    await f.locator("#rrec-due-day").fill("20");
    await f.locator("#rrec-start").fill("2026-11");
    await v.quiet(800);
  }
);
await v.say(
  "保存すると、定期売上の一覧に追加されます。金額が変わったときは、編集から直せます。不要になったら、削除します。",
  async (p) => {
    await p
      .locator("[role=dialog]")
      .last()
      .getByRole("button", { name: "保存" })
      .click();
    await sleep(3000);
    const row = p.locator("[role=dialog] tr", { hasText: "追加区画" }).first();
    await row.getByRole("button", { name: "編集" }).click();
    await sleep(1500);
    const f = p.locator("[role=dialog]").last();
    await f.locator("#rrec-amount").fill("35000");
    await v.quiet(600);
    await f.getByRole("button", { name: "保存" }).click();
    await sleep(3000);
    await p
      .locator("[role=dialog] tr", { hasText: "追加区画" })
      .first()
      .getByRole("button", { name: "削除" })
      .click();
    await sleep(1500);
    await p
      .getByRole("alertdialog")
      .getByRole("button", { name: /削除/ })
      .click();
    await sleep(3000);
  }
);
await chkWait(
  "定期売上を登録・編集・削除できる",
  async () =>
    !(await page.locator("[role=dialog]").first().innerText()).includes(
      "追加区画"
    )
);
await v.say("以上で、売上管理表の説明を終わります。", null);
await closeDlg();
await closeDlg();
saveFindings("05");
await v.close();
