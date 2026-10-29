import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  LineChart,
  PieChart,
  Settings,
  Tags,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { type AppRoute, pageAccess } from "~/lib/roles";

export interface NavLink {
  /** 現在地の判定を完全一致のみにする（親リンクが子ページで光らないように）。 */
  exact?: boolean;
  href: AppRoute | `${AppRoute}/${string}`;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** サブ項目としてインデント表示する。 */
  nested?: boolean;
}

export interface NavGroup {
  children: NavLink[];
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

/**
 * サイドバー構成。各リンクの表示可否は `~/lib/roles` の PAGE_ROLES（pageAccess）
 * から導出する（権限表が唯一の定義元）。
 * 工事計画（/orders-list）は受注一覧から遷移する画面のためサイドバーには出さない。
 */
export const NAV_ITEMS: NavEntry[] = [
  {
    icon: LayoutDashboard,
    label: "レポーティング",
    children: [
      { href: "/reporting/customers", icon: PieChart, label: "顧客別分析" },
      { href: "/reporting/vendors", icon: LineChart, label: "発注先別分析" },
    ],
  },
  { href: "/projects", icon: FileText, label: "受注一覧" },
  {
    icon: Settings,
    label: "マスタ設定",
    children: [
      { href: "/customers", icon: Building2, label: "顧客マスタ" },
      { href: "/vendors", icon: Users, label: "発注先マスタ" },
      { href: "/categories", icon: Tags, label: "工種マスタ" },
      { href: "/banks", icon: Landmark, label: "銀行マスタ" },
      {
        href: "/payment-categories",
        icon: Tags,
        label: "支払い種別マスタ",
      },
      { href: "/receipt-categories", icon: Wallet, label: "収入区分マスタ" },
      {
        href: "/company-accounts",
        icon: Landmark,
        label: "自社口座・手数料",
      },
    ],
  },
  { href: "/receipts", icon: BarChart3, label: "売上管理表" },
  { href: "/payment", icon: CreditCard, label: "支払い予定表" },
  { href: "/history", icon: History, label: "履歴詳細" },
  { href: "/invite", icon: UserPlus, label: "アカウント発行" },
];

export function visibleFor(entry: NavEntry, role: string): NavEntry | null {
  if (isNavGroup(entry)) {
    const children = entry.children.filter((c) => pageAccess(role, c.href));
    return children.length ? { ...entry, children } : null;
  }
  return pageAccess(role, entry.href) ? entry : null;
}

export function visibleNavItems(role: string): NavEntry[] {
  return NAV_ITEMS.map((entry) => visibleFor(entry, role)).filter(
    (entry): entry is NavEntry => entry !== null
  );
}

/** 表示されるリンクのhref一覧（テスト用・フラット）。 */
export function visibleNavHrefs(role: string): string[] {
  return visibleNavItems(role).flatMap((e) =>
    isNavGroup(e) ? e.children.map((c) => c.href) : [e.href]
  );
}
