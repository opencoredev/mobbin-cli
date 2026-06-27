import { createHash, randomBytes } from "node:crypto";
import {
  OAUTH_METADATA_URL,
  OAUTH_RESOURCE,
  OAUTH_SCOPE,
  VERSION,
} from "./constants";
import { formatApiError } from "./http";
import type {
  OAuthCallbackServer,
  OAuthClient,
  OAuthMetadata,
  OAuthSecret,
  OAuthTokenResponse,
} from "./types";
import { escapeHtml, isRecord, parseMaybeJson, stringValue } from "./utils";

export async function fetchOAuthMetadata(): Promise<OAuthMetadata> {
  const response = await fetch(OAUTH_METADATA_URL, {
    headers: {
      accept: "application/json",
      "user-agent": `mobbin-cli/${VERSION}`,
    },
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(formatOAuthError(response.status, parsed, text));
  }
  if (!isRecord(parsed)) {
    throw new Error("Mobbin OAuth metadata response was not an object.");
  }

  const authorizationEndpoint = stringValue(parsed.authorization_endpoint);
  const tokenEndpoint = stringValue(parsed.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error("Mobbin OAuth metadata is missing required endpoints.");
  }

  return {
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    registration_endpoint: stringValue(parsed.registration_endpoint),
  };
}

export function startOAuthCallbackServer(): OAuthCallbackServer {
  let pending:
    | {
        expectedState: string;
        resolve: (code: string) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const settle = (callback: () => void): void => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    callback();
    pending = undefined;
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname !== "/callback") {
        return htmlResponse("Not found", 404);
      }

      if (!pending) {
        return htmlResponse("Mobbin login was not expected by this CLI process.", 400);
      }

      const error = url.searchParams.get("error");
      const description = url.searchParams.get("error_description");
      if (error) {
        settle(() => pending?.reject(new Error(`Mobbin OAuth failed: ${description || error}`)));
        return htmlResponse("Mobbin login failed. You can close this tab.", 400);
      }

      const state = url.searchParams.get("state");
      if (state !== pending.expectedState) {
        settle(() => pending?.reject(new Error("Mobbin OAuth failed: state mismatch.")));
        return htmlResponse("Mobbin login failed. You can close this tab.", 400);
      }

      const code = url.searchParams.get("code");
      if (!code) {
        settle(() => pending?.reject(new Error("Mobbin OAuth failed: missing authorization code.")));
        return htmlResponse("Mobbin login failed. You can close this tab.", 400);
      }

      settle(() => pending?.resolve(code));
      return htmlResponse("Mobbin login complete. You can close this tab.");
    },
  });

  return {
    redirectUri: `http://127.0.0.1:${server.port}/callback`,
    waitForCode(expectedState: string) {
      return new Promise<string>((resolve, reject) => {
        pending = { expectedState, resolve, reject };
        timeout = setTimeout(() => {
          settle(() => reject(new Error("Timed out waiting for Mobbin login callback.")));
        }, 10 * 60 * 1000);
      });
    },
    stop() {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
      pending = undefined;
      server.stop(true);
    },
  };
}

function htmlResponse(message: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Mobbin CLI</title></head><body><p>${escapeHtml(message)}</p></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function registerOAuthClient(metadata: OAuthMetadata, redirectUri: string): Promise<OAuthClient> {
  if (!metadata.registration_endpoint) {
    throw new Error("Mobbin OAuth metadata does not expose dynamic client registration.");
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": `mobbin-cli/${VERSION}`,
    },
    body: JSON.stringify({
      client_name: "mobbin-cli",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE,
    }),
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(formatOAuthError(response.status, parsed, text));
  }
  if (!isRecord(parsed) || typeof parsed.client_id !== "string") {
    throw new Error("Mobbin OAuth client registration did not return a client_id.");
  }
  return { client_id: parsed.client_id };
}

export function base64Url(value: Uint8Array | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomOAuthValue(): string {
  return base64Url(randomBytes(32));
}

export function buildAuthorizationUrl(
  metadata: OAuthMetadata,
  options: {
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    state: string;
  },
): string {
  const codeChallenge = base64Url(createHash("sha256").update(options.codeVerifier).digest());
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("state", options.state);
  url.searchParams.set("nonce", options.state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", OAUTH_RESOURCE);
  return url.toString();
}

export async function openUrl(url: string): Promise<void> {
  const command =
    process.platform === "darwin"
      ? ["/usr/bin/open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];

  try {
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [, stderr, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      process.stderr.write(`Could not open browser automatically: ${stderr.trim() || `exit ${code}`}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not open browser automatically: ${message}\n`);
  }
}

export async function exchangeAuthorizationCode(
  metadata: OAuthMetadata,
  options: {
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    code: string;
  },
): Promise<OAuthTokenResponse> {
  return exchangeOAuthToken(metadata, {
    grant_type: "authorization_code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
    code: options.code,
    resource: OAUTH_RESOURCE,
  });
}

export async function exchangeRefreshToken(
  metadata: OAuthMetadata,
  secret: OAuthSecret,
): Promise<OAuthTokenResponse> {
  if (!secret.refreshToken) {
    throw new Error("Mobbin OAuth token cannot be refreshed because no refresh token is stored.");
  }
  return exchangeOAuthToken(metadata, {
    grant_type: "refresh_token",
    client_id: secret.clientId,
    refresh_token: secret.refreshToken,
    resource: OAUTH_RESOURCE,
  });
}

async function exchangeOAuthToken(
  metadata: OAuthMetadata,
  params: Record<string, string>,
): Promise<OAuthTokenResponse> {
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": `mobbin-cli/${VERSION}`,
    },
    body: new URLSearchParams(params),
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(formatOAuthError(response.status, parsed, text));
  }
  if (!isRecord(parsed) || typeof parsed.access_token !== "string") {
    throw new Error("Mobbin OAuth token response did not include an access token.");
  }

  return {
    access_token: parsed.access_token,
    refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
    expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
    token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
  };
}

export function tokenResponseToOAuthSecret(tokens: OAuthTokenResponse, clientId: string): OAuthSecret {
  return {
    type: "oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    clientId,
  };
}

function formatOAuthError(status: number, parsed: unknown, text: string): string {
  if (isRecord(parsed)) {
    const error = stringValue(parsed.error);
    const description = stringValue(parsed.error_description);
    if (error || description) {
      return `Mobbin OAuth ${status}: ${description || error}`;
    }
  }
  return formatApiError(status, parsed, text);
}
