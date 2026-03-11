import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Task } from "../../types/entities.js";
import type { ITaskRepo, CreateTaskData, UpdateTaskData, TaskFilter } from "../interfaces/task-repo.js";

export class SqliteTaskRepo implements ITaskRepo {
  create(data: CreateTaskData): Task {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, origin_external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.project_id, data.title, data.description ?? "", data.status ?? "OPEN", data.priority ?? 0, data.origin_external_id ?? null);
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
  }

  findById(id: string): Task | null {
    return (getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task) ?? null;
  }

  findByOriginExternalId(projectId: string, externalId: string): Task | null {
    return (getDb().prepare(
      "SELECT * FROM tasks WHERE project_id = ? AND origin_external_id = ?"
    ).get(projectId, externalId) as Task) ?? null;
  }

  listByProject(projectId: string, filter?: TaskFilter): Task[] {
    let sql = "SELECT * FROM tasks WHERE project_id = ?";
    const params: unknown[] = [projectId];

    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    if (filter?.q) {
      sql += " AND (title LIKE ? OR description LIKE ?)";
      const q = `%${filter.q}%`;
      params.push(q, q);
    }

    sql += " ORDER BY created_at DESC";
    return getDb().prepare(sql).all(...params) as Task[];
  }

  update(id: string, data: UpdateTaskData): Task | null {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) { fields.push("title = ?"); values.push(data.title); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.user_context !== undefined) { fields.push("user_context = ?"); values.push(data.user_context); }
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
    if (data.priority !== undefined) { fields.push("priority = ?"); values.push(data.priority); }
    if (data.requester_count !== undefined) { fields.push("requester_count = ?"); values.push(data.requester_count); }
    if (data.approval_instructions !== undefined) { fields.push("approval_instructions = ?"); values.push(data.approval_instructions); }
    if (data.approved_at !== undefined) { fields.push("approved_at = ?"); values.push(data.approved_at); }
    if (data.approved_by !== undefined) { fields.push("approved_by = ?"); values.push(data.approved_by); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }
}
