import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Project } from "../../types/entities.js";
import type {
  IProjectRepo,
  CreateProjectData,
  UpdateProjectData,
} from "../interfaces/project-repo.js";

export class SqliteProjectRepo implements IProjectRepo {
  create(data: CreateProjectData): Project {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO projects (id, name, description, rules_nl, agent_policy_nl)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      id,
      data.name,
      data.description ?? "",
      data.rules_nl ?? "",
      data.agent_policy_nl ?? ""
    );
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
  }

  findById(id: string): Project | null {
    const db = getDb();
    return (db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project) ?? null;
  }

  list(): Project[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as Project[];
  }

  update(id: string, data: UpdateProjectData): Project | null {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.rules_nl !== undefined) { fields.push("rules_nl = ?"); values.push(data.rules_nl); }
    if (data.agent_policy_nl !== undefined) { fields.push("agent_policy_nl = ?"); values.push(data.agent_policy_nl); }
    if (data.max_parallel_runs !== undefined) { fields.push("max_parallel_runs = ?"); values.push(data.max_parallel_runs); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }
}
