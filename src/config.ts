import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { DEFAULT_API_BASE_URL, CONFIG_DIR, CONFIG_FILE } from "./constants";
import type { Config } from "./types";
import { isNodeError, isRecord } from "./utils";

export async function readConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? (parsed as Config) : {};
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return {};
    throw error;
  }
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await chmod(CONFIG_DIR, 0o700);
  await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(CONFIG_FILE, 0o600);
}

export async function removeConfig(): Promise<void> {
  await rm(CONFIG_FILE, { force: true });
}

export async function hasFile(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

export function apiBaseUrl(config: Config): string {
  return (process.env.MOBBIN_API_BASE_URL || config.apiBaseUrl || DEFAULT_API_BASE_URL)
    .replace(/\/+$/, "");
}

export function mcpUrl(config: Config): string {
  return (process.env.MOBBIN_MCP_URL || `${apiBaseUrl(config)}/mcp`).replace(/\/+$/, "");
}
