import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Plan } from "../../types/entities.js";
import type { PlanStatus } from "../../types/enums.js";
import type { IPlanRepo, CreatePlanData, UpdatePlanData } from "../interfaces/plan-repo.js";

export class SqlitePlanRepo implements IPlanRepo {
  create(data: CreatePlanData): Plan {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO plans (id, project_id, task_id, work_group_id, plan_markdown, plan_json, status, agent_phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.project_id, data.task_id ?? null, data.work_group_id ?? null, data.plan_markdown, data.plan_json, data.status ?? "DRAFT", data.agent_phase ?? "idle");
    return db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Plan;
  }

  findById(id: string): Plan | null {
    return (getDb().prepare("SELECT * FROM plans WHERE id = ?").get(id) as Plan) ?? null;
  }

  listByProject(projectId: string): Plan[] {
    return getDb().prepare("SELECT * FROM plans WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Plan[];
  }

  listByTask(taskId: string): Plan[] {
    return getDb().prepare("SELECT * FROM plans WHERE task_id = ? ORDER BY created_at DESC").all(taskId) as Plan[];
  }

  updateStatus(id: string, status: PlanStatus): void {
    getDb().prepare("UPDATE plans SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }

  update(id: string, data: UpdatePlanData): Plan | null {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.plan_markdown !== undefined) { fields.push("plan_markdown = ?"); values.push(data.plan_markdown); }
    if (data.plan_json !== undefined) { fields.push("plan_json = ?"); values.push(data.plan_json); }
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
    if (data.agent_phase !== undefined) { fields.push("agent_phase = ?"); values.push(data.agent_phase); }
    if (data.agent_session_id !== undefined) { fields.push("agent_session_id = ?"); values.push(data.agent_session_id); }
    if (data.agent_error !== undefined) { fields.push("agent_error = ?"); values.push(data.agent_error); }
    if (data.workspace_path !== undefined) { fields.push("workspace_path = ?"); values.push(data.workspace_path); }
    if (data.branch_name !== undefined) { fields.push("branch_name = ?"); values.push(data.branch_name); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE plans SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM plans WHERE id = ?").run(id);
  }
}
