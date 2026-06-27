import type { ApiErrorBody, Platform } from "./types";

export function parseMaybeJson(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && isRecord(value.error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parsePlatform(value: string): Platform {
  return parseChoice(value, ["ios", "web"], "platform");
}

export function parseChoice<const T extends readonly string[]>(
  value: string,
  choices: T,
  name: string,
): T[number] {
  if ((choices as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`--${name} must be one of: ${choices.join(", ")}`);
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] || char;
  });
}
