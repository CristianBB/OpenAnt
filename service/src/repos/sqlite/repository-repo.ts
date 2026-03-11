import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Repository } from "../../types/entities.js";
import type { IRepositoryRepo, CreateRepositoryData } from "../interfaces/repository-repo.js";

export class SqliteRepositoryRepo implements IRepositoryRepo {
  create(data: CreateRepositoryData): Repository {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO repositories (id, project_id, owner, name, default_branch, github_repo_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.project_id, data.owner, data.name, data.default_branch ?? "main", data.github_repo_id ?? null);
    return db.prepare("SELECT * FROM repositories WHERE id = ?").get(id) as Repository;
  }

  findById(id: string): Repository | null {
    return (getDb().prepare("SELECT * FROM repositories WHERE id = ?").get(id) as Repository) ?? null;
  }

  findByProjectAndFullName(projectId: string, owner: string, name: string): Repository | null {
    return (getDb().prepare(
      "SELECT * FROM repositories WHERE project_id = ? AND owner = ? AND name = ?"
    ).get(projectId, owner, name) as Repository) ?? null;
  }

  listByProject(projectId: string): Repository[] {
    return getDb().prepare("SELECT * FROM repositories WHERE project_id = ? ORDER BY owner, name").all(projectId) as Repository[];
  }

  listSelectedByProject(projectId: string): Repository[] {
    return getDb().prepare("SELECT * FROM repositories WHERE project_id = ? AND selected = 1 ORDER BY owner, name").all(projectId) as Repository[];
  }

  setSelected(id: string, selected: boolean): void {
    getDb().prepare("UPDATE repositories SET selected = ? WHERE id = ?").run(selected ? 1 : 0, id);
  }

  updateDefaultBranch(id: string, branch: string): void {
    getDb().prepare("UPDATE repositories SET default_branch = ? WHERE id = ?").run(branch, id);
  }

  updateAnalysis(id: string, analysisJson: string): void {
    getDb().prepare(
      "UPDATE repositories SET analysis_json = ?, analysis_status = 'DONE', analysis_error = NULL, last_analyzed_at = datetime('now') WHERE id = ?"
    ).run(analysisJson, id);
  }

  updateAnalysisStatus(id: string, status: string, error?: string | null): void {
    getDb().prepare(
      "UPDATE repositories SET analysis_status = ?, analysis_error = ? WHERE id = ?"
    ).run(status, error ?? null, id);
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM repositories WHERE id = ?").run(id);
  }
}
