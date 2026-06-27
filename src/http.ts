import { VERSION } from "./constants";
import { isApiErrorBody, parseMaybeJson } from "./utils";

export async function requestJson(options: {
  token: string;
  baseUrl: string;
  endpoint: string;
  body: unknown;
  method?: string;
}): Promise<unknown> {
  const url = `${options.baseUrl}${options.endpoint.startsWith("/") ? "" : "/"}${options.endpoint}`;
  const method = options.method || "POST";
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${options.token}`,
      accept: "application/json",
      ...(method === "GET" ? {} : { "content-type": "application/json" }),
      "user-agent": `mobbin-cli/${VERSION}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);

  if (!response.ok) {
    throw new Error(formatApiError(response.status, parsed, text));
  }

  return parsed;
}

export function formatApiError(status: number, parsed: unknown, text: string): string {
  if (isApiErrorBody(parsed)) {
    const code = parsed.error?.code ? `${parsed.error.code}: ` : "";
    return `Mobbin API ${status}: ${code}${parsed.error?.message || "request failed"}`;
  }
  return `Mobbin API ${status}: ${text.slice(0, 500) || "request failed"}`;
}
