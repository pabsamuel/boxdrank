// Encrypts / decrypts the merchant's Airtable Personal Access Token so it is
// never stored in plain text. Uses AES-256-GCM (authenticated encryption).
//
// The key comes from the ENCRYPTION_KEY environment variable. In development
// we fall back to SHOPIFY_API_SECRET so things work out of the box, but
// production MUST set a dedicated ENCRYPTION_KEY (see README / DEPLOY.md).

import crypto from "node:crypto";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY (or SHOPIFY_API_SECRET) must be set to encrypt Airtable tokens",
    );
  }
  // scrypt stretches whatever string we get into a proper 32-byte AES key.
  return crypto.scryptSync(secret, "airsync-token-v1", 32);
}

// Returns "iv:authTag:ciphertext" (all hex). Safe to store in the DB.
export function encryptToken(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

// Reverses encryptToken. Throws if the stored value was tampered with or the
// key changed (GCM authenticates the ciphertext).
export function decryptToken(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Stored Airtable token has an unexpected format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
