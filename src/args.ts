import type { ParsedArgs } from "./types";

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: ParsedArgs["flags"] = {};
  const positionals: string[] = [];
  let command: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const raw = arg.slice(2);
      const equalsIndex = raw.indexOf("=");
      const key = normalizeFlagName(equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw);
      const inlineValue = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
      const next = argv[index + 1];
      const value =
        inlineValue ??
        (next && !next.startsWith("-") ? (index += 1, next) : true);
      addFlag(flags, key, value);
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      const key = normalizeFlagName(arg.slice(1));
      const next = argv[index + 1];
      const value = next && !next.startsWith("-") ? (index += 1, next) : true;
      addFlag(flags, key, value);
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags };
}

function addFlag(
  flags: ParsedArgs["flags"],
  key: string,
  value: string | boolean,
): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(String(value));
  } else {
    flags[key] = [String(existing), String(value)];
  }
}

function normalizeFlagName(name: string): string {
  const aliases: Record<string, string> = {
    d: "data",
    f: "format",
    h: "help",
    j: "json",
    k: "api-key",
    l: "limit",
    m: "mode",
    p: "platform",
    v: "version",
  };
  return aliases[name] ?? name;
}

export function getStringFlag(
  flags: ParsedArgs["flags"],
  key: string,
): string | undefined {
  const value = flags[key];
  if (Array.isArray(value)) return value.at(-1);
  if (typeof value === "string") return value;
  return undefined;
}

export function getBooleanFlag(flags: ParsedArgs["flags"], key: string): boolean {
  return flags[key] === true;
}

export function getRepeatedFlag(flags: ParsedArgs["flags"], key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export function getNumberFlag(
  flags: ParsedArgs["flags"],
  key: string,
  fallback: number,
): number {
  const raw = getStringFlag(flags, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return value;
}
