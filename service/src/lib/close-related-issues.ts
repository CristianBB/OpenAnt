import { getRepos } from "../repos/sqlite/index.js";
import { getLogger } from "./logger.js";
import { GitHubClient } from "../github/github-client.js";
import { getOAuthToken } from "../github/oauth.js";

/**
 * Close GitHub issues related to a task's source messages.
 * Called when a task transitions to DONE (either via PR merge or manual status change).
 */
export async function closeRelatedIssues(taskId: string, prUrl?: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  const task = repos.tasks.findById(taskId);
  if (!task) return;

  const token = getOAuthToken(task.project_id);
  if (!token) return;

  const client = new GitHubClient(token);
  const taskLinks = repos.taskSourceMessages.listByTask(taskId);

  for (const link of taskLinks) {
    const sourceMsg = repos.sourceMessages.findById(link.source_message_id);
    if (!sourceMsg) continue;

    const channel = repos.channels.findById(sourceMsg.channel_id);
    if (!channel || channel.kind !== "GITHUB_ISSUES") continue;

    // Extract issue number from external_id (format: "issue:owner/repo#number")
    const issueMatch = sourceMsg.external_id.match(/^issue:(.+?)\/(.+?)#(\d+)$/);
    if (!issueMatch) continue;

    const [, issueOwner, issueRepo, issueNum] = issueMatch;
    const comment = prUrl
      ? `This issue has been resolved in [${prUrl}](${prUrl}).\n\n🤖 _Automatically closed by [OpenAnt](https://github.com/CristianBB/OpenAnt)_`
      : `This issue has been resolved.\n\n🤖 _Automatically closed by [OpenAnt](https://github.com/CristianBB/OpenAnt)_`;

    try {
      await client.closeIssueWithComment(
        issueOwner,
        issueRepo,
        parseInt(issueNum, 10),
        comment,
      );
      log.info({ issueOwner, issueRepo, issueNum }, "Closed GitHub issue");
    } catch (err: any) {
      log.warn({ issueOwner, issueRepo, issueNum, err: err.message }, "Failed to close issue");
    }
  }
}
