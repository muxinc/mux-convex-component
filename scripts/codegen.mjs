#!/usr/bin/env node

// Regenerates the component's `_generated/` files, including
// `_generated/component.ts`: the `ComponentApi` type that apps on convex 1.35+
// import from `@mux/convex/_generated/component.js`.
//
// `convex codegen --component-dir` treats every JS/TS file under the directory
// as a Convex module, so it can't run on the repo root (node_modules, scaffold).
// Instead, stage the published component files in a scratch app, run codegen
// there against a local anonymous deployment, and copy the output back.

import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Reused across runs so the local deployment is too. Gitignored.
const work = join(root, ".codegen");
const componentDir = join(work, "component");

rmSync(componentDir, { recursive: true, force: true });
mkdirSync(componentDir, { recursive: true });
mkdirSync(join(work, "convex"), { recursive: true });

for (const file of pkg.files) {
  if (file.endsWith(".ts") && !file.startsWith("_generated/")) {
    mkdirSync(dirname(join(componentDir, file)), { recursive: true });
    cpSync(join(root, file), join(componentDir, file));
  }
}

const convexVersion = JSON.parse(
  readFileSync(join(root, "node_modules", "convex", "package.json"), "utf8"),
).version;
writeFileSync(
  join(work, "package.json"),
  JSON.stringify({
    name: "mux-convex-codegen",
    private: true,
    type: "module",
    dependencies: { convex: convexVersion },
  }),
);
writeFileSync(
  join(work, "convex", "convex.config.ts"),
  `import { defineApp } from "convex/server";
import mux from "../component/convex.config.js";

const app = defineApp();
app.use(mux);

export default app;
`,
);
if (!existsSync(join(work, "node_modules"))) {
  symlinkSync(join(root, "node_modules"), join(work, "node_modules"), "dir");
}

// Run the CLI with its own home directory so the local deployment (and any
// Convex login) is isolated from the developer's other projects. Share only
// the downloaded backend binary cache.
const home = join(work, "home");
const sharedCache = join(homedir(), ".cache", "convex");
mkdirSync(sharedCache, { recursive: true });
mkdirSync(join(home, ".cache"), { recursive: true });
if (!existsSync(join(home, ".cache", "convex"))) {
  symlinkSync(sharedCache, join(home, ".cache", "convex"), "dir");
}

const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  CONVEX_AGENT_MODE: "anonymous",
};

// Codegen analyzes the component on a running deployment, so keep a local one
// up with `convex dev` (which also creates it on the first run).
const dev = spawn(
  process.execPath,
  [convexBin, "dev", "--typecheck", "disable", "--tail-logs", "disable"],
  { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] },
);
try {
  await new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk;
      if (output.includes("Convex functions ready")) resolve();
    };
    dev.stdout.on("data", onData);
    dev.stderr.on("data", onData);
    dev.on("exit", (code) =>
      reject(new Error(`convex dev exited (${code}) before it was ready:\n${output}`)),
    );
  });
  execFileSync(
    process.execPath,
    [convexBin, "codegen", "--component-dir", "component", "--typecheck", "disable"],
    { cwd: work, env, stdio: "inherit" },
  );
} finally {
  dev.kill("SIGINT");
}

const generatedDir = join(componentDir, "_generated");
for (const file of readdirSync(generatedDir)) {
  if (file.endsWith(".ts")) {
    cpSync(join(generatedDir, file), join(root, "_generated", file));
    console.log(`write _generated/${file}`);
  }
}
