const RECENT_LOGIN_MINUTES = 15;

/** True when the session was issued within the last 15 minutes. */
export function signedInRecently(signedInAt: Date | undefined): boolean {
  return (
    signedInAt !== undefined &&
    Date.now() - signedInAt.getTime() <= RECENT_LOGIN_MINUTES * 60_000
  );
}
