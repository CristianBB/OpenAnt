import type { TaskLink } from "../../types/entities.js";
import type { TaskLinkType } from "../../types/enums.js";

export interface CreateTaskLinkData {
  project_id: string;
  from_task_id: string;
  to_task_id: string;
  type: TaskLinkType;
  confidence: number;
  reason: string;
}

export interface ITaskLinkRepo {
  create(data: CreateTaskLinkData): TaskLink;
  listByTask(taskId: string): TaskLink[];
  listByProject(projectId: string): TaskLink[];
  delete(id: string): void;
}
