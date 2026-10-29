import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";

import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "物件管理システム", template: "%s｜物件管理システム" },
  description: "株式会社WIN WIN 社内 物件管理システム",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "物件管理システム",
    description: "株式会社WIN WIN 社内 物件管理システム",
    siteName: "物件管理システム",
    locale: "ja_JP",
    type: "website",
  },
  applicationName: "物件管理システム",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#7c3aed" };

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
  weight: ["400", "500", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${notoSansJP.variable}`}
      lang="ja"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
