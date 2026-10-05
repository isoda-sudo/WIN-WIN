/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // pdfkit's Japanese font (fonts/jp.ttc, project root) is loaded via fs.readFile
  // at request time (src/server/pdf/font.ts), not imported, so Next's file
  // tracer can't discover it on its own — without this it would be silently
  // dropped from the Vercel deployment bundle.
  outputFileTracingIncludes: {
    "/api/po/[orderId]": ["./fonts/jp.ttc"],
    "/api/po/send": ["./fonts/jp.ttc"],
    "/api/invoice/project/[projectId]": ["./fonts/jp.ttc"],
    "/api/invoice/project/[projectId]/pdf": ["./fonts/jp.ttc"],
    "/api/invoice/send": ["./fonts/jp.ttc"],
    "/api/estimate/project/[projectId]": ["./fonts/jp.ttc"],
    "/api/estimate/project/[projectId]/pdf": ["./fonts/jp.ttc"],
    "/api/estimate/send": ["./fonts/jp.ttc"],
  },
};

export default config;
