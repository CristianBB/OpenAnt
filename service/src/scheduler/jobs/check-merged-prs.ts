import { getRepos } from "../../repos/sqlite/index.js";
import { getLogger } from "../../lib/logger.js";
import { GitHubClient } from "../../github/github-client.js";
import { getOAuthToken } from "../../github/oauth.js";

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

        // Update linked task to DONE
        if (plan.task_id) {
          repos.tasks.update(plan.task_id, { status: "DONE" });

          // Close related GitHub Issues if any source messages came from GitHub
          const taskLinks = repos.taskSourceMessages.listByTask(plan.task_id);
          for (const link of taskLinks) {
            const sourceMsg = repos.sourceMessages.findById(link.source_message_id);
            if (!sourceMsg) continue;

            const channel = repos.channels.findById(sourceMsg.channel_id);
            if (!channel || channel.kind !== "GITHUB_ISSUES") continue;

            // Extract issue number from external_id (format: "issue:owner/repo#number")
            const issueMatch = sourceMsg.external_id.match(/^issue:(.+?)\/(.+?)#(\d+)$/);
            if (!issueMatch) continue;

            const [, issueOwner, issueRepo, issueNum] = issueMatch;
            try {
              await client.closeIssueWithComment(
                issueOwner,
                issueRepo,
                parseInt(issueNum, 10),
                `This issue has been addressed in ${ghPr.merged ? pr.url : "a pull request"}. Closing automatically.`,
              );
              log.info({ issueOwner, issueRepo, issueNum }, "Closed GitHub issue after PR merge");
            } catch (err: any) {
              log.warn({ issueOwner, issueRepo, issueNum, err: err.message }, "Failed to close issue");
            }
          }
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
