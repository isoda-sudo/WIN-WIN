import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_PATTERN = /^[0-9a-f]{64}$/i;

function parseKey(keyHex: string): Buffer {
  if (!KEY_PATTERN.test(keyHex)) {
    throw new Error("Encryption key must be a 32-byte hex string");
  }
  return Buffer.from(keyHex, "hex");
}

/** Encrypts a TOTP secret bound to `owner` (AAD) as `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function sealSecret(
  plaintext: string,
  keyHex: string,
  owner: string
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, parseKey(keyHex), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(owner, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url")
    )
    .join(".");
}

/** Throws if the value was tampered with, truncated, or sealed under another key or owner. */
export function openSecret(
  sealed: string,
  keyHex: string,
  owner: string
): string {
  const [version, ivText, tagText, ciphertext] = sealed.split(".");
  if (version !== VERSION || !ivText || !tagText || !ciphertext) {
    throw new Error("Unrecognised sealed secret format");
  }
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Sealed secret has an invalid IV or auth tag length");
  }
  const decipher = createDecipheriv(ALGORITHM, parseKey(keyHex), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(owner, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
