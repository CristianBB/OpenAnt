import type { PullRequest } from "../../types/entities.js";
import type { PullRequestStatus } from "../../types/enums.js";

export interface CreatePullRequestData {
  plan_id: string;
  repository_id: string;
  github_pr_number?: number;
  url?: string;
}

export interface IPullRequestRepo {
  create(data: CreatePullRequestData): PullRequest;
  findById(id: string): PullRequest | null;
  listByPlan(planId: string): PullRequest[];
  listByStatus(status: PullRequestStatus): PullRequest[];
  updateStatus(id: string, status: PullRequestStatus): void;
}
