import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export function getOrCreateServerSecret(dataDir: string): Buffer {
  const secretPath = path.join(dataDir, ".secret");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath);
  }

  // If a database already exists but the secret is missing, refuse to start
  // rather than silently creating a new secret that cannot decrypt existing data.
  const dbPath = path.join(dataDir, "openant.db");
  if (fs.existsSync(dbPath)) {
    throw new Error(
      `FATAL: Database exists at ${dbPath} but encryption secret is missing (${secretPath}). ` +
        `Refusing to create a new secret — that would make existing encrypted data unreadable. ` +
        `Restore the .secret file from a backup or delete the database to start fresh.`
    );
  }

  const secret = crypto.randomBytes(32);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

export function encrypt(plaintext: string, secret: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, secret, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string, secret: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, secret, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
