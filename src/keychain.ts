import { hasFile } from "./config";
import {
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  OAUTH_KEYCHAIN_SERVICE,
} from "./constants";
import type { OAuthSecret } from "./types";

export async function keychainAvailable(): Promise<boolean> {
  return process.platform === "darwin" && (await hasFile("/usr/bin/security"));
}

async function runSecurity(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["/usr/bin/security", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

export async function readKeychainApiKey(): Promise<string | undefined> {
  if (!(await keychainAvailable())) return undefined;
  const result = await runSecurity([
    "find-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
  ]);
  if (result.code !== 0) return undefined;
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

export async function readKeychainOAuthSecret(): Promise<string | undefined> {
  if (!(await keychainAvailable())) return undefined;
  const result = await runSecurity([
    "find-generic-password",
    "-s",
    OAUTH_KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
  ]);
  if (result.code !== 0) return undefined;
  return result.stdout;
}

export async function writeKeychainApiKey(apiKey: string): Promise<void> {
  const result = await runSecurity([
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
    apiKey,
  ]);
  if (result.code !== 0) {
    throw new Error(`Keychain write failed: ${result.stderr.trim() || "unknown error"}`);
  }
}

export async function writeKeychainOAuthSecret(secret: OAuthSecret): Promise<void> {
  const result = await runSecurity([
    "add-generic-password",
    "-U",
    "-s",
    OAUTH_KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
    JSON.stringify(secret),
  ]);
  if (result.code !== 0) {
    throw new Error(`Keychain write failed: ${result.stderr.trim() || "unknown error"}`);
  }
}

export async function deleteKeychainApiKey(): Promise<void> {
  if (!(await keychainAvailable())) return;
  await runSecurity([
    "delete-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
  ]);
}

export async function deleteKeychainOAuthSecret(): Promise<void> {
  if (!(await keychainAvailable())) return;
  await runSecurity([
    "delete-generic-password",
    "-s",
    OAUTH_KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
  ]);
}
