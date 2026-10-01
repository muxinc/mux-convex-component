import fs from "node:fs";
import path from "node:path";

function printHelp() {
  console.log(`npx @mux/convex-mux-init

Scaffold app-level Convex wrappers for @mux/convex.

Usage:
  npx convex-mux-init [options]

Options:
  --component-name <name>  Mounted component name in convex.config.ts (default: mux)
  --force                  Overwrite existing generated files except convex/http.ts
  --skip-config            Do not create convex/convex.config.ts
  --skip-http              Do not create convex/muxHttp.ts or convex/http.ts
  --skip-migration         Do not create convex/migrations.ts
  --skip-webhook           Do not create convex/muxWebhook.ts
  -h, --help               Show help
`);
}

function migrationsTemplate(name) {
  return `"use node";

import Mux from "@mux/ts";
import { action } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(\`Missing env var: \${name}\`);
  return value;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function asVisibility(
  value: unknown
): "private" | "unlisted" | "public" | undefined {
  return value === "private" || value === "unlisted" || value === "public"
    ? value
    : undefined;
}

function parseMetadataPassthrough(passthrough: unknown): {
  userId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: "private" | "unlisted" | "public";
  custom?: Record<string, unknown>;
} {
  const raw = asString(passthrough);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    const parsedObj = asRecord(parsed);
    if (!parsedObj) return { userId: raw };

    return {
      userId: asString(parsedObj.userId) ?? asString(parsedObj.user_id),
      title: asString(parsedObj.title),
      description: asString(parsedObj.description),
      tags: asStringArray(parsedObj.tags),
      visibility: asVisibility(parsedObj.visibility),
      custom: asRecord(parsedObj.custom),
    };
  } catch {
    return { userId: raw };
  }
}

export const backfillMux = action({
  args: {
    maxAssets: v.optional(v.number()),
    defaultUserId: v.optional(v.string()),
    includeVideoMetadata: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const mux = new Mux({
      tokenId: requiredEnv("MUX_TOKEN_ID", process.env.MUX_TOKEN_ID),
      tokenSecret: requiredEnv("MUX_TOKEN_SECRET", process.env.MUX_TOKEN_SECRET),
    });

    const maxAssets = Math.max(1, Math.floor(args.maxAssets ?? 200));
    const includeVideoMetadata = args.includeVideoMetadata ?? true;

    let scanned = 0;
    let syncedAssets = 0;
    let metadataUpserts = 0;
    let missingUserId = 0;

    for await (const asset of mux.video.assets.list({ limit: 100 })) {
      if (scanned >= maxAssets) break;
      scanned += 1;
      if (!asset.id) continue;

      await ctx.runMutation(components.${name}.sync.upsertAssetFromPayloadPublic, {
        asset: asset as unknown as Record<string, unknown>,
      });
      syncedAssets += 1;

      if (!includeVideoMetadata) continue;
      const metadata = parseMetadataPassthrough(asset.passthrough);
      const userId = metadata.userId ?? asString(args.defaultUserId) ?? "default";

      await ctx.runMutation(components.${name}.videos.upsertVideoMetadata, {
        muxAssetId: asset.id,
        userId,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        visibility: metadata.visibility,
        custom: metadata.custom,
      });
      metadataUpserts += 1;
    }

    return { scanned, syncedAssets, metadataUpserts, missingUserId };
  },
});
`;
}

function convexConfigTemplate(name) {
  return `import { defineApp } from "convex/server";
import mux from "@mux/convex/convex.config.js";

const app = defineApp();
app.use(mux, { name: "${name}" });

export default app;
`;
}

function webhookTemplate(name) {
  return `"use node";

import Mux from "@mux/ts";
import { internalAction } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(\`Missing env var: \${name}\`);
  return value;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function asVisibility(
  value: unknown
): "private" | "unlisted" | "public" | undefined {
  return value === "private" || value === "unlisted" || value === "public"
    ? value
    : undefined;
}

function parseMetadataPassthrough(passthrough: unknown): {
  userId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: "private" | "unlisted" | "public";
  custom?: Record<string, unknown>;
} {
  const raw = asString(passthrough);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    const parsedObj = asRecord(parsed);
    if (!parsedObj) return { userId: raw };

    return {
      userId: asString(parsedObj.userId) ?? asString(parsedObj.user_id),
      title: asString(parsedObj.title),
      description: asString(parsedObj.description),
      tags: asStringArray(parsedObj.tags),
      visibility: asVisibility(parsedObj.visibility),
      custom: asRecord(parsedObj.custom),
    };
  } catch {
    return { userId: raw };
  }
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

export const ingestMuxWebhook = internalAction({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const mux = new Mux({
      webhookSecret: requiredEnv(
        "MUX_WEBHOOK_SECRET",
        process.env.MUX_WEBHOOK_SECRET
      ),
    });
    // Typed so a missing await fails the typecheck.
    const unwrapped: Mux.Webhooks.UnwrapWebhookEvent = await mux.webhooks.unwrap(
      args.rawBody,
      normalizeHeaders(args.headers)
    );
    const event = unwrapped as unknown as Record<string, unknown>;

    await ctx.runMutation(components.${name}.sync.recordWebhookEventPublic, {
      event,
      verified: true,
    });

    const eventType = asString(event.type) ?? "";
    const data = asRecord(event.data);
    const objectId = asString(data?.id);

    if (!objectId || !data) {
      return { skipped: true, reason: "missing_data" };
    }

    if (eventType.startsWith("video.asset.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(components.${name}.sync.markAssetDeletedPublic, {
          muxAssetId: objectId,
        });
      } else {
        await ctx.runMutation(components.${name}.sync.upsertAssetFromPayloadPublic, {
          asset: data,
        });

        const metadata = parseMetadataPassthrough(data.passthrough);
        const userId = metadata.userId ?? "default";
        await ctx.runMutation(components.${name}.videos.upsertVideoMetadata, {
          muxAssetId: objectId,
          userId,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          visibility: metadata.visibility,
          custom: metadata.custom,
        });
      }
      return { skipped: false };
    }

    if (eventType.startsWith("video.live_stream.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(components.${name}.sync.markLiveStreamDeletedPublic, {
          muxLiveStreamId: objectId,
        });
      } else {
        await ctx.runMutation(
          components.${name}.sync.upsertLiveStreamFromPayloadPublic,
          {
            liveStream: data,
          }
        );
      }
      return { skipped: false };
    }

    if (eventType.startsWith("video.upload.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(components.${name}.sync.markUploadDeletedPublic, {
          muxUploadId: objectId,
        });
      } else {
        await ctx.runMutation(components.${name}.sync.upsertUploadFromPayloadPublic, {
          upload: data,
        });
      }
      return { skipped: false };
    }

    return { skipped: true, reason: "unsupported_event" };
  },
});
`;
}

function muxHttpTemplate() {
  return `import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

export function registerMuxHttpRoutes(http: ReturnType<typeof httpRouter>) {
  http.route({
    path: "/mux/webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const rawBody = await request.text();
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const result = await ctx.runAction(internal.muxWebhook.ingestMuxWebhook, {
        rawBody,
        headers,
      });

      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    }),
  });
}
`;
}

function httpTemplate() {
  return `import { httpRouter } from "convex/server";
import { registerMuxHttpRoutes } from "./muxHttp";

const http = httpRouter();

registerMuxHttpRoutes(http);

export default http;
`;
}

function writeBootstrapHttpFile(cwd, convexDir, content) {
  const absPath = path.join(convexDir, "http.ts");
  if (fs.existsSync(absPath)) {
    console.log(
      `skip ${path.relative(
        cwd,
        absPath,
      )} (already exists; add registerMuxHttpRoutes(http) to your router)`,
    );
    return false;
  }

  fs.writeFileSync(absPath, content, "utf8");
  console.log(`write ${path.relative(cwd, absPath)}`);
  return true;
}

export function runInit(args) {
  let componentName = "mux";
  let force = false;
  let skipMigration = false;
  let skipWebhook = false;
  let skipConfig = false;
  let skipHttp = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "--component-name") {
      componentName = args[i + 1] ?? "";
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--skip-config") {
      skipConfig = true;
    } else if (arg === "--skip-http") {
      skipHttp = true;
    } else if (arg === "--skip-migration") {
      skipMigration = true;
    } else if (arg === "--skip-webhook") {
      skipWebhook = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(componentName)) {
    console.error(
      `Invalid --component-name "${componentName}". Use letters, numbers, and underscores, starting with a letter.`,
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const convexDir = path.join(cwd, "convex");

  if (!fs.existsSync(convexDir) || !fs.statSync(convexDir).isDirectory()) {
    console.error(
      "Could not find ./convex directory. Run this in your app root.",
    );
    process.exit(1);
  }

  function writeFile(relativePath, content) {
    const absPath = path.join(convexDir, relativePath);
    if (fs.existsSync(absPath) && !force) {
      console.log(`skip ${path.relative(cwd, absPath)} (already exists)`);
      return false;
    }
    fs.writeFileSync(absPath, content, "utf8");
    console.log(`write ${path.relative(cwd, absPath)}`);
    return true;
  }

  const hadHttpFile = fs.existsSync(path.join(convexDir, "http.ts"));

  let wroteAny = false;

  if (!skipConfig) {
    wroteAny =
      writeFile("convex.config.ts", convexConfigTemplate(componentName)) ||
      wroteAny;
  }

  if (!skipMigration) {
    wroteAny =
      writeFile("migrations.ts", migrationsTemplate(componentName)) || wroteAny;
  }

  if (!skipWebhook) {
    wroteAny =
      writeFile("muxWebhook.ts", webhookTemplate(componentName)) || wroteAny;
  }

  if (!skipHttp) {
    const webhookImplementationExists =
      !skipWebhook ||
      fs.existsSync(path.join(convexDir, "muxWebhook.ts")) ||
      fs.existsSync(path.join(convexDir, "muxWebhook.node.ts"));

    if (!webhookImplementationExists) {
      console.log(
        "skip convex/muxHttp.ts (--skip-webhook used and no convex/muxWebhook.ts was found)",
      );
      console.log(
        "skip convex/http.ts (--skip-webhook used and no convex/muxWebhook.ts was found)",
      );
    } else {
      wroteAny = writeFile("muxHttp.ts", muxHttpTemplate()) || wroteAny;
      wroteAny =
        writeBootstrapHttpFile(cwd, convexDir, httpTemplate()) || wroteAny;
    }
  }

  if (!wroteAny) {
    console.log("No files changed.");
  }

  const nextSteps = [];
  nextSteps.push(`Install Mux SDK in your app
   npm i @mux/ts`);
  if (skipConfig) {
    nextSteps.push(`Ensure convex/convex.config.ts mounts @mux/convex`);
  }
  if (skipHttp) {
    nextSteps.push(
      `Ensure convex/http.ts serves POST /mux/webhook and calls internal.muxWebhook.ingestMuxWebhook`,
    );
  } else if (hadHttpFile) {
    nextSteps.push(`Add Mux routes to your existing convex/http.ts
   import { registerMuxHttpRoutes } from "./muxHttp";
   registerMuxHttpRoutes(http)`);
  }
  nextSteps.push(`Set env vars in Convex
   npx convex env set MUX_TOKEN_ID <id>
   npx convex env set MUX_TOKEN_SECRET <secret>
   npx convex env set MUX_WEBHOOK_SECRET <secret>`);
  nextSteps.push(`Run
   npx convex dev
   npx convex run migrations:backfillMux '{}'`);

  console.log(`
Next steps:

${nextSteps.map((step, index) => `${index + 1}) ${step}`).join("\n\n")}
`);
}
