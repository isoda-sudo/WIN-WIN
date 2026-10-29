import { redirect } from "next/navigation";

/** レポーティングのトップ画面は廃止。ブックマーク等で開かれた場合は顧客別分析へ移動する。 */
export default function ReportingIndexPage() {
  redirect("/reporting/customers");
}
