# Mobbin CLI

<p align="center">
  <a href="https://github.com/opencoredev/mobbin-cli"><img alt="stars" src="https://shieldcn.dev/github/opencoredev/mobbin-cli/stars.svg" /></a>
  <a href="https://x.com/leodev"><img alt="follow" src="https://shieldcn.dev/x/follow/leodev.svg" /></a>
</p>

<p align="center">
  Mobbin visual search from your terminal. Log in once with Mobbin OAuth, store the token locally, and let agents search screens, flows, and page sections without keeping a Codex MCP server mounted.
</p>

## Overview

Codex MCP tools are great when they are active, but they also add startup clutter and depend on the agent client exposing the right tool surface. `mobbin-cli` keeps Mobbin access as a normal command:

- `mobbin login` opens Mobbin OAuth; no API key is required.
- OAuth-backed searches call Mobbin's MCP endpoint directly from the CLI.
- `MOBBIN_API_KEY` remains available as a CI or fallback path.
- JSON output is stable enough for agents to consume.
- `--download-dir` can save returned images for local visual inspection.

## Install

Clone the repo and install dependencies:

```bash
git clone https://github.com/opencoredev/mobbin-cli.git
cd mobbin-cli
bun install
bun run index.ts --help
```

For a local global command, symlink the Bun entrypoint somewhere on your `PATH`:

```bash
ln -sf "$PWD/index.ts" ~/.local/bin/mobbin
mobbin --help
```

## Login

```bash
mobbin login
```

The OAuth flow stores credentials in macOS Keychain when available. On other systems, or when requested with `--store file`, credentials are written to `~/.config/mobbin-cli/config.json` with `0600` permissions.

Check the saved login:

```bash
mobbin status --check
```

API-key fallback is supported for CI-style environments:

```bash
printf '%s' "$MOBBIN_API_KEY" | mobbin login --stdin
```

`MOBBIN_API_KEY` always overrides stored credentials.

## Search

```bash
mobbin search "login screen with biometric authentication" --platform ios --limit 5
mobbin search "checkout page with Apple Pay" --platform web --mode deep --limit 4 --json
mobbin screens search "settings screen with account security" --platform ios --download-dir /tmp/mobbin
mobbin flows search "onboarding with personalization steps" --platform ios --limit 3 --json
mobbin sections search "pricing page with plan comparison table" --limit 4 --json
```

Use `--json` for agent-readable output. Use `--mode deep` when the query needs intent matching rather than a quick layout pass.

## Auth Model

Credential precedence:

1. `MOBBIN_API_KEY`
2. OAuth or API-key credential stored by `mobbin login`
3. `~/.config/mobbin-cli/config.json`

OAuth credentials use:

```text
https://api.mobbin.com/mcp
```

API-key credentials use REST search endpoints such as:

```text
POST /v1/screens/search
POST /v1/flows/search
POST /v1/sections/search
```

## Project Structure

```text
index.ts          executable entrypoint and public test exports
src/args.ts      CLI argument parsing
src/auth.ts      credential loading, login, validation, refresh
src/oauth.ts     browser OAuth and dynamic client registration
src/mcp.ts       direct JSON-RPC calls to Mobbin's MCP endpoint
src/http.ts      REST API requests and API errors
src/search.ts    search payloads, image download helpers, text output
src/commands.ts  command handlers
```

## Development

```bash
bun install
bun test
bun run check
mobbin status --check
mobbin search "login screen" --platform ios --limit 1 --json
```

The CLI is Bun-native and intentionally has no dev server. Keep examples copy-pasteable and avoid committing credentials from `~/.config/mobbin-cli`.
