import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

function omitUndefined<T extends Record<string, unknown>>(doc: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asPlaybackIds(value: unknown): Array<{ id: string; policy?: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const mapped = value
    .map((entry) => {
      const id = asString((entry as { id?: unknown }).id);
      if (!id) return null;
      const policy = asString((entry as { policy?: unknown }).policy);
      return policy ? { id, policy } : { id };
    })
    .filter((entry): entry is { id: string; policy?: string } => entry !== null);
  return mapped.length > 0 ? mapped : undefined;
}

function asTracks(
  value: unknown
):
  | Array<{
      id?: string;
      type?: string;
      textType?: string;
      languageCode?: string;
      status?: string;
      name?: string;
    }>
  | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tracks = value.map((entry) => {
    const track = entry as {
      id?: unknown;
      type?: unknown;
      text_type?: unknown;
      language_code?: unknown;
      status?: unknown;
      name?: unknown;
    };
    return {
      id: asString(track.id),
      type: asString(track.type),
      textType: asString(track.text_type),
      languageCode: asString(track.language_code),
      status: asString(track.status),
      name: asString(track.name),
    };
  });
  return tracks.length > 0 ? tracks : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : undefined;
}

const upsertAssetFromPayloadHandler = async (
  ctx: MutationCtx,
  args: { asset: Record<string, unknown> }
) => {
  const now = Date.now();
  const asset = args.asset as {
    id?: unknown;
    status?: unknown;
    playback_ids?: unknown;
    duration?: unknown;
    aspect_ratio?: unknown;
    max_stored_resolution?: unknown;
    max_stored_frame_rate?: unknown;
    passthrough?: unknown;
    upload_id?: unknown;
    live_stream_id?: unknown;
    tracks?: unknown;
  };
  const muxAssetId = asString(asset.id);
  if (!muxAssetId) {
    throw new Error("Mux asset payload is missing an id.");
  }

  const existing = await ctx.db
    .query("assets")
    .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", muxAssetId))
    .unique();

  const patchDoc = omitUndefined({
    status: asString(asset.status),
    playbackIds: asPlaybackIds(asset.playback_ids),
    durationSeconds: asNumber(asset.duration),
    aspectRatio: asString(asset.aspect_ratio),
    maxStoredResolution: asString(asset.max_stored_resolution),
    maxStoredFrameRate: asNumber(asset.max_stored_frame_rate),
    passthrough: asString(asset.passthrough),
    uploadId: asString(asset.upload_id),
    liveStreamId: asString(asset.live_stream_id),
    tracks: asTracks(asset.tracks),
    updatedAtMs: now,
    deletedAtMs: asString(asset.status) === "deleted" ? now : undefined,
    raw: args.asset,
  });

  if (existing) {
    await ctx.db.patch("assets", existing._id, patchDoc);
    return existing._id;
  }

  return await ctx.db.insert("assets", {
    muxAssetId,
    createdAtMs: now,
    ...patchDoc,
    updatedAtMs: now,
    raw: args.asset,
  });
};

export const upsertAssetFromPayload = internalMutation({
  args: { asset: v.record(v.string(), v.any()) },
  returns: v.id("assets"),
  handler: upsertAssetFromPayloadHandler,
});

export const upsertAssetFromPayloadPublic = mutation({
  args: { asset: v.record(v.string(), v.any()) },
  returns: v.id("assets"),
  handler: upsertAssetFromPayloadHandler,
});

const markAssetDeletedHandler = async (
  ctx: MutationCtx,
  args: { muxAssetId: string }
) => {
  const existing = await ctx.db
    .query("assets")
    .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
    .unique();
  if (!existing) return null;
  await ctx.db.patch("assets", existing._id, {
    status: "deleted",
    deletedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return existing._id;
};

export const markAssetDeleted = internalMutation({
  args: { muxAssetId: v.string() },
  returns: v.union(v.id("assets"), v.null()),
  handler: markAssetDeletedHandler,
});

export const markAssetDeletedPublic = mutation({
  args: { muxAssetId: v.string() },
  returns: v.union(v.id("assets"), v.null()),
  handler: markAssetDeletedHandler,
});

const upsertLiveStreamFromPayloadHandler = async (
  ctx: MutationCtx,
  args: { liveStream: Record<string, unknown> }
) => {
  const now = Date.now();
  const liveStream = args.liveStream as {
    id?: unknown;
    status?: unknown;
    playback_ids?: unknown;
    reconnect_window?: unknown;
    recent_asset_ids?: unknown;
  };
  const muxLiveStreamId = asString(liveStream.id);
  if (!muxLiveStreamId) {
    throw new Error("Mux live stream payload is missing an id.");
  }

  const existing = await ctx.db
    .query("liveStreams")
    .withIndex("by_mux_live_stream_id", (q) =>
      q.eq("muxLiveStreamId", muxLiveStreamId)
    )
    .unique();

  const patchDoc = omitUndefined({
    status: asString(liveStream.status),
    playbackIds: asPlaybackIds(liveStream.playback_ids),
    reconnectWindowSeconds: asNumber(liveStream.reconnect_window),
    recentAssetIds: asStringArray(liveStream.recent_asset_ids),
    updatedAtMs: now,
    raw: args.liveStream,
  });

  if (existing) {
    await ctx.db.patch("liveStreams", existing._id, patchDoc);
    return existing._id;
  }

  return await ctx.db.insert("liveStreams", {
    muxLiveStreamId,
    createdAtMs: now,
    ...patchDoc,
    updatedAtMs: now,
    raw: args.liveStream,
  });
};

export const upsertLiveStreamFromPayload = internalMutation({
  args: { liveStream: v.record(v.string(), v.any()) },
  returns: v.id("liveStreams"),
  handler: upsertLiveStreamFromPayloadHandler,
});

export const upsertLiveStreamFromPayloadPublic = mutation({
  args: { liveStream: v.record(v.string(), v.any()) },
  returns: v.id("liveStreams"),
  handler: upsertLiveStreamFromPayloadHandler,
});

const markLiveStreamDeletedHandler = async (
  ctx: MutationCtx,
  args: { muxLiveStreamId: string }
) => {
  const existing = await ctx.db
    .query("liveStreams")
    .withIndex("by_mux_live_stream_id", (q) =>
      q.eq("muxLiveStreamId", args.muxLiveStreamId)
    )
    .unique();
  if (!existing) return null;
  await ctx.db.patch("liveStreams", existing._id, {
    status: "deleted",
    deletedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return existing._id;
};

export const markLiveStreamDeleted = internalMutation({
  args: { muxLiveStreamId: v.string() },
  returns: v.union(v.id("liveStreams"), v.null()),
  handler: markLiveStreamDeletedHandler,
});

export const markLiveStreamDeletedPublic = mutation({
  args: { muxLiveStreamId: v.string() },
  returns: v.union(v.id("liveStreams"), v.null()),
  handler: markLiveStreamDeletedHandler,
});

const upsertUploadFromPayloadHandler = async (
  ctx: MutationCtx,
  args: { upload: Record<string, unknown> }
) => {
  const now = Date.now();
  const upload = args.upload as {
    id?: unknown;
    status?: unknown;
    url?: unknown;
    timeout?: unknown;
    cors_origin?: unknown;
    asset_id?: unknown;
    error?: unknown;
  };
  const muxUploadId = asString(upload.id);
  if (!muxUploadId) {
    throw new Error("Mux upload payload is missing an id.");
  }

  const existing = await ctx.db
    .query("uploads")
    .withIndex("by_mux_upload_id", (q) => q.eq("muxUploadId", muxUploadId))
    .unique();

  const patchDoc = omitUndefined({
    status: asString(upload.status),
    uploadUrl: asString(upload.url),
    timeoutSeconds: asNumber(upload.timeout),
    corsOrigin: asString(upload.cors_origin),
    assetId: asString(upload.asset_id),
    error: asObject(upload.error),
    updatedAtMs: now,
    raw: args.upload,
  });

  if (existing) {
    await ctx.db.patch("uploads", existing._id, patchDoc);
    return existing._id;
  }

  return await ctx.db.insert("uploads", {
    muxUploadId,
    createdAtMs: now,
    ...patchDoc,
    updatedAtMs: now,
    raw: args.upload,
  });
};

export const upsertUploadFromPayload = internalMutation({
  args: { upload: v.record(v.string(), v.any()) },
  returns: v.id("uploads"),
  handler: upsertUploadFromPayloadHandler,
});

export const upsertUploadFromPayloadPublic = mutation({
  args: { upload: v.record(v.string(), v.any()) },
  returns: v.id("uploads"),
  handler: upsertUploadFromPayloadHandler,
});

const markUploadDeletedHandler = async (
  ctx: MutationCtx,
  args: { muxUploadId: string }
) => {
  const existing = await ctx.db
    .query("uploads")
    .withIndex("by_mux_upload_id", (q) => q.eq("muxUploadId", args.muxUploadId))
    .unique();
  if (!existing) return null;
  await ctx.db.patch("uploads", existing._id, {
    status: "deleted",
    deletedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
  return existing._id;
};

export const markUploadDeleted = internalMutation({
  args: { muxUploadId: v.string() },
  returns: v.union(v.id("uploads"), v.null()),
  handler: markUploadDeletedHandler,
});

export const markUploadDeletedPublic = mutation({
  args: { muxUploadId: v.string() },
  returns: v.union(v.id("uploads"), v.null()),
  handler: markUploadDeletedHandler,
});

function inferObjectTypeFromEventType(eventType: string): string | undefined {
  // These events carry a child object in `data`, not the asset or live stream.
  if (eventType.startsWith("video.asset.track.")) return "track";
  if (eventType.startsWith("video.asset.static_rendition.")) return "static_rendition";
  if (eventType.startsWith("video.asset.shots.")) return "shots";
  if (eventType.startsWith("video.live_stream.simulcast_target.")) return "simulcast_target";
  if (eventType.startsWith("video.asset.")) return "asset";
  if (eventType.startsWith("video.live_stream.")) return "live_stream";
  if (eventType.startsWith("video.upload.")) return "upload";
  return undefined;
}

const recordWebhookEventHandler = async (
  ctx: MutationCtx,
  args: {
    event: Record<string, unknown>;
    verified: boolean;
  }
) => {
  const now = Date.now();
  const event = args.event as {
    id?: unknown;
    type?: unknown;
    data?: { id?: unknown };
    created_at?: unknown;
  };

  const eventType = asString(event.type) ?? "unknown";
  const muxEventId = asString(event.id);
  const objectId = asString(event.data?.id);
  const objectType = inferObjectTypeFromEventType(eventType);
  const occurredAtMs = asTimestamp(event.created_at);

  if (muxEventId) {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_mux_event_id", (q) => q.eq("muxEventId", muxEventId))
      .unique();
    if (existing) {
      return { eventDocId: existing._id, alreadyProcessed: true };
    }
  }

  const eventDocId = await ctx.db.insert("events", {
    type: eventType,
    receivedAtMs: now,
    verified: args.verified,
    raw: args.event,
    ...(muxEventId ? { muxEventId } : {}),
    ...(objectType ? { objectType } : {}),
    ...(objectId ? { objectId } : {}),
    ...(occurredAtMs !== undefined ? { occurredAtMs } : {}),
  });

  return { eventDocId, alreadyProcessed: false };
};

export const recordWebhookEvent = internalMutation({
  args: {
    event: v.record(v.string(), v.any()),
    verified: v.boolean(),
  },
  returns: v.object({ eventDocId: v.id("events"), alreadyProcessed: v.boolean() }),
  handler: recordWebhookEventHandler,
});

export const recordWebhookEventPublic = mutation({
  args: {
    event: v.record(v.string(), v.any()),
    verified: v.boolean(),
  },
  returns: v.object({ eventDocId: v.id("events"), alreadyProcessed: v.boolean() }),
  handler: recordWebhookEventHandler,
});
