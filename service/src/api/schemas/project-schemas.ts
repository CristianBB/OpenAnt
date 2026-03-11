import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  rules_nl: z.string().max(50000).optional(),
  agent_policy_nl: z.string().max(50000).optional(),
  max_parallel_runs: z.number().int().min(1).max(20).optional(),
});
