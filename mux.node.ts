"use node";

import Mux from "@mux/ts";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

type JsonObject = Record<string, unknown>;
const DEFAULT_METADATA_USER_ID = "default";

type MuxWebhookEvent = JsonObject & {
  id?: unknown;
  type?: unknown;
  created_at?: unknown;
  data?: {
    id?: unknown;
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): JsonObject | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
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
  custom?: JsonObject;
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

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON object payload.");
  }
  return value as JsonObject;
}

function parseWebhookEvent(value: unknown): MuxWebhookEvent {
  return asObject(value) as MuxWebhookEvent;
}

function hasApiCredentials(args: {
  muxTokenId?: string;
  muxTokenSecret?: string;
}): args is { muxTokenId: string; muxTokenSecret: string } {
  return Boolean(args.muxTokenId && args.muxTokenSecret);
}

function createMuxClient(args: {
  muxTokenId?: string;
  muxTokenSecret?: string;
  webhookSecret?: string;
}): Mux {
  return new Mux({
    tokenId: args.muxTokenId,
    tokenSecret: args.muxTokenSecret,
    webhookSecret: args.webhookSecret,
  });
}

export const createAsset = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    params: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const asset = await mux.video.assets.create(
      args.params as unknown as Parameters<typeof mux.video.assets.create>[0]
    );
    await ctx.runMutation(internal.sync.upsertAssetFromPayload, { asset });
    return asset;
  },
});

export const createDirectUpload = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    params: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const upload = await mux.video.uploads.create(
      (args.params ?? {}) as unknown as Parameters<typeof mux.video.uploads.create>[0]
    );
    await ctx.runMutation(internal.sync.upsertUploadFromPayload, { upload });
    return upload;
  },
});

export const createLiveStream = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    params: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const liveStream = await mux.video.liveStreams.create(
      (args.params ?? {}) as unknown as Parameters<
        typeof mux.video.liveStreams.create
      >[0]
    );
    await ctx.runMutation(internal.sync.upsertLiveStreamFromPayload, { liveStream });
    return liveStream;
  },
});

export const syncAssetById = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    muxAssetId: v.string(),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const asset = await mux.video.assets.retrieve(args.muxAssetId);
    await ctx.runMutation(internal.sync.upsertAssetFromPayload, { asset });
    return asset;
  },
});

export const syncUploadById = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    muxUploadId: v.string(),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const upload = await mux.video.uploads.retrieve(args.muxUploadId);
    await ctx.runMutation(internal.sync.upsertUploadFromPayload, { upload });
    return upload;
  },
});

export const syncLiveStreamById = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    muxLiveStreamId: v.string(),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const liveStream = await mux.video.liveStreams.retrieve(args.muxLiveStreamId);
    await ctx.runMutation(internal.sync.upsertLiveStreamFromPayload, { liveStream });
    return liveStream;
  },
});

export const backfillAssets = action({
  args: {
    muxTokenId: v.string(),
    muxTokenSecret: v.string(),
    maxAssets: v.optional(v.number()),
    includeVideoMetadata: v.optional(v.boolean()),
    defaultUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const mux = createMuxClient(args);
    const maxAssets = Math.max(1, Math.floor(args.maxAssets ?? 200));
    const includeVideoMetadata = args.includeVideoMetadata ?? true;

    let scanned = 0;
    let syncedAssets = 0;
    let metadataUpserts = 0;
    let missingUserId = 0;

    for await (const asset of mux.video.assets.list({ limit: 100 })) {
      if (scanned >= maxAssets) break;
      scanned += 1;

      const assetObj = asset as unknown as Record<string, unknown>;
      const muxAssetId = asString(assetObj.id);
      if (!muxAssetId) continue;

      await ctx.runMutation(internal.sync.upsertAssetFromPayload, {
        asset: assetObj,
      });
      syncedAssets += 1;

      if (!includeVideoMetadata) continue;

      const passthroughUserId = asString(assetObj.passthrough);
      const userId =
        passthroughUserId ??
        asString(args.defaultUserId) ??
        DEFAULT_METADATA_USER_ID;

      await ctx.runMutation(api.videos.upsertVideoMetadata, {
        muxAssetId,
        userId,
      });
      metadataUpserts += 1;
    }

    return {
      scanned,
      syncedAssets,
      metadataUpserts,
      missingUserId,
    };
  },
});

export const ingestWebhook = action({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    webhookSecret: v.string(),
    verifySignature: v.optional(v.boolean()),
    muxTokenId: v.optional(v.string()),
    muxTokenSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const verifySignature = args.verifySignature ?? true;
    const normalizedHeaders = normalizeHeaders(args.headers);

    let event: MuxWebhookEvent;

    if (verifySignature) {
      const mux = createMuxClient({
        webhookSecret: args.webhookSecret,
      });
      // Typed so a missing await fails the typecheck.
      const unwrapped: Mux.Webhooks.UnwrapWebhookEvent = await mux.webhooks.unwrap(
        args.rawBody,
        normalizedHeaders
      );
      event = parseWebhookEvent(unwrapped);
    } else {
      event = parseWebhookEvent(JSON.parse(args.rawBody));
    }

    const eventRecord = await ctx.runMutation(internal.sync.recordWebhookEvent, {
      event,
      verified: verifySignature,
    });
    if (eventRecord.alreadyProcessed) {
      return { event: eventRecord, skipped: true };
    }

    const eventType = asString(event.type) ?? "";
    const objectId = asString(event.data?.id);

    if (!objectId) {
      return { event: eventRecord, skipped: true };
    }

    if (eventType.startsWith("video.asset.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(internal.sync.markAssetDeleted, { muxAssetId: objectId });
        return { event: eventRecord, skipped: false };
      }
      let assetPayload: JsonObject;
      if (hasApiCredentials(args)) {
        const mux = createMuxClient(args);
        const asset = await mux.video.assets.retrieve(objectId);
        await ctx.runMutation(internal.sync.upsertAssetFromPayload, { asset });
        assetPayload = asset as unknown as JsonObject;
      } else {
        assetPayload = asObject(event.data);
        await ctx.runMutation(internal.sync.upsertAssetFromPayload, {
          asset: assetPayload,
        });
      }

      const metadata = parseMetadataPassthrough(assetPayload.passthrough);
      const userId = metadata.userId ?? DEFAULT_METADATA_USER_ID;
      await ctx.runMutation(api.videos.upsertVideoMetadata, {
        muxAssetId: objectId,
        userId,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        visibility: metadata.visibility,
        custom: metadata.custom,
      });
      return { event: eventRecord, skipped: false };
    }

    if (eventType.startsWith("video.live_stream.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(internal.sync.markLiveStreamDeleted, {
          muxLiveStreamId: objectId,
        });
        return { event: eventRecord, skipped: false };
      }
      if (hasApiCredentials(args)) {
        const mux = createMuxClient(args);
        const liveStream = await mux.video.liveStreams.retrieve(objectId);
        await ctx.runMutation(internal.sync.upsertLiveStreamFromPayload, { liveStream });
      } else {
        await ctx.runMutation(internal.sync.upsertLiveStreamFromPayload, {
          liveStream: asObject(event.data),
        });
      }
      return { event: eventRecord, skipped: false };
    }

    if (eventType.startsWith("video.upload.")) {
      if (eventType.endsWith(".deleted")) {
        await ctx.runMutation(internal.sync.markUploadDeleted, { muxUploadId: objectId });
        return { event: eventRecord, skipped: false };
      }
      if (hasApiCredentials(args)) {
        const mux = createMuxClient(args);
        const upload = await mux.video.uploads.retrieve(objectId);
        await ctx.runMutation(internal.sync.upsertUploadFromPayload, { upload });
      } else {
        await ctx.runMutation(internal.sync.upsertUploadFromPayload, {
          upload: asObject(event.data),
        });
      }
      return { event: eventRecord, skipped: false };
    }

    return { event: eventRecord, skipped: true };
  },
});
