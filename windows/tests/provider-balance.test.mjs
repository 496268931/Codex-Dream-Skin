import assert from "node:assert/strict";
import vm from "node:vm";
import {
  balanceEndpoint,
  createProviderBalanceMonitor,
  parseCodexProviderConfig,
  queryProviderBalance,
} from "../scripts/provider-balance.mjs";
import { balancePayloadFor } from "../scripts/injector.mjs";

const direct = parseCodexProviderConfig(`
model_provider = "custom"
model = "gpt-test"

[model_providers.custom]
name = "Fixture Relay"
base_url = "https://relay.example/v1/"
wire_api = "responses"
experimental_bearer_token = "fixture-secret-token" # preserved only in the daemon
`);
assert.equal(direct.status, "ready");
assert.equal(direct.provider, "Fixture Relay");
assert.equal(direct.baseUrl, "https://relay.example/v1");
assert.equal(direct.token, "fixture-secret-token");
assert.equal(balanceEndpoint(direct.baseUrl), "https://relay.example/v1/usage");

const fromEnvironment = parseCodexProviderConfig(`
model_provider = 'relay'
[model_providers.relay]
base_url = 'https://relay.example/api'
env_key = 'RELAY_TOKEN'
`, { RELAY_TOKEN: "environment-secret" });
assert.equal(fromEnvironment.token, "environment-secret");
assert.equal(balanceEndpoint(fromEnvironment.baseUrl), "https://relay.example/api/v1/usage");

const official = parseCodexProviderConfig('model_provider = "openai"\n');
assert.equal(official.status, "hidden");

let requestedUrl = null;
let requestedAuthorization = null;
const queried = await queryProviderBalance(direct, {
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    requestedAuthorization = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async text() { return JSON.stringify({ quota: { remaining: "73.81", unit: "usd" } }); },
    };
  },
});
assert.equal(requestedUrl, "https://relay.example/v1/usage");
assert.equal(requestedAuthorization, "Bearer fixture-secret-token");
assert.deepEqual(queried, { remaining: 73.81, unit: "USD" });

const updates = [];
let selected = 0;
let resolveOldRequest;
const providers = [
  { status: "ready", provider: "Old Relay", baseUrl: "https://old.example", token: "old", fingerprint: "old" },
  { status: "ready", provider: "New Relay", baseUrl: "https://new.example", token: "new", fingerprint: "new" },
];
const monitor = createProviderBalanceMonitor({
  readProvider: async () => providers[selected],
  queryBalance: async (provider) => {
    if (provider.fingerprint === "old") {
      return new Promise((resolve) => { resolveOldRequest = resolve; });
    }
    return { remaining: 42.5, unit: "USD" };
  },
  onUpdate: (state) => updates.push(state),
  refreshMs: 30_000,
  configCheckMs: 1,
});
await monitor.tick(0);
assert.equal(monitor.state.status, "loading");
selected = 1;
await monitor.tick(2);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(monitor.state.status, "ok");
assert.equal(monitor.state.provider, "New Relay");
assert.equal(monitor.state.remaining, 42.5);
resolveOldRequest({ remaining: 999, unit: "USD" });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(monitor.state.provider, "New Relay", "A late response from the old provider must be ignored.");
assert.equal(monitor.state.remaining, 42.5);
monitor.stop();

const publicPayload = balancePayloadFor({
  status: "ok",
  provider: "Fixture Relay",
  remaining: 73.81,
  unit: "USD",
  fetchedAt: 123,
  token: "must-never-enter-renderer",
});
assert.doesNotMatch(publicPayload, /must-never-enter-renderer|fixture-secret-token/);
const dispatched = [];
const context = {
  window: {
    dispatchEvent(event) { dispatched.push(event); },
  },
  CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  },
};
vm.runInNewContext(publicPayload, context);
assert.equal(context.window.__CODEX_DREAM_SKIN_BALANCE__.remaining, 73.81);
assert.equal(dispatched[0].type, "codex-dream-skin-balance");

assert.ok(updates.some((state) => state.status === "loading" && state.provider === "Old Relay"));
assert.ok(updates.some((state) => state.status === "loading" && state.provider === "New Relay"));
console.log("PASS: provider balance parsing, querying, switching, and renderer redaction are safe.");
