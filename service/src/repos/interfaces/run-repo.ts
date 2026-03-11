import type { Run } from "../../types/entities.js";
import type { RunStatus } from "../../types/enums.js";

export interface CreateRunData {
  plan_id: string;
  logs_path?: string;
  workspace_path?: string;
  branch_name?: string;
}

export interface IRunRepo {
  create(data: CreateRunData): Run;
  findById(id: string): Run | null;
  listByPlan(planId: string): Run[];
  updateStatus(id: string, status: RunStatus, error?: string): void;
  setStarted(id: string): void;
  setEnded(id: string): void;
}
