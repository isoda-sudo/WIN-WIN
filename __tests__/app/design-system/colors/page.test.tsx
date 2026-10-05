import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ColorsPage from "~/app/design-system/colors/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
  }),
}));

// Mock useColorValues hook
vi.mock("~/hooks/use-color-values", () => ({
  useColorValues: (variableName: string) => {
    const mockValues: Record<string, { light: string; dark: string }> = {
      "--primary": {
        light: "0.4341 0.0392 41.9938",
        dark: "0.4341 0.0392 41.9938",
      },
      "--background": { light: "0.9821 0 0", dark: "0.9821 0 0" },
      "--chart-1": {
        light: "0.6271 0.1936 33.339",
        dark: "0.6271 0.1936 33.339",
      },
      "--sidebar": { light: "0.9881 0 0", dark: "0.9881 0 0" },
    };
    const values = mockValues[variableName] || { light: "", dark: "" };
    return {
      ...values,
      loading: false,
      error: null,
    };
  },
}));

// Mock design-tokens
vi.mock("~/lib/design-tokens", () => ({
  colorTokens: {
    primary: {
      name: "Primary",
      description: "メインブランドカラー",
      variable: "--primary",
      usage: ["CTA ボタン", "リンク"],
    },
    background: {
      name: "Background",
      description: "ページの背景色",
      variable: "--background",
    },
  },
  chartColors: {
    "chart-1": {
      name: "Chart 1",
      description: "メインチャートカラー",
      variable: "--chart-1",
    },
  },
  sidebarColors: {
    sidebar: {
      name: "Sidebar",
      description: "サイドバーの背景色",
      variable: "--sidebar",
    },
  },
  getCSSVariable: (variableName: string) => {
    const mockValues: Record<string, string> = {
      "--primary": "0.4341 0.0392 41.9938",
      "--background": "0.9821 0 0",
      "--chart-1": "0.6271 0.1936 33.339",
      "--sidebar": "0.9881 0 0",
    };
    return mockValues[variableName] || "";
  },
  getColorValues: (variableName: string) => {
    const mockValues: Record<string, { light: string; dark: string }> = {
      "--primary": {
        light: "0.4341 0.0392 41.9938",
        dark: "0.4341 0.0392 41.9938",
      },
      "--background": { light: "0.9821 0 0", dark: "0.9821 0 0" },
      "--chart-1": {
        light: "0.6271 0.1936 33.339",
        dark: "0.6271 0.1936 33.339",
      },
      "--sidebar": { light: "0.9881 0 0", dark: "0.9881 0 0" },
    };
    return mockValues[variableName] || { light: "", dark: "" };
  },
}));

describe("ColorsPage", () => {
  beforeEach(() => {
    // Reset DOM
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
  });

  it("should render page title and description", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: page loads
    // Then: title and description should be visible
    expect(screen.getByText("カラーシステム")).toBeInTheDocument();
    expect(
      screen.getByText(
        "globals.cssに定義されたカラートークンの一覧とガイドライン"
      )
    ).toBeInTheDocument();
  });

  it("should render all color sections", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: page loads
    // Then: all color sections should be visible
    expect(screen.getByText("基本カラー")).toBeInTheDocument();
    expect(screen.getByText("チャートカラー")).toBeInTheDocument();
    expect(screen.getByText("サイドバーカラー")).toBeInTheDocument();
  });

  it("should render color token cards with names and descriptions", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: page loads
    // Then: color token cards should display names and descriptions
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("メインブランドカラー")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("ページの背景色")).toBeInTheDocument();
  });

  it("should display CSS variable names for each token", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: page loads
    // Then: CSS variable names should be displayed
    expect(screen.getByText("var(--primary)")).toBeInTheDocument();
    expect(screen.getByText("var(--background)")).toBeInTheDocument();
  });

  it("should display usage examples when available", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: page loads
    // Then: usage examples should be displayed for tokens that have them
    expect(screen.getByText("使用例")).toBeInTheDocument();
    expect(screen.getByText("CTA ボタン")).toBeInTheDocument();
    expect(screen.getByText("リンク")).toBeInTheDocument();
  });

  it("should dynamically load color values using useEffect", async () => {
    // Given: CSS variables are set on document
    document.documentElement.style.setProperty(
      "--primary",
      "0.4341 0.0392 41.9938"
    );

    // When: ColorsPage is rendered
    render(<ColorsPage />);

    // Then: color values should be loaded and displayed
    await waitFor(() => {
      const colorValues = screen.getAllByText("0.4341 0.0392 41.9938");
      expect(colorValues.length).toBeGreaterThan(0);
    });
  });

  it("should display both light and dark mode values", async () => {
    // Given: page is rendered
    render(<ColorsPage />);

    // When: color values are loaded
    // Then: both Light and Dark labels should be visible
    await waitFor(() => {
      const lightLabels = screen.getAllByText("Light");
      const darkLabels = screen.getAllByText("Dark");
      expect(lightLabels.length).toBeGreaterThan(0);
      expect(darkLabels.length).toBeGreaterThan(0);
    });
  });

  it("should render color swatches for each token", () => {
    // Given: ColorsPage is rendered
    render(<ColorsPage />);

    // When: component mounts
    // Then: color swatches should be rendered (one for light, one for dark per token)
    const lightLabels = screen.getAllByText("Light");
    const darkLabels = screen.getAllByText("Dark");
    expect(lightLabels.length).toBeGreaterThan(0);
    expect(darkLabels.length).toBeGreaterThan(0);
  });
});
