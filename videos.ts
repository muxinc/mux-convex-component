import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assetDoc, videoMetadataDoc } from "./schema";

const DEFAULT_METADATA_USER_ID = "default";

function omitUndefined<T extends Record<string, unknown>>(doc: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export const upsertVideoMetadata = mutation({
  args: {
    muxAssetId: v.string(),
    userId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(
      v.union(v.literal("private"), v.literal("unlisted"), v.literal("public"))
    ),
    custom: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.id("videoMetadata"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const isFallbackUser = args.userId === DEFAULT_METADATA_USER_ID;
    const existing = await ctx.db
      .query("videoMetadata")
      .withIndex("by_asset_and_user", (q) =>
        q.eq("muxAssetId", args.muxAssetId).eq("userId", args.userId)
      )
      .unique();

    const patchDoc = omitUndefined({
      title: args.title,
      description: args.description,
      tags: args.tags,
      visibility: args.visibility,
      custom: args.custom,
      updatedAtMs: now,
    });

    if (existing) {
      if (!isFallbackUser) {
        const fallback = await ctx.db
          .query("videoMetadata")
          .withIndex("by_asset_and_user", (q) =>
            q.eq("muxAssetId", args.muxAssetId).eq("userId", DEFAULT_METADATA_USER_ID)
          )
          .unique();

        if (fallback && fallback._id !== existing._id) {
          const mergedPatchDoc = omitUndefined({
            title: args.title ?? existing.title ?? fallback.title,
            description:
              args.description ?? existing.description ?? fallback.description,
            tags: args.tags ?? existing.tags ?? fallback.tags,
            visibility: args.visibility ?? existing.visibility ?? fallback.visibility,
            custom: args.custom ?? existing.custom ?? fallback.custom,
            updatedAtMs: now,
          });
          await ctx.db.patch("videoMetadata", existing._id, mergedPatchDoc);
          await ctx.db.delete("videoMetadata", fallback._id);
          return existing._id;
        }
      }

      await ctx.db.patch("videoMetadata", existing._id, patchDoc);
      return existing._id;
    }

    if (!isFallbackUser) {
      const fallback = await ctx.db
        .query("videoMetadata")
        .withIndex("by_asset_and_user", (q) =>
          q.eq("muxAssetId", args.muxAssetId).eq("userId", DEFAULT_METADATA_USER_ID)
        )
        .unique();

      if (fallback) {
        const migratedPatchDoc = omitUndefined({
          userId: args.userId,
          title: args.title ?? fallback.title,
          description: args.description ?? fallback.description,
          tags: args.tags ?? fallback.tags,
          visibility: args.visibility ?? fallback.visibility,
          custom: args.custom ?? fallback.custom,
          updatedAtMs: now,
        });
        await ctx.db.patch("videoMetadata", fallback._id, migratedPatchDoc);
        return fallback._id;
      }
    }

    return await ctx.db.insert("videoMetadata", {
      muxAssetId: args.muxAssetId,
      userId: args.userId,
      createdAtMs: now,
      ...patchDoc,
      updatedAtMs: now,
    });
  },
});

export const getVideoByMuxAssetId = query({
  args: {
    muxAssetId: v.string(),
    userId: v.optional(v.string()),
  },
  // `metadata` is the user's row when `userId` is given, otherwise every row.
  returns: v.union(
    v.null(),
    v.object({
      asset: assetDoc,
      metadata: v.union(videoMetadataDoc, v.null(), v.array(videoMetadataDoc)),
    })
  ),
  handler: async (ctx, args) => {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
      .unique();

    if (!asset) return null;

    if (args.userId) {
      const userId = args.userId;
      const metadata = await ctx.db
        .query("videoMetadata")
        .withIndex("by_asset_and_user", (q) =>
          q.eq("muxAssetId", args.muxAssetId).eq("userId", userId)
        )
        .unique();
      return { asset, metadata };
    }

    const metadata = await ctx.db
      .query("videoMetadata")
      .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
      .collect();
    return { asset, metadata };
  },
});

export const listVideosForUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      metadata: videoMetadataDoc,
      asset: v.union(assetDoc, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const metadataRows = await ctx.db
      .query("videoMetadata")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 25);

    const joinedRows = await Promise.all(
      metadataRows.map(async (metadata) => {
        const asset = await ctx.db
          .query("assets")
          .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", metadata.muxAssetId))
          .unique();
        return { metadata, asset };
      })
    );

    return joinedRows;
  },
});
