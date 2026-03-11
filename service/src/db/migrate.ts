import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./database.js";
import { getLogger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const log = getLogger();
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    log.warn("No migrations directory found");
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((r) => (r as { name: string }).name)
  );

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    log.info("Database is up to date");
    return;
  }

  const applyMigration = db.transaction((fileName: string) => {
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(fileName);
  });

  for (const file of pending) {
    log.info(`Applying migration: ${file}`);
    applyMigration(file);
  }

  log.info(`Applied ${pending.length} migration(s)`);
}
