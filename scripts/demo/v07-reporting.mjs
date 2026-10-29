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

const v = new Video("07-レポーティング", {
  storageState: await authState("hiromu.umeda@sun-asterisk.com"),
});
const page = await v.open();
const { rowOf, pick } = helpers(page);
const total = async () => (await text(page)).replace(/\s+/g, " ");

await v.say(
  "この動画では、レポーティングの使い方を説明します。顧客別と、発注先別の、2つの分析画面があります。まず、顧客別分析です。",
  async (p) => {
    await p.goto(`${BASE}/projects`);
    await waitIdle(p, 1200);
    await p.getByRole("button", { name: "レポーティング" }).click();
    await sleep(1000);
    await p
      .getByRole("link", { name: /顧客別/ })
      .first()
      .click();
    await p.waitForURL(/reporting\/customers|reporting$/);
    await sleep(5000);
  }
);
chk("顧客別分析が開く", (await text(page)).includes("顧客別分析"));

await v.say(
  "上部の会計期で、分析する期を選びます。顧客を選ぶと、その顧客だけの集計に、絞り込めます。",
  async (p) => {
    await v.quiet(1500);
    await p.getByRole("combobox").filter({ hasText: /第7期/ }).first().click();
    await sleep(800);
    await p.getByRole("option").nth(1).click();
    await sleep(3500);
    await p.getByRole("combobox").first().click();
    await sleep(800);
    await p.getByRole("option").first().click();
    await sleep(3500);
  }
);
await chkWait("会計期を切り替えると、集計が更新される", async () =>
  (await text(page)).includes("売上（合計）")
);

await v.say(
  "月別の推移では、売上高と粗利を、棒グラフで確認できます。薄い棒は、将来の期の見込みです。もうひとつのグラフでは、案件数と粗利率が分かります。",
  async (p) => {
    await v.quiet(2500);
    await p.mouse.move(700, 450);
    await sleep(2500);
  }
);
chk(
  "売上高・粗利と、案件数・粗利率のグラフがある",
  (await text(page)).includes("売上高・粗利") &&
    (await text(page)).includes("案件数・粗利率")
);

await v.say(
  "売上、原価、粗利、粗利率の合計が、カードで表示されます。粗利は、売上から、発注の決定金額と、振込手数料の合計を引いた金額です。",
  async (p) => {
    await p.getByText("売上（合計）").first().scrollIntoViewIfNeeded();
    await v.quiet(3500);
  }
);
{
  const tx = await total();
  chk(
    "売上・原価・粗利・粗利率の合計カードがある",
    ["売上（合計）", "原価（合計）", "粗利（合計）", "粗利率"].every((k) =>
      tx.includes(k)
    )
  );
}

await v.say(
  "下の案件別の表には、案件ごとの売上と粗利が並びます。行を押すと、その案件の、工事計画が開きます。",
  async (p) => {
    await p.getByText("案件別").first().scrollIntoViewIfNeeded();
    await v.quiet(2500);
    await p.locator("tbody tr").first().click();
    await p.waitForURL(/orders-list/);
    await sleep(3500);
  }
);
chk(
  "案件の行を押すと、工事計画に移動する",
  page.url().includes("orders-list"),
  page.url()
);

await v.say(
  "続いて、発注先別分析です。どの発注先に、いくら発注しているかが分かります。",
  async (p) => {
    if (
      !(await p
        .getByRole("link", { name: /発注先別/ })
        .first()
        .isVisible())
    ) {
      await p.getByRole("button", { name: "レポーティング" }).click();
      await sleep(600);
    }
    await p
      .getByRole("link", { name: /発注先別/ })
      .first()
      .click();
    await p.waitForURL(/reporting\/vendors/);
    await sleep(5000);
  }
);
chk("発注先別分析が開く", (await text(page)).includes("発注先別分析"));

await v.say(
  "会計期と、工種で、絞り込めます。発注金額の合計、発注件数、発注先の数、最大のシェアが、カードに表示されます。",
  async (p) => {
    await v.quiet(2000);
    await p.getByRole("combobox").filter({ hasText: "すべて" }).first().click();
    await sleep(800);
    await p.getByRole("option").nth(1).click();
    await sleep(3500);
  }
);
await chkWait("工種で絞り込むと、集計が変わる", async () =>
  (await text(page)).includes("発注金額（合計）")
);

await v.say(
  "下のランキングでは、発注金額の大きい順に、発注先が並び、全体に占めるシェアと、発注件数を確認できます。",
  async (p) => {
    await v.quiet(3500);
  }
);
await v.say("以上で、レポーティングの説明を終わります。", null);
saveFindings("07");
await v.close();
