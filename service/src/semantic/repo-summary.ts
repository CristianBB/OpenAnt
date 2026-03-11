import { getRepos } from "../repos/sqlite/index.js";

export function buildRepoSummary(repositoryId: string): string {
  const repos = getRepos();
  const repo = repos.repositories.findById(repositoryId);
  if (!repo) return "";

  const parts: string[] = [];
  parts.push(`## ${repo.owner}/${repo.name}`);
  parts.push(`- Default branch: ${repo.default_branch}`);

  if (repo.analysis_json) {
    try {
      const analysis = JSON.parse(repo.analysis_json);
      if (analysis.summary) parts.push(`- Summary: ${analysis.summary}`);
      if (analysis.projects?.length) {
        for (const p of analysis.projects) {
          parts.push(`- Project: ${p.name} (${p.type}) at ${p.path}`);
          parts.push(`  ${p.description}`);
          if (p.languages?.length) parts.push(`  Languages: ${p.languages.join(", ")}`);
          if (p.frameworks?.length) parts.push(`  Frameworks: ${p.frameworks.join(", ")}`);
        }
      }
      if (analysis.conventions?.length) parts.push(`- Conventions: ${analysis.conventions.join(", ")}`);
    } catch {
      // analysis_json not valid JSON, skip
    }
  }

  // Add indexed file count
  const indexed = repos.codeIndex.listByRepo(repositoryId);
  if (indexed.length > 0) {
    const langCounts = new Map<string, number>();
    for (const f of indexed) {
      const lang = f.language ?? "other";
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }
    const langBreakdown = [...langCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang}(${count})`)
      .join(", ");
    parts.push(`- Indexed files: ${indexed.length} [${langBreakdown}]`);
  }

  return parts.join("\n");
}

export function buildProjectRepoSummaries(projectId: string): string {
  const repos = getRepos();
  const selectedRepos = repos.repositories.listSelectedByProject(projectId);
  if (selectedRepos.length === 0) return "No repositories selected.";
  return selectedRepos.map(r => buildRepoSummary(r.id)).join("\n\n");
}
