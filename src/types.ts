export type CredentialStore = "keychain" | "file";
export type AuthType = "api_key" | "oauth";
export type Platform = "ios" | "web";
export type SearchKind = "screens" | "flows" | "sections";

export type Config = {
  apiBaseUrl?: string;
  apiKey?: string;
  authType?: AuthType;
  oauth?: OAuthSecret;
  credentialStore?: CredentialStore;
  updatedAt?: string;
};

export type ParsedArgs = {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
};

export type Credential = {
  token: string;
  authType: AuthType;
  source: "env" | "keychain" | "file";
  config: Config;
};

export type OAuthMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

export type OAuthClient = {
  client_id: string;
};

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export type OAuthSecret = {
  type: "oauth";
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId: string;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export type OAuthCallbackServer = {
  redirectUri: string;
  waitForCode: (expectedState: string) => Promise<string>;
  stop: () => void;
};
