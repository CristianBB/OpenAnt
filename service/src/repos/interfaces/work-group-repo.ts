import type { WorkGroup, WorkGroupItem } from "../../types/entities.js";
import type { WorkGroupStatus } from "../../types/enums.js";

export interface CreateWorkGroupData {
  project_id: string;
  name: string;
  summary?: string;
}

export interface IWorkGroupRepo {
  create(data: CreateWorkGroupData): WorkGroup;
  findById(id: string): WorkGroup | null;
  listByProject(projectId: string): WorkGroup[];
  updateStatus(id: string, status: WorkGroupStatus): void;
  addItem(workGroupId: string, taskId: string, confidence: number, reason: string): WorkGroupItem;
  listItems(workGroupId: string): WorkGroupItem[];
  delete(id: string): void;
}
