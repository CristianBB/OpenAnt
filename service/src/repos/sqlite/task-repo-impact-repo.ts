import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { TaskRepoImpact } from "../../types/entities.js";
import type { ITaskRepoImpactRepo, CreateTaskRepoImpactData } from "../interfaces/task-repo-impact-repo.js";

export class SqliteTaskRepoImpactRepo implements ITaskRepoImpactRepo {
  create(data: CreateTaskRepoImpactData): TaskRepoImpact {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO task_repo_impacts (id, task_id, repository_id, areas_json, confidence, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.task_id, data.repository_id, data.areas_json, data.confidence, data.reason);
    return db.prepare("SELECT * FROM task_repo_impacts WHERE id = ?").get(id) as TaskRepoImpact;
  }

  listByTask(taskId: string): TaskRepoImpact[] {
    return getDb().prepare("SELECT * FROM task_repo_impacts WHERE task_id = ?").all(taskId) as TaskRepoImpact[];
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM task_repo_impacts WHERE id = ?").run(id);
  }
}
