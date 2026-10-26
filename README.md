# Mux Convex Component

A reusable [Convex](https://convex.dev) component for apps that use [Mux](https://mux.com) for video. Sync your Mux video data with Convex and build video apps with a real-time database backing your catalog.

This package gives you:

- Convex tables for Mux `assets`, `uploads`, `liveStreams`, and `events`
- Mutations to upsert/delete synced Mux objects
- App-level `videoMetadata` storage (`userId`, title, visibility, tags, custom fields)
- Query helpers for catalog and user-facing video data
- A separate companion CLI package, `@mux/convex-mux-init`, to scaffold app-level Convex wrappers (`npx convex-mux-init`)

## Quickstart

### 1) Install packages

```sh
npm i @mux/convex @mux/ts
npm i -D @mux/convex-mux-init
```

`convex` (1.31.2 or later) and `@mux/ts` (15 or later) are peer dependencies, so
the component uses your app's copies.

If you prefer not to install the scaffold CLI, you can run it directly with
`npx`:

```sh
npx @mux/convex-mux-init@latest --component-name mux
```

### 2) Generate app-level Convex files

```sh
npx convex-mux-init --component-name mux

# or without installing it
npx @mux/convex-mux-init@latest --component-name mux
```

This creates:

- `convex/convex.config.ts`
- `convex/migrations.ts`
- `convex/muxWebhook.ts`
- `convex/muxHttp.ts`
- `convex/http.ts` if your app does not already have one

If files already exist, the CLI skips them unless you pass `--force`.
Existing `convex/http.ts` is never overwritten.

### 3) Set Mux API env vars in Convex

```sh
npx convex env set MUX_TOKEN_ID <your_mux_token_id>
npx convex env set MUX_TOKEN_SECRET <your_mux_token_secret>
```

### 4) Start Convex and run backfill

```sh
npx convex dev
npx convex run migrations:backfillMux '{}'
```

### 5) Register the webhook route

If `npx convex-mux-init` created `convex/http.ts` for you, this is already
done.

If your app already had `convex/http.ts`, wire the generated helper into your
existing router:

```ts
import { httpRouter } from "convex/server";
import { registerMuxHttpRoutes } from "./muxHttp";

const http = httpRouter();

registerMuxHttpRoutes(http);

export default http;
```

### 6) Configure Mux webhook endpoint

In the [Mux dashboard](https://dashboard.mux.com), create a webhook endpoint:

- URL for deployed app: `https://<your-deployment>.convex.site/mux/webhook`
- URL for local development: use a tunnel (e.g. ngrok or cloudflared) to `/mux/webhook`

Copy the webhook signing secret and set it in Convex:

```sh
npx convex env set MUX_WEBHOOK_SECRET <your_mux_webhook_secret>
```

The generated webhook route returns **401** for invalid signatures, **400** for
signed malformed payloads, and **500** for server failures. See
[webhook HTTP responses](scaffold/README.md#webhook-http-responses) for details and
how to update existing wrappers.

Track, static rendition, and simulcast target events re-sync their parent asset or
live stream when `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are set (step 3); without
them, those events are recorded in `events` but not applied. See
[child object events](scaffold/README.md#child-object-events).

### 7) Verify data in Convex dashboard

Tables to check:

- `assets`
- `uploads`
- `liveStreams`
- `events`
- `videoMetadata`

## Why both backfill and webhook?

- **Backfill** is a one-time catch-up for existing Mux objects.
- **Webhooks** keep your Convex tables updated in near real time as Mux state changes.

Without webhooks, data will drift over time.

## Runtime model

This follows Convex component best practices:

- `@mux/convex` is component-only (schema, queries, mutations)
- Node runtime integration (Mux SDK, webhook verification, backfill) lives in app-level code in your project
- `@mux/convex-mux-init` is the separate CLI package that scaffolds those app-level files for you

## Using a different component name

If you mount with a different name, for example:

```ts
app.use(mux, { name: "videoInfra" });
```

Then regenerate wrappers with the matching name:

```sh
npx convex-mux-init --component-name videoInfra --force
```

## Common commands

```sh
# regenerate wrappers
npx convex-mux-init --component-name mux --force

# run backfill with options
npx convex run migrations:backfillMux '{"maxAssets":500,"defaultUserId":"dev-user-1","includeVideoMetadata":true}'

# run against prod deployment
npx convex run --prod migrations:backfillMux '{"maxAssets":500}'
```

## Development

From a fresh checkout:

```sh
npm ci
npm run typecheck
npm test
```

These checks do not require a Convex deployment or Mux credentials. Webhook tests
use the real Mux SDK with locally signed payloads and mocked database calls.

The component's `_generated/` files are checked into Git and included in the
published package. `_generated/component.ts` holds the `ComponentApi` type that
apps on convex 1.35+ import from `@mux/convex/_generated/component.js` to type
`components.mux`. After adding, removing, or changing the args or `returns` of a
public function, regenerate and commit them:

```sh
npm run codegen
```

This stages the published component files in a scratch app under `.codegen/` and
runs `convex codegen --component-dir` against an isolated local deployment. It
needs no Convex account; the first run downloads the local backend. `npm test`
fails if `component.ts` is out of sync with the component's public functions.

CI runs typechecking and tests on pull requests and pushes to `main`, against both
the locked dependencies and the oldest versions allowed by `peerDependencies`. A
weekly job runs the same checks against the latest `convex` and `@mux/ts`.

## Troubleshooting

- **`components.mux` is `any`, or `Cannot find module '@mux/convex/_generated/component.js'`**: Upgrade `@mux/convex`. Versions before `_generated/component.ts` was published leave the component untyped in apps on convex 1.35+.
- **`Could not find function for 'migrations:backfillMux'`**: Ensure `convex/migrations.ts` exists and exports `backfillMux`, then run `npx convex dev`.
- **`InvalidReference ... does not export [mux_node.backfillAssets]`**: Do not call `components.<name>.mux_node.*` directly. Use the app-level wrappers generated by `npx convex-mux-init`.
- **TypeScript `webhooks.unwrap ... Record<string, unknown>`**: Regenerate wrappers with `npx convex-mux-init --force`.
- **TypeScript `request.headers.entries is not a function/property`**: Build headers with `request.headers.forEach(...)` in `convex/muxHttp.ts`.
- **Webhooks route compiles but never updates tables**: If `ingestMuxWebhook` is generated as `internalAction`, call it via `internal.muxWebhook.ingestMuxWebhook` (not `anyApi.*`).
- **`Node APIs without "use node"`**: Ensure Node runtime files start with `"use node";`.
- **Bundling fails on `node:fs` / `node:path` from `@mux/convex/bin/*`**: Upgrade to the split packages and use `@mux/convex-mux-init` as the separate scaffold CLI.
