import { MCP_PROTOCOL_VERSION, VERSION } from "./constants";
import type { JsonRpcResponse } from "./types";
import { isApiErrorBody, isRecord, parseMaybeJson, stringValue } from "./utils";

export async function callMcpTool(options: {
  token: string;
  mcpUrl: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<unknown> {
  const initialize = await postMcpJson({
    token: options.token,
    mcpUrl: options.mcpUrl,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "mobbin-cli",
          version: VERSION,
        },
      },
    },
  });
  assertNoRpcError(initialize.payload, "initialize");

  const sessionId = initialize.sessionId;
  await postMcpJson({
    token: options.token,
    mcpUrl: options.mcpUrl,
    sessionId,
    body: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
  });

  const toolCall = await postMcpJson({
    token: options.token,
    mcpUrl: options.mcpUrl,
    sessionId,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: options.toolName,
        arguments: options.arguments,
      },
    },
  });
  assertNoRpcError(toolCall.payload, options.toolName);

  if (!isRecord(toolCall.payload)) {
    throw new Error("Mobbin MCP returned a non-object tool response.");
  }

  return normalizeMcpToolResult((toolCall.payload as JsonRpcResponse).result);
}

async function postMcpJson(options: {
  token: string;
  mcpUrl: string;
  sessionId?: string | null;
  body: unknown;
}): Promise<{ payload: unknown; sessionId: string | null }> {
  const response = await fetch(options.mcpUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "user-agent": `mobbin-cli/${VERSION}`,
      ...(options.sessionId ? { "mcp-session-id": options.sessionId } : {}),
    },
    body: JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = parseMcpResponse(text);

  if (!response.ok) {
    throw new Error(formatMcpError(response.status, payload, text));
  }

  return {
    payload,
    sessionId: response.headers.get("mcp-session-id") || options.sessionId || null,
  };
}

export function parseMcpResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (/^event:|^data:/m.test(trimmed)) {
    const events = parseSseDataEvents(trimmed);
    const parsedEvents = events.map((event) => parseMaybeJson(event));
    return (
      parsedEvents.find((event) => isRecord(event) && ("result" in event || "error" in event)) ??
      parsedEvents.at(-1) ??
      {}
    );
  }
  return parseMaybeJson(trimmed);
}

export function parseSseDataEvents(text: string): string[] {
  const events: string[] = [];
  let dataLines: string[] = [];

  const flush = (): void => {
    if (dataLines.length === 0) return;
    events.push(dataLines.join("\n"));
    dataLines = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();

  return events;
}

function assertNoRpcError(payload: unknown, operation: string): void {
  if (!isRecord(payload)) return;
  const error = payload.error;
  if (isRecord(error)) {
    const message = stringValue(error.message) || "request failed";
    throw new Error(`Mobbin MCP ${operation} failed: ${message}`);
  }
}

function normalizeMcpToolResult(result: unknown): unknown {
  if (!isRecord(result)) return result ?? {};

  if ("structuredContent" in result) {
    return result.structuredContent;
  }

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") continue;
      const parsed = parseMaybeJson(item.text);
      if (isRecord(parsed) || Array.isArray(parsed)) return parsed;
    }
  }

  return result;
}

function formatMcpError(status: number, parsed: unknown, text: string): string {
  if (isApiErrorBody(parsed)) {
    const code = parsed.error?.code ? `${parsed.error.code}: ` : "";
    return `Mobbin MCP ${status}: ${code}${parsed.error?.message || "request failed"}`;
  }
  if (isRecord(parsed) && isRecord(parsed.error)) {
    return `Mobbin MCP ${status}: ${stringValue(parsed.error.message) || "request failed"}`;
  }
  return `Mobbin MCP ${status}: ${text.slice(0, 500) || "request failed"}`;
}
