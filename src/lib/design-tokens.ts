/**
 * Design token utilities for reading CSS variables from globals.css
 */

export interface ColorTokenDefinition {
  description: string;
  name: string;
  usage?: string[];
  variable: string;
}

export interface SpacingTokenDefinition {
  example: string;
  usage: string;
  value: string;
}

/**
 * Get CSS variable value from the document
 * This function must be called on the client side
 */
export function getCSSVariable(variableName: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  if (!variableName.startsWith("--")) {
    console.warn(`CSS variable should start with '--': ${variableName}`);
    return "";
  }

  try {
    const element = document.documentElement;
    if (!element) {
      console.warn("document.documentElement is not available");
      return "";
    }

    const computedStyle = getComputedStyle(element);
    if (!computedStyle) {
      console.warn("getComputedStyle returned null for element");
      return "";
    }
    const value = computedStyle.getPropertyValue(variableName);
    return value ? value.trim() : "";
  } catch (error) {
    console.error(`Failed to get CSS variable ${variableName}:`, error);
    return "";
  }
}

/**
 * Get color value for light and dark modes
 * This function temporarily switches theme to read both values and restores the original state
 */
export function getColorValues(variableName: string): {
  light: string;
  dark: string;
} {
  if (typeof window === "undefined") {
    return { light: "", dark: "" };
  }

  // Store original theme state
  const originalTheme = document.documentElement.classList.contains("dark");

  try {
    // Get light mode value
    document.documentElement.classList.remove("dark");
    const light = getCSSVariable(variableName);

    // Get dark mode value
    document.documentElement.classList.add("dark");
    const dark = getCSSVariable(variableName);

    return { light, dark };
  } finally {
    // Restore original theme state
    if (!originalTheme) {
      document.documentElement.classList.remove("dark");
    }
  }
}

/**
 * Color token definitions
 */
export const colorTokens: Record<string, ColorTokenDefinition> = {
  background: {
    name: "Background",
    description: "ページの背景色",
    variable: "--background",
  },
  foreground: {
    name: "Foreground",
    description: "メインテキストの色",
    variable: "--foreground",
  },
  primary: {
    name: "Primary",
    description: "メインブランドカラー。重要なアクションやフォーカス状態に使用",
    variable: "--primary",
    usage: ["CTA ボタン", "リンク", "フォーカス状態", "プログレスバー"],
  },
  "primary-foreground": {
    name: "Primary Foreground",
    description: "プライマリカラー上のテキスト色",
    variable: "--primary-foreground",
  },
  secondary: {
    name: "Secondary",
    description: "セカンダリアクションや補助的な要素に使用",
    variable: "--secondary",
    usage: ["セカンダリボタン", "選択状態", "バッジ", "強調テキスト"],
  },
  "secondary-foreground": {
    name: "Secondary Foreground",
    description: "セカンダリカラー上のテキスト色",
    variable: "--secondary-foreground",
  },
  muted: {
    name: "Muted",
    description: "サブテキストや無効状態に使用",
    variable: "--muted",
  },
  "muted-foreground": {
    name: "Muted Foreground",
    description: "ミュートカラー上のテキスト色",
    variable: "--muted-foreground",
  },
  accent: {
    name: "Accent",
    description: "アクセントカラー。特別な要素やハイライトに使用",
    variable: "--accent",
    usage: ["通知", "ハイライト", "ホバー状態", "デコレーション"],
  },
  "accent-foreground": {
    name: "Accent Foreground",
    description: "アクセントカラー上のテキスト色",
    variable: "--accent-foreground",
  },
  destructive: {
    name: "Destructive",
    description: "危険な操作やエラー状態を表現",
    variable: "--destructive",
    usage: ["削除ボタン", "エラーメッセージ", "警告表示"],
  },
  border: {
    name: "Border",
    description: "ボーダーやセパレーターの色",
    variable: "--border",
  },
  input: {
    name: "Input",
    description: "入力フィールドのボーダー色",
    variable: "--input",
  },
  ring: {
    name: "Ring",
    description: "フォーカスリングの色",
    variable: "--ring",
  },
  card: {
    name: "Card",
    description: "カードコンポーネントの背景色",
    variable: "--card",
  },
  "card-foreground": {
    name: "Card Foreground",
    description: "カード上のテキスト色",
    variable: "--card-foreground",
  },
  popover: {
    name: "Popover",
    description: "ポップオーバーの背景色",
    variable: "--popover",
  },
  "popover-foreground": {
    name: "Popover Foreground",
    description: "ポップオーバー上のテキスト色",
    variable: "--popover-foreground",
  },
};

export const chartColors: Record<string, ColorTokenDefinition> = {
  "chart-1": {
    name: "Chart 1",
    description: "メインチャートカラー",
    variable: "--chart-1",
  },
  "chart-2": {
    name: "Chart 2",
    description: "セカンダリチャートカラー",
    variable: "--chart-2",
  },
  "chart-3": {
    name: "Chart 3",
    description: "第3チャートカラー",
    variable: "--chart-3",
  },
  "chart-4": {
    name: "Chart 4",
    description: "第4チャートカラー",
    variable: "--chart-4",
  },
  "chart-5": {
    name: "Chart 5",
    description: "第5チャートカラー",
    variable: "--chart-5",
  },
};

export const sidebarColors: Record<string, ColorTokenDefinition> = {
  sidebar: {
    name: "Sidebar",
    description: "サイドバーの背景色",
    variable: "--sidebar",
  },
  "sidebar-foreground": {
    name: "Sidebar Foreground",
    description: "サイドバーのテキスト色",
    variable: "--sidebar-foreground",
  },
  "sidebar-primary": {
    name: "Sidebar Primary",
    description: "サイドバーのプライマリ要素",
    variable: "--sidebar-primary",
  },
  "sidebar-primary-foreground": {
    name: "Sidebar Primary Foreground",
    description: "サイドバープライマリ要素のテキスト色",
    variable: "--sidebar-primary-foreground",
  },
  "sidebar-accent": {
    name: "Sidebar Accent",
    description: "サイドバーのアクセント要素",
    variable: "--sidebar-accent",
  },
  "sidebar-accent-foreground": {
    name: "Sidebar Accent Foreground",
    description: "サイドバーアクセント要素のテキスト色",
    variable: "--sidebar-accent-foreground",
  },
  "sidebar-border": {
    name: "Sidebar Border",
    description: "サイドバーのボーダー色",
    variable: "--sidebar-border",
  },
  "sidebar-ring": {
    name: "Sidebar Ring",
    description: "サイドバーのフォーカスリング色",
    variable: "--sidebar-ring",
  },
};

/**
 * Spacing scale definitions
 */
export const spacingScale: Record<string, SpacingTokenDefinition> = {
  "1": {
    value: "0.25rem",
    usage: "最小UI間隔",
    example: "チェックボックスとラベル",
  },
  "2": {
    value: "0.5rem",
    usage: "基本UI間隔",
    example: "リストアイテム間隔",
  },
  "3": {
    value: "0.75rem",
    usage: "標準コンポーネント間隔",
    example: "入力フィールド内余白",
  },
  "4": {
    value: "1rem",
    usage: "標準コンテンツ間隔",
    example: "段落間の基本間隔",
  },
  "5": {
    value: "1.25rem",
    usage: "コンポーネント間隔",
    example: "フォームフィールド間",
  },
  "6": {
    value: "1.5rem",
    usage: "セクション内間隔",
    example: "カード内余白",
  },
  "8": {
    value: "2rem",
    usage: "セクション間隔",
    example: "セクション間の標準間隔",
  },
  "10": {
    value: "2.5rem",
    usage: "メジャーセクション間隔",
    example: "ヘッダーとコンテンツ間",
  },
  "12": {
    value: "3rem",
    usage: "大レイアウト間隔",
    example: "ページヘッダーとコンテンツ間",
  },
  "16": {
    value: "4rem",
    usage: "超大レイアウト間隔",
    example: "ページトップとメインコンテンツ間",
  },
};
