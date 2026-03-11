import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load root .env so client picks up NEXT_PUBLIC_* variables
function loadRootEnv() {
  try {
    const envPath = resolve(__dirname, "..", ".env");
    const content = readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key.startsWith("NEXT_PUBLIC_") && !process.env[key]) {
        env[key] = value;
      }
    }
    return env;
  } catch {
    return {};
  }
}

const rootEnv = loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: rootEnv,
};

export default nextConfig;
