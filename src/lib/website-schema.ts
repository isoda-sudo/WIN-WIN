import { z } from "zod";
import { normalizeWebsite } from "~/lib/safe-url";

/** ウェブサイト欄。http(s) のURLにそろえる（スキームが無ければ https:// を付ける）。javascript: などは拒否する。 */
export const websiteSchema = z
  .string()
  .max(500)
  .transform((value, ctx) => {
    const normalized = normalizeWebsite(value);
    if (normalized === null) {
      ctx.addIssue({
        code: "custom",
        message:
          "ウェブサイトは、http:// または https:// で始まるURLで入力してください",
      });
      return z.NEVER;
    }
    return normalized;
  })
  .nullish();
