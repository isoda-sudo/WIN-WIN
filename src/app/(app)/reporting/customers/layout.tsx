import type { Metadata } from "next";

export const metadata: Metadata = { title: "顧客別分析" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
