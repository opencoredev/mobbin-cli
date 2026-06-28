---
name: mobbin-cli
description: This skill should be used when the user asks to "use Mobbin", "find UI references", "search app screens", "search flows", "search website sections", "gather mobile UI inspiration", "gather dashboard references", or do Mobbin-backed product and interface research from an agent. It teaches agents to use the npm-installed Mobbin CLI instead of relying on a mounted Mobbin MCP server.
---

# Mobbin CLI

Use the local `mobbin` command to search Mobbin from an agent without requiring a
Mobbin MCP server to be mounted in the current client. The CLI stores credentials
once and reuses them across future sessions.

## Install Check

Start by checking whether the command is available:

```bash
mobbin --help
```

If the command is missing, ask the user before installing globally. Prefer Bun:

```bash
bun add -g @opencoredev/mobbin-cli
```

Use npm only when Bun global installs are not available:

```bash
npm install -g @opencoredev/mobbin-cli
```

The command runs on Bun. If npm installs the package, Bun must still be installed
and available on `PATH`.

## Login

Check auth before research:

```bash
mobbin status --check
```

When credentials are missing, run the browser OAuth login:

```bash
mobbin login
```

This does not require an API key. The login stores credentials in macOS Keychain
when available, with a file-based fallback at `~/.config/mobbin-cli/config.json`.

For CI or non-interactive environments, use an API key only when it is already
available in the environment:

```bash
printf '%s' "$MOBBIN_API_KEY" | mobbin login --stdin
```

Never print, paste, or commit API keys. `mobbin status` redacts secrets.

## Search Commands

Use one precise query per screen, flow, or section. Keep platform selection in
flags instead of mixing it into the query text.

Search screens:

```bash
mobbin search "login screen with biometric authentication" --platform ios --limit 5 --json
mobbin search "checkout page with Apple Pay and promo code" --platform web --mode deep --limit 4 --json
mobbin screens search "settings screen with account security" --platform ios --download-dir /tmp/mobbin --json
```

Search flows:

```bash
mobbin flows search "onboarding with personalization steps" --platform ios --limit 3 --json
```

Search website sections:

```bash
mobbin sections search "pricing page with plan comparison table" --limit 4 --json
```

Use `--mode standard` for quick layout references. Use `--mode deep` for nuanced
intent, complex flows, or when the first pass is too generic.

## Research Workflow

Use `--json` for agent-readable output. For each useful result, preserve the
`mobbin_url` so the user can open the source reference.

For visual claims, inspect actual images from `image_url` or downloaded files.
Do not infer detailed screen contents from metadata alone.

When downloading images, return fully resolved paths:

```bash
realpath /tmp/mobbin/*
```

Give absolute filesystem paths for local images and full `https://` URLs for
remote `image_url` or `mobbin_url` values. Never give only a relative image path.

## Credential Precedence

Credential lookup order:

1. `MOBBIN_API_KEY`
2. OAuth or API-key credential created by `mobbin login`
3. `~/.config/mobbin-cli/config.json`

OAuth credentials use Mobbin's MCP endpoint. API-key credentials use Mobbin's
REST search endpoints. `MOBBIN_API_BASE_URL` and `MOBBIN_MCP_URL` are available
for debugging only.
