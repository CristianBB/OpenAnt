import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { TaskLink } from "../../types/entities.js";
import type { ITaskLinkRepo, CreateTaskLinkData } from "../interfaces/task-link-repo.js";

export class SqliteTaskLinkRepo implements ITaskLinkRepo {
  create(data: CreateTaskLinkData): TaskLink {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO task_links (id, project_id, from_task_id, to_task_id, type, confidence, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.project_id, data.from_task_id, data.to_task_id, data.type, data.confidence, data.reason);
    return db.prepare("SELECT * FROM task_links WHERE id = ?").get(id) as TaskLink;
  }

  listByTask(taskId: string): TaskLink[] {
    return getDb().prepare(
      "SELECT * FROM task_links WHERE from_task_id = ? OR to_task_id = ?"
    ).all(taskId, taskId) as TaskLink[];
  }

  listByProject(projectId: string): TaskLink[] {
    return getDb().prepare("SELECT * FROM task_links WHERE project_id = ?").all(projectId) as TaskLink[];
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM task_links WHERE id = ?").run(id);
  }
}
