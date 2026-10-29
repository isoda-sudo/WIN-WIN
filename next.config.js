/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // 検索エンジンに載せない（PDF・APIレスポンスにも効かせる）＋基本のセキュリティヘッダ
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ]);
  },
  // pdfkit's Japanese font (fonts/jp.ttc, project root) is loaded via fs.readFile
  // at request time (src/server/pdf/font.ts), not imported, so Next's file
  // tracer can't discover it on its own — without this it would be silently
  // dropped from the Vercel deployment bundle.
  outputFileTracingIncludes: {
    "/api/po/[orderId]": ["./fonts/jp.ttc"],
    "/api/po/send": ["./fonts/jp.ttc"],
    "/api/invoice/project/[projectId]": [
      "./fonts/jp.ttc",
      "./assets/company-seal.png",
    ],
    "/api/invoice/project/[projectId]/pdf": [
      "./fonts/jp.ttc",
      "./assets/company-seal.png",
    ],
    "/api/invoice/send": ["./fonts/jp.ttc", "./assets/company-seal.png"],
    "/api/invoices/[id]/file": ["./fonts/jp.ttc", "./assets/company-seal.png"],
  },
};

export default config;
