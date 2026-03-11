import path from "node:path";
import fs from "node:fs";
import { simpleGit } from "simple-git";
import { getConfig } from "../config/env.js";

export async function createDemoRepo(name: string): Promise<string> {
  const config = getConfig();
  const repoDir = path.join(config.OPENANT_DATA_DIR, "demo-repos", name);

  if (fs.existsSync(repoDir)) {
    return repoDir;
  }

  fs.mkdirSync(repoDir, { recursive: true });
  const git = simpleGit(repoDir);
  await git.init();
  await git.addConfig("user.email", "demo@openant.local");
  await git.addConfig("user.name", "OpenAnt Demo");

  // Create a simple TypeScript project
  fs.writeFileSync(
    path.join(repoDir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        type: "module",
        scripts: { build: "tsc", test: "echo 'no tests'" },
        devDependencies: { typescript: "^5.0.0" },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(repoDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          outDir: "dist",
          strict: true,
        },
        include: ["src"],
      },
      null,
      2
    )
  );

  fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(repoDir, "src", "index.ts"),
    `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function add(a: number, b: number): number {
  return a + b;
}
`
  );

  fs.writeFileSync(
    path.join(repoDir, "src", "utils.ts"),
    `export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/\\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
`
  );

  fs.writeFileSync(
    path.join(repoDir, "README.md"),
    `# ${name}\n\nA demo repository for OpenAnt.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run build\n\`\`\`\n`
  );

  await git.add(".");
  await git.commit("Initial commit");

  return repoDir;
}
