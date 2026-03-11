import type { ILLMProvider } from "./provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { MockLLMProvider } from "./mock-provider.js";
import { getRepos } from "../repos/sqlite/index.js";
import { decrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";
import { getLogger } from "../lib/logger.js";

export interface LLMConfig {
  apiKey: string;
  assignmentModel: string;
  planningModel: string;
}

const DEFAULT_ASSIGNMENT_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_PLANNING_MODEL = "anthropic/claude-3.5-sonnet";

export function getLLMProvider(projectId: string): { provider: ILLMProvider; config: LLMConfig } {
  const repos = getRepos();
  const setting = repos.integrationSettings.findByProjectAndKind(projectId, "OPENROUTER");

  if (!setting) {
    return {
      provider: new MockLLMProvider(),
      config: {
        apiKey: "",
        assignmentModel: DEFAULT_ASSIGNMENT_MODEL,
        planningModel: DEFAULT_PLANNING_MODEL,
      },
    };
  }

  try {
    const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
    const raw = JSON.parse(decrypt(setting.json_encrypted, secret));
    const config: LLMConfig = {
      apiKey: raw.apiKey,
      assignmentModel: raw.assignmentModel || DEFAULT_ASSIGNMENT_MODEL,
      planningModel: raw.planningModel || DEFAULT_PLANNING_MODEL,
    };
    return { provider: new OpenRouterProvider(config.apiKey), config };
  } catch (err) {
    getLogger().warn({ err, projectId }, "Failed to decrypt OpenRouter config, falling back to mock provider");
    return {
      provider: new MockLLMProvider(),
      config: {
        apiKey: "",
        assignmentModel: DEFAULT_ASSIGNMENT_MODEL,
        planningModel: DEFAULT_PLANNING_MODEL,
      },
    };
  }
}
