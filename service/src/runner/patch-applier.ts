import fs from "node:fs";
import path from "node:path";

export interface PatchOperation {
  action: "create" | "update" | "delete";
  path: string;
  content?: string;
}

export function parsePlanPatches(planJson: string): PatchOperation[] {
  const plan = JSON.parse(planJson);
  const patches: PatchOperation[] = [];

  if (Array.isArray(plan.patches)) {
    for (const p of plan.patches) {
      patches.push({
        action: p.action ?? "update",
        path: p.path,
        content: p.content,
      });
    }
  } else if (Array.isArray(plan.files)) {
    for (const f of plan.files) {
      patches.push({
        action: f.action ?? "create",
        path: f.path,
        content: f.content,
      });
    }
  }

  return patches;
}

export function applyPatches(workDir: string, patches: PatchOperation[]): void {
  for (const patch of patches) {
    const fullPath = path.join(workDir, patch.path);

    switch (patch.action) {
      case "create":
      case "update": {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, patch.content ?? "");
        break;
      }
      case "delete": {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        break;
      }
    }
  }
}
