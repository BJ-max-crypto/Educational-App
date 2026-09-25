import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function key() {
  const raw = process.env.FEED_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing FEED_ENCRYPTION_KEY");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error("FEED_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return bytes;
}

/** AES-256-GCM. Output: v1:<base64 of iv | auth tag | ciphertext>. */
export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [version, body] = payload.split(":");
  if (version !== VERSION || !body) throw new Error("Unrecognized encrypted payload");
  const bytes = Buffer.from(body, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
