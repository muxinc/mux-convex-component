import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { actionGeneric, internalActionGeneric, httpActionGeneric, httpRouter, anyApi, getFunctionName } from "convex/server";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const secret = "local-webhook-regression-test-secret";
const project = mkdtempSync(join(tmpdir(), "mux-webhooks-"));
const envKeys = ["MUX_WEBHOOK_SECRET", "MUX_TOKEN_ID", "MUX_TOKEN_SECRET"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.MUX_WEBHOOK_SECRET = secret;
// API credentials are opted into per test.
delete process.env.MUX_TOKEN_ID;
delete process.env.MUX_TOKEN_SECRET;
after(() => {
  rmSync(project, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
mkdirSync(join(project, "convex"));
execFileSync(process.execPath, [join(root, "scaffold/bin/convex-mux-init.mjs")], {
  cwd: project,
});

// Execute the actual TypeScript handlers with the real Mux SDK and Convex
// registration helpers. Only generated references and database calls are faked;
// no deployment, generated files, network, or production secrets are required.
function loadModule(file, overrides = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: file,
  });
  const module = { exports: {} };
  const testRequire = (id) => {
    if (id in overrides) return overrides[id];
    if (id === "./_generated/server") {
      return { action: actionGeneric, internalAction: internalActionGeneric, httpAction: httpActionGeneric };
    }
    if (id === "./_generated/api") {
      return { api: anyApi, internal: anyApi, components: { mux: anyApi } };
    }
    return require(id);
  };
  new Function("require", "module", "exports", outputText)(testRequire, module, module.exports);
  return module.exports;
}

function loadHandler(file, exportName) {
  return loadModule(file)[exportName]._handler;
}

function signedHeaders(body, { key = secret, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const signature = createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
  // Mixed casing exercises each handler's header normalization.
  return { "Mux-Signature": `t=${timestamp},v1=${signature}` };
}

function event(type = "video.asset.ready") {
  return {
    id: "event-test",
    type,
    created_at: new Date().toISOString(),
    data: {
      id: "object-test",
      status: "ready",
      passthrough: JSON.stringify({ userId: "user-test", title: "Test video" }),
    },
  };
}

function childEvent(type, data) {
  return { id: `event-${type}`, type, created_at: new Date().toISOString(), data };
}

const implementations = [
  {
    name: "component",
    file: join(root, "mux.node.ts"),
    exportName: "ingestWebhook",
    suffix: "",
    credentials: { args: { muxTokenId: "token-id", muxTokenSecret: "token-secret" }, env: {} },
  },
  {
    name: "generated scaffold",
    file: join(project, "convex/muxWebhook.ts"),
    exportName: "ingestMuxWebhook",
    suffix: "Public",
    credentials: { args: {}, env: { MUX_TOKEN_ID: "token-id", MUX_TOKEN_SECRET: "token-secret" } },
  },
].map((implementation) => ({
  ...implementation,
  handler: loadHandler(implementation.file, implementation.exportName),
}));

// The real SDK (so signatures are still verified) with API retrieval stubbed.
const RealMux = require("@mux/ts").default;
const parents = {
  "asset-parent": { id: "asset-parent", status: "ready", tracks: [{ id: "track-test", type: "text", status: "ready" }] },
  "stream-parent": { id: "stream-parent", status: "idle" },
};
class StubbedMux extends RealMux {
  constructor(options) {
    super(options);
    const retrieve = async (id) => {
      if (!(id in parents)) throw new RealMux.NotFoundError(404, {}, "Not Found", new Headers());
      return parents[id];
    };
    this.video = { assets: { retrieve }, liveStreams: { retrieve } };
  }
}

async function invokeWithCredentials(implementation, payload) {
  const handler = loadModule(implementation.file, { "@mux/ts": StubbedMux })[implementation.exportName]._handler;
  const { args, env } = implementation.credentials;
  Object.assign(process.env, env);
  try {
    const body = JSON.stringify(payload);
    const { calls, promise } = invoke({ ...implementation, handler }, body, signedHeaders(body), args);
    return { calls, result: await promise };
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
  }
}

const track = { id: "track-test", asset_id: "asset-parent", type: "text", status: "ready" };
const rendition = { id: "rendition-test", asset_id: "asset-parent", name: "highest.mp4", status: "ready" };
const simulcastTarget = { id: "target-test", live_stream_id: "stream-parent", status: "idle", url: "rtmps://example.test/live" };
const childEvents = [
  ["video.asset.track.ready", track, "upsertAssetFromPayload", "asset", "asset-parent"],
  ["video.asset.track.deleted", { ...track, status: "deleted" }, "upsertAssetFromPayload", "asset", "asset-parent"],
  ["video.asset.static_rendition.ready", rendition, "upsertAssetFromPayload", "asset", "asset-parent"],
  ["video.asset.static_rendition.deleted", rendition, "upsertAssetFromPayload", "asset", "asset-parent"],
  ["video.live_stream.simulcast_target.idle", simulcastTarget, "upsertLiveStreamFromPayload", "liveStream", "stream-parent"],
  ["video.live_stream.simulcast_target.deleted", simulcastTarget, "upsertLiveStreamFromPayload", "liveStream", "stream-parent"],
];

function invoke(implementation, body, headers = signedHeaders(body), extra = {}, alreadyProcessed = false) {
  const calls = [];
  const ctx = {
    async runMutation(ref, args) {
      // A Promise here was the original regression: require a real JSON payload.
      assert.equal(typeof args.event?.then, "undefined");
      calls.push({ name: getFunctionName(ref), args });
      return { alreadyProcessed };
    },
  };
  const promise = implementation.handler(ctx, {
    rawBody: body,
    headers,
    webhookSecret: secret,
    ...extra,
  });
  return { calls, promise };
}

for (const implementation of implementations) {
  const { name, suffix } = implementation;
  test(`${name}: valid signed asset is recorded and dispatched with metadata`, async () => {
    const payload = event();
    const { calls, promise } = invoke(implementation, JSON.stringify(payload));
    assert.equal((await promise).skipped, false);
    assert.deepEqual(calls.map((call) => call.name), [
      `sync:recordWebhookEvent${suffix}`,
      `sync:upsertAssetFromPayload${suffix}`,
      "videos:upsertVideoMetadata",
    ]);
    assert.deepEqual(calls[0].args, { event: payload, verified: true });
    assert.deepEqual(calls[1].args, { asset: payload.data });
    assert.equal(calls[2].args.muxAssetId, payload.data.id);
    assert.equal(calls[2].args.userId, "user-test");
    assert.equal(calls[2].args.title, "Test video");
  });

  for (const [type, mutation, argument] of [
    ["video.asset.deleted", "markAssetDeleted", "muxAssetId"],
    ["video.live_stream.deleted", "markLiveStreamDeleted", "muxLiveStreamId"],
    ["video.upload.deleted", "markUploadDeleted", "muxUploadId"],
    ["video.live_stream.active", "upsertLiveStreamFromPayload", "liveStream"],
    ["video.upload.created", "upsertUploadFromPayload", "upload"],
  ]) {
    test(`${name}: routes ${type}`, async () => {
      const payload = event(type);
      const { calls, promise } = invoke(implementation, JSON.stringify(payload));
      assert.equal((await promise).skipped, false);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].name, `sync:${mutation}${suffix}`);
      assert.deepEqual(calls[1].args, {
        [argument]: type.endsWith(".deleted") ? payload.data.id : payload.data,
      });
    });
  }

  // Their data is the asset, so they must not be treated as asset deletion.
  for (const type of ["video.asset.master.deleted", "video.asset.static_renditions.deleted"]) {
    test(`${name}: ${type} updates the asset instead of deleting it`, async () => {
      const payload = event(type);
      const { calls, promise } = invoke(implementation, JSON.stringify(payload));
      assert.equal((await promise).skipped, false);
      assert.deepEqual(calls.map((call) => call.name), [
        `sync:recordWebhookEvent${suffix}`,
        `sync:upsertAssetFromPayload${suffix}`,
        "videos:upsertVideoMetadata",
      ]);
      assert.deepEqual(calls[1].args, { asset: payload.data });
    });
  }

  for (const [type, data, mutation, argument, parentId] of childEvents) {
    test(`${name}: ${type} without API credentials only records the event`, async () => {
      const payload = childEvent(type, data);
      const { calls, promise } = invoke(implementation, JSON.stringify(payload));
      assert.equal((await promise).skipped, true);
      assert.deepEqual(calls.map((call) => call.name), [`sync:recordWebhookEvent${suffix}`]);
    });

    test(`${name}: ${type} with API credentials re-syncs the parent`, async () => {
      const { calls, result } = await invokeWithCredentials(implementation, childEvent(type, data));
      assert.equal(result.skipped, false);
      assert.deepEqual(calls.map((call) => call.name), [
        `sync:recordWebhookEvent${suffix}`,
        `sync:${mutation}${suffix}`,
      ]);
      assert.deepEqual(calls[1].args, { [argument]: parents[parentId] });
    });
  }

  test(`${name}: child event for a deleted parent is skipped`, async () => {
    const payload = childEvent("video.asset.track.ready", { ...track, asset_id: "asset-gone" });
    const { calls, result } = await invokeWithCredentials(implementation, payload);
    assert.equal(result.skipped, true);
    assert.deepEqual(calls.map((call) => call.name), [`sync:recordWebhookEvent${suffix}`]);
  });

  const body = JSON.stringify(event());
  for (const [label, rawBody, headers, error] of [
    ["wrong secret", body, signedHeaders(body, { key: "wrong-secret" }), /No signatures found/],
    ["tampered body", body + " ", signedHeaders(body), /No signatures found/],
    ["missing signature", body, {}, /mux-signature header/],
    ["malformed signature", body, { "mux-signature": "invalid" }, /Unable to extract/],
    ["missing v1 signature", body, { "mux-signature": `t=${Math.floor(Date.now() / 1000)}` }, /No v1 signatures/],
    ["expired timestamp", body, signedHeaders(body, { timestamp: Math.floor(Date.now() / 1000) - 600 }), /timestamp is too old/],
    ["signed invalid JSON", "{", signedHeaders("{"), SyntaxError],
  ]) {
    test(`${name}: rejects ${label} before any mutation`, async () => {
      const { calls, promise } = invoke(implementation, rawBody, headers);
      if (name === "generated scaffold") {
        assert.deepEqual(await promise, {
          error: error === SyntaxError ? "invalid_payload" : "invalid_signature",
        });
      } else {
        await assert.rejects(promise, error);
      }
      assert.deepEqual(calls, []);
    });
  }

  for (const payload of [event("unrecognized.event"), { id: "event-no-data", type: "video.asset.ready" }]) {
    test(`${name}: records but skips ${payload.type === "unrecognized.event" ? "unsupported event" : "missing data"}`, async () => {
      const { calls, promise } = invoke(implementation, JSON.stringify(payload));
      assert.equal((await promise).skipped, true);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].args, { event: payload, verified: true });
    });
  }
}

test("component: duplicate event skips further mutations", async () => {
  const body = JSON.stringify(event());
  const { calls, promise } = invoke(implementations[0], body, signedHeaders(body), {}, true);
  assert.equal((await promise).skipped, true);
  assert.equal(calls.length, 1);
});

test("component: explicit verification bypass records event as unverified", async () => {
  const { calls, promise } = invoke(implementations[0], JSON.stringify(event()), {}, { verifySignature: false });
  assert.equal((await promise).skipped, false);
  assert.equal(calls[0].args.verified, false);
});

const router = httpRouter();
loadModule(join(project, "convex/muxHttp.ts")).registerMuxHttpRoutes(router);
const httpHandler = router.lookup("/mux/webhook", "POST")[0]._handler;

function invokeHttp(body, headers = signedHeaders(body), options = {}) {
  const calls = [];
  const ctx = {
    async runMutation(ref, args) {
      calls.push({ name: getFunctionName(ref), args });
      if (options.mutationError) throw options.mutationError;
      return { alreadyProcessed: false };
    },
  };
  const promise = httpHandler({
    async runAction(ref, args) {
      assert.equal(getFunctionName(ref), "muxWebhook:ingestMuxWebhook");
      const result = await (options.handler ?? implementations[1].handler)(ctx, args);
      // Simulate Convex serialization between the Node action and HTTP action.
      return JSON.parse(JSON.stringify(result));
    },
  }, new Request("https://example.test/mux/webhook", { method: "POST", headers, body }));
  return { calls, promise };
}

test("HTTP: valid signed webhook returns 200 and syncs", async () => {
  const payload = event();
  const { calls, promise } = invokeHttp(JSON.stringify(payload));
  const response = await promise;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { skipped: false });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args, { event: payload, verified: true });
});

const httpBody = JSON.stringify(event());
for (const [label, body, headers, status, error] of [
  ["wrong secret", httpBody, signedHeaders(httpBody, { key: "wrong" }), 401, "invalid_signature"],
  ["tampered body", httpBody + " ", signedHeaders(httpBody), 401, "invalid_signature"],
  ["missing signature", httpBody, {}, 401, "invalid_signature"],
  ["malformed signature", httpBody, { "mux-signature": "invalid" }, 401, "invalid_signature"],
  ["missing v1 signature", httpBody, { "mux-signature": `t=${Math.floor(Date.now() / 1000)}` }, 401, "invalid_signature"],
  ["expired timestamp", httpBody, signedHeaders(httpBody, { timestamp: Math.floor(Date.now() / 1000) - 600 }), 401, "invalid_signature"],
  ["signed invalid JSON", "{", signedHeaders("{"), 400, "invalid_payload"],
  ["unsigned invalid JSON", "{", {}, 401, "invalid_signature"],
  ...["null", "[]", "42", '"text"', "true"].map((body) => [
    `signed non-object ${body}`, body, signedHeaders(body), 400, "invalid_payload",
  ]),
]) {
  test(`HTTP: ${label} returns ${status} without writes`, async () => {
    const { calls, promise } = invokeHttp(body, headers);
    const response = await promise;
    assert.equal(response.status, status);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(calls, []);
  });
}

test("HTTP: missing configuration propagates as a server failure", async () => {
  delete process.env.MUX_WEBHOOK_SECRET;
  try {
    const { calls, promise } = invokeHttp(httpBody);
    await assert.rejects(promise, /Missing env var: MUX_WEBHOOK_SECRET/);
    assert.deepEqual(calls, []);
  } finally {
    process.env.MUX_WEBHOOK_SECRET = secret;
  }
});

test("HTTP: database errors propagate even if their message resembles a signature error", async () => {
  const failure = new Error("No v1 signatures found");
  const { promise } = invokeHttp(httpBody, signedHeaders(httpBody), { mutationError: failure });
  // Convex turns uncaught server errors into 500 responses; don't map these to 4xx.
  await assert.rejects(promise, (error) => error === failure);
});

test("HTTP: unexpected SDK/crypto errors remain server failures", async () => {
  const failure = new Error("Crypto service unavailable");
  const handler = loadModule(join(project, "convex/muxWebhook.ts"), {
    "@mux/ts": class {
      webhooks = { unwrap: async () => { throw failure; } };
    },
  }).ingestMuxWebhook._handler;
  const { calls, promise } = invokeHttp(httpBody, signedHeaders(httpBody), { handler });
  await assert.rejects(promise, (error) => error === failure);
  assert.deepEqual(calls, []);
});
