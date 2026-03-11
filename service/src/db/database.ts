import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { getConfig } from "../config/env.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const config = getConfig();
    const dbDir = config.OPENANT_DATA_DIR;
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, "openant.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
