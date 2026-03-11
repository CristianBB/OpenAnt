import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { PullRequest } from "../../types/entities.js";
import type { PullRequestStatus } from "../../types/enums.js";
import type { IPullRequestRepo, CreatePullRequestData } from "../interfaces/pull-request-repo.js";

export class SqlitePullRequestRepo implements IPullRequestRepo {
  create(data: CreatePullRequestData): PullRequest {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO pull_requests (id, plan_id, repository_id, github_pr_number, url)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, data.plan_id, data.repository_id, data.github_pr_number ?? null, data.url ?? null);
    return db.prepare("SELECT * FROM pull_requests WHERE id = ?").get(id) as PullRequest;
  }

  findById(id: string): PullRequest | null {
    return (getDb().prepare("SELECT * FROM pull_requests WHERE id = ?").get(id) as PullRequest) ?? null;
  }

  listByPlan(planId: string): PullRequest[] {
    return getDb().prepare("SELECT * FROM pull_requests WHERE plan_id = ? ORDER BY created_at DESC").all(planId) as PullRequest[];
  }

  listByStatus(status: PullRequestStatus): PullRequest[] {
    return getDb().prepare("SELECT * FROM pull_requests WHERE status = ? ORDER BY created_at DESC").all(status) as PullRequest[];
  }

  updateStatus(id: string, status: PullRequestStatus): void {
    getDb().prepare("UPDATE pull_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }
}
