import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { IntegrationSettings } from "../../types/entities.js";
import type { IntegrationKind } from "../../types/enums.js";
import type { IIntegrationSettingsRepo } from "../interfaces/integration-settings-repo.js";

export class SqliteIntegrationSettingsRepo implements IIntegrationSettingsRepo {
  upsert(
    projectId: string,
    kind: IntegrationKind,
    jsonEncrypted: string
  ): IntegrationSettings {
    const db = getDb();
    const existing = this.findByProjectAndKind(projectId, kind);

    if (existing) {
      db.prepare(
        `UPDATE integration_settings SET json_encrypted = ?, updated_at = datetime('now')
         WHERE project_id = ? AND kind = ?`
      ).run(jsonEncrypted, projectId, kind);
      return this.findByProjectAndKind(projectId, kind)!;
    }

    const id = newId();
    db.prepare(
      `INSERT INTO integration_settings (id, project_id, kind, json_encrypted)
       VALUES (?, ?, ?, ?)`
    ).run(id, projectId, kind, jsonEncrypted);
    return db
      .prepare("SELECT * FROM integration_settings WHERE id = ?")
      .get(id) as IntegrationSettings;
  }

  findByProjectAndKind(
    projectId: string,
    kind: IntegrationKind
  ): IntegrationSettings | null {
    const db = getDb();
    return (
      (db
        .prepare(
          "SELECT * FROM integration_settings WHERE project_id = ? AND kind = ?"
        )
        .get(projectId, kind) as IntegrationSettings) ?? null
    );
  }

  delete(projectId: string, kind: IntegrationKind): void {
    const db = getDb();
    db.prepare(
      "DELETE FROM integration_settings WHERE project_id = ? AND kind = ?"
    ).run(projectId, kind);
  }

  listByProject(projectId: string): IntegrationSettings[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM integration_settings WHERE project_id = ?")
      .all(projectId) as IntegrationSettings[];
  }
}
