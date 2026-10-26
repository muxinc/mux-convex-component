import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const playbackId = v.object({
  id: v.string(),
  policy: v.optional(v.string()),
});

const videoTrack = v.object({
  id: v.optional(v.string()),
  type: v.optional(v.string()),
  textType: v.optional(v.string()),
  languageCode: v.optional(v.string()),
  status: v.optional(v.string()),
  name: v.optional(v.string()),
});

const genericObject = v.record(v.string(), v.any());

const assetFields = {
  muxAssetId: v.string(),
  status: v.optional(v.string()),
  playbackIds: v.optional(v.array(playbackId)),
  durationSeconds: v.optional(v.number()),
  aspectRatio: v.optional(v.string()),
  maxStoredResolution: v.optional(v.string()),
  maxStoredFrameRate: v.optional(v.number()),
  passthrough: v.optional(v.string()),
  uploadId: v.optional(v.string()),
  liveStreamId: v.optional(v.string()),
  tracks: v.optional(v.array(videoTrack)),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
  deletedAtMs: v.optional(v.number()),
  raw: genericObject,
};

const liveStreamFields = {
  muxLiveStreamId: v.string(),
  status: v.optional(v.string()),
  playbackIds: v.optional(v.array(playbackId)),
  reconnectWindowSeconds: v.optional(v.number()),
  recentAssetIds: v.optional(v.array(v.string())),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
  deletedAtMs: v.optional(v.number()),
  raw: genericObject,
};

const uploadFields = {
  muxUploadId: v.string(),
  status: v.optional(v.string()),
  uploadUrl: v.optional(v.string()),
  timeoutSeconds: v.optional(v.number()),
  corsOrigin: v.optional(v.string()),
  assetId: v.optional(v.string()),
  error: v.optional(genericObject),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
  deletedAtMs: v.optional(v.number()),
  raw: genericObject,
};

const eventFields = {
  muxEventId: v.optional(v.string()),
  type: v.string(),
  objectType: v.optional(v.string()),
  objectId: v.optional(v.string()),
  occurredAtMs: v.optional(v.number()),
  receivedAtMs: v.number(),
  verified: v.boolean(),
  raw: genericObject,
};

const videoMetadataFields = {
  muxAssetId: v.string(),
  userId: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  visibility: v.optional(
    v.union(v.literal("private"), v.literal("unlisted"), v.literal("public"))
  ),
  custom: v.optional(genericObject),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
};

// Document validators for `returns`, built from the same fields as the tables
// so they can't drift from the schema.
export const assetDoc = v.object({
  _id: v.id("assets"),
  _creationTime: v.number(),
  ...assetFields,
});
export const liveStreamDoc = v.object({
  _id: v.id("liveStreams"),
  _creationTime: v.number(),
  ...liveStreamFields,
});
export const uploadDoc = v.object({
  _id: v.id("uploads"),
  _creationTime: v.number(),
  ...uploadFields,
});
export const eventDoc = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  ...eventFields,
});
export const videoMetadataDoc = v.object({
  _id: v.id("videoMetadata"),
  _creationTime: v.number(),
  ...videoMetadataFields,
});

export default defineSchema({
  assets: defineTable(assetFields)
    .index("by_mux_asset_id", ["muxAssetId"])
    .index("by_status", ["status"])
    .index("by_updated_at", ["updatedAtMs"]),

  liveStreams: defineTable(liveStreamFields)
    .index("by_mux_live_stream_id", ["muxLiveStreamId"])
    .index("by_status", ["status"])
    .index("by_updated_at", ["updatedAtMs"]),

  uploads: defineTable(uploadFields)
    .index("by_mux_upload_id", ["muxUploadId"])
    .index("by_status", ["status"])
    .index("by_updated_at", ["updatedAtMs"]),

  events: defineTable(eventFields)
    .index("by_mux_event_id", ["muxEventId"])
    .index("by_type", ["type"])
    .index("by_object", ["objectType", "objectId"])
    .index("by_received_at", ["receivedAtMs"]),

  videoMetadata: defineTable(videoMetadataFields)
    .index("by_mux_asset_id", ["muxAssetId"])
    .index("by_user_id", ["userId"])
    .index("by_asset_and_user", ["muxAssetId", "userId"])
    .index("by_updated_at", ["updatedAtMs"]),
});
