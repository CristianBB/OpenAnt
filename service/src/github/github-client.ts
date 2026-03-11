import { Octokit } from "@octokit/rest";

export class GitHubClient {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  async getAuthenticatedUser() {
    const { data } = await this.octokit.users.getAuthenticated();
    return { login: data.login, id: data.id, email: data.email };
  }

  async listRepos() {
    const repos = await this.octokit.paginate(
      this.octokit.repos.listForAuthenticatedUser,
      {
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
        per_page: 100,
      }
    );
    return repos.map((r) => ({
      id: r.id,
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      description: r.description,
    }));
  }

  async getRepo(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      id: data.id,
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
    };
  }

  async createBranch(owner: string, repo: string, branchName: string, fromSha: string) {
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    });
  }

  async getDefaultBranchSha(owner: string, repo: string, branch: string) {
    const { data } = await this.octokit.repos.getBranch({ owner, repo, branch });
    return data.commit.sha;
  }

  async getTree(owner: string, repo: string, branch: string): Promise<string[]> {
    const sha = await this.getDefaultBranchSha(owner, repo, branch);
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: "1",
    });
    return data.tree
      .filter((item) => item.type === "blob" && item.path)
      .map((item) => item.path as string)
      .slice(0, 5000);
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      if ("content" in data && data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch {
      return null;
    }
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ) {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    return { number: data.number, url: data.html_url };
  }

  async getPullRequest(owner: string, repo: string, prNumber: number) {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return {
      number: data.number,
      url: data.html_url,
      state: data.state as "open" | "closed",
      merged: data.merged,
      mergedAt: data.merged_at,
      title: data.title,
    };
  }

  async listIssuesSince(owner: string, repo: string, since: string) {
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      since,
      state: "open",
      per_page: 100,
    });
    // Filter out pull requests (GitHub returns PRs in the issues endpoint)
    return data.filter((issue) => !issue.pull_request).map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      user: issue.user?.login ?? "",
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));
  }

  async listIssueCommentsSince(owner: string, repo: string, since: string) {
    const { data } = await this.octokit.issues.listCommentsForRepo({
      owner,
      repo,
      since,
      per_page: 100,
    });
    return data.map((comment) => ({
      id: comment.id,
      issueNumber: comment.issue_url.split("/").pop()!,
      body: comment.body ?? "",
      user: comment.user?.login ?? "",
      createdAt: comment.created_at,
    }));
  }

  async closeIssueWithComment(owner: string, repo: string, issueNumber: number, comment: string) {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment,
    });
    await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: "closed",
    });
  }

  async createIssueComment(owner: string, repo: string, issueNumber: number, body: string) {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}
