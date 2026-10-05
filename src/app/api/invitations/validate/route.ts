import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { invitations } from "~/server/db/schema";

export const runtime = "nodejs";

const INVITE_ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  accounting: "経理部",
  staff: "一般社員",
};

/** 招待トークン検証（accept-invite ページから／認証不要） */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }
  const inv = await db.query.invitations.findFirst({
    where: eq(invitations.token, token),
  });
  if (!inv) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }
  if (inv.acceptedAt) {
    return NextResponse.json({ valid: false, reason: "accepted" });
  }
  if (inv.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }
  return NextResponse.json({
    valid: true,
    email: inv.email,
    name: inv.name,
    role: inv.role,
    roleLabel: INVITE_ROLE_LABELS[inv.role] || inv.role,
  });
}
