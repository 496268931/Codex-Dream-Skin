import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const BALANCE_REFRESH_MS = 30_000;
export const BALANCE_CONFIG_CHECK_MS = 3_000;
export const BALANCE_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "#") return line.slice(0, index);
  }
  return line;
}

function parseTomlString(value, label) {
  const source = value.trim();
  if (source.startsWith('"') && source.endsWith('"')) {
    try {
      const parsed = JSON.parse(source);
      if (typeof parsed === "string") return parsed;
    } catch {}
  } else if (source.startsWith("'") && source.endsWith("'") && source.length >= 2) {
    return source.slice(1, -1);
  }
  throw new Error(`${label} must be a single-line TOML string`);
}

function providerTableName(line) {
  const bare = /^\[\s*model_providers\.([A-Za-z0-9_-]{1,80})\s*\]$/.exec(line);
  if (bare) return bare[1];
  const quoted = /^\[\s*model_providers\.("(?:[^"\\]|\\.)+")\s*\]$/.exec(line);
  if (!quoted) return null;
  try {
    const value = JSON.parse(quoted[1]);
    return typeof value === "string" && value.length <= 80 ? value : null;
  } catch {
    return null;
  }
}

export function parseCodexProviderConfig(content, environment = process.env) {
  if (typeof content !== "string" || content.includes("\0")) {
    throw new Error("Codex config must be strict text without NUL bytes");
  }
  let section = "";
  let selectedProvider = null;
  const providers = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      section = providerTableName(line) ?? "other";
      continue;
    }
    const setting = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!setting) continue;
    const [, key, rawValue] = setting;
    if (!section && key === "model_provider") {
      selectedProvider = parseTomlString(rawValue, "model_provider");
      continue;
    }
    if (!section || section === "other" ||
        !["name", "base_url", "experimental_bearer_token", "env_key"].includes(key)) continue;
    const provider = providers.get(section) ?? {};
    provider[key] = parseTomlString(rawValue, `model_providers.${section}.${key}`);
    providers.set(section, provider);
  }

  if (!selectedProvider) return { status: "hidden", fingerprint: "official" };
  const provider = providers.get(selectedProvider);
  if (!provider?.base_url) {
    return { status: "hidden", fingerprint: `official:${selectedProvider}` };
  }
  let baseUrl;
  try {
    const parsed = new URL(provider.base_url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("unsafe URL");
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    baseUrl = parsed.href.replace(/\/$/, "");
  } catch {
    return {
      status: "unsupported",
      provider: provider.name || selectedProvider,
      fingerprint: `invalid:${selectedProvider}`,
    };
  }
  const envKey = provider.env_key;
  const envToken = envKey && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(envKey)
    ? environment[envKey]
    : null;
  const token = provider.experimental_bearer_token || envToken || null;
  const tokenFingerprint = token
    ? createHash("sha256").update(token).digest("hex").slice(0, 16)
    : "missing";
  const host = new URL(baseUrl).hostname;
  return {
    status: token ? "ready" : "unsupported",
    provider: provider.name || (selectedProvider === "custom" ? host : selectedProvider),
    providerId: selectedProvider,
    baseUrl,
    token,
    fingerprint: createHash("sha256")
      .update(selectedProvider).update("\0").update(baseUrl).update("\0").update(tokenFingerprint)
      .digest("hex").slice(0, 20),
  };
}

function cleanProviderLabel(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/-\d{10,}$/, "");
  return normalized && normalized.length <= 80 && !/[\u0000-\u001f]/.test(normalized)
    ? normalized
    : fallback;
}

async function ccSwitchProviderLabel(settingsPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    return cleanProviderLabel(parsed?.currentProviderCodex, null);
  } catch {
    return null;
  }
}

export async function readCurrentProvider({
  configPath = path.join(os.homedir(), ".codex", "config.toml"),
  ccSwitchSettingsPath = path.join(os.homedir(), ".cc-switch", "settings.json"),
  environment = process.env,
} = {}) {
  let content;
  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "hidden", fingerprint: "missing-config" };
    throw error;
  }
  const provider = parseCodexProviderConfig(content, environment);
  if (provider.status !== "hidden" && provider.providerId === "custom") {
    provider.provider = await ccSwitchProviderLabel(ccSwitchSettingsPath) || provider.provider;
  }
  return provider;
}

export function balanceEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  const pathName = url.pathname.replace(/\/+$/, "");
  url.pathname = `${pathName.endsWith("/v1") ? pathName : `${pathName}/v1`}/usage`
    .replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.href;
}

async function readLimitedJson(response) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Balance response is too large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Balance response is too large");
  }
  return JSON.parse(text);
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export async function queryProviderBalance(provider, {
  fetchImpl = globalThis.fetch,
  signal = null,
  timeoutMs = BALANCE_TIMEOUT_MS,
} = {}) {
  if (provider?.status !== "ready" || !provider.token || !provider.baseUrl) {
    throw new Error("Provider does not have a supported balance configuration");
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener?.("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Balance request timed out")), timeoutMs);
  try {
    const response = await fetchImpl(balanceEndpoint(provider.baseUrl), {
      method: "GET",
      headers: { Authorization: `Bearer ${provider.token}`, Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Balance endpoint returned HTTP ${response.status}`);
    const body = await readLimitedJson(response);
    if (body?.is_active === false || body?.isValid === false) {
      throw new Error("Provider reports that the credential is inactive");
    }
    const remaining = numberValue(body?.remaining ?? body?.quota?.remaining ?? body?.balance);
    if (remaining === null) throw new Error("Balance response does not contain a remaining amount");
    const rawUnit = body?.unit ?? body?.quota?.unit ?? "USD";
    const unit = typeof rawUnit === "string" && /^[A-Za-z0-9._-]{1,12}$/.test(rawUnit.trim())
      ? rawUnit.trim().toUpperCase()
      : "USD";
    return { remaining, unit };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", abort);
  }
}

function publicState(state) {
  return {
    status: state.status,
    provider: state.provider ?? "",
    remaining: typeof state.remaining === "number" && Number.isFinite(state.remaining)
      ? state.remaining
      : null,
    unit: typeof state.unit === "string" ? state.unit : "USD",
    fetchedAt: Number.isFinite(state.fetchedAt) ? state.fetchedAt : null,
  };
}

export function createProviderBalanceMonitor({
  readProvider = readCurrentProvider,
  queryBalance = queryProviderBalance,
  onUpdate = () => {},
  refreshMs = BALANCE_REFRESH_MS,
  configCheckMs = BALANCE_CONFIG_CHECK_MS,
} = {}) {
  let provider = null;
  let state = publicState({ status: "hidden" });
  let generation = 0;
  let nextConfigCheckAt = 0;
  let nextRefreshAt = 0;
  let request = null;
  let stopped = false;

  const emit = (next) => {
    state = publicState(next);
    onUpdate(state);
  };
  const startQuery = (now) => {
    if (request || stopped || provider?.status !== "ready") return;
    const requestGeneration = generation;
    const requestProvider = provider;
    const controller = new AbortController();
    request = { controller, generation: requestGeneration };
    nextRefreshAt = now + refreshMs;
    queryBalance(requestProvider, { signal: controller.signal }).then((result) => {
      if (stopped || generation !== requestGeneration) return;
      emit({
        status: "ok",
        provider: requestProvider.provider,
        remaining: result.remaining,
        unit: result.unit,
        fetchedAt: Date.now(),
      });
    }).catch(() => {
      if (stopped || generation !== requestGeneration) return;
      emit({
        ...state,
        status: state.remaining === null ? "error" : "stale",
        provider: requestProvider.provider,
      });
    }).finally(() => {
      if (request?.generation === requestGeneration) request = null;
    });
  };

  return {
    get state() { return state; },
    async tick(now = Date.now()) {
      if (stopped) return;
      if (now >= nextConfigCheckAt) {
        nextConfigCheckAt = now + configCheckMs;
        let nextProvider;
        try {
          nextProvider = await readProvider();
        } catch {
          nextProvider = { status: "unsupported", provider: "API", fingerprint: "read-error" };
        }
        if (!provider || nextProvider.fingerprint !== provider.fingerprint) {
          generation += 1;
          request?.controller.abort();
          request = null;
          provider = nextProvider;
          nextRefreshAt = 0;
          if (provider.status === "hidden") emit({ status: "hidden" });
          else if (provider.status === "ready") emit({ status: "loading", provider: provider.provider });
          else emit({ status: "unsupported", provider: provider.provider });
        } else {
          provider = { ...provider, provider: nextProvider.provider };
        }
      }
      if (now >= nextRefreshAt) startQuery(now);
    },
    stop() {
      stopped = true;
      generation += 1;
      request?.controller.abort();
      request = null;
    },
  };
}
