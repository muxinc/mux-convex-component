# @mux/convex-mux-init

Scaffold app-level Convex files for `@mux/convex`.

### Purpose

Convex component packages should stay component-only. App-specific Node wrappers
for backfills and webhooks belong in the consuming app.

This CLI creates those app files for you:

- `convex/convex.config.ts`
- `convex/migrations.ts`
- `convex/muxWebhook.ts`
- `convex/muxHttp.ts`
- `convex/http.ts` if your app does not already have one

### Install and usage

Install the runtime packages in your app:

```sh
npm i @mux/convex @mux/ts
```

Then run the scaffold CLI with `npx`, or install it as a dev dependency if you
prefer.

Run in your app root (the folder that contains `convex/`):

```sh
npx @mux/convex-mux-init@latest --component-name mux

# or
npm i -D @mux/convex-mux-init
npx convex-mux-init --component-name mux
```

Options:

```sh
npx @mux/convex-mux-init@latest --component-name mux
npx convex-mux-init --force
npx convex-mux-init --skip-config
npx convex-mux-init --skip-http
npx convex-mux-init --skip-migration
npx convex-mux-init --skip-webhook
```

Existing `convex/http.ts` is never overwritten, even with `--force`.

### Next Steps After Scaffolding

1. Install Mux SDK in your app:

```sh
npm i @mux/ts
```

2. If your app already had `convex/http.ts`, add the generated helper:

```ts
import { registerMuxHttpRoutes } from "./muxHttp";

registerMuxHttpRoutes(http);
```

3. Set env vars in Convex:

```sh
npx convex env set MUX_TOKEN_ID <id>
npx convex env set MUX_TOKEN_SECRET <secret>
npx convex env set MUX_WEBHOOK_SECRET <secret>
```

4. Run:

```sh
npx convex dev
npx convex run migrations:backfillMux '{}'
```

### Video Metadata From Upload Flow

Generated webhook/backfill code can auto-upsert `videoMetadata` from Mux asset
`passthrough`.

- If `passthrough` is a plain string, it is treated as `userId`.
- If `passthrough` is JSON, it may include:
  `userId` (or `user_id`), `title`, `description`, `tags`, `visibility`,
  and `custom`.

Example:

```json
{"userId":"user_123","title":"My clip","visibility":"public"}
```
