import type { FastifyInstance } from "fastify";
import type pino from "pino";
import { getRepos } from "../../repos/sqlite/index.js";
import { getOAuthToken } from "../../github/oauth.js";
import { GitHubClient } from "../../github/github-client.js";
import { getLLMProvider } from "../../llm/index.js";
import { analyzeRepo } from "../../agents/repo-analysis-agent.js";
import { repoAnalysisSchema } from "../../agents/schemas.js";
import { ensureMainRepoCopy } from "../../lib/workspace-manager.js";
import { getLogger } from "../../lib/logger.js";
import type { Repository, Project } from "../../types/entities.js";
import { z } from "zod";

const selectReposSchema = z.object({
  repos: z.array(
    z.object({
      owner: z.string(),
      name: z.string(),
      default_branch: z.string().optional(),
      github_repo_id: z.number().optional(),
    })
  ),
});

// Config/doc filenames — matched at any depth in the tree (monorepo-friendly)
const KEY_FILE_NAMES = [
  "README.md",
  "readme.md",
  "README",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  ".env.example",
];

// Config files only read at root
const ROOT_ONLY_PATTERNS = [
  ".github/workflows/ci.yml",
  ".github/workflows/ci.yaml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
];

// Max depth for config/doc file discovery in monorepo (e.g., service/package.json but not service/src/deep/package.json)
const MAX_KEY_FILE_DEPTH = 2;

function selectKeyFiles(fileList: string[]): string[] {
  const selected: string[] = [];

  // Root-only patterns (exact match)
  for (const pattern of ROOT_ONLY_PATTERNS) {
    if (fileList.includes(pattern)) selected.push(pattern);
  }

  // Config/doc files at any depth up to MAX_KEY_FILE_DEPTH
  for (const file of fileList) {
    const segments = file.split("/");
    const fileName = segments[segments.length - 1];
    const depth = segments.length - 1; // 0 = root
    if (depth <= MAX_KEY_FILE_DEPTH && KEY_FILE_NAMES.includes(fileName)) {
      selected.push(file);
    }
  }

  // Prisma/Drizzle schemas at any depth
  for (const file of fileList) {
    if (/(^|\/)prisma\/schema\.prisma$/.test(file) || /(^|\/)drizzle\.config\.(ts|js)$/.test(file)) {
      selected.push(file);
    }
  }

  return [...new Set(selected)];
}

// Patterns to identify important source files — NOT anchored to root,
// so they work for monorepos (e.g., service/src/api/routes/tasks.ts)
const SOURCE_FILE_PATTERNS: RegExp[] = [
  // ── Entry points ──
  /(^|\/)(index|main|app|server)\.(ts|js|tsx|jsx)$/,
  /(^|\/)cmd\/.+\.(go|ts|js)$/,

  // ── Directory-based: routes, API, controllers, handlers ──
  /(^|\/)(api|routes|controllers|handlers)\/.+\.(ts|js|py|rb|php|go|java|kt)$/,
  /\/app\/api\/.+\/route\.(ts|js)$/,

  // ── Suffix-based: framework-specific naming conventions ──
  // NestJS / Angular
  /\.controller\.(ts|js)$/,
  /\.service\.(ts|js)$/,
  /\.module\.(ts|js)$/,
  /\.guard\.(ts|js)$/,
  /\.resolver\.(ts|js)$/,
  /\.dto\.(ts|js)$/,
  /\.entity\.(ts|js)$/,
  /\.interceptor\.(ts|js)$/,
  /\.pipe\.(ts|js)$/,
  // Spring Boot / Java / Kotlin
  /(Controller|Service|Repository|Entity)\.(java|kt)$/,
  // Django
  /(^|\/)(views|serializers|urls|forms|admin)\.(py)$/,
  // Flask / FastAPI
  /_?(router|routes|views|endpoints)\.(py)$/,
  // Ruby on Rails
  /(^|\/)app\/(controllers|models|serializers|jobs)\/.+\.rb$/,
  // Laravel / PHP
  /(^|\/)app\/(Http\/Controllers|Models|Providers)\/.+\.php$/,
  // Go handlers
  /_(handler|controller|router|server)\.(go)$/,

  // ── Models / Types / Schemas ──
  /(^|\/)(models|entities|types|schemas?|interfaces)\/.+\.(ts|js|py|rb|java|kt|go)$/,

  // ── Database ──
  /(^|\/)(db|database)\/(index|schema|connection|client)\.(ts|js)$/,
  /(^|\/)prisma\/schema\.prisma$/,
  /(^|\/)migrations?\/.+\.(sql)$/,

  // ── Config ──
  /(^|\/)config\/.+\.(ts|js|py|rb|yaml|yml)$/,

  // ── Next.js layouts/pages ──
  /\/app\/.*\/(layout|page)\.(tsx|jsx)$/,
  /(^|\/)app\/(layout|page)\.(tsx|jsx)$/,

  // ── Lib / utils ──
  /(^|\/)lib\/.+\.(ts|js)$/,

  // ── Middleware ──
  /(^|\/)middleware\/.+\.(ts|js|py)$/,
  /(^|\/)middleware\.(ts|js)$/,

  // ── Services / use-cases / domain ──
  /(^|\/)(services|usecases|use-cases|domain)\/.+\.(ts|js|py|java|kt|go)$/,

  // ── GraphQL ──
  /\.(graphql|gql)$/,
  /\.resolver\.(ts|js)$/,

  // ── Proto / gRPC ──
  /\.proto$/,
];

// Max total bytes of source content to send to the LLM
const MAX_TOTAL_SOURCE_BYTES = 200_000;
const MAX_FILE_BYTES = 15_000;
const MAX_SOURCE_FILES = 60;

function selectImportantSourceFiles(fileList: string[]): string[] {
  const selected: string[] = [];
  for (const file of fileList) {
    // Skip test files, stories, snapshots, generated files, vendor dirs, etc.
    if (
      /\.(test|spec|stories|snap|e2e)\.(ts|js|tsx|jsx)$/.test(file) ||
      /(^|\/)(__tests__|__mocks__|node_modules|dist|build|\.next|coverage|vendor|\.gradle|target)\//.test(file) ||
      /\.d\.ts$/.test(file) ||
      /\.min\.(js|css)$/.test(file) ||
      /(^|\/)test_.*\.py$/.test(file) ||
      /_test\.(go|py|rb)$/.test(file) ||
      /Test\.(java|kt)$/.test(file)
    ) {
      continue;
    }
    if (SOURCE_FILE_PATTERNS.some((p) => p.test(file))) {
      selected.push(file);
    }
  }

  // Prioritize: route/API/controller files first, then models, then entry points, then rest
  const priority = (f: string): number => {
    if (/(api|routes|controllers|handlers)\//.test(f)) return 0;
    if (/\.(controller|resolver)\.(ts|js|java|kt)$/.test(f)) return 0;
    if (/(Controller|Handler)\.(java|kt|go)$/.test(f)) return 0;
    if (/(views|urls|serializers)\.(py)$/.test(f)) return 0;
    if (/(models|entities|types|schemas?)\//.test(f)) return 1;
    if (/\.(entity|dto|model)\.(ts|js|java|kt)$/.test(f)) return 1;
    if (/(index|main|app|server)\.(ts|js|tsx|jsx)$/.test(f)) return 2;
    if (/\.(module)\.(ts|js)$/.test(f)) return 2;
    if (/(services|domain|usecases)\//.test(f)) return 3;
    if (/\.(service)\.(ts|js|java|kt)$/.test(f)) return 3;
    return 4;
  };

  selected.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    // Within same priority, shorter paths first
    return a.split("/").length - b.split("/").length || a.localeCompare(b);
  });

  return selected.slice(0, MAX_SOURCE_FILES);
}

async function runRepoAnalysis(repo: Repository, project: Project, token: string, log: pino.Logger): Promise<void> {
  const repos = getRepos();
  const gh = new GitHubClient(token);

  // Fetch the file tree from GitHub (up to 500 files)
  log.info({ repo: `${repo.owner}/${repo.name}` }, "Fetching repo tree for analysis");
  const fileList = await gh.getTree(repo.owner, repo.name, repo.default_branch);

  // Read key config/doc files (README, package.json, etc. at root and workspace level)
  const keyFilePaths = selectKeyFiles(fileList);
  const keyFiles: Record<string, string> = {};
  let totalBytes = 0;

  for (const filePath of keyFilePaths) {
    if (totalBytes >= MAX_TOTAL_SOURCE_BYTES) break;
    try {
      const content = await gh.getFileContent(repo.owner, repo.name, filePath, repo.default_branch);
      if (content) {
        const trimmed = content.slice(0, MAX_FILE_BYTES);
        keyFiles[filePath] = trimmed;
        totalBytes += trimmed.length;
      }
    } catch {
      // Skip files we can't read
    }
  }

  // Read important source files (entry points, routes, models, types)
  const sourceFiles = selectImportantSourceFiles(fileList);
  const sourceContents: Record<string, string> = {};

  for (const filePath of sourceFiles) {
    if (totalBytes >= MAX_TOTAL_SOURCE_BYTES) break;
    if (keyFiles[filePath]) continue;
    try {
      const content = await gh.getFileContent(repo.owner, repo.name, filePath, repo.default_branch);
      if (content) {
        const trimmed = content.slice(0, MAX_FILE_BYTES);
        sourceContents[filePath] = trimmed;
        totalBytes += trimmed.length;
      }
    } catch {
      // Skip files we can't read
    }
  }

  log.info(
    {
      repo: `${repo.owner}/${repo.name}`,
      treeFiles: fileList.length,
      keyFiles: Object.keys(keyFiles).length,
      sourceFiles: Object.keys(sourceContents).length,
      totalBytes,
    },
    "Running LLM analysis"
  );

  const { provider, config } = getLLMProvider(project.id);
  const analysis = await analyzeRepo(provider, config.planningModel, {
    repoName: `${repo.owner}/${repo.name}`,
    fileList,
    keyFiles: { ...keyFiles, ...sourceContents },
  });

  repos.repositories.updateAnalysis(repo.id, JSON.stringify(analysis));
}

export async function repositoryRoutes(app: FastifyInstance): Promise<void> {
  // List GitHub repos available to connect
  app.get<{ Params: { id: string } }>("/api/projects/:id/github/repos", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const token = getOAuthToken(project.id);
    if (!token) {
      reply.code(400).send({ error: "GitHub not connected" });
      return;
    }

    const gh = new GitHubClient(token);
    return gh.listRepos();
  });

  // Select repos for the project
  app.post<{ Params: { id: string } }>("/api/projects/:id/repositories/select", async (request, reply) => {
    const allRepos = getRepos();
    const project = allRepos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = selectReposSchema.parse(request.body);

    for (const r of body.repos) {
      let repo = allRepos.repositories.findByProjectAndFullName(project.id, r.owner, r.name);
      if (!repo) {
        repo = allRepos.repositories.create({
          project_id: project.id,
          owner: r.owner,
          name: r.name,
          default_branch: r.default_branch,
          github_repo_id: r.github_repo_id,
        });
      }
      allRepos.repositories.setSelected(repo.id, true);

      // Background clone of main repo copy (don't await for fast response)
      ensureMainRepoCopy(repo, project.id).catch((err) => {
        app.log.warn({ repoId: repo.id, err: err.message }, "Background clone for main repo copy failed");
      });
    }

    return { ok: true };
  });

  // List project repositories
  app.get<{ Params: { id: string } }>("/api/projects/:id/repositories", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }
    return repos.repositories.listByProject(project.id);
  });

  // Get single repository with analysis
  app.get<{ Params: { repoId: string } }>("/api/repositories/:repoId", async (request, reply) => {
    const repos = getRepos();
    const repo = repos.repositories.findById(request.params.repoId);
    if (!repo) {
      reply.code(404).send({ error: "Repository not found" });
      return;
    }
    return {
      ...repo,
      analysis: repo.analysis_json ? JSON.parse(repo.analysis_json) : null,
    };
  });

  // Analyze repo via GitHub API + LLM (fire-and-forget)
  app.post<{ Params: { repoId: string } }>("/api/repositories/:repoId/analyze", async (request, reply) => {
    const log = getLogger();
    const repos = getRepos();
    const repo = repos.repositories.findById(request.params.repoId);
    if (!repo) {
      reply.code(404).send({ error: "Repository not found" });
      return;
    }

    const project = repos.projects.findById(repo.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const token = getOAuthToken(project.id);
    if (!token) {
      reply.code(400).send({ error: "GitHub not connected — cannot fetch repo contents" });
      return;
    }

    // Guard against double-click
    if (repo.analysis_status === "ANALYZING") {
      return { ok: true, status: "ANALYZING" };
    }

    // Mark as analyzing and return immediately
    repos.repositories.updateAnalysisStatus(repo.id, "ANALYZING");

    // Fire and forget
    runRepoAnalysis(repo, project, token, log).catch((err) => {
      log.error({ repoId: repo.id, err }, "Background repo analysis failed");
      repos.repositories.updateAnalysisStatus(repo.id, "ERROR", err.message ?? "Unknown error");
    });

    return { ok: true, status: "ANALYZING" };
  });

  // Update repository info (default branch, etc.)
  app.patch<{ Params: { repoId: string } }>("/api/repositories/:repoId", async (request, reply) => {
    const repos = getRepos();
    const repo = repos.repositories.findById(request.params.repoId);
    if (!repo) {
      reply.code(404).send({ error: "Repository not found" });
      return;
    }

    const body = z
      .object({
        default_branch: z.string().optional(),
        selected: z.boolean().optional(),
      })
      .parse(request.body);

    if (body.default_branch !== undefined) {
      repos.repositories.updateDefaultBranch(repo.id, body.default_branch);
    }
    if (body.selected !== undefined) {
      repos.repositories.setSelected(repo.id, body.selected);
    }

    return repos.repositories.findById(repo.id);
  });

  // Save analysis (manual create/edit)
  app.patch<{ Params: { repoId: string } }>("/api/repositories/:repoId/analysis", async (request, reply) => {
    const repos = getRepos();
    const repo = repos.repositories.findById(request.params.repoId);
    if (!repo) {
      reply.code(404).send({ error: "Repository not found" });
      return;
    }

    const body = repoAnalysisSchema.parse(request.body);

    repos.repositories.updateAnalysis(repo.id, JSON.stringify(body));
    return { ok: true };
  });

  // Delete a repository
  app.delete<{ Params: { repoId: string } }>("/api/repositories/:repoId", async (request, reply) => {
    const repos = getRepos();
    const repo = repos.repositories.findById(request.params.repoId);
    if (!repo) {
      reply.code(404).send({ error: "Repository not found" });
      return;
    }
    repos.repositories.delete(repo.id);
    return { ok: true };
  });
}
