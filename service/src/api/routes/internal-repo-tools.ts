import type { FastifyInstance } from "fastify";
import { internalAuthGuard } from "../middleware/internal-auth.js";
import path from "node:path";
import fs from "node:fs";
import { simpleGit } from "simple-git";
import { getOAuthToken } from "../../github/oauth.js";
import { getConfig } from "../../config/env.js";
import { GitHubClient } from "../../github/github-client.js";
import { getRepos } from "../../repos/sqlite/index.js";

export async function internalRepoToolRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", internalAuthGuard);

  app.post("/api/internal/repo-tools/checkout", async (request) => {
    const { projectId, repoOwner, repoName, branch } = request.body as {
      projectId: string;
      repoOwner: string;
      repoName: string;
      branch?: string;
    };
    const token = getOAuthToken(projectId);
    if (!token) return { error: "No GitHub token" };

    const config = getConfig();
    const workDir = path.join(config.OPENANT_DATA_DIR, "workspaces", "tools", `${repoOwner}_${repoName}`);

    if (!fs.existsSync(workDir)) {
      const cloneUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
      await simpleGit().clone(cloneUrl, workDir, ["--depth", "1"]);
    }

    if (branch) {
      await simpleGit(workDir).checkout(branch);
    }
    return { workDir };
  });

  app.post("/api/internal/repo-tools/read-file", async (request) => {
    const { workDir, filePath } = request.body as { workDir: string; filePath: string };
    const fullPath = path.resolve(workDir, filePath);
    if (!fullPath.startsWith(path.resolve(workDir))) return { error: "Path traversal" };
    if (!fs.existsSync(fullPath)) return { error: "Not found" };
    return { content: fs.readFileSync(fullPath, "utf-8") };
  });

  app.post("/api/internal/repo-tools/search", async (request) => {
    const { workDir, query, glob: globPattern } = request.body as {
      workDir: string;
      query: string;
      glob?: string;
    };
    const results: Array<{ file: string; line: number; text: string }> = [];
    const pattern = globPattern ?? "**/*";
    walkDir(workDir, workDir, pattern, (filePath, relPath) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query.toLowerCase())) {
            results.push({ file: relPath, line: i + 1, text: lines[i].slice(0, 200) });
          }
        }
      } catch {
        // skip binary files
      }
    });
    return results.slice(0, 50);
  });

  app.post("/api/internal/repo-tools/apply-patch", async (request) => {
    const { workDir, patches } = request.body as {
      workDir: string;
      patches: Array<{ action: string; path: string; content?: string }>;
    };
    for (const patch of patches) {
      const fullPath = path.resolve(workDir, patch.path);
      if (!fullPath.startsWith(path.resolve(workDir))) continue;
      if (patch.action === "delete") {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, patch.content ?? "");
      }
    }
    return { ok: true, applied: patches.length };
  });

  app.post("/api/internal/repo-tools/run-command", async (request) => {
    const { workDir, command } = request.body as { workDir: string; command: string };
    const allowed = ["npm test", "npm run lint", "npm run build", "pnpm test", "pnpm lint", "pnpm build", "npx tsc --noEmit"];
    if (!allowed.some((a) => command.startsWith(a))) {
      return { error: "Command not in allowlist", allowed };
    }
    const { execSync } = await import("node:child_process");
    try {
      const output = execSync(command, { cwd: workDir, timeout: 60_000, encoding: "utf-8" });
      return { exitCode: 0, output: output.slice(0, 10_000) };
    } catch (err: any) {
      return { exitCode: err.status ?? 1, output: (err.stdout ?? err.message).slice(0, 10_000) };
    }
  });

  app.post("/api/internal/repo-tools/commit", async (request) => {
    const { workDir, message } = request.body as { workDir: string; message: string };
    const git = simpleGit(workDir);
    await git.add(".");
    const result = await git.commit(message);
    return { commitHash: result.commit };
  });

  app.post("/api/internal/repo-tools/push", async (request) => {
    const { workDir, branch } = request.body as { workDir: string; branch: string };
    await simpleGit(workDir).push("origin", branch);
    return { ok: true };
  });

  app.post("/api/internal/repo-tools/create-pr", async (request) => {
    const { projectId, repoOwner, repoName, head, base, title, body } = request.body as {
      projectId: string;
      repoOwner: string;
      repoName: string;
      head: string;
      base: string;
      title: string;
      body: string;
    };
    const token = getOAuthToken(projectId);
    if (!token) return { error: "No GitHub token" };
    const client = new GitHubClient(token);
    const pr = await client.createPullRequest(repoOwner, repoName, title, body, head, base);

    const repos = getRepos();
    const repoRecord = repos.repositories.listSelectedByProject(projectId)
      .find((r) => r.owner === repoOwner && r.name === repoName);

    if (repoRecord) {
      repos.pullRequests.create({
        plan_id: "",
        repository_id: repoRecord.id,
        github_pr_number: pr.number,
        url: pr.url,
      });
    }
    return pr;
  });
}

function walkDir(
  baseDir: string,
  currentDir: string,
  _glob: string,
  callback: (filePath: string, relPath: string) => void
): void {
  const skipDirs = new Set(["node_modules", ".git", "dist", "build"]);
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walkDir(baseDir, path.join(currentDir, entry.name), _glob, callback);
    } else {
      callback(path.join(currentDir, entry.name), path.relative(baseDir, path.join(currentDir, entry.name)));
    }
  }
}
