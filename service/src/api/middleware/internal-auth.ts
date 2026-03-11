import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { getOrCreateServerSecret } from "../../lib/crypto.js";
import { getConfig } from "../../config/env.js";

let internalApiKey: string | null = null;

function getInternalApiKey(): string {
  if (!internalApiKey) {
    const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
    internalApiKey = crypto.createHash("sha256").update(secret).update("internal-api-key").digest("hex");
  }
  return internalApiKey;
}

export function getInternalApiKeyValue(): string {
  return getInternalApiKey();
}

export async function internalAuthGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const key = request.headers["x-internal-api-key"] as string | undefined;
  if (!key || key !== getInternalApiKey()) {
    reply.code(401).send({ error: "Invalid internal API key" });
    return;
  }
}
