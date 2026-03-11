import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative paths from the project root (one level above service/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

const envSchema = z.object({
  OPENANT_DATA_DIR: z.string().default("./data"),
  API_PORT: z.coerce.number().default(3001),
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Config = z.infer<typeof envSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("Invalid environment configuration:", parsed.error.format());
      process.exit(1);
    }
    // Always resolve OPENANT_DATA_DIR relative to the project root,
    // not the process cwd, so the path is stable regardless of where
    // the service is launched from.
    const dataDir = path.isAbsolute(parsed.data.OPENANT_DATA_DIR)
      ? parsed.data.OPENANT_DATA_DIR
      : path.resolve(PROJECT_ROOT, parsed.data.OPENANT_DATA_DIR);
    config = {
      ...parsed.data,
      OPENANT_DATA_DIR: dataDir,
    };
  }
  return config;
}
