import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config/env.js";
import { getRepos } from "../repos/sqlite/index.js";

export interface CodeSearchResult {
  filePath: string;
  language: string | null;
  score: number;
  matchingLines: { lineNumber: number; text: string }[];
  snippet: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function computeBM25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75,
): number {
  const docLength = docTokens.length;
  const termFreqs = new Map<string, number>();
  for (const token of docTokens) {
    termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const queryToken of queryTokens) {
    const tf = termFreqs.get(queryToken) ?? 0;
    if (tf === 0) continue;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
    score += numerator / denominator;
  }
  return score;
}

function extractMatchingLines(
  content: string,
  queryTokens: string[],
  maxLines = 5,
): { lineNumber: number; text: string }[] {
  const lines = content.split("\n");
  const matches: { lineNumber: number; text: string; score: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = new Set(tokenize(lines[i]));
    let lineScore = 0;
    for (const qt of queryTokens) {
      if (lineTokens.has(qt)) lineScore++;
    }
    if (lineScore > 0) {
      matches.push({ lineNumber: i + 1, text: lines[i].trim(), score: lineScore });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxLines).map(({ lineNumber, text }) => ({ lineNumber, text }));
}

export function searchCode(params: {
  repositoryIds: string[];
  query: string;
  fileGlob?: string;
  limit?: number;
}): CodeSearchResult[] {
  const { repositoryIds, query, fileGlob, limit = 20 } = params;
  const config = getConfig();
  const repos = getRepos();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const allDocs: { filePath: string; language: string | null; content: string; tokens: string[] }[] = [];

  for (const repoId of repositoryIds) {
    const indexDir = path.join(config.OPENANT_DATA_DIR, "code-index", repoId);
    if (!fs.existsSync(indexDir)) continue;

    const indexed = repos.codeIndex.listByRepo(repoId);
    for (const entry of indexed) {
      // Apply glob filter
      if (fileGlob) {
        const globRegex = globToRegex(fileGlob);
        if (!globRegex.test(entry.file_path)) continue;
      }

      const safePath = entry.file_path.replace(/[/\\]/g, "__");
      const indexFilePath = path.join(indexDir, `${safePath}.json`);

      try {
        const data = JSON.parse(fs.readFileSync(indexFilePath, "utf-8"));
        const tokens = tokenize(data.content);
        allDocs.push({
          filePath: data.filePath,
          language: data.language,
          content: data.content,
          tokens,
        });
      } catch {
        // skip unreadable index files
      }
    }
  }

  if (allDocs.length === 0) return [];

  const avgDocLength = allDocs.reduce((sum, d) => sum + d.tokens.length, 0) / allDocs.length;

  const scored = allDocs.map(doc => ({
    ...doc,
    score: computeBM25Score(queryTokens, doc.tokens, avgDocLength),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter(d => d.score > 0)
    .slice(0, limit)
    .map(doc => {
      const matchingLines = extractMatchingLines(doc.content, queryTokens);
      const snippet = matchingLines.slice(0, 3).map(l => `L${l.lineNumber}: ${l.text}`).join("\n");
      return {
        filePath: doc.filePath,
        language: doc.language,
        score: doc.score,
        matchingLines,
        snippet,
      };
    });
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${escaped}$`);
}
