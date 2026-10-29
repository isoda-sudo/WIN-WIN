import type { Metadata } from "next";

export const metadata: Metadata = { title: "受注一覧" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
