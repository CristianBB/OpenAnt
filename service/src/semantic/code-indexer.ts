import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { simpleGit } from "simple-git";
import { getRepos } from "../repos/sqlite/index.js";
import { getOAuthToken } from "../github/oauth.js";
import { getConfig } from "../config/env.js";
import { getLogger } from "../lib/logger.js";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".venv", "venv", "vendor", ".cache", "coverage", ".turbo",
  ".parcel-cache", "target", "out", ".output", ".nuxt",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".scala",
  ".rb", ".php", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".swift", ".m", ".mm",
  ".vue", ".svelte", ".astro",
  ".css", ".scss", ".less",
  ".html", ".htm",
  ".json", ".yaml", ".yml", ".toml",
  ".sql", ".graphql", ".gql",
  ".sh", ".bash", ".zsh",
  ".md", ".mdx", ".txt",
  ".env.example", ".gitignore",
  "Dockerfile", "Makefile",
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB

function getLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".rb": "ruby", ".php": "php",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
    ".cs": "csharp", ".swift": "swift",
    ".vue": "vue", ".svelte": "svelte",
    ".css": "css", ".scss": "scss",
    ".html": "html", ".htm": "html",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".md": "markdown", ".mdx": "markdown",
  };
  return langMap[ext] ?? null;
}

function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return CODE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(basename);
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".gitignore" && entry.name !== ".env.example") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && isCodeFile(entry.name)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= MAX_FILE_SIZE && stat.size > 0) {
          results.push(fullPath);
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return results;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function indexRepositoryCode(repositoryId: string): Promise<{ indexed: number; unchanged: number; removed: number }> {
  const log = getLogger();
  const repos = getRepos();
  const config = getConfig();

  const repo = repos.repositories.findById(repositoryId);
  if (!repo) {
    log.warn({ repositoryId }, "Repository not found for indexing");
    return { indexed: 0, unchanged: 0, removed: 0 };
  }

  const token = getOAuthToken(repo.project_id);
  if (!token) {
    log.debug({ repositoryId }, "No OAuth token, skipping code indexing");
    return { indexed: 0, unchanged: 0, removed: 0 };
  }

  // Clone/pull repo
  const repoDir = path.join(config.OPENANT_DATA_DIR, "repos", repositoryId);
  const cloneUrl = `https://x-access-token:${token}@github.com/${repo.owner}/${repo.name}.git`;

  try {
    if (fs.existsSync(path.join(repoDir, ".git"))) {
      await simpleGit(repoDir).pull("origin", repo.default_branch, ["--ff-only"]);
    } else {
      fs.mkdirSync(path.dirname(repoDir), { recursive: true });
      await simpleGit().clone(cloneUrl, repoDir, ["--depth", "1"]);
    }
  } catch (err: any) {
    log.error({ repositoryId, err: err.message }, "Failed to clone/pull repo for code indexing");
    return { indexed: 0, unchanged: 0, removed: 0 };
  }

  // Walk files and index
  const indexDir = path.join(config.OPENANT_DATA_DIR, "code-index", repositoryId);
  fs.mkdirSync(indexDir, { recursive: true });

  const files = walkDir(repoDir);
  const existingIndexed = new Set(repos.codeIndex.listByRepo(repositoryId).map(f => f.file_path));

  let indexed = 0;
  let unchanged = 0;
  const currentFiles = new Set<string>();

  for (const fullPath of files) {
    const relativePath = path.relative(repoDir, fullPath);
    currentFiles.add(relativePath);

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const hash = hashContent(content);
      const existing = repos.codeIndex.findByRepoAndPath(repositoryId, relativePath);

      if (existing && existing.file_hash === hash) {
        unchanged++;
        continue;
      }

      // Store indexed file as JSON
      const safePath = relativePath.replace(/[/\\]/g, "__");
      const indexFilePath = path.join(indexDir, `${safePath}.json`);
      fs.writeFileSync(indexFilePath, JSON.stringify({
        filePath: relativePath,
        content,
        language: getLanguage(relativePath),
      }));

      // Update DB
      repos.codeIndex.upsert({
        repository_id: repositoryId,
        file_path: relativePath,
        file_hash: hash,
        language: getLanguage(relativePath) ?? undefined,
        size_bytes: Buffer.byteLength(content, "utf-8"),
      });

      indexed++;
    } catch (err: any) {
      log.debug({ file: relativePath, err: err.message }, "Failed to index file");
    }
  }

  // Remove stale index entries
  let removed = 0;
  for (const existingPath of existingIndexed) {
    if (!currentFiles.has(existingPath)) {
      repos.codeIndex.deleteByRepoAndPath(repositoryId, existingPath);
      const safePath = existingPath.replace(/[/\\]/g, "__");
      const indexFilePath = path.join(indexDir, `${safePath}.json`);
      try { fs.unlinkSync(indexFilePath); } catch { /* ignore */ }
      removed++;
    }
  }

  log.info({ repositoryId, repo: `${repo.owner}/${repo.name}`, indexed, unchanged, removed }, "Code indexing complete");
  return { indexed, unchanged, removed };
}
