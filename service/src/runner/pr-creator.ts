import { GitHubClient } from "../github/github-client.js";
import { getOAuthToken } from "../github/oauth.js";
import { getRepos } from "../repos/sqlite/index.js";

export async function createPullRequest(opts: {
  projectId: string;
  planId: string;
  repositoryId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
}): Promise<{ prUrl: string; prNumber: number }> {
  const repos = getRepos();
  const token = getOAuthToken(opts.projectId);
  if (!token) throw new Error("No GitHub token configured for project");
  const client = new GitHubClient(token);

  const pr = await client.createPullRequest(
    opts.repoOwner,
    opts.repoName,
    opts.title,
    opts.body,
    opts.branch,
    opts.baseBranch
  );

  repos.pullRequests.create({
    plan_id: opts.planId,
    repository_id: opts.repositoryId,
    github_pr_number: pr.number,
    url: pr.url,
  });

  return { prUrl: pr.url, prNumber: pr.number };
}
