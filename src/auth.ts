import { getBooleanFlag, getStringFlag } from "./args";
import { apiBaseUrl, mcpUrl, readConfig, writeConfig } from "./config";
import { ENDPOINTS, MCP_TOOLS } from "./constants";
import { requestJson } from "./http";
import {
  deleteKeychainApiKey,
  deleteKeychainOAuthSecret,
  keychainAvailable,
  readKeychainApiKey,
  readKeychainOAuthSecret,
  writeKeychainApiKey,
  writeKeychainOAuthSecret,
} from "./keychain";
import { callMcpTool } from "./mcp";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  fetchOAuthMetadata,
  openUrl,
  randomOAuthValue,
  registerOAuthClient,
  startOAuthCallbackServer,
  tokenResponseToOAuthSecret,
} from "./oauth";
import type { Config, Credential, CredentialStore, OAuthSecret, ParsedArgs, AuthType } from "./types";
import { isRecord } from "./utils";

export async function loadCredential(): Promise<Credential> {
  const envKey = process.env.MOBBIN_API_KEY?.trim();
  const config = await readConfig();
  if (envKey) return { token: envKey, authType: "api_key", source: "env", config };

  if (config.authType === "api_key") {
    const apiKey = await loadApiKey(config);
    if (apiKey) return { token: apiKey.token, authType: "api_key", source: apiKey.source, config };
  }

  const oauth = await loadOAuthCredential(config);
  if (oauth) return oauth;

  const apiKey = await loadApiKey(config);
  if (apiKey) return { token: apiKey.token, authType: "api_key", source: apiKey.source, config };

  throw new Error(
    "Mobbin is not logged in. Run `mobbin login` or set MOBBIN_API_KEY.",
  );
}

async function loadApiKey(config: Config): Promise<{ token: string; source: "keychain" | "file" } | undefined> {
  if (config.credentialStore === "keychain") {
    const key = await readKeychainApiKey();
    if (key) return { token: key, source: "keychain" };
  }

  if (config.apiKey) {
    return { token: config.apiKey, source: "file" };
  }

  const keychainKey = await readKeychainApiKey();
  if (keychainKey) {
    return { token: keychainKey, source: "keychain" };
  }

  return undefined;
}

async function loadOAuthCredential(config: Config): Promise<Credential | undefined> {
  const oauth = await loadOAuthSecret(config);
  if (!oauth) return undefined;
  const refreshed = await refreshOAuthSecretIfNeeded(oauth, config);
  return {
    token: refreshed.secret.accessToken,
    authType: "oauth",
    source: refreshed.source,
    config: refreshed.config,
  };
}

async function loadOAuthSecret(config: Config): Promise<{ secret: OAuthSecret; source: "keychain" | "file" } | undefined> {
  if (config.credentialStore === "keychain" || !config.credentialStore) {
    const rawSecret = await readKeychainOAuthSecret();
    const secret = rawSecret ? parseOAuthSecret(rawSecret) : undefined;
    if (secret) return { secret, source: "keychain" };
  }

  if (config.oauth?.type === "oauth") {
    return { secret: config.oauth, source: "file" };
  }

  return undefined;
}

function parseOAuthSecret(value: string): OAuthSecret | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return undefined;
    if (parsed.type !== "oauth") return undefined;
    if (typeof parsed.accessToken !== "string") return undefined;
    if (typeof parsed.clientId !== "string") return undefined;
    return {
      type: "oauth",
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
      clientId: parsed.clientId,
    };
  } catch {
    return undefined;
  }
}

async function refreshOAuthSecretIfNeeded(
  current: { secret: OAuthSecret; source: "keychain" | "file" },
  config: Config,
): Promise<{ secret: OAuthSecret; source: "keychain" | "file"; config: Config }> {
  if (!current.secret.refreshToken || !current.secret.expiresAt) {
    return { ...current, config };
  }

  const refreshSkewMs = 60_000;
  if (Date.now() < current.secret.expiresAt - refreshSkewMs) {
    return { ...current, config };
  }

  const metadata = await fetchOAuthMetadata();
  const tokens = await exchangeRefreshToken(metadata, current.secret);
  const nextSecret = tokenResponseToOAuthSecret(tokens, current.secret.clientId);
  const nextConfig = {
    ...config,
    authType: "oauth" as const,
    credentialStore: current.source,
    updatedAt: new Date().toISOString(),
  };

  await storeOAuthSecret(nextSecret, current.source, nextConfig);
  return { secret: nextSecret, source: current.source, config: nextConfig };
}

export async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function pickStore(raw: string | undefined): CredentialStore | undefined {
  if (!raw) return undefined;
  if (raw === "keychain" || raw === "file") return raw;
  throw new Error("--store must be keychain or file");
}

export async function loginWithApiKey(apiKey: string, flags: ParsedArgs["flags"]): Promise<CredentialStore> {
  if (!apiKey) throw new Error("No API key provided.");

  const currentConfig = await readConfig();
  const store =
    pickStore(getStringFlag(flags, "store")) ??
    ((await keychainAvailable()) ? "keychain" : "file");

  const nextConfig: Config = {
    ...currentConfig,
    apiBaseUrl: apiBaseUrl(currentConfig),
    authType: "api_key",
    credentialStore: store,
    updatedAt: new Date().toISOString(),
  };
  delete nextConfig.oauth;

  if (!getBooleanFlag(flags, "no-validate")) {
    await validateCredentialToken(apiKey, "api_key", nextConfig);
  }

  await deleteKeychainOAuthSecret();
  if (store === "keychain") {
    await writeKeychainApiKey(apiKey);
    delete nextConfig.apiKey;
  } else {
    await deleteKeychainApiKey();
    nextConfig.apiKey = apiKey;
  }

  await writeConfig(nextConfig);
  return store;
}

export async function loginWithOAuth(flags: ParsedArgs["flags"]): Promise<CredentialStore> {
  const currentConfig = await readConfig();
  const store =
    pickStore(getStringFlag(flags, "store")) ??
    ((await keychainAvailable()) ? "keychain" : "file");
  const metadata = await fetchOAuthMetadata();
  const { redirectUri, waitForCode, stop } = startOAuthCallbackServer();
  let secret: OAuthSecret | undefined;

  try {
    const client = await registerOAuthClient(metadata, redirectUri);
    const codeVerifier = randomOAuthValue();
    const state = randomOAuthValue();
    const authUrl = buildAuthorizationUrl(metadata, {
      clientId: client.client_id,
      redirectUri,
      codeVerifier,
      state,
    });

    const dryRun = getBooleanFlag(flags, "dry-run");
    const printUrl = getBooleanFlag(flags, "print-url");
    if (dryRun || printUrl) {
      process.stderr.write("Mobbin login URL:\n");
      process.stdout.write(`${authUrl}\n`);
    } else {
      process.stderr.write(`Opening Mobbin login in your browser...\n${authUrl}\n`);
    }
    if (dryRun) {
      process.stderr.write("Mobbin OAuth login URL generated. Rerun without --dry-run to complete login.\n");
      return store;
    }

    const codePromise = waitForCode(state);
    if (!printUrl) {
      await openUrl(authUrl);
    }

    const code = await codePromise;
    const tokens = await exchangeAuthorizationCode(metadata, {
      clientId: client.client_id,
      redirectUri,
      codeVerifier,
      code,
    });
    secret = tokenResponseToOAuthSecret(tokens, client.client_id);
  } finally {
    stop();
  }

  if (!secret) {
    throw new Error("Mobbin OAuth login did not complete.");
  }

  const nextConfig: Config = {
    ...currentConfig,
    apiBaseUrl: apiBaseUrl(currentConfig),
    authType: "oauth",
    credentialStore: store,
    updatedAt: new Date().toISOString(),
  };
  delete nextConfig.apiKey;

  if (!getBooleanFlag(flags, "no-validate")) {
    await validateCredentialToken(secret.accessToken, "oauth", nextConfig);
  }

  await deleteKeychainApiKey();
  if (store === "file") {
    await deleteKeychainOAuthSecret();
  }
  await storeOAuthSecret(secret, store, nextConfig);
  return store;
}

async function storeOAuthSecret(
  secret: OAuthSecret,
  store: CredentialStore,
  config: Config,
): Promise<void> {
  const nextConfig = { ...config };
  delete nextConfig.apiKey;

  if (store === "keychain") {
    await writeKeychainOAuthSecret(secret);
    delete nextConfig.oauth;
  } else {
    nextConfig.oauth = secret;
  }

  await writeConfig(nextConfig);
}

export async function validateCredentialToken(token: string, authType: AuthType, config: Config): Promise<void> {
  if (authType === "oauth") {
    await callMcpTool({
      token,
      mcpUrl: mcpUrl(config),
      toolName: MCP_TOOLS.screens,
      arguments: {
        query: "login screen",
        platform: "ios",
        limit: 1,
        mode: "standard",
      },
    });
    return;
  }

  await requestJson({
    token,
    baseUrl: apiBaseUrl(config),
    endpoint: ENDPOINTS.screens,
    body: {
      query: "login screen",
      platform: "ios",
      limit: 1,
      mode: "standard",
      format: "optimized",
    },
  });
}
