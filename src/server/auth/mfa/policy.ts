import { isRole, type Role } from "~/lib/roles";

export type LoginStep = "session" | "verify" | "enroll";

/** Parses `MFA_REQUIRED_ROLES` ("admin,accounting"); throws on an unknown role name. */
export function parseRequiredRoles(raw: string | undefined): Role[] {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of names) {
    if (!isRole(name)) {
      throw new Error(`MFA_REQUIRED_ROLES has an unknown role: ${name}`);
    }
  }
  return names as Role[];
}

/** What the login response hands out after the password check passed. */
export function decideLoginStep({
  mfaConfigured,
  totpEnabled,
  role,
  requiredRoles,
}: {
  mfaConfigured: boolean;
  totpEnabled: boolean;
  role: string;
  requiredRoles: readonly string[];
}): LoginStep {
  if (!mfaConfigured) {
    return "session";
  }
  if (totpEnabled) {
    return "verify";
  }
  return requiredRoles.includes(role) ? "enroll" : "session";
}
