import { getRepos } from "../../repos/sqlite/index.js";
import { getLogger } from "../../lib/logger.js";
import { GitHubClient } from "../../github/github-client.js";
import { getOAuthToken } from "../../github/oauth.js";
import { closeRelatedIssues } from "../../lib/close-related-issues.js";

export async function runCheckMergedPrs(): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  // Get all open PRs
  const openPrs = repos.pullRequests.listByStatus("OPEN");

  for (const pr of openPrs) {
    try {
      if (!pr.github_pr_number) continue;

      const repo = repos.repositories.findById(pr.repository_id);
      if (!repo) continue;

      const plan = repos.plans.findById(pr.plan_id);
      if (!plan) continue;

      const token = getOAuthToken(plan.project_id);
      if (!token) continue;

      const client = new GitHubClient(token);
      const ghPr = await client.getPullRequest(repo.owner, repo.name, pr.github_pr_number);

      if (ghPr.merged) {
        // Update PR status
        repos.pullRequests.updateStatus(pr.id, "MERGED");

        // Update plan status
        repos.plans.updateStatus(plan.id, "DONE");

        // Update linked task to DONE and close related GitHub issues
        if (plan.task_id) {
          repos.tasks.update(plan.task_id, { status: "DONE" });
          await closeRelatedIssues(plan.task_id, pr.url ?? undefined);
        }

        log.info({ prId: pr.id, prNumber: pr.github_pr_number }, "PR merged, updated statuses");
      } else if (ghPr.state === "closed" && !ghPr.merged) {
        repos.pullRequests.updateStatus(pr.id, "CLOSED");
        log.info({ prId: pr.id, prNumber: pr.github_pr_number }, "PR closed without merge");
      }
    } catch (err: any) {
      log.error({ prId: pr.id, err: err.message }, "Failed to check PR status");
    }
  }
}
