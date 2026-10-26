/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    catalog: {
      getAssetByMuxId: FunctionReference<
        "query",
        "internal",
        { muxAssetId: string },
        {
          _creationTime: number;
          _id: string;
          aspectRatio?: string;
          createdAtMs: number;
          deletedAtMs?: number;
          durationSeconds?: number;
          liveStreamId?: string;
          maxStoredFrameRate?: number;
          maxStoredResolution?: string;
          muxAssetId: string;
          passthrough?: string;
          playbackIds?: Array<{ id: string; policy?: string }>;
          raw: Record<string, any>;
          status?: string;
          tracks?: Array<{
            id?: string;
            languageCode?: string;
            name?: string;
            status?: string;
            textType?: string;
            type?: string;
          }>;
          updatedAtMs: number;
          uploadId?: string;
        } | null,
        Name
      >;
      getLiveStreamByMuxId: FunctionReference<
        "query",
        "internal",
        { muxLiveStreamId: string },
        {
          _creationTime: number;
          _id: string;
          createdAtMs: number;
          deletedAtMs?: number;
          muxLiveStreamId: string;
          playbackIds?: Array<{ id: string; policy?: string }>;
          raw: Record<string, any>;
          recentAssetIds?: Array<string>;
          reconnectWindowSeconds?: number;
          status?: string;
          updatedAtMs: number;
        } | null,
        Name
      >;
      getUploadByMuxId: FunctionReference<
        "query",
        "internal",
        { muxUploadId: string },
        {
          _creationTime: number;
          _id: string;
          assetId?: string;
          corsOrigin?: string;
          createdAtMs: number;
          deletedAtMs?: number;
          error?: Record<string, any>;
          muxUploadId: string;
          raw: Record<string, any>;
          status?: string;
          timeoutSeconds?: number;
          updatedAtMs: number;
          uploadUrl?: string;
        } | null,
        Name
      >;
      listAssets: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aspectRatio?: string;
          createdAtMs: number;
          deletedAtMs?: number;
          durationSeconds?: number;
          liveStreamId?: string;
          maxStoredFrameRate?: number;
          maxStoredResolution?: string;
          muxAssetId: string;
          passthrough?: string;
          playbackIds?: Array<{ id: string; policy?: string }>;
          raw: Record<string, any>;
          status?: string;
          tracks?: Array<{
            id?: string;
            languageCode?: string;
            name?: string;
            status?: string;
            textType?: string;
            type?: string;
          }>;
          updatedAtMs: number;
          uploadId?: string;
        }>,
        Name
      >;
      listLiveStreams: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          createdAtMs: number;
          deletedAtMs?: number;
          muxLiveStreamId: string;
          playbackIds?: Array<{ id: string; policy?: string }>;
          raw: Record<string, any>;
          recentAssetIds?: Array<string>;
          reconnectWindowSeconds?: number;
          status?: string;
          updatedAtMs: number;
        }>,
        Name
      >;
      listRecentEvents: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          muxEventId?: string;
          objectId?: string;
          objectType?: string;
          occurredAtMs?: number;
          raw: Record<string, any>;
          receivedAtMs: number;
          type: string;
          verified: boolean;
        }>,
        Name
      >;
      listUploads: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          assetId?: string;
          corsOrigin?: string;
          createdAtMs: number;
          deletedAtMs?: number;
          error?: Record<string, any>;
          muxUploadId: string;
          raw: Record<string, any>;
          status?: string;
          timeoutSeconds?: number;
          updatedAtMs: number;
          uploadUrl?: string;
        }>,
        Name
      >;
    };
    sync: {
      markAssetDeletedPublic: FunctionReference<
        "mutation",
        "internal",
        { muxAssetId: string },
        string | null,
        Name
      >;
      markLiveStreamDeletedPublic: FunctionReference<
        "mutation",
        "internal",
        { muxLiveStreamId: string },
        string | null,
        Name
      >;
      markUploadDeletedPublic: FunctionReference<
        "mutation",
        "internal",
        { muxUploadId: string },
        string | null,
        Name
      >;
      recordWebhookEventPublic: FunctionReference<
        "mutation",
        "internal",
        { event: Record<string, any>; verified: boolean },
        { alreadyProcessed: boolean; eventDocId: string },
        Name
      >;
      upsertAssetFromPayloadPublic: FunctionReference<
        "mutation",
        "internal",
        { asset: Record<string, any> },
        string,
        Name
      >;
      upsertLiveStreamFromPayloadPublic: FunctionReference<
        "mutation",
        "internal",
        { liveStream: Record<string, any> },
        string,
        Name
      >;
      upsertUploadFromPayloadPublic: FunctionReference<
        "mutation",
        "internal",
        { upload: Record<string, any> },
        string,
        Name
      >;
    };
    videos: {
      getVideoByMuxAssetId: FunctionReference<
        "query",
        "internal",
        { muxAssetId: string; userId?: string },
        null | {
          asset: {
            _creationTime: number;
            _id: string;
            aspectRatio?: string;
            createdAtMs: number;
            deletedAtMs?: number;
            durationSeconds?: number;
            liveStreamId?: string;
            maxStoredFrameRate?: number;
            maxStoredResolution?: string;
            muxAssetId: string;
            passthrough?: string;
            playbackIds?: Array<{ id: string; policy?: string }>;
            raw: Record<string, any>;
            status?: string;
            tracks?: Array<{
              id?: string;
              languageCode?: string;
              name?: string;
              status?: string;
              textType?: string;
              type?: string;
            }>;
            updatedAtMs: number;
            uploadId?: string;
          };
          metadata:
            | {
                _creationTime: number;
                _id: string;
                createdAtMs: number;
                custom?: Record<string, any>;
                description?: string;
                muxAssetId: string;
                tags?: Array<string>;
                title?: string;
                updatedAtMs: number;
                userId: string;
                visibility?: "private" | "unlisted" | "public";
              }
            | null
            | Array<{
                _creationTime: number;
                _id: string;
                createdAtMs: number;
                custom?: Record<string, any>;
                description?: string;
                muxAssetId: string;
                tags?: Array<string>;
                title?: string;
                updatedAtMs: number;
                userId: string;
                visibility?: "private" | "unlisted" | "public";
              }>;
        },
        Name
      >;
      listVideosForUser: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        Array<{
          asset: {
            _creationTime: number;
            _id: string;
            aspectRatio?: string;
            createdAtMs: number;
            deletedAtMs?: number;
            durationSeconds?: number;
            liveStreamId?: string;
            maxStoredFrameRate?: number;
            maxStoredResolution?: string;
            muxAssetId: string;
            passthrough?: string;
            playbackIds?: Array<{ id: string; policy?: string }>;
            raw: Record<string, any>;
            status?: string;
            tracks?: Array<{
              id?: string;
              languageCode?: string;
              name?: string;
              status?: string;
              textType?: string;
              type?: string;
            }>;
            updatedAtMs: number;
            uploadId?: string;
          } | null;
          metadata: {
            _creationTime: number;
            _id: string;
            createdAtMs: number;
            custom?: Record<string, any>;
            description?: string;
            muxAssetId: string;
            tags?: Array<string>;
            title?: string;
            updatedAtMs: number;
            userId: string;
            visibility?: "private" | "unlisted" | "public";
          };
        }>,
        Name
      >;
      upsertVideoMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          custom?: Record<string, any>;
          description?: string;
          muxAssetId: string;
          tags?: Array<string>;
          title?: string;
          userId: string;
          visibility?: "private" | "unlisted" | "public";
        },
        string,
        Name
      >;
    };
  };
