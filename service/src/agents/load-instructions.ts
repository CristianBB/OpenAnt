import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(__dirname, "../../agents");

const cache = new Map<string, string>();

export function loadAgentInstructions(agentName: string): string {
  if (cache.has(agentName)) {
    return cache.get(agentName)!;
  }

  const filePath = path.join(agentsDir, `${agentName}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent instructions not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  cache.set(agentName, content);
  return content;
}

export function clearInstructionsCache(): void {
  cache.clear();
}
