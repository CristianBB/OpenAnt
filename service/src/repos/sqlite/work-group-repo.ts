import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { WorkGroup, WorkGroupItem } from "../../types/entities.js";
import type { WorkGroupStatus } from "../../types/enums.js";
import type { IWorkGroupRepo, CreateWorkGroupData } from "../interfaces/work-group-repo.js";

export class SqliteWorkGroupRepo implements IWorkGroupRepo {
  create(data: CreateWorkGroupData): WorkGroup {
    const db = getDb();
    const id = newId();
    db.prepare(
      "INSERT INTO work_groups (id, project_id, name, summary) VALUES (?, ?, ?, ?)"
    ).run(id, data.project_id, data.name, data.summary ?? "");
    return db.prepare("SELECT * FROM work_groups WHERE id = ?").get(id) as WorkGroup;
  }

  findById(id: string): WorkGroup | null {
    return (getDb().prepare("SELECT * FROM work_groups WHERE id = ?").get(id) as WorkGroup) ?? null;
  }

  listByProject(projectId: string): WorkGroup[] {
    return getDb().prepare("SELECT * FROM work_groups WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as WorkGroup[];
  }

  updateStatus(id: string, status: WorkGroupStatus): void {
    getDb().prepare("UPDATE work_groups SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }

  addItem(workGroupId: string, taskId: string, confidence: number, reason: string): WorkGroupItem {
    const db = getDb();
    const id = newId();
    db.prepare(
      "INSERT INTO work_group_items (id, work_group_id, task_id, confidence, reason) VALUES (?, ?, ?, ?, ?)"
    ).run(id, workGroupId, taskId, confidence, reason);
    return db.prepare("SELECT * FROM work_group_items WHERE id = ?").get(id) as WorkGroupItem;
  }

  listItems(workGroupId: string): WorkGroupItem[] {
    return getDb().prepare("SELECT * FROM work_group_items WHERE work_group_id = ?").all(workGroupId) as WorkGroupItem[];
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM work_groups WHERE id = ?").run(id);
  }
}
