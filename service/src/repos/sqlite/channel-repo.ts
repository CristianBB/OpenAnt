import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { Channel } from "../../types/entities.js";
import type { ChannelKind } from "../../types/enums.js";
import type { IChannelRepo, CreateChannelData } from "../interfaces/channel-repo.js";

export class SqliteChannelRepo implements IChannelRepo {
  create(data: CreateChannelData): Channel {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO channels (id, project_id, kind, name, config_encrypted, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.project_id, data.kind, data.name, data.config_encrypted, data.enabled ?? 1);
    return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as Channel;
  }

  findById(id: string): Channel | undefined {
    return getDb().prepare("SELECT * FROM channels WHERE id = ?").get(id) as Channel | undefined;
  }

  listByProject(projectId: string): Channel[] {
    return getDb().prepare(
      "SELECT * FROM channels WHERE project_id = ? ORDER BY created_at DESC"
    ).all(projectId) as Channel[];
  }

  listEnabled(): Channel[] {
    return getDb().prepare(
      "SELECT * FROM channels WHERE enabled = 1"
    ).all() as Channel[];
  }

  listEnabledByKind(kind: ChannelKind): Channel[] {
    return getDb().prepare(
      "SELECT * FROM channels WHERE enabled = 1 AND kind = ?"
    ).all(kind) as Channel[];
  }

  updatePollCursor(id: string, cursor: string, pollAt: string): void {
    getDb().prepare(
      "UPDATE channels SET last_poll_cursor = ?, last_poll_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(cursor, pollAt, id);
  }

  updateEnabled(id: string, enabled: boolean): void {
    getDb().prepare(
      "UPDATE channels SET enabled = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(enabled ? 1 : 0, id);
  }

  update(id: string, data: Partial<{ name: string; config_encrypted: string; enabled: number }>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.config_encrypted !== undefined) { fields.push("config_encrypted = ?"); values.push(data.config_encrypted); }
    if (data.enabled !== undefined) { fields.push("enabled = ?"); values.push(data.enabled); }

    if (fields.length === 0) return;

    fields.push("updated_at = datetime('now')");
    values.push(id);
    getDb().prepare(`UPDATE channels SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  delete(id: string): void {
    getDb().prepare("DELETE FROM channels WHERE id = ?").run(id);
  }
}
