import crypto from "node:crypto";

export function newId(): string {
  return crypto.randomUUID();
}

export function shortId(): string {
  return crypto.randomBytes(4).toString("hex");
}
