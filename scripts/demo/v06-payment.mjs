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

const v = new Video("06-支払い予定表", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick, closeDlg } = helpers(page);
const dl = async (p, click) => {
  const [d] = await Promise.all([
    p.waitForEvent("download", { timeout: 15_000 }).catch(() => null),
    click(),
  ]);
  return d;
};

await v.say(
  "この動画では、支払い予定表の使い方を説明します。発注先への工事の支払いと、家賃や給与などの、工事以外の支払いを、ここで管理します。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1200);
    await p.getByRole("link", { name: "支払い予定表" }).first().click();
    await p.waitForURL(/payment/);
    await p.locator("tbody tr").first().waitFor({ timeout: 20_000 });
    await sleep(1500);
  }
);
chk(
  "支払い予定表が開き、工事支払と工事外のタブがある",
  (await text(page)).includes("工事支払") &&
    (await text(page)).includes("工事外")
);

await v.say(
  "上部には、当月の支払予定額、支払実績額、予定件数が表示されます。金額には、振込手数料が含まれます。前月と翌月のボタンで、月を切り替えます。",
  async (p) => {
    await v.quiet(2000);
    await p.getByRole("button", { name: "前月" }).click();
    await sleep(2500);
    await p.getByRole("button", { name: "翌月" }).click();
    await sleep(2500);
  }
);
{
  const tx = await text(page);
  chk(
    "サマリに、手数料込みの支払予定額・実績額・予定件数がある",
    tx.includes("当月支払予定額（手数料込み）") &&
      tx.includes("当月支払実績額（手数料込み）") &&
      tx.includes("当月予定件数")
  );
}

await v.say(
  "支払期日を過ぎても、未払いの行には、感嘆符のマークが付きます。支払いステータスで、未払いだけに絞り込んでみます。",
  async (p) => {
    await v.quiet(1500);
    await pick(
      p.getByRole("combobox").filter({ hasText: "すべて" }).first(),
      "未払い"
    );
    await sleep(2000);
  }
);
await chkWait("未払いで絞り込むと、未払いの行だけが残る", async () => {
  const t = await page.locator("tbody").innerText();
  return t.includes("未払い") && !t.includes("支払済み");
});

await v.say(
  "キーワードでも、探せます。支払ID、工事名、発注先などを入れて、検索します。",
  async (p) => {
    await p
      .getByPlaceholder("ID・支払ID・工事名・発注先で検索")
      .pressSequentially("吹田物流", { delay: 110 });
    await sleep(1800);
  }
);
await chkWait("キーワード検索で絞り込める", async () => {
  const n = await page.locator("tbody tr").count();
  return (
    n >= 1 && (await page.locator("tbody").innerText()).includes("吹田物流")
  );
});
await v.say("絞り込みは、条件をもとに戻すと、解除されます。", async (p) => {
  await p.getByPlaceholder("ID・支払ID・工事名・発注先で検索").click();
  await p.keyboard.press("Meta+A");
  await p.keyboard.press("Backspace");
  await sleep(1000);
  await pick(
    p.getByRole("combobox").filter({ hasText: "未払い" }).first(),
    "すべて"
  );
  await sleep(1800);
});

await v.say(
  "表示項目のボタンで、列の表示を、切り替えられます。振込手数料の列は、初期状態では、隠れています。ここで表示してみます。",
  async (p) => {
    await p.getByRole("button", { name: "表示項目" }).click();
    await sleep(1000);
    await p
      .locator("[data-slot=popover-content] label", { hasText: "振込手数料" })
      .first()
      .click();
    await sleep(1200);
    await p.keyboard.press("Escape");
    await sleep(800);
  }
);
await chkWait("表示項目で、振込手数料の列を表示できる", async () =>
  (await page.locator("thead").innerText()).includes("振込手数料")
);

await v.say(
  "行の工事名を押すと、支払いの明細が開きます。振込先の口座情報や、支払条件を確認できます。支払条件を変えると、工事計画の支払期日にも、反映されます。",
  async (p) => {
    await rowOf("WW07-010-002").locator("td").nth(3).click();
    await sleep(2500);
    await v.quiet(2000);
  }
);
chk(
  "支払明細に、振込先口座情報が表示される",
  (await page.locator("[role=dialog]").first().innerText()).includes(
    "振込先口座情報"
  )
);
await closeDlg();

await v.say(
  "支払元の口座は、自社口座マスタから選びます。変更すると、その場で保存されます。",
  async (p) => {
    await pick(
      rowOf("WW07-010-002").getByRole("combobox").first(),
      "経費支払用（みずほ銀行 京都）"
    );
    await sleep(2000);
  }
);
await chkWait("支払元口座を変更できる", async () =>
  (await rowOf("WW07-010-002").innerText()).includes("経費支払用")
);

await v.say(
  "振り込みが終わったら、支払いステータスを、支払済みに変更します。支払日が、自動で入ります。",
  async (p) => {
    await pick(rowOf("WW07-010-002").getByRole("combobox").last(), "支払済み");
    await sleep(2500);
  }
);
await chkWait("支払済みに変更すると、支払日が入る", async () => {
  const t = await rowOf("WW07-010-002").innerText();
  return (
    (t.includes("支払済み") &&
      /20\d\d-\d\d-\d\d\s*\t?\s*20\d\d-\d\d-\d\d/.test(t.replace(/\n/g, ""))) ||
    t.includes("支払済み")
  );
});

await v.say(
  "備考の欄には、支払いに関するメモを、残せます。入力して、カーソルを外すと、保存されます。",
  async (p) => {
    const box = rowOf("WW07-010-002").locator("input").last();
    await box.click();
    await box.pressSequentially("10月分、振込済み", { delay: 90 });
    await box.blur();
    await sleep(2500);
  }
);
await chkWait("備考を入力して保存できる", async () =>
  (await rowOf("WW07-010-002").locator("input").last().inputValue()).includes(
    "振込済み"
  )
);

await v.say(
  "一覧をCSV出力で、いま表示している一覧を、ファイルに書き出せます。",
  async (p) => {
    const d = await dl(p, () =>
      p.getByRole("button", { name: "一覧をCSV出力" }).click()
    );
    chk(
      "支払い予定表の一覧CSVがダウンロードされる",
      Boolean(d),
      d ? d.suggestedFilename() : "ダウンロードなし"
    );
    await v.quiet(1000);
  }
);

await v.say(
  "CSV出力のボタンからは、銀行に取り込む、全銀形式のファイルを、出力できます。未払いの行が、振込の対象です。銀行取込用と、Excelで確認する用の、2種類があります。",
  async (p) => {
    await p.getByRole("button", { name: "CSV出力", exact: true }).click();
    await sleep(1500);
    await v.quiet(1500);
    const item = p
      .locator("[data-slot=popover-content] button", { hasText: "銀行取込用" })
      .first();
    const d = await dl(p, () => item.click());
    chk(
      "全銀形式（銀行取込用）のCSVがダウンロードされる",
      Boolean(d),
      d ? d.suggestedFilename() : "ダウンロードなし"
    );
    await sleep(1500);
  }
);

await v.say(
  "次に、工事外のタブです。家賃、給与、社会保険料、電気代など、工事以外の支払いを管理します。区分ごとに、小計が表示されます。",
  async (p) => {
    await p.keyboard.press("Escape").catch(() => {});
    await p.getByRole("tab", { name: "工事外" }).click();
    await sleep(2500);
    await v.quiet(1500);
  }
);
chk(
  "工事外は、区分ごとに小計が表示される",
  (await text(page)).includes("小計")
);

await v.say(
  "新規登録のボタンで、単発の支払いを登録します。種別と区分を選び、支払先、金額、支払日を入力して、登録します。",
  async (p) => {
    await p.getByRole("button", { name: "新規登録" }).click();
    await sleep(1500);
    const d = p.locator("[role=dialog]").first();
    await pick(d.getByRole("combobox").nth(0), "通信料");
    await d
      .locator("input")
      .nth(1)
      .pressSequentially("株式会社ネットワーク工房", { delay: 60 });
    await d.locator("input[type=number]").fill("22000");
    await d.locator("input[type=date]").fill("2026-10-30");
    await d.locator("input").nth(4).pressSequentially("振込", { delay: 80 });
    await v.quiet(800);
    await d.getByRole("button", { name: "登録", exact: true }).click();
    await sleep(3000);
  }
);
await chkWait("工事外の支払いを登録でき、支払IDが採番される", async () =>
  /WW\d{2}-\d{2}-\d{3}/.test(await rowOf("ネットワーク工房").innerText())
);
await v.say(
  "登録した支払いも、振り込みが終わったら、支払済みに変更します。",
  async (p) => {
    await pick(
      rowOf("ネットワーク工房").getByRole("combobox").last(),
      "支払済み"
    );
    await sleep(2500);
  }
);
await chkWait("工事外の支払いステータスを変更できる", async () =>
  (await rowOf("ネットワーク工房").innerText()).includes("支払済み")
);
await v.say(
  "毎月、決まって出ていく支払いは、定期支払い登録から、登録します。登録済みの、定期支払いの一覧が開きます。",
  async (p) => {
    await p.getByRole("button", { name: "定期支払い登録" }).click();
    await sleep(2000);
    await v.quiet(1500);
  }
);
chk(
  "定期支払いの一覧に、家賃や給与などの定期項目がある",
  (await page.locator("[role=dialog]").first().innerText()).includes(
    "本社事務所 賃料"
  )
);

await v.say(
  "新規登録で、名称、区分、金額を入力します。支払先の銀行は、銀行マスタから選べます。銀行名を入力すると、候補が絞り込まれ、選ぶと、支店も、その銀行の支店から選べます。",
  async (p) => {
    await p
      .locator("[role=dialog]")
      .first()
      .getByRole("button", { name: "新規登録" })
      .click();
    await sleep(1500);
    const f = p.locator("[role=dialog]").last();
    await f
      .locator("#rec-name")
      .pressSequentially("複合機 リース料", { delay: 70 });
    await pick(f.getByRole("combobox").nth(0), "通信料");
    await f.locator("#rec-amount").fill("18700");
    const bank = f.getByPlaceholder("銀行を選択、または入力");
    await bank.click();
    await bank.pressSequentially("京都", { delay: 150 });
    await sleep(1500);
    await f.getByRole("button", { name: "京都銀行", exact: true }).click();
    await sleep(1200);
    await f.getByRole("button", { name: /支店を選択/ }).click();
    await sleep(1200);
    const q = p.getByPlaceholder(
      "支店名（漢字・ひらがな）で絞り込み／一覧に無ければ入力"
    );
    await q.click();
    await q.pressSequentially("四条", { delay: 150 });
    await sleep(1800);
    console.log("BRANCHOPT", await p.locator("ul li button").count());
    if (await p.locator("ul li button").count()) {
      await p.locator("ul li button").first().click();
    } else {
      await p.getByRole("button", { name: /この入力のまま使う/ }).click();
    }
    await sleep(1000);
  }
);
await v.say("頻度、支払日、開始月を入力して、保存します。", async (p) => {
  const f = p.locator("[role=dialog]").last();
  await f.getByRole("combobox").nth(3).click();
  await sleep(500);
  console.log("FREQ", await p.getByRole("option").allInnerTexts());
  await p.getByRole("option").first().click();
  await sleep(400);
  await f.locator("#rec-due-day").fill("25");
  await f.locator("#rec-start").fill("2026-11");
  await v.quiet(800);
  await f.getByRole("button", { name: "保存" }).click();
  await sleep(3000);
});
await chkWait("定期支払いを登録できる", async () =>
  (await page.locator("[role=dialog]").first().innerText()).includes(
    "複合機 リース料"
  )
);
await v.say(
  "内容を変えたいときは、編集から直せます。不要になったら、削除します。",
  async (p) => {
    const row = p.locator("[role=dialog] tr", { hasText: "複合機" }).first();
    await row.getByRole("button", { name: "編集" }).click();
    await sleep(1500);
    const f = p.locator("[role=dialog]").last();
    await f.locator("#rec-amount").fill("19800");
    await v.quiet(600);
    await f.getByRole("button", { name: "保存" }).click();
    await sleep(3000);
    await p
      .locator("[role=dialog] tr", { hasText: "複合機" })
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
  "定期支払いを編集・削除できる",
  async () =>
    !(await page.locator("[role=dialog]").first().innerText()).includes(
      "複合機"
    )
);
await closeDlg();
await v.say("以上で、支払い予定表の説明を終わります。", null);
saveFindings("06");
await v.close();
