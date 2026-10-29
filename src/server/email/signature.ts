import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

const TRAILING_SPACE_RE = /\s+$/;
const SIGNATURE_SEPARATOR = "\n\n";

/** 送信者（ログインユーザー）の署名を本文の末尾に付ける。署名が未登録なら本文のまま。 */
export async function withSenderSignature(
  body: string,
  userId: number
): Promise<string> {
  const [row] = await db
    .select({ signature: users.emailSignature })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const signature = row?.signature?.trim();
  if (!signature) {
    return body;
  }
  return `${body.replace(TRAILING_SPACE_RE, "")}${SIGNATURE_SEPARATOR}${signature}`;
}
