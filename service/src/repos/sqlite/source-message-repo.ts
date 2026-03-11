import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { SourceMessage } from "../../types/entities.js";
import type { TriageClassification } from "../../types/enums.js";
import type { ISourceMessageRepo, CreateSourceMessageData } from "../interfaces/source-message-repo.js";

export class SqliteSourceMessageRepo implements ISourceMessageRepo {
  create(data: CreateSourceMessageData): SourceMessage {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO source_messages (id, channel_id, project_id, external_id, content, subject, sender_name, sender_email, sender_id, raw_json, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.channel_id, data.project_id, data.external_id, data.content,
      data.subject ?? null, data.sender_name ?? null, data.sender_email ?? null,
      data.sender_id ?? null, data.raw_json ?? null, data.received_at ?? new Date().toISOString()
    );
    return db.prepare("SELECT * FROM source_messages WHERE id = ?").get(id) as SourceMessage;
  }

  findById(id: string): SourceMessage | undefined {
    return getDb().prepare("SELECT * FROM source_messages WHERE id = ?").get(id) as SourceMessage | undefined;
  }

  findByChannelAndExternalId(channelId: string, externalId: string): SourceMessage | undefined {
    return getDb().prepare(
      "SELECT * FROM source_messages WHERE channel_id = ? AND external_id = ?"
    ).get(channelId, externalId) as SourceMessage | undefined;
  }

  listPendingByProject(projectId: string, limit?: number): SourceMessage[] {
    return getDb().prepare(
      `SELECT * FROM source_messages WHERE project_id = ? AND triage_status = 'PENDING' ORDER BY created_at ASC LIMIT ?`
    ).all(projectId, limit ?? 100) as SourceMessage[];
  }

  markProcessing(ids: string[]): void {
    if (ids.length === 0) return;
    const db = getDb();
    const placeholders = ids.map(() => "?").join(", ");
    db.prepare(
      `UPDATE source_messages SET triage_status = 'PROCESSING' WHERE id IN (${placeholders})`
    ).run(...ids);
  }

  markTriaged(id: string, classification: TriageClassification): void {
    getDb().prepare(
      `UPDATE source_messages SET triage_status = 'TRIAGED', triage_classification = ?, triaged_at = datetime('now') WHERE id = ?`
    ).run(classification, id);
  }

  markDismissed(id: string): void {
    getDb().prepare(
      `UPDATE source_messages SET triage_status = 'DISMISSED', triaged_at = datetime('now') WHERE id = ?`
    ).run(id);
  }

  markError(id: string, _error?: string): void {
    getDb().prepare(
      `UPDATE source_messages SET triage_status = 'ERROR' WHERE id = ?`
    ).run(id);
  }

  markPending(id: string): void {
    getDb().prepare(
      `UPDATE source_messages SET triage_status = 'PENDING', triage_classification = NULL, triaged_at = NULL WHERE id = ?`
    ).run(id);
  }

  listByChannel(channelId: string, opts?: { limit?: number; offset?: number }): SourceMessage[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    return getDb().prepare(
      "SELECT * FROM source_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(channelId, limit, offset) as SourceMessage[];
  }

  countByChannel(channelId: string): number {
    const row = getDb().prepare(
      "SELECT COUNT(*) as count FROM source_messages WHERE channel_id = ?"
    ).get(channelId) as { count: number };
    return row.count;
  }

  countPendingByChannel(channelId: string): number {
    const row = getDb().prepare(
      "SELECT COUNT(*) as count FROM source_messages WHERE channel_id = ? AND triage_status = 'PENDING'"
    ).get(channelId) as { count: number };
    return row.count;
  }

  countPendingByProject(projectId: string): number {
    const row = getDb().prepare(
      "SELECT COUNT(*) as count FROM source_messages WHERE project_id = ? AND triage_status = 'PENDING'"
    ).get(projectId) as { count: number };
    return row.count;
  }

  listProjectsWithPending(): string[] {
    const rows = getDb().prepare(
      "SELECT DISTINCT project_id FROM source_messages WHERE triage_status = 'PENDING'"
    ).all() as { project_id: string }[];
    return rows.map((r) => r.project_id);
  }
}
