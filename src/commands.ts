import { getBooleanFlag, getStringFlag } from "./args";
import { apiBaseUrl, mcpUrl, removeConfig } from "./config";
import { CONFIG_FILE, DEFAULT_API_BASE_URL, ENDPOINTS, MCP_TOOLS, VERSION } from "./constants";
import { requestJson } from "./http";
import {
  deleteKeychainApiKey,
  deleteKeychainOAuthSecret,
} from "./keychain";
import { callMcpTool } from "./mcp";
import { printJsonOrText } from "./output";
import {
  buildMcpArguments,
  buildSearchBody,
  printSearchResults,
  queryFromPositionals,
  searchKind,
  withDownloadedImages,
} from "./search";
import {
  loadCredential,
  loginWithApiKey,
  loginWithOAuth,
  readStdin,
  validateCredentialToken,
} from "./auth";
import type { ParsedArgs } from "./types";
import { redactSecret, errorMessage } from "./utils";

export async function commandLogin(flags: ParsedArgs["flags"]): Promise<void> {
  const fromFlag = getStringFlag(flags, "api-key");
  const fromEnv = process.env.MOBBIN_API_KEY?.trim();
  const fromStdin = getBooleanFlag(flags, "stdin") ? (await readStdin()).trim() : undefined;
  const apiKey = (fromFlag || fromEnv || fromStdin || "").trim();

  if (apiKey) {
    const store = await loginWithApiKey(apiKey, flags);
    process.stdout.write(`Mobbin API-key login saved (${store}).\n`);
    return;
  }

  const store = await loginWithOAuth(flags);
  if (!getBooleanFlag(flags, "dry-run")) {
    process.stdout.write(`Mobbin OAuth login saved (${store}).\n`);
  }
}

export async function commandLogout(): Promise<void> {
  await deleteKeychainApiKey();
  await deleteKeychainOAuthSecret();
  await removeConfig();
  process.stdout.write("Mobbin login removed.\n");
}

export async function commandStatus(flags: ParsedArgs["flags"]): Promise<void> {
  const json = getBooleanFlag(flags, "json");
  try {
    const credential = await loadCredential();
    const check = getBooleanFlag(flags, "check");
    const payload: Record<string, unknown> = {
      loggedIn: true,
      authType: credential.authType,
      source: credential.source,
      token: redactSecret(credential.token),
      configFile: CONFIG_FILE,
      apiBaseUrl: apiBaseUrl(credential.config),
    };
    if (check) {
      await validateCredentialToken(credential.token, credential.authType, credential.config);
      payload.check = "ok";
    }
    printJsonOrText(payload, json, [
      "Logged in: yes",
      `Auth: ${credential.authType}`,
      `Source: ${credential.source}`,
      `Token: ${redactSecret(credential.token)}`,
      `Config: ${CONFIG_FILE}`,
      check ? "Mobbin check: ok" : undefined,
    ]);
  } catch (error) {
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ loggedIn: false, error: errorMessage(error) }, null, 2)}\n`,
      );
    } else {
      process.stdout.write(`Logged in: no\n${errorMessage(error)}\n`);
    }
    process.exitCode = 1;
  }
}

export async function commandSearch(command: string | undefined, positionals: string[], flags: ParsedArgs["flags"]): Promise<void> {
  const kind = searchKind(command);
  const query = queryFromPositionals(positionals);
  const credential = await loadCredential();
  const body = buildSearchBody(kind, query, flags);
  const result =
    credential.authType === "oauth"
      ? await callMcpTool({
          token: credential.token,
          mcpUrl: mcpUrl(credential.config),
          toolName: MCP_TOOLS[kind],
          arguments: buildMcpArguments(body),
        })
      : await requestJson({
          token: credential.token,
          baseUrl: apiBaseUrl(credential.config),
          endpoint: ENDPOINTS[kind],
          body,
        });

  const downloadDir = getStringFlag(flags, "download-dir");
  const output = downloadDir
    ? await withDownloadedImages(result, downloadDir)
    : result;

  if (getBooleanFlag(flags, "raw") || getBooleanFlag(flags, "json")) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  printSearchResults(kind, output);
}

export async function commandRaw(positionals: string[], flags: ParsedArgs["flags"]): Promise<void> {
  const endpoint = positionals[0];
  if (!endpoint) throw new Error("Missing endpoint, for example `/v1/screens/search`.");
  const credential = await loadCredential();
  const data = getStringFlag(flags, "data");
  const body = data ? (JSON.parse(data) as unknown) : {};
  const result = await requestJson({
    token: credential.token,
    baseUrl: apiBaseUrl(credential.config),
    endpoint,
    body,
    method: getStringFlag(flags, "method") || "POST",
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function printHelp(): void {
  process.stdout.write(`mobbin ${VERSION}

Usage:
  mobbin login [--print-url] [--store keychain|file] [--no-validate]
  mobbin login --api-key <key> [--store keychain|file] [--no-validate]
  mobbin login --stdin [--store keychain|file] [--no-validate]
  mobbin status [--check] [--json]
  mobbin logout
  mobbin search <query> --platform ios|web [--limit 5] [--mode standard|deep] [--json]
  mobbin screens search <query> --platform ios|web
  mobbin flows search <query> --platform ios|web [--page 1]
  mobbin sections search <query> [--page 1]
  mobbin raw <endpoint> --data '{"query":"login screen","platform":"ios"}'

Auth:
  mobbin login opens a browser OAuth flow; no API key is required.
  MOBBIN_API_KEY overrides stored credentials.
  MOBBIN_API_BASE_URL overrides ${DEFAULT_API_BASE_URL}.
  MOBBIN_MCP_URL overrides ${DEFAULT_API_BASE_URL}/mcp for OAuth-backed search.

Examples:
  mobbin login
  mobbin status --check
  mobbin search "checkout page with Apple Pay" --platform web --mode deep --limit 4 --json
  mobbin screens search "login screen with biometric authentication" --platform ios --download-dir /tmp/mobbin
`);
}
