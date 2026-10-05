import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // This project connects to the SAME live Supabase instance as the existing
  // construct-pro (Express) app. Never run `drizzle-kit push`/`migrate` against
  // it from here — the schema is authored to match the live DB, not to drive it.
  // See /Users/hiromu.umeda/.claude/plans/mutable-gliding-metcalfe.md, risk #10.
  strict: true,
  verbose: true,
});
