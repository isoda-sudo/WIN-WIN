import type { MfaFailureReason } from "./service";

/** User-facing message and HTTP status for each 2FA failure. */
export const MFA_FAILURE: Record<
  MfaFailureReason,
  { message: string; status: number }
> = {
  malformed: {
    message:
      "コードの形式が正しくありません（認証コードは6桁の数字、リカバリーコードは XXXXX-XXXXX）",
    status: 400,
  },
  invalid: { message: "コードが正しくありません", status: 401 },
  replayed: {
    message:
      "このコードは使用済みです。次のコードが表示されるまでお待ちください",
    status: 401,
  },
  locked: {
    message:
      "コードの誤りが続いたため、15分間ロックしました。時間をおいて最初からログインしてください",
    status: 429,
  },
  not_enabled: {
    message: "2段階認証が設定されていません",
    status: 409,
  },
  not_started: {
    message: "設定を最初からやり直してください",
    status: 409,
  },
  already_enabled: {
    message: "2段階認証はすでに設定済みです",
    status: 409,
  },
  device_limit: {
    message:
      "登録できるスマホは2台までです。追加するには古いスマホを削除してください",
    status: 409,
  },
  last_device: {
    message: "最後の1台は削除できません。先に新しいスマホを登録してください",
    status: 409,
  },
  reauth_required: {
    message:
      "安全のため、2段階認証の設定とスマホの追加はログインから15分以内に行ってください。ログインし直してからもう一度お試しください",
    status: 403,
  },
  device_not_found: {
    message: "このスマホは登録されていません。画面を再読み込みしてください",
    status: 404,
  },
};

export const PENDING_EXPIRED_MESSAGE =
  "ログインの有効期限が切れました。最初からログインし直してください";
