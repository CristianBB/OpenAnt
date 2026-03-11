import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { ITaskSourceMessageRepo } from "../interfaces/task-source-message-repo.js";

export class SqliteTaskSourceMessageRepo implements ITaskSourceMessageRepo {
  link(taskId: string, sourceMessageId: string): void {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT OR IGNORE INTO task_source_messages (id, task_id, source_message_id) VALUES (?, ?, ?)`
    ).run(id, taskId, sourceMessageId);
  }

  listByTask(taskId: string): { task_id: string; source_message_id: string }[] {
    return getDb().prepare(
      "SELECT task_id, source_message_id FROM task_source_messages WHERE task_id = ? ORDER BY created_at ASC"
    ).all(taskId) as { task_id: string; source_message_id: string }[];
  }

  countByTask(taskId: string): number {
    const row = getDb().prepare(
      "SELECT COUNT(*) as count FROM task_source_messages WHERE task_id = ?"
    ).get(taskId) as { count: number };
    return row.count;
  }
}
