import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { CodeIndexFile } from "../../types/entities.js";
import type { ICodeIndexRepo, UpsertCodeIndexData } from "../interfaces/code-index-repo.js";

export class SqliteCodeIndexRepo implements ICodeIndexRepo {
  upsert(data: UpsertCodeIndexData): CodeIndexFile {
    const db = getDb();
    const existing = this.findByRepoAndPath(data.repository_id, data.file_path);
    if (existing) {
      db.prepare(
        `UPDATE code_index_files SET file_hash = ?, language = ?, size_bytes = ?, indexed_at = datetime('now')
         WHERE repository_id = ? AND file_path = ?`
      ).run(data.file_hash, data.language ?? null, data.size_bytes, data.repository_id, data.file_path);
      return this.findByRepoAndPath(data.repository_id, data.file_path)!;
    }
    const id = newId();
    db.prepare(
      `INSERT INTO code_index_files (id, repository_id, file_path, file_hash, language, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.repository_id, data.file_path, data.file_hash, data.language ?? null, data.size_bytes);
    return db.prepare("SELECT * FROM code_index_files WHERE id = ?").get(id) as CodeIndexFile;
  }

  findByRepoAndPath(repositoryId: string, filePath: string): CodeIndexFile | null {
    return (getDb().prepare("SELECT * FROM code_index_files WHERE repository_id = ? AND file_path = ?").get(repositoryId, filePath) as CodeIndexFile) ?? null;
  }

  listByRepo(repositoryId: string): CodeIndexFile[] {
    return getDb().prepare("SELECT * FROM code_index_files WHERE repository_id = ? ORDER BY file_path").all(repositoryId) as CodeIndexFile[];
  }

  deleteByRepoAndPath(repositoryId: string, filePath: string): void {
    getDb().prepare("DELETE FROM code_index_files WHERE repository_id = ? AND file_path = ?").run(repositoryId, filePath);
  }

  deleteByRepo(repositoryId: string): void {
    getDb().prepare("DELETE FROM code_index_files WHERE repository_id = ?").run(repositoryId);
  }
}
