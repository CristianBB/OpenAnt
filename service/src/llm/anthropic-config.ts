import { getRepos } from "../repos/sqlite/index.js";
import { decrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";
import { getLogger } from "../lib/logger.js";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

const DEFAULT_AGENT_MODEL = "claude-sonnet-4-6";

export function getAnthropicConfig(projectId: string): AnthropicConfig | null {
  const repos = getRepos();
  const setting = repos.integrationSettings.findByProjectAndKind(projectId, "ANTHROPIC");
  if (!setting) return null;

  try {
    const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
    const raw = JSON.parse(decrypt(setting.json_encrypted, secret));
    return {
      apiKey: raw.apiKey,
      model: raw.model || DEFAULT_AGENT_MODEL,
    };
  } catch (err) {
    getLogger().warn({ err, projectId }, "Failed to decrypt Anthropic config");
    return null;
  }
}
