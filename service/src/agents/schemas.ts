import { z } from "zod";

export const taskAssignmentResultSchema = z.object({
  action: z.enum(["attach_to_group", "create_group", "link_to_task", "no_change"]),
  targetGroupId: z.string().nullable(),
  targetTaskId: z.string().nullable(),
  newGroup: z
    .object({
      name: z.string(),
      summary: z.string(),
    })
    .nullable(),
  links: z
    .array(
      z.object({
        fromTaskId: z.string(),
        toTaskId: z.string(),
        type: z.enum(["DUPLICATES", "RELATED", "DEPENDS_ON", "BLOCKS", "SAME_EPIC"]),
        confidence: z.number(),
        reason: z.string(),
      })
    )
    .default([]),
  impacts: z
    .array(
      z.object({
        repositoryId: z.string(),
        areas: z.array(z.string()),
        confidence: z.number(),
        reason: z.string(),
      })
    )
    .default([]),
  reason: z.string().nullable(),
});

export type TaskAssignmentResult = z.infer<typeof taskAssignmentResultSchema>;

export const repoAnalysisSchema = z.object({
  summary: z.string().describe("1-3 sentence summary of what this repository is and does"),
  projects: z
    .array(z.object({
      name: z.string().describe("Project or sub-project name"),
      path: z.string().describe("Root path relative to repo root ('.' for single-project repos)"),
      description: z.string().describe("2-4 sentence description of what this project does and its role"),
      type: z.string().describe("Kind of project, e.g. 'API service', 'Web application', 'CLI tool', 'Library'"),
      languages: z.array(z.string()).default([]),
      frameworks: z.array(z.string()).default([]),
      features: z.array(z.string()).default([]).describe("High-level capabilities, e.g. 'User authentication with OAuth'"),
    }))
    .default([]),
  conventions: z.array(z.string()).default([]).describe("Code style, patterns, and architectural conventions"),
  testCommands: z.array(z.string()).default([]),
  buildCommands: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]).describe("External services and APIs the repo integrates with"),
  notes: z.string().nullable(),
});

export type RepoAnalysis = z.infer<typeof repoAnalysisSchema>;

export const planOutputSchema = z.object({
  plan_markdown: z.string(),
  plan_json: z.record(z.unknown()),
});

export type PlanOutput = z.infer<typeof planOutputSchema>;
