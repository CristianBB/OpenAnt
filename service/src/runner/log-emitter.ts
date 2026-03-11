import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config/env.js";

export interface RunLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitRunLog(runId: string, entry: RunLogEntry): void {
  emitter.emit(`run:${runId}`, entry);
  appendLogToFile(runId, entry);
}

export function onRunLog(runId: string, handler: (entry: RunLogEntry) => void): () => void {
  const key = `run:${runId}`;
  emitter.on(key, handler);
  return () => emitter.off(key, handler);
}

export function emitRunDone(runId: string): void {
  emitter.emit(`run-done:${runId}`);
}

export function onRunDone(runId: string, handler: () => void): () => void {
  const key = `run-done:${runId}`;
  emitter.on(key, handler);
  return () => emitter.off(key, handler);
}

function appendLogToFile(runId: string, entry: RunLogEntry): void {
  const config = getConfig();
  const logsDir = path.join(config.OPENANT_DATA_DIR, "run-logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(
    path.join(logsDir, `${runId}.jsonl`),
    JSON.stringify(entry) + "\n"
  );
}

export function getRunLogs(runId: string): RunLogEntry[] {
  const config = getConfig();
  const logFile = path.join(config.OPENANT_DATA_DIR, "run-logs", `${runId}.jsonl`);
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
