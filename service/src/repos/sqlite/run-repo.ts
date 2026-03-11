import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Run } from "../../types/entities.js";
import type { RunStatus } from "../../types/enums.js";
import type { IRunRepo, CreateRunData } from "../interfaces/run-repo.js";

export class SqliteRunRepo implements IRunRepo {
  create(data: CreateRunData): Run {
    const db = getDb();
    const id = newId();
    db.prepare("INSERT INTO runs (id, plan_id, logs_path, workspace_path, branch_name) VALUES (?, ?, ?, ?, ?)").run(id, data.plan_id, data.logs_path ?? null, data.workspace_path ?? null, data.branch_name ?? null);
    return db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run;
  }

  findById(id: string): Run | null {
    return (getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run) ?? null;
  }

  listByPlan(planId: string): Run[] {
    return getDb().prepare("SELECT * FROM runs WHERE plan_id = ? ORDER BY started_at DESC").all(planId) as Run[];
  }

  updateStatus(id: string, status: RunStatus, error?: string): void {
    getDb().prepare("UPDATE runs SET status = ?, error = ? WHERE id = ?").run(status, error ?? null, id);
  }

  setStarted(id: string): void {
    getDb().prepare("UPDATE runs SET started_at = datetime('now'), status = 'RUNNING' WHERE id = ?").run(id);
  }

  setEnded(id: string): void {
    getDb().prepare("UPDATE runs SET ended_at = datetime('now') WHERE id = ?").run(id);
  }
}
