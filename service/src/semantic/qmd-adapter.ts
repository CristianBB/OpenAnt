import { getConfig } from "../config/env.js";
import { getLogger } from "../lib/logger.js";
import path from "node:path";
import fs from "node:fs";

// qmd is optional - this adapter provides a graceful fallback when not available
// In production, install @tobilu/qmd for full semantic search

export interface SearchResult {
  virtualPath: string;
  title: string;
  score: number;
  content?: string;
}

export function getProjectIndexPath(projectId: string): string {
  const config = getConfig();
  return path.join(config.OPENANT_DATA_DIR, "qmd", projectId);
}

export async function initProjectIndex(projectId: string): Promise<void> {
  const indexPath = getProjectIndexPath(projectId);
  fs.mkdirSync(indexPath, { recursive: true });
  getLogger().debug({ projectId, indexPath }, "qmd index directory ensured");
}

export async function upsertDocument(
  projectId: string,
  collection: string,
  virtualPath: string,
  title: string,
  markdown: string
): Promise<void> {
  // Stub: stores as simple JSON files for now
  // When @tobilu/qmd is available, this will use the real qmd store
  const indexPath = getProjectIndexPath(projectId);
  const docPath = path.join(indexPath, collection);
  fs.mkdirSync(docPath, { recursive: true });
  const safeName = virtualPath.replace(/[/\\]/g, "_");
  fs.writeFileSync(
    path.join(docPath, `${safeName}.json`),
    JSON.stringify({ virtualPath, title, markdown, updatedAt: new Date().toISOString() })
  );
}

export async function hybridSearch(
  projectId: string,
  query: string,
  opts?: { collection?: string; limit?: number }
): Promise<SearchResult[]> {
  // Simple keyword-based fallback search
  const log = getLogger();
  const indexPath = getProjectIndexPath(projectId);
  const results: SearchResult[] = [];
  const limit = opts?.limit ?? 10;

  const collections = opts?.collection ? [opts.collection] : getCollections(indexPath);

  for (const collection of collections) {
    const colPath = path.join(indexPath, collection);
    if (!fs.existsSync(colPath)) continue;

    const files = fs.readdirSync(colPath).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(colPath, file), "utf-8"));
        const text = `${doc.title} ${doc.markdown}`.toLowerCase();
        const queryLower = query.toLowerCase();
        const words = queryLower.split(/\s+/);
        const matchCount = words.filter((w) => text.includes(w)).length;
        if (matchCount > 0) {
          results.push({
            virtualPath: doc.virtualPath,
            title: doc.title,
            score: matchCount / words.length,
            content: doc.markdown?.slice(0, 200),
          });
        }
      } catch {
        // skip invalid files
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function getCollections(indexPath: string): string[] {
  if (!fs.existsSync(indexPath)) return [];
  return fs
    .readdirSync(indexPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
