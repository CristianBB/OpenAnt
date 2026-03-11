import type { Task } from "../../types/entities.js";
import type { TaskStatus } from "../../types/enums.js";

export interface CreateTaskData {
  project_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  origin_external_id?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  user_context?: string;
  status?: TaskStatus;
  priority?: number;
  requester_count?: number;
  approval_instructions?: string;
  approved_at?: string;
  approved_by?: string;
}

export interface TaskFilter {
  status?: TaskStatus;
  q?: string;
}

export interface ITaskRepo {
  create(data: CreateTaskData): Task;
  findById(id: string): Task | null;
  findByOriginExternalId(projectId: string, externalId: string): Task | null;
  listByProject(projectId: string, filter?: TaskFilter): Task[];
  update(id: string, data: UpdateTaskData): Task | null;
  delete(id: string): void;
}
