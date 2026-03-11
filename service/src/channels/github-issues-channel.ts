import { GitHubClient } from "../github/github-client.js";
import { getOAuthToken } from "../github/oauth.js";
import { getRepos } from "../repos/sqlite/index.js";
import { decrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";
import type { Channel } from "../types/entities.js";
import type { ChannelHandler, PollResult } from "./types.js";

interface GitHubIssuesConfig {
  repositoryIds: string[];
}

function decryptConfig(channel: Channel): GitHubIssuesConfig {
  const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
  return JSON.parse(decrypt(channel.config_encrypted, secret));
}

export class GitHubIssuesChannel implements ChannelHandler {
  async poll(channel: Channel): Promise<PollResult> {
    const config = decryptConfig(channel);
    const token = getOAuthToken(channel.project_id);
    if (!token) {
      throw new Error(`No GitHub token for project ${channel.project_id}`);
    }

    const client = new GitHubClient(token);
    const repos = getRepos();
    const messages: PollResult["messages"] = [];
    const since = channel.last_poll_cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let latestDate = since;

    for (const repoId of config.repositoryIds) {
      const repo = repos.repositories.findById(repoId);
      if (!repo) continue;

      // Fetch new issues
      const issues = await client.listIssuesSince(repo.owner, repo.name, since);
      for (const issue of issues) {
        const externalId = `issue:${repo.owner}/${repo.name}#${issue.number}`;
        messages.push({
          external_id: externalId,
          content: `${issue.title}\n\n${issue.body}`,
          subject: issue.title,
          sender_name: issue.user,
          sender_id: issue.user,
          raw_json: JSON.stringify(issue),
          received_at: issue.createdAt,
        });

        if (issue.updatedAt > latestDate) {
          latestDate = issue.updatedAt;
        }
      }

      // Fetch new comments
      const comments = await client.listIssueCommentsSince(repo.owner, repo.name, since);
      for (const comment of comments) {
        const externalId = `comment:${repo.owner}/${repo.name}#${comment.id}`;
        messages.push({
          external_id: externalId,
          content: comment.body,
          sender_name: comment.user,
          sender_id: comment.user,
          raw_json: JSON.stringify(comment),
          received_at: comment.createdAt,
        });

        if (comment.createdAt > latestDate) {
          latestDate = comment.createdAt;
        }
      }
    }

    return { messages, cursor: latestDate };
  }
}
