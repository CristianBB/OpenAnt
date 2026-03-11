import type { TaskRepoImpact } from "../../types/entities.js";

export interface CreateTaskRepoImpactData {
  task_id: string;
  repository_id: string;
  areas_json: string;
  confidence: number;
  reason: string;
}

export interface ITaskRepoImpactRepo {
  create(data: CreateTaskRepoImpactData): TaskRepoImpact;
  listByTask(taskId: string): TaskRepoImpact[];
  delete(id: string): void;
}
