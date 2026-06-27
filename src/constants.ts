import { homedir } from "node:os";
import path from "node:path";
import type { SearchKind } from "./types";

export const VERSION = "0.1.0";
export const DEFAULT_API_BASE_URL = "https://api.mobbin.com";
export const OAUTH_RESOURCE = "https://api.mobbin.com/mcp";
export const OAUTH_METADATA_URL = `${DEFAULT_API_BASE_URL}/.well-known/oauth-authorization-server/mcp`;
export const OAUTH_SCOPE = "openid";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
  "mobbin-cli",
);
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const KEYCHAIN_SERVICE = "mobbin-cli-api-key";
export const OAUTH_KEYCHAIN_SERVICE = "mobbin-cli-oauth";
export const KEYCHAIN_ACCOUNT = "mobbin";

export const ENDPOINTS: Record<SearchKind, string> = {
  screens: "/v1/screens/search",
  flows: "/v1/flows/search",
  sections: "/v1/sections/search",
};

export const MCP_TOOLS: Record<SearchKind, string> = {
  screens: "search_screens",
  flows: "search_flows",
  sections: "search_sections",
};
