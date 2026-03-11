import { loadAgentInstructions } from "./load-instructions.js";
import { getRepos } from "../repos/sqlite/index.js";

export function getAgentInstructions(
  agentName: string,
  projectId?: string
): string {
  const base = loadAgentInstructions(agentName);

  if (!projectId) return base;

  // Check for project-level overrides stored in integration_settings
  const repos = getRepos();
  const setting = repos.integrationSettings.findByProjectAndKind(
    projectId,
    "OPENROUTER"
  );

  if (!setting) return base;

  try {
    const config = JSON.parse(setting.json_encrypted);
    const overrides = config.agentOverrides as Record<string, string> | undefined;
    if (overrides?.[agentName]) {
      return `${base}\n\n## Project-Specific Overrides\n\n${overrides[agentName]}`;
    }
  } catch {
    // no overrides
  }

  return base;
}
