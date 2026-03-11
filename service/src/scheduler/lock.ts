import { getDb } from "../db/database.js";

export function acquireLock(jobName: string, ttlSec: number = 300): boolean {
  const db = getDb();

  // Clean expired locks
  db.prepare(
    `DELETE FROM job_locks
     WHERE job_name = ?
       AND datetime(locked_at, '+' || lock_ttl_sec || ' seconds') < datetime('now')`
  ).run(jobName);

  // Try to acquire
  const result = db.prepare(
    `INSERT OR IGNORE INTO job_locks (job_name, locked_at, lock_ttl_sec, locked_by)
     VALUES (?, datetime('now'), ?, ?)`
  ).run(jobName, ttlSec, `pid-${process.pid}`);

  return result.changes > 0;
}

export function releaseLock(jobName: string): void {
  getDb().prepare("DELETE FROM job_locks WHERE job_name = ?").run(jobName);
}

export function isLocked(jobName: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 FROM job_locks
       WHERE job_name = ?
         AND datetime(locked_at, '+' || lock_ttl_sec || ' seconds') >= datetime('now')`
    )
    .get(jobName);
  return !!row;
}
