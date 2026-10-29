// @ts-nocheck
// biome-ignore-all lint: 一度きりのデータ入れ替えスクリプト（本番DBのテストデータを消し、現実的なデモデータに置き換える）
/**
 * テスト・ゴミデータを削除し、期間・種類をばらした現実的なデータを生成する。
 * 既定はドライラン（最後にROLLBACK）。実行する場合だけ `--commit` を付ける。
 *   bun run scripts/reset-demo-data.ts            # ドライラン
 *   bun run scripts/reset-demo-data.ts --commit   # 反映
 * 実行前に必ず pg_dump でバックアップを取ること。
 */

import PDFDocument from "pdfkit";
import postgres from "postgres";
import {
  currentFiscalPeriod,
  fiscalPeriodLabel,
  fiscalPeriodOfMonth,
} from "~/lib/fiscal-period";
import { calcPaymentDueDate, paymentTermLabel } from "~/lib/payment-term";
import {
  dueDateForMonth,
  formatMiscPaymentNo,
  miscNoKeyForMonth,
} from "~/lib/recurring-payments";
import { formatReceiptNo } from "~/lib/recurring-receipts";

const COMMIT = process.argv.includes("--commit");
const TODAY = "2026-10-27";
const NOW = new Date("2026-10-27T10:00:00+09:00");

const url = (process.env.DATABASE_URL ?? "").split("?")[0] as string;
const sql = postgres(url, { max: 1, prepare: false });

// ---------- 乱数・日付ヘルパー ----------
let seed = 20261027;
function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
};
const lastDay = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
};
const addDays = (d: string, n: number): string => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const roundTo = (n: number, unit: number) => Math.round(n / unit) * unit;
const ts = (d: string, h = 10, mi = between(0, 59)): Date =>
  new Date(`${d}T${pad(h)}:${pad(mi)}:00+09:00`);
const yenTax = (sub: number) => Math.floor(sub * 0.1);

function dummyPdf(title: string): Promise<string> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4" });
    const bufs: Buffer[] = [];
    doc.on("data", (b: Buffer) => bufs.push(b));
    doc.on("end", () =>
      resolve(
        `data:application/pdf;base64,${Buffer.concat(bufs).toString("base64")}`
      )
    );
    doc.fontSize(18).text(title, 72, 120);
    doc.fontSize(11).text("Sample document for demo data.", 72, 160);
    doc.end();
  });
}

// ---------- マスタ定義 ----------
const BANK_LABEL = (name: string) =>
  /(店|部|所|課|室|センター|集中|公務|本社)$/.test(name) ? name : `${name}支店`;

const STAFF = ["小林 靖昌", "玉木 宏明", "石河 一明", "土井 丈生"] as const;

const CUSTOMERS = [
  {
    company: "洛北ハウジング株式会社",
    dept: "開発事業部",
    contact: "岡田 圭介",
    title: "課長",
    email: "okada@rakuhoku-housing.example.jp",
    phone: "075-781-2210",
    zip: "603-8302",
    address: "京都府京都市北区紫野東御所田町28-3",
    capital: 80000000,
    scale: "中堅",
  },
  {
    company: "関西フードサービス株式会社",
    dept: "店舗開発課",
    contact: "中島 由美",
    title: "主任",
    email: "nakajima@kansai-food.example.jp",
    phone: "06-6377-4125",
    zip: "532-0011",
    address: "大阪府大阪市淀川区西中島5-6-3",
    capital: 120000000,
    scale: "大手",
  },
  {
    company: "琵琶湖リゾート開発株式会社",
    dept: "施設管理部",
    contact: "西村 健太",
    title: "部長",
    email: "nishimura@biwako-resort.example.jp",
    phone: "077-523-8801",
    zip: "520-0043",
    address: "滋賀県大津市中央2-1-12",
    capital: 300000000,
    scale: "大手",
  },
  {
    company: "医療法人社団 桂和会",
    dept: "事務局",
    contact: "藤井 理恵",
    title: "事務長",
    email: "fujii@keiwakai.example.jp",
    phone: "075-381-5520",
    zip: "615-8071",
    address: "京都府京都市西京区桂野里町14",
    capital: null,
    scale: "中堅",
  },
  {
    company: "株式会社丹後商事",
    dept: "総務部",
    contact: "高橋 誠",
    title: "部長",
    email: "takahashi@tango-shoji.example.jp",
    phone: "0772-22-4140",
    zip: "625-0036",
    address: "京都府舞鶴市浜2020",
    capital: 30000000,
    scale: "中小",
  },
  {
    company: "大和不動産管理株式会社",
    dept: "建物管理部",
    contact: "井上 達也",
    title: "課長",
    email: "inoue@yamato-fudosan.example.jp",
    phone: "0742-34-9071",
    zip: "630-8215",
    address: "奈良県奈良市東向中町29",
    capital: 50000000,
    scale: "中堅",
  },
  {
    company: "福知山市",
    dept: "都市整備課",
    contact: "森本 浩二",
    title: "係長",
    email: "tosei@fukuchiyama.example.lg.jp",
    phone: "0773-24-7011",
    zip: "620-8501",
    address: "京都府福知山市字内記13-1",
    capital: null,
    scale: "官公庁",
  },
  {
    company: "学校法人 洛南学園",
    dept: "施設課",
    contact: "山口 恵子",
    title: "課長",
    email: "yamaguchi@rakunan-gakuen.example.ed.jp",
    phone: "075-691-7125",
    zip: "601-8478",
    address: "京都府京都市南区壬生通八条下る",
    capital: null,
    scale: "学校法人",
  },
  {
    company: "株式会社ナニワロジスティクス",
    dept: "施設管理課",
    contact: "田村 一郎",
    title: "課長",
    email: "tamura@naniwa-logi.example.jp",
    phone: "06-6612-3380",
    zip: "590-0985",
    address: "大阪府堺市堺区戎之町西1-1-30",
    capital: 200000000,
    scale: "大手",
  },
  {
    company: "宇治茶まちづくり協同組合",
    dept: "事務局",
    contact: "松本 美帆",
    title: "事務局長",
    email: "matsumoto@uji-machizukuri.example.or.jp",
    phone: "0774-21-3320",
    zip: "611-0021",
    address: "京都府宇治市宇治琴坂27",
    capital: null,
    scale: "組合",
  },
  {
    company: "阪神メディカルプラザ株式会社",
    dept: "管理部",
    contact: "石井 大輔",
    title: "次長",
    email: "ishii@hanshin-medical.example.jp",
    phone: "06-6431-7782",
    zip: "660-0052",
    address: "兵庫県尼崎市七松町3-8-4",
    capital: 90000000,
    scale: "中堅",
  },
  {
    company: "株式会社京洛ホテルズ",
    dept: "施設営繕室",
    contact: "長谷川 修",
    title: "室長",
    email: "hasegawa@keiraku-hotels.example.jp",
    phone: "075-221-8890",
    zip: "604-8005",
    address: "京都府京都市中京区河原町通三条上る",
    capital: 400000000,
    scale: "大手",
  },
  {
    company: "南丹市",
    dept: "建設課",
    contact: "上田 勝",
    title: "主幹",
    email: "kensetsu@nantan.example.lg.jp",
    phone: "0771-68-0011",
    zip: "629-0197",
    address: "京都府南丹市園部町小桜町47",
    capital: null,
    scale: "官公庁",
  },
  {
    company: "株式会社東山パーキング",
    dept: "事業企画課",
    contact: "渡辺 沙織",
    title: "主任",
    email: "watanabe@higashiyama-pk.example.jp",
    phone: "075-541-6630",
    zip: "605-0074",
    address: "京都府京都市東山区祇園町南側570",
    capital: 20000000,
    scale: "中小",
  },
] as const;

interface VendorDef {
  address: string;
  bank: string;
  bankCode: string;
  branch: string;
  cats: string[];
  company: string;
  contact: string;
  dept: string;
  email: string;
  holder: string;
  number: string;
  phone: string;
  term: [string, string, string]; // 締め日, 支払日, 支払月
  type: string;
  zip: string;
}
const VENDORS: VendorDef[] = [
  {
    company: "洛北基礎工業株式会社",
    dept: "工事部",
    contact: "安田 修司",
    email: "yasuda@rakuhoku-kiso.example.jp",
    phone: "075-722-5101",
    zip: "603-8044",
    address: "京都府京都市北区小山下総町12",
    cats: ["基礎工事", "仮設工事"],
    bank: "京都銀行",
    bankCode: "0158",
    branch: "四条",
    type: "普通",
    number: "3105482",
    holder: "ラクホクキソコウギョウ（カ",
    term: ["末", "末", "1"],
  },
  {
    company: "株式会社大和鉄骨",
    dept: "営業部",
    contact: "大西 隆",
    email: "onishi@yamato-tekkotsu.example.jp",
    phone: "0743-52-2260",
    zip: "639-1123",
    address: "奈良県大和郡山市筒井町820",
    cats: ["鉄骨工事", "軽鉄工事", "鋼製建具工事"],
    bank: "三菱UFJ銀行",
    bankCode: "0005",
    branch: "梅田",
    type: "普通",
    number: "4418207",
    holder: "ヤマトテッコツ（カ",
    term: ["末", "5", "2"],
  },
  {
    company: "京洛内装株式会社",
    dept: "内装設計課",
    contact: "金子 真由",
    email: "kaneko@keiraku-naiso.example.jp",
    phone: "075-312-4480",
    zip: "600-8216",
    address: "京都府京都市下京区烏丸通七条下る",
    cats: ["内装工事", "軽鉄工事", "家具工事", "木工造作工事"],
    bank: "三井住友銀行",
    bankCode: "0009",
    branch: "京都",
    type: "普通",
    number: "6023915",
    holder: "ケイラクナイソウ（カ",
    term: ["末", "末", "1"],
  },
  {
    company: "関西電気設備株式会社",
    dept: "電気工事部",
    contact: "原田 浩",
    email: "harada@kansai-denki.example.jp",
    phone: "06-6942-7710",
    zip: "540-0026",
    address: "大阪府大阪市中央区内本町1-2-9",
    cats: ["電気工事", "弱電工事", "防災工事"],
    bank: "みずほ銀行",
    bankCode: "0001",
    branch: "京都",
    type: "普通",
    number: "2874106",
    holder: "カンサイデンキセツビ（カ",
    term: ["末", "5", "2"],
  },
  {
    company: "琵琶湖設備工業株式会社",
    dept: "設備部",
    contact: "近藤 正樹",
    email: "kondo@biwako-setsubi.example.jp",
    phone: "077-562-3340",
    zip: "525-0034",
    address: "滋賀県草津市大路1-4-18",
    cats: ["設備工事"],
    bank: "滋賀銀行",
    bankCode: "0157",
    branch: "草津",
    type: "普通",
    number: "0519374",
    holder: "ビワコセツビコウギョウ（カ",
    term: ["末", "15", "1"],
  },
  {
    company: "西陣塗装工業",
    dept: "",
    contact: "吉田 光男",
    email: "yoshida@nishijin-tosou.example.jp",
    phone: "075-441-9082",
    zip: "602-8301",
    address: "京都府京都市上京区上立売通浄福寺西入",
    cats: ["塗装工事", "左官工事", "リペア工事"],
    bank: "京都信用金庫",
    bankCode: "1610",
    branch: "西陣",
    type: "当座",
    number: "0128843",
    holder: "ニシジントソウコウギョウ",
    term: ["末", "末", "1"],
  },
  {
    company: "株式会社ミヤコ防水",
    dept: "施工管理課",
    contact: "清水 健",
    email: "shimizu@miyako-bosui.example.jp",
    phone: "075-662-0155",
    zip: "601-8031",
    address: "京都府京都市南区東九条上殿田町45",
    cats: ["防水工事", "屋根工事"],
    bank: "りそな銀行",
    bankCode: "0010",
    branch: "京都",
    type: "普通",
    number: "1759028",
    holder: "ミヤコボウスイ（カ",
    term: ["末", "5", "2"],
  },
  {
    company: "山科外構造園株式会社",
    dept: "外構課",
    contact: "木村 隆之",
    email: "kimura@yamashina-gaiko.example.jp",
    phone: "075-583-2290",
    zip: "607-8080",
    address: "京都府京都市山科区音羽前出町15",
    cats: ["外構工事", "植栽工事"],
    bank: "京都信用金庫",
    bankCode: "1610",
    branch: "山科",
    type: "普通",
    number: "0384217",
    holder: "ヤマシナガイコウゾウエン（カ",
    term: ["末", "15", "1"],
  },
  {
    company: "株式会社堺解体",
    dept: "工事部",
    contact: "村上 剛",
    email: "murakami@sakai-kaitai.example.jp",
    phone: "072-238-5510",
    zip: "590-0958",
    address: "大阪府堺市堺区南旅篭町東1-2",
    cats: ["解体工事", "仮設工事"],
    bank: "大阪信用金庫",
    bankCode: "1630",
    branch: "堺東",
    type: "普通",
    number: "5560193",
    holder: "サカイカイタイ（カ",
    term: ["末", "末", "1"],
  },
  {
    company: "丹波建具製作所",
    dept: "",
    contact: "谷口 義雄",
    email: "taniguchi@tanba-tategu.example.jp",
    phone: "0771-22-6054",
    zip: "621-0851",
    address: "京都府亀岡市追分町谷筋30",
    cats: ["木工建具工事", "鋼製建具工事", "家具工事"],
    bank: "京都銀行",
    bankCode: "0158",
    branch: "京都駅前",
    type: "普通",
    number: "3341562",
    holder: "タンバタテグセイサクショ",
    term: ["末", "5", "2"],
  },
  {
    company: "株式会社南都タイル",
    dept: "営業課",
    contact: "岡本 亮",
    email: "okamoto@nanto-tile.example.jp",
    phone: "0742-45-1180",
    zip: "630-8014",
    address: "奈良県奈良市四条大路2-3-11",
    cats: ["タイル工事", "左官工事"],
    bank: "南都銀行",
    bankCode: "0162",
    branch: "学園前",
    type: "普通",
    number: "0772815",
    holder: "ナントタイル（カ",
    term: ["末", "5", "2"],
  },
  {
    company: "洛南ガラス工業株式会社",
    dept: "施工課",
    contact: "杉本 健二",
    email: "sugimoto@rakunan-glass.example.jp",
    phone: "075-681-3305",
    zip: "601-8003",
    address: "京都府京都市南区東九条東山王町21",
    cats: ["硝子工事", "金物造作工事"],
    bank: "三菱UFJ銀行",
    bankCode: "0005",
    branch: "京都",
    type: "普通",
    number: "4902251",
    holder: "ラクナンガラスコウギョウ（カ",
    term: ["末", "末", "1"],
  },
  {
    company: "近畿昇降機サービス株式会社",
    dept: "工事課",
    contact: "前田 直樹",
    email: "maeda@kinki-elevator.example.jp",
    phone: "06-6264-5520",
    zip: "541-0053",
    address: "大阪府大阪市中央区本町3-4-8",
    cats: ["昇降機工事"],
    bank: "池田泉州銀行",
    bankCode: "0161",
    branch: "梅田",
    type: "普通",
    number: "1086634",
    holder: "キンキショウコウキサービス（カ",
    term: ["末", "15", "1"],
  },
  {
    company: "株式会社東山足場",
    dept: "",
    contact: "内藤 勇",
    email: "naito@higashiyama-ashiba.example.jp",
    phone: "075-531-4408",
    zip: "605-0932",
    address: "京都府京都市東山区本町15丁目",
    cats: ["仮設工事"],
    bank: "みずほ銀行",
    bankCode: "0001",
    branch: "大阪",
    type: "普通",
    number: "2231907",
    holder: "ヒガシヤマアシバ（カ",
    term: ["末", "末", "1"],
  },
  {
    company: "関西エイジング・リペア合同会社",
    dept: "",
    contact: "三宅 由香",
    email: "miyake@kansai-aging.example.jp",
    phone: "06-6195-2284",
    zip: "553-0003",
    address: "大阪府大阪市福島区福島6-12-21",
    cats: ["リペア工事", "エイジング工事"],
    bank: "三井住友銀行",
    bankCode: "0009",
    branch: "堺",
    type: "普通",
    number: "7140382",
    holder: "カンサイエイジングリペア（ド",
    term: ["末", "5", "2"],
  },
  {
    company: "株式会社ナカガワ資材",
    dept: "資材課",
    contact: "中川 大地",
    email: "nakagawa@nakagawa-shizai.example.jp",
    phone: "073-431-6620",
    zip: "640-8341",
    address: "和歌山県和歌山市黒田1-2-5",
    cats: ["建築工事一式", "その他", "ネット購入"],
    bank: "紀陽銀行",
    bankCode: "0163",
    branch: "和歌山中央",
    type: "普通",
    number: "0629448",
    holder: "ナカガワシザイ（カ",
    term: ["末", "末", "1"],
  },
];

// 工種プール（工事の種類ごと）
const POOL = {
  new: [
    "仮設工事",
    "基礎工事",
    "鉄骨工事",
    "屋根工事",
    "電気工事",
    "設備工事",
    "内装工事",
    "外構工事",
    "塗装工事",
  ],
  reform: [
    "解体工事",
    "内装工事",
    "軽鉄工事",
    "電気工事",
    "設備工事",
    "塗装工事",
    "家具工事",
    "木工造作工事",
  ],
  repair: [
    "仮設工事",
    "防水工事",
    "塗装工事",
    "左官工事",
    "鉄骨工事",
    "解体工事",
    "硝子工事",
  ],
} as const;

type Status =
  | "未対応"
  | "提案中"
  | "見積確認中"
  | "受注"
  | "請求書発行済み"
  | "全額入金済み"
  | "失注"
  | "オーダー移行";
interface ProjDef {
  acct?: number; // 入金先口座の番号(1-5)
  amount: number;
  c: number;
  dm: string;
  dur?: number;
  irregular?: boolean;
  key: string;
  kind: keyof typeof POOL;
  moveTo?: { dm: string; key: string; name?: string }; // オーダー移行元
  name: string;
  noContract?: boolean;
  overdue?: boolean;
  split?: number[];
  status: Status;
  unlocked?: boolean;
}
const P: ProjDef[] = [
  {
    key: "p01",
    name: "桂川沿い共同住宅 外壁改修工事",
    c: 5,
    dm: "2025-02",
    amount: 18_600_000,
    status: "全額入金済み",
    kind: "repair",
  },
  {
    key: "p02",
    name: "宝ヶ池モデルハウス新築工事",
    c: 0,
    dm: "2025-03",
    amount: 32_400_000,
    status: "全額入金済み",
    kind: "new",
    split: [30, 70],
  },
  {
    key: "p03",
    name: "京洛ホテル 客室リニューアル工事（3〜5階）",
    c: 11,
    dm: "2025-06",
    amount: 46_800_000,
    status: "全額入金済み",
    kind: "reform",
    split: [30, 30, 40],
  },
  {
    key: "p04",
    name: "南草津店 内装工事",
    c: 1,
    dm: "2025-07",
    amount: 12_350_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p05",
    name: "展望テラス増築工事",
    c: 2,
    dm: "2025-08",
    amount: 58_000_000,
    status: "全額入金済み",
    kind: "new",
    split: [30, 70],
  },
  {
    key: "p06",
    name: "桂クリニック 内装改修工事",
    c: 3,
    dm: "2025-09",
    amount: 21_700_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p07",
    name: "福知山倉庫 屋根防水改修工事",
    c: 4,
    dm: "2025-10",
    amount: 9_800_000,
    status: "全額入金済み",
    kind: "repair",
  },
  {
    key: "p08",
    name: "奈良学園前マンション 大規模修繕工事",
    c: 5,
    dm: "2025-11",
    amount: 74_500_000,
    status: "全額入金済み",
    kind: "repair",
    split: [30, 30, 40],
  },
  {
    key: "p09",
    name: "市民プラザ 空調設備更新工事",
    c: 6,
    dm: "2025-12",
    amount: 38_200_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p10",
    name: "洛南学園 体育館耐震補強工事",
    c: 7,
    dm: "2026-01",
    amount: 66_000_000,
    status: "全額入金済み",
    kind: "repair",
    split: [50, 50],
  },
  {
    key: "p11",
    name: "堺配送センター 床改修工事",
    c: 8,
    dm: "2026-02",
    amount: 27_900_000,
    status: "全額入金済み",
    kind: "repair",
  },
  {
    key: "p12",
    name: "京洛ホテル別館 ロビー改修工事",
    c: 11,
    dm: "2026-02",
    amount: 18_400_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p13",
    name: "宇治茶房 店舗改装工事",
    c: 9,
    dm: "2026-03",
    amount: 14_200_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p14",
    name: "祇園立体駐車場 新築工事",
    c: 13,
    dm: "2025-12",
    amount: 120_000_000,
    status: "失注",
    kind: "new",
  },
  {
    key: "p15",
    name: "宝ヶ池分譲住宅（3棟）新築工事",
    c: 0,
    dm: "2026-04",
    amount: 85_500_000,
    status: "全額入金済み",
    kind: "new",
    split: [30, 30, 40],
  },
  {
    key: "p16",
    name: "京都駅前店 新装工事",
    c: 1,
    dm: "2026-05",
    amount: 19_800_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p17",
    name: "学校給食センター 改修工事",
    c: 12,
    dm: "2026-06",
    amount: 41_300_000,
    status: "全額入金済み",
    kind: "reform",
  },
  {
    key: "p18",
    name: "リゾート客室棟 改修工事",
    c: 2,
    dm: "2026-07",
    amount: 52_700_000,
    status: "請求書発行済み",
    kind: "reform",
    overdue: true,
    unlocked: true,
  },
  {
    key: "p19",
    name: "訪問看護ステーション 新築工事",
    c: 3,
    dm: "2026-07",
    amount: 33_000_000,
    status: "全額入金済み",
    kind: "new",
  },
  {
    key: "p20",
    name: "生駒マンション 外壁・防水改修工事",
    c: 5,
    dm: "2026-08",
    amount: 29_400_000,
    status: "全額入金済み",
    kind: "repair",
  },
  {
    key: "p21",
    name: "防災倉庫 新築工事",
    c: 6,
    dm: "2026-08",
    amount: 15_600_000,
    status: "請求書発行済み",
    kind: "new",
  },
  {
    key: "p22",
    name: "製茶工場 増築工事",
    c: 9,
    dm: "2026-09",
    amount: 36_800_000,
    status: "請求書発行済み",
    kind: "new",
    irregular: true,
  },
  {
    key: "p23",
    name: "吹田物流 事務所改装工事",
    c: 8,
    dm: "2026-09",
    amount: 11_200_000,
    status: "受注",
    kind: "reform",
  },
  {
    key: "p24",
    name: "洛南学園 図書館改修工事",
    c: 7,
    dm: "2026-10",
    amount: 43_500_000,
    status: "受注",
    kind: "reform",
  },
  {
    key: "p25",
    name: "京洛ホテル本館 大浴場改修工事",
    c: 11,
    dm: "2026-10",
    amount: 31_900_000,
    status: "請求書発行済み",
    kind: "reform",
    split: [40, 60],
    acct: 2,
  },
  {
    key: "p26",
    name: "阪神メディカルプラザ 4階クリニック内装工事",
    c: 10,
    dm: "2026-11",
    amount: 27_400_000,
    status: "受注",
    kind: "reform",
  },
  {
    key: "p27",
    name: "祇園事務所ビル 外壁改修工事",
    c: 13,
    dm: "2026-11",
    amount: 22_600_000,
    status: "受注",
    kind: "repair",
    acct: 3,
  },
  {
    key: "p28",
    name: "舞鶴 事務所新築工事",
    c: 4,
    dm: "2026-12",
    amount: 48_300_000,
    status: "受注",
    kind: "new",
    noContract: true,
  },
  {
    key: "p29",
    name: "グループホーム 改修工事",
    c: 3,
    dm: "2026-12",
    amount: 35_200_000,
    status: "見積確認中",
    kind: "reform",
  },
  {
    key: "p30",
    name: "大津ウォーターフロント 改修工事",
    c: 2,
    dm: "2027-01",
    amount: 62_000_000,
    status: "見積確認中",
    kind: "reform",
  },
  {
    key: "p31",
    name: "小学校 トイレ改修工事",
    c: 6,
    dm: "2027-01",
    amount: 17_500_000,
    status: "提案中",
    kind: "reform",
  },
  {
    key: "p32",
    name: "庁舎 耐震補強工事",
    c: 12,
    dm: "2027-02",
    amount: 78_000_000,
    status: "提案中",
    kind: "repair",
  },
  {
    key: "p33",
    name: "北山マンション 新築工事",
    c: 0,
    dm: "2027-03",
    amount: 120_000_000,
    status: "提案中",
    kind: "new",
  },
  {
    key: "p34",
    name: "学研都市 賃貸住宅 新築工事",
    c: 5,
    dm: "2027-03",
    amount: 54_000_000,
    status: "未対応",
    kind: "new",
  },
  {
    key: "p35",
    name: "宇治観光案内所 新築工事",
    c: 9,
    dm: "2027-03",
    amount: 12_800_000,
    status: "未対応",
    kind: "new",
  },
  {
    key: "p36",
    name: "摂津倉庫 新築工事",
    c: 8,
    dm: "2027-02",
    amount: 39_500_000,
    status: "失注",
    kind: "new",
  },
  {
    key: "p37",
    name: "京洛ホテル新館 増築工事",
    c: 11,
    dm: "2027-05",
    amount: 96_000_000,
    status: "提案中",
    kind: "new",
  },
  {
    key: "p38",
    name: "大阪梅田店 新装工事",
    c: 1,
    dm: "2027-06",
    amount: 24_500_000,
    status: "未対応",
    kind: "reform",
  },
  {
    key: "p39",
    name: "洛南学園 校舎空調更新工事",
    c: 7,
    dm: "2027-04",
    amount: 58_000_000,
    status: "未対応",
    kind: "reform",
  },
  // 引渡月の変更（オーダー移行）
  {
    key: "p40o",
    name: "市営住宅 改修工事",
    c: 6,
    dm: "2026-09",
    amount: 26_800_000,
    status: "オーダー移行",
    kind: "reform",
    moveTo: { dm: "2026-12", key: "p40" },
  },
  {
    key: "p40",
    name: "市営住宅 改修工事",
    c: 6,
    dm: "2026-12",
    amount: 26_800_000,
    status: "受注",
    kind: "reform",
  },
  {
    key: "p41o",
    name: "宝ヶ池モデルハウス 第2期工事",
    c: 0,
    dm: "2026-03",
    amount: 31_000_000,
    status: "オーダー移行",
    kind: "new",
    moveTo: { dm: "2026-12", key: "p41" },
  },
  {
    key: "p41",
    name: "宝ヶ池モデルハウス 第2期工事",
    c: 0,
    dm: "2026-12",
    amount: 31_000_000,
    status: "受注",
    kind: "new",
  },
  {
    key: "p42o",
    name: "生駒マンション 共用部改修工事",
    c: 5,
    dm: "2026-10",
    amount: 18_900_000,
    status: "オーダー移行",
    kind: "repair",
    moveTo: { dm: "2027-01", key: "p42" },
  },
  {
    key: "p42",
    name: "生駒マンション 共用部改修工事",
    c: 5,
    dm: "2027-01",
    amount: 18_900_000,
    status: "受注",
    kind: "repair",
  },
];

const SITE_BY_CUSTOMER = CUSTOMERS.map((c) => c.address.replace(/\d.*$/, ""));

// ---------- 本体 ----------
async function main() {
  const pdfContract = await dummyPdf("Contract (demo)");
  const pdfAck = await dummyPdf("Order acknowledgment (demo)");
  const pdfInv = await dummyPdf("Vendor invoice (demo)");
  const summary: Record<string, number | string> = {};

  await sql
    .begin(async (tx) => {
      // --- 1. アカウント ---
      const [kei] = await tx`select password_hash from users where id = 8`;
      const [stf] = await tx`select password_hash from users where id = 9`;
      const [vwr] = await tx`select password_hash from users where id = 10`;
      const demoUsers = [
        {
          email: "demo-keiri@example.com",
          name: "確認用（経理）",
          role: "accounting",
          hash: kei?.password_hash,
        },
        {
          email: "demo-staff@example.com",
          name: "確認用（一般社員）",
          role: "staff",
          hash: stf?.password_hash,
        },
        {
          email: "demo-viewer@example.com",
          name: "確認用（閲覧のみ）",
          role: "viewer",
          hash: vwr?.password_hash,
        },
        {
          email: "demo-tax@example.com",
          name: "確認用（税理士）",
          role: "tax_advisor",
          hash: stf?.password_hash,
        },
      ];
      await tx`delete from audit_logs`;
      await tx`delete from users where id in (1,2,6,8,9,10)`;
      const demoIds: Record<string, number> = {};
      for (const u of demoUsers) {
        const [r] =
          await tx`insert into users (email, password_hash, name, role, status) values (${u.email}, ${u.hash}, ${u.name}, ${u.role}, 'active') returning id`;
        demoIds[u.role] = (r as { id: number }).id;
      }
      const staffIds =
        (await tx`select id, name from users where email like '%@winwin-corp.co.jp'`) as unknown as {
          id: number;
          name: string;
        }[];
      const idOf = (n: string) =>
        staffIds.find((s) => s.name.replace(/\s/g, "") === n.replace(/\s/g, ""))
          ?.id ?? 11;
      const admin = idOf("磯田 裕晃");

      // --- 2. 全取引データを削除（FK連鎖あり） ---
      await tx`delete from projects`; // orders / invoices / files は CASCADE
      await tx`delete from misc_payments`;
      await tx`delete from misc_receipts`;
      await tx`delete from recurring_payment_skips`;
      await tx`delete from recurring_receipt_skips`;
      await tx`delete from recurring_payments`;
      await tx`delete from recurring_receipts`;
      await tx`delete from notification_opens`;
      await tx`delete from edit_locks`;
      await tx`delete from invitations`;
      await tx`delete from password_resets`;
      await tx`delete from vendors`;
      await tx`delete from customers`;
      await tx`delete from payment_categories where name = 'えええ'`;

      // --- 3. 自社口座（テスト名称→実運用の名称。口座番号はダミー） ---
      const accts = [
        {
          id: 1,
          name: "メイン口座（京都銀行 四条）",
          bank: "京都銀行",
          branch: "四条支店",
          no: "3108842",
          def: true,
        },
        {
          id: 2,
          name: "給与・社保用（三井住友銀行 京都）",
          bank: "三井住友銀行",
          branch: "京都支店",
          no: "6150327",
          def: false,
        },
        {
          id: 3,
          name: "経費支払用（みずほ銀行 京都）",
          bank: "みずほ銀行",
          branch: "京都支店",
          no: "2907751",
          def: false,
        },
        {
          id: 4,
          name: "入金用（三菱UFJ銀行 京都）",
          bank: "三菱UFJ銀行",
          branch: "京都支店",
          no: "4533016",
          def: false,
        },
        {
          id: 5,
          name: "予備口座（りそな銀行 京都）",
          bank: "りそな銀行",
          branch: "京都支店",
          no: "1702984",
          def: false,
        },
      ];
      for (const a of accts) {
        await tx`update company_accounts set name=${a.name}, bank_name=${a.bank}, branch_name=${a.branch}, account_type='普通', account_number=${a.no}, account_holder='カ）ウィンウィン', is_default=${a.def}, updated_at=now() where id=${a.id}`;
      }
      const acctBank = (n: number) => {
        const a = accts[n - 1]!;
        return `${a.bank} ${a.branch} (普)${a.no} カ）ウィンウィン`;
      };

      // --- 4. 顧客・発注先 ---
      for (const c of CUSTOMERS) {
        await tx`insert into customers (company, department, contact, contact_title, email, phone, zip_code, address, capital, company_scale, to_contacts, cc_contacts)
        values (${c.company}, ${c.dept}, ${c.contact}, ${c.title}, ${c.email}, ${c.phone}, ${c.zip}, ${c.address}, ${c.capital}, ${c.scale},
          ${tx.json([{ name: c.contact, title: c.title, email: c.email }])}, ${tx.json([])})`;
      }
      VENDORS.forEach(async () => undefined);
      for (let i = 0; i < VENDORS.length; i++) {
        const v = VENDORS[i]!;
        await tx`insert into vendors (id, company, dept, contact, email, phone, zip_code, address, categories, bank_name, bank_branch, bank_type, bank_number, bank_holder, payment_term, payment_closing_day, payment_due_day, payment_due_month_offset, to_contacts, cc_contacts)
        values (${pad(i + 1, 3)}, ${v.company}, ${v.dept}, ${v.contact}, ${v.email}, ${v.phone}, ${v.zip}, ${v.address}, ${v.cats.join(",")}, ${v.bank}, ${BANK_LABEL(v.branch)}, ${v.type}, ${v.number}, ${v.holder},
          ${paymentTermLabel(v.term[0], v.term[1], v.term[2])}, ${v.term[0]}, ${v.term[1]}, ${v.term[2]},
          ${tx.json([{ name: v.contact, title: "担当", email: v.email }])}, ${tx.json([])})`;
      }

      // --- 5. 案件 ---
      // 引渡月の昇順で採番（期ごとの連番）。オーダー移行の元は先に作る。
      const sorted = [...P].sort((a, b) =>
        a.dm === b.dm ? (a.key.endsWith("o") ? -1 : 0) : a.dm < b.dm ? -1 : 1
      );
      const seqByPrefix: Record<string, number> = {};
      const projRow: Record<
        string,
        {
          id: number;
          no: string;
          def: ProjDef;
          start: string;
          end: string;
          assignee: string;
          created: string;
        }
      > = {};
      const lockedAdminTs: Record<string, string> = {};
      let assigneeI = 0;
      for (const d of sorted) {
        const prefix = `WW${fiscalPeriodLabel(fiscalPeriodOfMonth(d.dm)!)}-`;
        seqByPrefix[prefix] = (seqByPrefix[prefix] ?? 0) + 1;
        const no = `${prefix}${pad(seqByPrefix[prefix]!, 3)}`;
        const dur =
          d.dur ??
          Math.max(2, Math.min(9, Math.round(d.amount / 10_000_000) + 1));
        const start = `${addMonths(d.dm, -(dur - 1))}-${pad(between(1, 10))}`;
        const end = `${d.dm}-${pad(Math.min(lastDay(d.dm), between(24, 31)))}`;
        const cust = CUSTOMERS[d.c]!;
        const assignee = STAFF[assigneeI++ % STAFF.length]!;
        const created = addDays(start, -between(30, 70));
        const pre = ["未対応", "提案中", "見積確認中"].includes(d.status);
        const paid = d.status === "全額入金済み";
        const locked =
          !d.unlocked &&
          (paid || d.status === "請求書発行済み") &&
          addMonths(d.dm, 1) + "-20" < TODAY;
        let invoiceDate: string | null = null;
        void invoiceDate;
        const projCreatedTs = ts(created > TODAY ? TODAY : created);
        const row = {
          name: d.name,
          client: cust.company.replace(/株式会社|学校法人 |医療法人社団 /g, ""),
          clientCompany: cust.company,
          clientPhone: cust.phone,
          clientEmail: cust.email,
          clientAddress: cust.address,
          amount: d.amount,
          startDate: start,
          endDate: end,
          status: d.status,
          notes: pick([
            "",
            "",
            "",
            "先方担当者は午前中の連絡を希望",
            "工程表は月次で共有",
            "近隣挨拶は着工1週間前に実施",
            "追加工事の可能性あり",
          ]),
          project_no: no,
          delivery_month: d.dm,
          version: between(1, 4),
          planned_amount: pre ? roundTo(d.amount * 0.97, 100_000) : null,
          company_account_id: d.acct ?? null,
          locked_at: locked
            ? ts(`${addMonths(d.dm, 1)}-${pad(between(21, 25))}`, 15)
            : null,
          locked_by: locked ? admin : null,
          paid_at: null as Date | null,
        };
        const [r] = await tx`insert into projects ${tx(row)} returning id`;
        projRow[d.key] = {
          id: (r as { id: number }).id,
          no,
          def: d,
          start,
          end,
          assignee,
          created: projCreatedTs.toISOString().slice(0, 10),
        };
        void lockedAdminTs;
      }
      // オーダー移行のひも付け
      for (const d of P.filter((x) => x.moveTo)) {
        const from = projRow[d.key]!;
        const to = projRow[d.moveTo!.key]!;
        await tx`update projects set superseded_by=${to.id}, delivery_month_changed_at=${ts("2026-09-18")} where id=${from.id}`;
      }

      // --- 6. 発注・請求・入金・ファイル ---
      const poolVendors = (cat: string) =>
        VENDORS.map((v, i) => ({ v, i })).filter((x) => x.v.cats.includes(cat));
      const orderRows: {
        projectKey: string;
        row: Record<string, unknown>;
        hasAck: boolean;
        hasInv: boolean;
        created: string;
        logStatus: string;
      }[] = [];
      const invoicesByProject: Record<string, number[]> = {};
      const auditPlans: {
        at: Date;
        user: number;
        action: string;
        table: string;
        recordId: number;
        name: string;
        changes: string[];
      }[] = [];

      for (const d of P) {
        const pr = projRow[d.key]!;
        const isMovedFrom = !!d.moveTo;
        const contracted = ["受注", "請求書発行済み", "全額入金済み"].includes(
          d.status
        );
        const pre = ["未対応", "提案中", "見積確認中"].includes(d.status);
        const cust = CUSTOMERS[d.c]!;

        // 監査ログ（案件の作成と段階的なステータス変更）
        const path = [
          "未対応",
          "提案中",
          "見積確認中",
          "受注",
          "請求書発行済み",
          "全額入金済み",
        ];
        const reach =
          d.status === "失注"
            ? 2
            : d.status === "オーダー移行"
              ? 3
              : Math.max(0, path.indexOf(d.status));
        auditPlans.push({
          at: ts(pr.created, 9),
          user: idOf(pr.assignee),
          action: "CREATE",
          table: "projects",
          recordId: pr.id,
          name: d.name,
          changes: [`新規登録（顧客: ${cust.company} / ステータス: 未対応）`],
        });
        let t = pr.created;
        for (let k = 1; k <= reach; k++) {
          t = addDays(t, between(7, 25));
          if (t > TODAY) t = TODAY;
          auditPlans.push({
            at: ts(t, between(9, 17)),
            user: idOf(pr.assignee),
            action: "UPDATE",
            table: "projects",
            recordId: pr.id,
            name: d.name,
            changes: [`ステータスを ${path[k - 1]} → ${path[k]} に変更`],
          });
        }
        if (d.status === "失注") {
          auditPlans.push({
            at: ts(addDays(t, 10 > 0 ? 9 : 0), 11),
            user: idOf(pr.assignee),
            action: "UPDATE",
            table: "projects",
            recordId: pr.id,
            name: d.name,
            changes: ["ステータスを 見積確認中 → 失注 に変更"],
          });
        }
        if (d.status === "オーダー移行") {
          auditPlans.push({
            at: ts("2026-09-18", 14),
            user: idOf(pr.assignee),
            action: "UPDATE",
            table: "projects",
            recordId: pr.id,
            name: d.name,
            changes: [
              `引渡月変更のため新しい案件IDに移行し、オーダー移行ステータスに変更（編集不可）`,
            ],
          });
        }
        if (!(contracted || pre) || isMovedFrom) {
          // 失注・オーダー移行（コピー元）は発注や請求なし。ただし期跨ぎ（p41o）は発注・請求が元に残る
          if (!(d.key === "p41o")) continue;
        }

        // 契約書
        if (contracted && !d.noContract && !isMovedFrom) {
          await tx`insert into project_files (project_id, kind, filename, data_url, uploaded_at) values (${pr.id}, 'contract', ${`契約書_${pr.no}.pdf`}, ${pdfContract}, ${ts(addDays(pr.start, -between(5, 20)))})`;
        }

        // 発注
        const norders =
          d.key === "p41"
            ? 0
            : pre
              ? d.status === "未対応"
                ? 0
                : between(2, 3)
              : between(4, 6);
        if (norders === 0) continue;
        const pool = [...POOL[d.kind]];
        const cats: string[] = [];
        while (cats.length < norders && pool.length)
          cats.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
        const costBudget = d.amount * (0.6 + rnd() * 0.16);
        const weights = cats.map(() => 0.5 + rnd());
        const wsum = weights.reduce((a, b) => a + b, 0);
        let seq = 0;
        for (let i = 0; i < cats.length; i++) {
          const cat = cats[i]!;
          const cands = poolVendors(cat);
          const { v } = cands.length ? pick(cands) : { v: VENDORS[15]! };
          const decided = roundTo((costBudget * weights[i]!) / wsum, 10_000);
          const estimate = roundTo(decided * (1.04 + rnd() * 0.1), 10_000);
          const planned = roundTo(decided * (1.0 + rnd() * 0.05), 10_000);
          const termClosing = v.term[0];
          const usual = calcPaymentDueDate(
            termClosing,
            v.term[1],
            d.dm,
            v.term[2]
          )!;
          let payDate = usual;
          let payNote = "";
          // 状態の決定
          let status: string;
          let payStatus = "未払い";
          let paidOn: string | null = null;
          let decidedVal: number | null = decided;
          let plannedVal: number | null = planned;
          if (pre) {
            status = i === 0 ? "見積待ち" : pick(["未処理", "見積待ち"]);
            decidedVal = null;
            plannedVal = d.status === "見積確認中" ? planned : null;
            payDate = "";
          } else if (d.status === "受注") {
            // 受注: 工事進行中。進捗に応じて決定済み／発注完了／見積待ち
            const r = i % 3;
            status =
              pr.start <= TODAY
                ? r === 2
                  ? "決定済み"
                  : "発注完了"
                : r === 0
                  ? "決定済み"
                  : r === 1
                    ? "見積待ち"
                    : "未処理";
            if (status === "見積待ち" || status === "未処理") decidedVal = null;
          } else {
            status = "発注完了";
            if (usual <= TODAY && !(d.overdue && i < 2)) {
              status = "支払済み";
              payStatus = "支払済み";
              paidOn = usual;
            }
          }
          if (d.irregular && i === 1) {
            payDate = addDays(usual, 12);
            payNote = "先方の資金繰り都合により、支払日を後ろ倒し（協議済み）";
            status = "発注完了";
            payStatus = "未払い";
            paidOn = null;
          }
          const ordered = status === "発注完了" || status === "支払済み";
          seq += 1;
          const inWork = pr.start <= TODAY && TODAY <= pr.end;
          const hasAck =
            ordered && !(inWork && i === 0 && ["p24", "p25"].includes(d.key));
          orderRows.push({
            projectKey: d.key,
            created: addDays(pr.start, -between(0, 15)),
            logStatus: status,
            hasAck,
            hasInv: status === "支払済み",
            row: {
              project_id: pr.id,
              category: cat,
              vendor: v.company,
              estimate,
              planned: plannedVal,
              decided: decidedVal,
              status,
              details: `${cat} ${d.name.replace(/工事$/, "")}`.slice(0, 60),
              site: `${cust.address.replace(/\d.*$/, "")}（${d.name.split(" ")[0]}現場）`,
              period_start: addDays(pr.start, between(0, 20)),
              period_end: addDays(pr.end, -between(0, 10)),
              handover: pr.end,
              payment: paymentTermLabel(v.term[0], v.term[1], v.term[2]),
              paymentStatus: payStatus,
              paymentDate: payDate,
              paymentNotes: payNote,
              ack_done: hasAck,
              invoice_done: status === "支払済み",
              assignee: pr.assignee,
              version: between(1, 3),
              payment_no: `${pr.no}-${pad(seq, 3)}`,
              paid_on: paidOn,
              company_account_id: paidOn ? pick([1, 1, 2, 3]) : null,
            },
          });
        }
      }
      for (const o of orderRows) {
        const [r] =
          await tx`insert into orders ${tx(o.row as never)} returning id`;
        const id = (r as { id: number }).id;
        const st = o.row.status as string;
        if (st === "発注完了" || st === "支払済み")
          await tx`update orders set order_no = ${pad(id, 6)} where id = ${id}`;
        const pr = projRow[o.projectKey]!;
        auditPlans.push({
          at: ts(o.created, 10),
          user: idOf(pr.assignee),
          action: "CREATE",
          table: "orders",
          recordId: id,
          name: `${o.row.category}（${o.row.vendor}）`,
          changes: [
            `新規登録（工種: ${o.row.category} / 発注先: ${o.row.vendor}）`,
          ],
        });
        if (st !== "未処理" && st !== "見積待ち") {
          auditPlans.push({
            at: ts(addDays(o.created, between(3, 20)), 14),
            user: idOf(pr.assignee),
            action: "UPDATE",
            table: "orders",
            recordId: id,
            name: `${o.row.category}（${o.row.vendor}）`,
            changes: [
              `ステータスを 見積待ち → ${st === "支払済み" ? "発注完了" : st} に変更`,
            ],
          });
        }
        if (st === "支払済み") {
          auditPlans.push({
            at: ts(`${o.row.paid_on}`, 16),
            user: demoIds.accounting!,
            action: "UPDATE",
            table: "orders",
            recordId: id,
            name: `${o.row.category}（${o.row.vendor}）`,
            changes: ["ステータスを 発注完了 → 支払済み に変更"],
          });
        }
        if (o.hasAck) {
          const amt = Math.floor(Number(o.row.decided ?? 0) * 1.1);
          await tx`insert into order_files (order_id, kind, filename, data_url, uploaded_at, doc_date, doc_amount) values (${id}, 'ack', ${`請書_${o.row.payment_no}.pdf`}, ${pdfAck}, ${ts(String(o.row.period_start))}, ${String(o.row.period_start)}, ${amt})`;
        }
        if (o.hasInv) {
          await tx`insert into order_files (order_id, kind, filename, data_url, uploaded_at, doc_date, doc_amount) values (${id}, 'invoice', ${`請求書_${o.row.payment_no}.pdf`}, ${pdfInv}, ${ts(String(o.row.paid_on))}, ${String(o.row.paid_on)}, ${Math.floor(Number(o.row.decided ?? 0) * 1.1)})`;
        }
      }

      // 請求書・入金
      let invCount = 0;
      for (const d of P) {
        if (!["請求書発行済み", "全額入金済み"].includes(d.status)) continue;
        const pr = projRow[d.key]!;
        const parts = d.split ?? [100];
        const baseDate = (() => {
          const first = `${addMonths(d.dm, 1)}-${pad(between(1, 5))}`;
          return first > TODAY ? addDays(TODAY, -between(1, 3)) : first;
        })();
        const labels =
          parts.length === 1
            ? [d.name]
            : parts.length === 2
              ? ["着手金", "完了金"]
              : ["着手金", "中間金", "完了金"];
        let acc = 0;
        let lastDue = baseDate;
        for (let k = 0; k < parts.length; k++) {
          const sub =
            k === parts.length - 1
              ? d.amount - acc
              : roundTo((d.amount * parts[k]!) / 100, 10_000);
          acc += sub;
          const iDate =
            parts.length === 1
              ? baseDate
              : k === parts.length - 1
                ? baseDate
                : addDays(pr.start, 5 + k * 40) > TODAY
                  ? addDays(TODAY, -(parts.length - k) * 7)
                  : addDays(pr.start, 5 + k * 40);
          const due = `${addMonths(iDate.slice(0, 7), 1)}-${pad(lastDay(addMonths(iDate.slice(0, 7), 1)))}`;
          lastDue = due > lastDue ? due : lastDue;
          const tax = yenTax(sub);
          const sent = rnd() < 0.45;
          const items = [
            {
              name: parts.length === 1 ? d.name : `${d.name}（${labels[k]}）`,
              qty: 1,
              unit: "式",
              price: sub,
              note: "",
            },
          ];
          const [r] =
            await tx`insert into invoices (project_id, invoice_no, registration_no, invoice_date, due_date, subtotal, tax, total, bank_info, status, items, is_split)
          values (${pr.id}, ${`${pr.no}-${pad(k + 1, 3)}`}, 'T8130001068355', ${iDate}, ${due}, ${sub}, ${tax}, ${sub + tax}, ${acctBank(d.acct ?? 1)}, ${sent ? "発送済み" : "発行済"}, ${tx.json(items)}, ${parts.length > 1}) returning id`;
          const id = (r as { id: number }).id;
          invCount += 1;
          auditPlans.push({
            at: ts(iDate, 13),
            user: demoIds.accounting!,
            action: "CREATE",
            table: "invoices",
            recordId: id,
            name: `${pr.no}-${pad(k + 1, 3)}`,
            changes: [
              `請求書を発行（案件ID: ${pr.id} / 明細: 1件 / 合計: ${(sub + tax).toLocaleString()}円）`,
            ],
          });
        }
        if (d.status === "全額入金済み") {
          const paidDate = (() => {
            const p = addDays(lastDue, -between(0, 8));
            return p > TODAY ? addDays(TODAY, -between(1, 5)) : p;
          })();
          await tx`update projects set paid_at=${ts(paidDate, 3, 0)}, company_account_id=${d.acct ?? pick([1, 4])} where id=${pr.id}`;
          auditPlans.push({
            at: ts(paidDate, 11),
            user: demoIds.accounting!,
            action: "UPDATE",
            table: "projects",
            recordId: pr.id,
            name: d.name,
            changes: ["ステータスを 請求書発行済み → 全額入金済み に変更"],
          });
        }
      }
      // 期跨ぎのオーダー移行元(p41o)は発注・請求を元に残す設計だが、新案件へ発注のみ複製する
      {
        const from = projRow.p41o!;
        const to = projRow.p41!;
        const copied =
          (await tx`select category, vendor, estimate, planned, decided, details, site, period_start, period_end, handover, payment, assignee from orders where project_id = ${from.id}`) as unknown as Record<
            string,
            unknown
          >[];
        let seq = 0;
        for (const c of copied) {
          seq += 1;
          await tx`insert into orders ${tx({ ...c, project_id: to.id, status: "未処理", paymentStatus: "未払い", paymentDate: "", paymentNotes: "", payment_no: `${to.no}-${pad(seq, 3)}`, decided: null, version: 1 } as never)}`;
        }
      }

      // --- 7. 定期支払い・工事外支払い ---
      const pcats =
        (await tx`select name from payment_categories`) as unknown as {
          name: string;
        }[];
      void pcats;
      interface Rec {
        acct: number;
        amount: number;
        cat: string;
        day: number | null;
        end?: string;
        eom: boolean;
        fee: number | null;
        freq: "monthly" | "yearly";
        method: string;
        moy?: number;
        name: string;
        payee: string;
        start: string;
      }
      const recs: Rec[] = [
        {
          name: "本社事務所 賃料",
          cat: "賃料（本社）",
          payee: "京洛不動産株式会社",
          amount: 285_000,
          freq: "monthly",
          day: null,
          eom: true,
          start: "2025-04",
          acct: 3,
          method: "口座振替",
          fee: null,
        },
        {
          name: "東京連絡所 賃料",
          cat: "賃料（東京支店）",
          payee: "丸の内ビルマネジメント",
          amount: 98_000,
          freq: "monthly",
          day: null,
          eom: true,
          start: "2025-04",
          acct: 3,
          method: "振込",
          fee: 440,
        },
        {
          name: "従業員 給与",
          cat: "給与",
          payee: "従業員",
          amount: 4_650_000,
          freq: "monthly",
          day: 25,
          eom: false,
          start: "2025-04",
          acct: 2,
          method: "振込",
          fee: null,
        },
        {
          name: "社会保険料（健保・厚年）",
          cat: "社会保険料",
          payee: "日本年金機構",
          amount: 812_000,
          freq: "monthly",
          day: null,
          eom: true,
          start: "2025-04",
          acct: 2,
          method: "口座振替",
          fee: null,
        },
        {
          name: "固定電話・インターネット回線",
          cat: "通信料",
          payee: "関西ネットワークサービス",
          amount: 43_500,
          freq: "monthly",
          day: 27,
          eom: false,
          start: "2025-04",
          acct: 3,
          method: "口座振替",
          fee: null,
        },
        {
          name: "事務所 電気料金",
          cat: "電気代",
          payee: "関西電力",
          amount: 38_200,
          freq: "monthly",
          day: 20,
          eom: false,
          start: "2025-04",
          acct: 3,
          method: "口座振替",
          fee: null,
        },
        {
          name: "銀行借入返済（運転資金）",
          cat: "融資返済",
          payee: "京都銀行",
          amount: 1_200_000,
          freq: "monthly",
          day: null,
          eom: true,
          start: "2024-04",
          end: "2029-03",
          acct: 1,
          method: "口座振替",
          fee: null,
        },
        {
          name: "銀行借入返済（設備資金）",
          cat: "融資返済",
          payee: "京都中央信用金庫",
          amount: 380_000,
          freq: "monthly",
          day: 10,
          eom: false,
          start: "2025-04",
          end: "2030-03",
          acct: 1,
          method: "口座振替",
          fee: null,
        },
        {
          name: "夏季賞与",
          cat: "賞与",
          payee: "従業員",
          amount: 6_200_000,
          freq: "yearly",
          day: 30,
          eom: false,
          moy: 6,
          start: "2025-04",
          acct: 2,
          method: "振込",
          fee: null,
        },
        {
          name: "冬季賞与",
          cat: "賞与",
          payee: "従業員",
          amount: 6_800_000,
          freq: "yearly",
          day: 10,
          eom: false,
          moy: 12,
          start: "2025-04",
          acct: 2,
          method: "振込",
          fee: null,
        },
        {
          name: "法人税・地方税（確定納付）",
          cat: "税金",
          payee: "税務署・京都府・京都市",
          amount: 3_400_000,
          freq: "yearly",
          day: null,
          eom: true,
          moy: 5,
          start: "2025-04",
          acct: 1,
          method: "振込",
          fee: null,
        },
        {
          name: "固定資産税・償却資産税",
          cat: "税金",
          payee: "京都市",
          amount: 720_000,
          freq: "yearly",
          day: 30,
          eom: false,
          moy: 4,
          start: "2025-04",
          acct: 1,
          method: "口座振替",
          fee: null,
        },
      ];
      const recIds: number[] = [];
      for (const r of recs) {
        const [x] =
          await tx`insert into recurring_payments (name, category_name, payee, amount, frequency, due_day, due_day_is_month_end, month_of_year, start_month, end_month, notes, payment_method, company_account_id, transfer_fee, created_at, updated_at)
        values (${r.name}, ${r.cat}, ${r.payee}, ${r.amount}, ${r.freq}, ${r.day}, ${r.eom}, ${r.moy ?? null}, ${r.start}, ${r.end ?? null}, '', ${r.method}, ${r.acct}, ${r.fee}, ${ts("2025-04-01")}, ${ts("2025-04-01")}) returning id`;
        recIds.push((x as { id: number }).id);
      }
      const noSeq: Record<string, number> = {};
      const skipKey = "通信料|2026-08"; // 1件だけ「当月支払なし」
      let matPay = 0;
      for (let mi = 0; mi < recs.length; mi++) {
        const r = recs[mi]!;
        const sched = {
          frequency: r.freq,
          dueDay: r.day,
          dueDayIsMonthEnd: r.eom,
          monthOfYear: r.moy ?? null,
          startMonth: r.start,
          endMonth: r.end ?? null,
        } as never;
        let ym = "2025-04";
        while (ym <= "2026-10") {
          const due = dueDateForMonth(sched, ym);
          if (due && due <= TODAY) {
            if (`${r.cat}|${ym}` === skipKey) {
              await tx`insert into recurring_payment_skips (recurring_id, period, created_by) values (${recIds[mi]}, ${ym}, ${demoIds.accounting})`;
            } else {
              const key = miscNoKeyForMonth(due.slice(0, 7))!;
              const k = `${key.period}-${key.month}`;
              noSeq[k] = (noSeq[k] ?? 0) + 1;
              const no = formatMiscPaymentNo(key, noSeq[k]!);
              const amount =
                r.cat === "電気代"
                  ? r.amount + between(-6, 14) * 500
                  : r.amount;
              const [x] =
                await tx`insert into misc_payments (category, type, payee, amount, payment_date, status, notes, recurring_id, period, payment_no, transfer_fee, payment_method, company_account_id, created_at)
              values (${r.cat}, '支払', ${r.payee}, ${amount}, ${due}, '支払済み', '', ${recIds[mi]}, ${ym}, ${no}, ${r.fee}, ${r.method}, ${r.acct}, ${ts(due)}) returning id`;
              matPay += 1;
              if (matPay % 6 === 0)
                auditPlans.push({
                  at: ts(due, 16),
                  user: demoIds.accounting!,
                  action: "UPDATE",
                  table: "misc_payments",
                  recordId: (x as { id: number }).id,
                  name: r.name,
                  changes: [
                    `定期支払い ${r.name} ${ym} を支払済みに（¥${amount.toLocaleString()}、支払日 ${due}、支払No ${no}）`,
                  ],
                });
            }
          }
          ym = addMonths(ym, 1);
        }
        auditPlans.push({
          at: ts("2025-04-01", 10),
          user: admin,
          action: "CREATE",
          table: "recurring_payments",
          recordId: recIds[mi]!,
          name: r.name,
          changes: [
            `新規登録（定例支払い: ${r.name}（¥${r.amount.toLocaleString()}）、振込手数料 ${r.fee ?? "-"}・支払方法 ${r.method}）`,
          ],
        });
      }
      // 工事外の単発支払い
      const oneOffs = [
        {
          cat: "税金",
          payee: "税務署",
          amount: 2_100_000,
          date: "2026-11-30",
          status: "未払い",
          notes: "消費税 中間納付",
        },
        {
          cat: "通信料",
          payee: "関西ネットワークサービス",
          amount: 165_000,
          date: "2026-09-14",
          status: "支払済み",
          notes: "回線増設工事費",
        },
        {
          cat: "賞与",
          payee: "従業員",
          amount: 3_000_000,
          date: "2027-03-10",
          status: "未払い",
          notes: "決算賞与（予定）",
        },
        {
          cat: "電気代",
          payee: "関西電力",
          amount: 220_000,
          date: "2026-10-30",
          status: "未払い",
          notes: "事務所 空調更新に伴う契約容量変更",
        },
      ];
      for (const o of oneOffs) {
        const key = miscNoKeyForMonth(o.date.slice(0, 7))!;
        const k = `${key.period}-${key.month}`;
        noSeq[k] = (noSeq[k] ?? 0) + 1;
        await tx`insert into misc_payments (category, type, payee, amount, payment_date, status, notes, period, payment_no, payment_method, company_account_id, created_at)
        values (${o.cat}, '支払', ${o.payee}, ${o.amount}, ${o.date}, ${o.status}, ${o.notes}, ${o.date.slice(0, 7)}, ${formatMiscPaymentNo(key, noSeq[k]!)}, '振込', ${pick([1, 3])}, ${ts(addDays(o.date, -10) > TODAY ? TODAY : addDays(o.date, -10))})`;
      }

      // --- 8. 定期売上・工事外売上 ---
      const rrecs = [
        {
          name: "北山駐車場 月極賃料",
          cat: "賃貸収入",
          payer: "株式会社東山パーキング",
          amount: 165_000,
          freq: "monthly",
          day: 25,
          eom: false,
          moy: null,
          start: "2025-04",
          acct: 4,
        },
        {
          name: "事務所 一部転貸料",
          cat: "賃貸収入",
          payer: "株式会社ライトハウス設計",
          amount: 88_000,
          freq: "monthly",
          day: 5,
          eom: false,
          moy: null,
          start: "2025-04",
          acct: 4,
        },
        {
          name: "普通預金 利息",
          cat: "利息収入",
          payer: "京都銀行",
          amount: 3_200,
          freq: "yearly",
          day: 28,
          eom: false,
          moy: 3,
          start: "2025-04",
          acct: 1,
        },
      ];
      const rrIds: number[] = [];
      for (const r of rrecs) {
        const [x] =
          await tx`insert into recurring_receipts (name, category_name, payer, amount, frequency, due_day, due_day_is_month_end, month_of_year, start_month, notes, company_account_id, created_at, updated_at)
        values (${r.name}, ${r.cat}, ${r.payer}, ${r.amount}, ${r.freq}, ${r.day}, ${r.eom}, ${r.moy}, ${r.start}, '', ${r.acct}, ${ts("2025-04-01")}, ${ts("2025-04-01")}) returning id`;
        rrIds.push((x as { id: number }).id);
      }
      const rSeq: Record<string, number> = {};
      for (let i = 0; i < rrecs.length; i++) {
        const r = rrecs[i]!;
        let ym = "2025-04";
        while (ym <= "2026-10") {
          const due = dueDateForMonth(
            {
              frequency: r.freq,
              dueDay: r.day,
              dueDayIsMonthEnd: r.eom,
              monthOfYear: r.moy,
              startMonth: r.start,
              endMonth: null,
            } as never,
            ym
          );
          if (due && due <= TODAY) {
            const key = miscNoKeyForMonth(due.slice(0, 7))!;
            const k = `${key.period}-${key.month}`;
            rSeq[k] = (rSeq[k] ?? 0) + 1;
            await tx`insert into misc_receipts (category, type, payer, amount, receipt_date, status, notes, name, recurring_id, period, receipt_no, company_account_id, created_at)
            values (${r.cat}, '入金', ${r.payer}, ${r.amount}, ${due}, '入金済', '', ${r.name}, ${rrIds[i]}, ${ym}, ${formatReceiptNo(key, rSeq[k]!)}, ${r.acct}, ${ts(due)})`;
          }
          ym = addMonths(ym, 1);
        }
      }
      const oneReceipts = [
        {
          cat: "備品売上",
          payer: "有限会社 山科重機リース",
          amount: 450_000,
          date: "2026-08-20",
          status: "入金済",
          name: "中古ミニバックホー 売却",
          notes: "",
        },
        {
          cat: "雑収入",
          payer: "東京海上日動火災保険",
          amount: 120_000,
          date: "2026-06-12",
          status: "入金済",
          name: "事務所 設備破損の保険金",
          notes: "",
        },
        {
          cat: "備品売上",
          payer: "株式会社ライトハウス設計",
          amount: 60_000,
          date: "2026-10-30",
          status: "未入金",
          name: "不要什器の譲渡",
          notes: "請求書送付済み",
        },
        {
          cat: "賃貸収入",
          payer: "有限会社 山科重機リース",
          amount: 55_000,
          date: "2026-11-15",
          status: "未入金",
          name: "資材置場 臨時利用料",
          notes: "",
        },
      ];
      for (const o of oneReceipts) {
        const key = miscNoKeyForMonth(o.date.slice(0, 7))!;
        const k = `${key.period}-${key.month}`;
        rSeq[k] = (rSeq[k] ?? 0) + 1;
        await tx`insert into misc_receipts (category, type, payer, amount, receipt_date, status, notes, name, period, receipt_no, company_account_id, created_at)
        values (${o.cat}, '入金', ${o.payer}, ${o.amount}, ${o.date}, ${o.status}, ${o.notes}, ${o.name}, ${o.date.slice(0, 7)}, ${formatReceiptNo(key, rSeq[k]!)}, 4, ${ts(addDays(o.date, -20) > TODAY ? TODAY : addDays(o.date, -20))})`;
      }

      // --- 9. 監査ログ ---
      auditPlans.sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const a of auditPlans) {
        if (a.at.getTime() > NOW.getTime()) continue;
        await tx`insert into audit_logs (user_id, action, table_name, record_id, details, created_at)
        values (${a.user}, ${a.action}, ${a.table}, ${a.recordId}, ${tx.json({ name: a.name, changes: a.changes })}, ${a.at})`;
      }
      for (const [i, v] of VENDORS.entries()) {
        await tx`insert into audit_logs (user_id, action, table_name, record_id, details, created_at) values (${admin}, 'CREATE', 'vendors', ${i + 1}, ${tx.json({ name: v.company, changes: [`新規登録（発注先: ${v.company}）`] })}, ${ts("2025-04-02", 10, i)})`;
      }
      for (const [i, c] of CUSTOMERS.entries()) {
        await tx`insert into audit_logs (user_id, action, table_name, record_id, details, created_at) values (${admin}, 'CREATE', 'customers', ${i + 1}, ${tx.json({ name: c.company, changes: [`新規登録（顧客: ${c.company}）`] })}, ${ts("2025-04-02", 11, i)})`;
      }

      // --- 集計 ---
      for (const t of [
        "users",
        "customers",
        "vendors",
        "projects",
        "orders",
        "order_files",
        "project_files",
        "invoices",
        "recurring_payments",
        "misc_payments",
        "recurring_receipts",
        "misc_receipts",
        "audit_logs",
      ]) {
        const [c] = await tx.unsafe(`select count(*)::int n from ${t}`);
        summary[t] = (c as { n: number }).n;
      }
      summary.invoicesCreated = invCount;
      if (!COMMIT) {
        throw new Error("__DRY_RUN__");
      }
    })
    .catch((e: Error) => {
      if (e.message !== "__DRY_RUN__") throw e;
    });
  console.log(COMMIT ? "COMMITTED" : "DRY RUN (rolled back)", summary);
  void currentFiscalPeriod;
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
