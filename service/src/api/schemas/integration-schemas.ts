import { z } from "zod";

export const openrouterConfigSchema = z.object({
  apiKey: z.string().optional(),
  assignmentModel: z.string().optional(),
  planningModel: z.string().optional(),
});

export const anthropicConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

