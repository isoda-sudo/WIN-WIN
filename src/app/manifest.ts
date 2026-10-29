import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "物件管理システム",
    short_name: "物件管理",
    description: "株式会社WIN WIN 社内 物件管理システム",
    start_url: "/login",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    lang: "ja",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
