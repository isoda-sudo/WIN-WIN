import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  digest: z.string().max(100).optional(),
  message: z.string().max(500).optional(),
  path: z.string().max(300).optional(),
  stack: z.string().max(2000).optional(),
});

// 画面側で起きた予期しないエラーを、サーバーのログ（Vercel Logs）に残す。
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (parsed.success) {
    console.error("[client-error]", JSON.stringify(parsed.data));
  }
  return NextResponse.json({ ok: true });
}
