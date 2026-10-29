import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { MFA_FAILURE } from "~/server/auth/mfa/messages";
import { signedInRecently } from "~/server/auth/mfa/recent-login";
import {
  adminResetMfa,
  confirmAddDevice,
  confirmTotpEnrollment,
  getMfaStatus,
  isMfaConfigured,
  listMfaEnabledUserIds,
  type MfaFailure,
  regenerateRecoveryCodes,
  removeDevice,
  startAddDevice,
  startTotpEnrollment,
} from "~/server/auth/mfa/service";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

const codeInput = z.object({ code: z.string().trim().min(1).max(20) });
const DEVICE_NAME_PATTERN = /^[^\p{Cc}\p{Cf}]*$/u;

const ERROR_CODE: Record<MfaFailure["reason"], TRPCError["code"]> = {
  malformed: "BAD_REQUEST",
  invalid: "BAD_REQUEST",
  replayed: "BAD_REQUEST",
  locked: "TOO_MANY_REQUESTS",
  not_enabled: "CONFLICT",
  not_started: "CONFLICT",
  already_enabled: "CONFLICT",
  device_limit: "CONFLICT",
  last_device: "CONFLICT",
  device_not_found: "NOT_FOUND",
  reauth_required: "FORBIDDEN",
};

function toTrpcError(failure: MfaFailure): TRPCError {
  return new TRPCError({
    code: ERROR_CODE[failure.reason],
    message: MFA_FAILURE[failure.reason].message,
  });
}

/** Self-service setup from the settings screen needs a session issued within 15 minutes. */
function requireRecentLogin(signedInAt: Date | undefined) {
  if (!signedInRecently(signedInAt)) {
    throw toTrpcError({ ok: false, reason: "reauth_required" });
  }
}

function requireConfigured() {
  if (!isMfaConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "2段階認証はまだ利用できません（サーバー設定が未完了です）",
    });
  }
}

/** Every signed-in role manages its own phones; turning 2FA off (reset) is admin-only. */
export const mfaRouter = createTRPCRouter({
  status: protectedProcedure.query(({ ctx }) => getMfaStatus(ctx.user)),

  startEnrollment: protectedProcedure.mutation(async ({ ctx }) => {
    requireConfigured();
    requireRecentLogin(ctx.user.signedInAt);
    const result = await startTotpEnrollment(ctx.user);
    if (!result.ok) {
      throw toTrpcError(result);
    }
    return { ...result, accountName: ctx.user.email };
  }),

  confirmEnrollment: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      requireRecentLogin(ctx.user.signedInAt);
      const result = await confirmTotpEnrollment(ctx.user, input.code);
      if (!result.ok) {
        throw toTrpcError(result);
      }
      return { recoveryCodes: result.recoveryCodes };
    }),

  regenerateRecoveryCodes: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      const result = await regenerateRecoveryCodes(ctx.user, input.code);
      if (!result.ok) {
        throw toTrpcError(result);
      }
      return { recoveryCodes: result.recoveryCodes };
    }),

  startAddDevice: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .max(30)
          .regex(DEVICE_NAME_PATTERN, "使えない文字が含まれています")
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      const result = await startAddDevice(ctx.user, input.name);
      if (!result.ok) {
        throw toTrpcError(result);
      }
      return { ...result, accountName: ctx.user.email };
    }),

  confirmAddDevice: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      const result = await confirmAddDevice(ctx.user, input.code);
      if (!result.ok) {
        throw toTrpcError(result);
      }
      return { ok: true };
    }),

  removeDevice: protectedProcedure
    .input(codeInput.extend({ deviceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      const result = await removeDevice(ctx.user, input.deviceId, input.code);
      if (!result.ok) {
        throw toTrpcError(result);
      }
      return { ok: true };
    }),

  adminReset: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireConfigured();
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "自分の2段階認証は、別の管理者にリセットを依頼してください",
        });
      }
      const target = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const reset = await adminResetMfa(ctx.user.id, {
        id: target.id,
        email: target.email,
        role: target.role ?? "user",
      });
      return { reset };
    }),

  adminEnabledUserIds: adminProcedure.query(() => listMfaEnabledUserIds()),
});
