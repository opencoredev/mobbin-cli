import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getNumberFlag, getRepeatedFlag, getStringFlag } from "./args";
import type { ParsedArgs, SearchKind } from "./types";
import { isRecord, parseChoice, parsePlatform, stringValue, titleCase } from "./utils";

export function searchKind(command: string | undefined): SearchKind {
  if (command === "flows" || command === "flow") return "flows";
  if (command === "sections" || command === "section") return "sections";
  return "screens";
}

export function queryFromPositionals(positionals: string[]): string {
  const withoutSearch = positionals[0] === "search" ? positionals.slice(1) : positionals;
  const query = withoutSearch.join(" ").trim();
  if (!query) throw new Error("Missing search query.");
  return query;
}

export function buildSearchBody(kind: SearchKind, query: string, flags: ParsedArgs["flags"]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    limit: getNumberFlag(flags, "limit", kind === "flows" ? 3 : 5),
  };

  if (kind === "screens" || kind === "flows") {
    body.platform = parsePlatform(getStringFlag(flags, "platform") || "ios");
  }

  const mode = getStringFlag(flags, "mode");
  if (mode) body.mode = parseChoice(mode, ["standard", "deep", "fast"], "mode");

  const format = getStringFlag(flags, "format");
  if (format) body.format = parseChoice(format, ["optimized", "high"], "format");

  const imageFormat = getStringFlag(flags, "image-format");
  if (imageFormat) {
    body.image_format = parseChoice(imageFormat, ["webp", "jpg"], "image-format");
  }

  const page = getStringFlag(flags, "page");
  if (page) body.page = getNumberFlag(flags, "page", 1);

  const exclude = getRepeatedFlag(flags, "exclude").concat(getRepeatedFlag(flags, "exclude-screen-id"));
  if (exclude.length > 0) body.exclude_screen_ids = exclude;

  return body;
}

export function buildMcpArguments(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.format;
  return next;
}

export async function withDownloadedImages(result: unknown, directory: string): Promise<unknown> {
  const imageUrls = collectImageUrls(result);
  await mkdir(directory, { recursive: true });
  const downloads: { url: string; path: string }[] = [];

  for (const [index, url] of imageUrls.entries()) {
    const ext = extensionFromUrl(url) || "jpg";
    const filePath = path.join(directory, `mobbin-${String(index + 1).padStart(2, "0")}.${ext}`);
    const response = await fetch(url);
    if (!response.ok) continue;
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    downloads.push({ url, path: filePath });
  }

  const annotated = attachDownloadPaths(result, new Map(downloads.map((item) => [item.url, item.path])));
  if (isRecord(result)) {
    return { ...(isRecord(annotated) ? annotated : result), _downloads: downloads };
  }
  return { result: annotated, _downloads: downloads };
}

function attachDownloadPaths(value: unknown, downloads: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => attachDownloadPaths(item, downloads));
  }

  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = attachDownloadPaths(child, downloads);
  }

  const imageUrl = stringValue(value.image_url) || stringValue(value.preview_image_url);
  if (imageUrl && downloads.has(imageUrl)) {
    next.downloaded_to = downloads.get(imageUrl);
  }

  return next;
}

export function collectImageUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      if (/image/i.test(key) && /^https?:\/\//.test(node)) urls.add(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (isRecord(node)) {
      for (const [childKey, childValue] of Object.entries(node)) {
        visit(childValue, childKey);
      }
    }
  };
  visit(value);
  return [...urls];
}

function extensionFromUrl(url: string): string | undefined {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).slice(1).toLowerCase();
  return ext || undefined;
}

export function printSearchResults(kind: SearchKind, output: unknown): void {
  const key = kind;
  const items = isRecord(output) && Array.isArray(output[key]) ? output[key] : undefined;
  if (!items) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (items.length === 0) {
    process.stdout.write(`No ${kind} found.\n`);
    return;
  }

  process.stdout.write(`${titleCase(kind)}:\n`);
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      process.stdout.write(`${index + 1}. ${JSON.stringify(item)}\n`);
      continue;
    }
    const name = stringValue(item.app_name) || stringValue(item.title) || stringValue(item.name) || `${kind.slice(0, -1)} ${index + 1}`;
    process.stdout.write(`${index + 1}. ${name}${stringValue(item.platform) ? ` (${item.platform})` : ""}\n`);
    writeField("id", item.id);
    writeField("mobbin", item.mobbin_url || item.url);
    writeField("image", item.image_url || item.preview_image_url);
    writeField("download", item.downloaded_to);
  }
}

function writeField(label: string, value: unknown): void {
  if (typeof value === "string" && value.length > 0) {
    process.stdout.write(`   ${label}: ${value}\n`);
  }
}
