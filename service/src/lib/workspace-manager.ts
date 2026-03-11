import path from "node:path";
import fs from "node:fs";
import { simpleGit } from "simple-git";
import { getConfig } from "../config/env.js";
import { getOAuthToken } from "../github/oauth.js";
import { getLogger } from "./logger.js";
import { shortId } from "./id.js";
import type { Repository } from "../types/entities.js";

// ── Main Repo Copy ──────────────────────────────────────

export function getMainRepoPath(repoId: string): string {
  const config = getConfig();
  return path.join(config.OPENANT_DATA_DIR, "repos", repoId);
}

/**
 * Clones a repo from GitHub into data/repos/{repoId}/ if not already present.
 * Uses full clone (no --depth 1) so that local clones from this copy work properly.
 */
export async function ensureMainRepoCopy(repo: Repository, projectId: string): Promise<string> {
  const log = getLogger();
  const repoDir = getMainRepoPath(repo.id);
  const token = getOAuthToken(projectId);
  if (!token) throw new Error(`No GitHub token for project ${projectId}`);

  if (fs.existsSync(path.join(repoDir, ".git"))) {
    log.debug({ repoId: repo.id }, "Main repo copy already exists");
    return repoDir;
  }

  const cloneUrl = `https://x-access-token:${token}@github.com/${repo.owner}/${repo.name}.git`;
  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  log.info({ repo: `${repo.owner}/${repo.name}`, repoId: repo.id }, "Cloning main repo copy");
  await simpleGit().clone(cloneUrl, repoDir);
  return repoDir;
}

/**
 * Pulls latest from origin for a main repo copy.
 * Updates the remote URL first to handle token refreshes.
 */
export async function updateMainRepoCopy(repo: Repository, projectId: string): Promise<void> {
  const log = getLogger();
  const repoDir = getMainRepoPath(repo.id);

  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    await ensureMainRepoCopy(repo, projectId);
    return;
  }

  const token = getOAuthToken(projectId);
  if (token) {
    const cloneUrl = `https://x-access-token:${token}@github.com/${repo.owner}/${repo.name}.git`;
    await simpleGit(repoDir).remote(["set-url", "origin", cloneUrl]);
  }

  log.info({ repo: `${repo.owner}/${repo.name}` }, "Pulling latest for main repo copy");
  try {
    await simpleGit(repoDir).pull("origin", repo.default_branch, ["--ff-only"]);
  } catch (err: any) {
    log.warn({ repo: `${repo.owner}/${repo.name}`, err: err.message }, "Pull failed, attempting full fetch");
    await simpleGit(repoDir).fetch("origin");
    await simpleGit(repoDir).reset(["--hard", `origin/${repo.default_branch}`]);
  }
}

export function deleteMainRepoCopy(repoId: string): void {
  const repoDir = getMainRepoPath(repoId);
  if (fs.existsSync(repoDir)) {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

// ── Plan Workspace ──────────────────────────────────────

export function getPlanWorkspacePath(planId: string): string {
  const config = getConfig();
  return path.join(config.OPENANT_DATA_DIR, "plan-workspaces", planId);
}

/**
 * Creates a plan workspace by:
 * 1. Pulling latest on each main repo copy
 * 2. Local-cloning from data/repos/{repoId}/ into data/plan-workspaces/{planId}/{owner}_{name}/
 * 3. Setting remote URL back to GitHub (for push)
 * 4. Creating a feature branch on each clone
 * 5. Initializing a .git at the workspace root (Claude Code isolation)
 */
export async function createPlanWorkspace(params: {
  planId: string;
  projectId: string;
  repos: Repository[];
  branchName?: string;
}): Promise<{ workspacePath: string; clonedRepos: string[]; branchName: string }> {
  const log = getLogger();
  const workspacePath = getPlanWorkspacePath(params.planId);

  fs.mkdirSync(workspacePath, { recursive: true });

  // Init root .git to isolate Claude Code
  await simpleGit(workspacePath).init();

  const clonedRepos: string[] = [];
  const branchName = params.branchName ?? `openant/${params.planId.slice(0, 8)}-${shortId()}`;

  for (const repo of params.repos) {
    try {
      // Update main copy
      await updateMainRepoCopy(repo, params.projectId);

      // Local clone from main copy (fast, uses hardlinks)
      const mainRepoDir = getMainRepoPath(repo.id);
      const targetDir = path.join(workspacePath, `${repo.owner}_${repo.name}`);
      await simpleGit().clone(mainRepoDir, targetDir);

      // Set remote URL back to GitHub for push
      const token = getOAuthToken(params.projectId);
      if (token) {
        const githubUrl = `https://x-access-token:${token}@github.com/${repo.owner}/${repo.name}.git`;
        await simpleGit(targetDir).remote(["set-url", "origin", githubUrl]);
      }

      // Create feature branch
      await simpleGit(targetDir).checkoutLocalBranch(branchName);

      clonedRepos.push(`${repo.owner}_${repo.name}`);
    } catch (err: any) {
      log.warn({ repo: `${repo.owner}/${repo.name}`, err: err.message }, "Failed to clone repo for plan workspace");
    }
  }

  return { workspacePath, clonedRepos, branchName };
}

// ── Cleanup ─────────────────────────────────────────────

export function deletePlanWorkspace(planId: string): void {
  const log = getLogger();
  const workspacePath = getPlanWorkspacePath(planId);
  if (fs.existsSync(workspacePath)) {
    log.info({ planId, workspacePath }, "Deleting plan workspace");
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

/**
 * Deletes remote branches on GitHub for a plan's repos.
 * Uses git push origin :<branch> from the workspace directory.
 */
export async function deleteRemoteBranches(params: {
  planId: string;
  projectId: string;
  branchName: string;
  repos: Repository[];
}): Promise<void> {
  const log = getLogger();
  const workspacePath = getPlanWorkspacePath(params.planId);

  for (const repo of params.repos) {
    const repoDir = path.join(workspacePath, `${repo.owner}_${repo.name}`);
    try {
      if (fs.existsSync(path.join(repoDir, ".git"))) {
        await simpleGit(repoDir).push("origin", `:${params.branchName}`);
      }
    } catch (err: any) {
      log.warn({ repo: `${repo.owner}/${repo.name}`, branch: params.branchName, err: err.message }, "Failed to delete remote branch");
    }
  }
}

/**
 * Full cleanup for a plan: delete remote branches + delete workspace directory.
 */
export async function cleanupPlan(params: {
  planId: string;
  projectId: string;
  branchName: string | null;
  repos: Repository[];
}): Promise<void> {
  if (params.branchName) {
    await deleteRemoteBranches({
      planId: params.planId,
      projectId: params.projectId,
      branchName: params.branchName,
      repos: params.repos,
    });
  }
  deletePlanWorkspace(params.planId);
}
