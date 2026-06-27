import { describe, expect, test } from "bun:test";
import { buildSearchBody, collectImageUrls, parseArgs, redactSecret } from "./index";
import { parseMcpResponse, parseSseDataEvents } from "./src/mcp";

describe("parseArgs", () => {
  test("parses flags and positionals", () => {
    const parsed = parseArgs([
      "screens",
      "search",
      "checkout",
      "flow",
      "--platform",
      "web",
      "--limit=3",
      "--json",
    ]);

    expect(parsed.command).toBe("screens");
    expect(parsed.positionals).toEqual(["search", "checkout", "flow"]);
    expect(parsed.flags.platform).toBe("web");
    expect(parsed.flags.limit).toBe("3");
    expect(parsed.flags.json).toBe(true);
  });
});

describe("buildSearchBody", () => {
  test("builds screen search payloads", () => {
    const body = buildSearchBody("screens", "login screen", {
      platform: "ios",
      mode: "deep",
      limit: "2",
      format: "optimized",
      exclude: ["a", "b"],
    });

    expect(body).toEqual({
      query: "login screen",
      platform: "ios",
      mode: "deep",
      limit: 2,
      format: "optimized",
      exclude_screen_ids: ["a", "b"],
    });
  });

  test("sections do not force a platform", () => {
    const body = buildSearchBody("sections", "pricing table", {});

    expect(body).toEqual({
      query: "pricing table",
      limit: 5,
    });
  });
});

describe("collectImageUrls", () => {
  test("extracts nested image urls only", () => {
    expect(
      collectImageUrls({
        screens: [
          { image_url: "https://example.com/a.webp", mobbin_url: "https://mobbin.com/x" },
          { preview_image_url: "https://example.com/b.jpg" },
        ],
      }),
    ).toEqual(["https://example.com/a.webp", "https://example.com/b.jpg"]);
  });
});

describe("parseMcpResponse", () => {
  test("reads JSON-RPC payloads from SSE responses", () => {
    const response = parseMcpResponse([
      "event: message",
      'data: {"jsonrpc":"2.0","id":2,"result":{"structuredContent":{"screens":[]}}}',
      "",
    ].join("\n"));

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        structuredContent: {
          screens: [],
        },
      },
    });
  });
});

describe("parseSseDataEvents", () => {
  test("joins multiline data fields per event", () => {
    expect(parseSseDataEvents("data: one\ndata: two\n\ndata: three\n")).toEqual([
      "one\ntwo",
      "three",
    ]);
  });
});

describe("redactSecret", () => {
  test("keeps only edges", () => {
    expect(redactSecret("mobbin_1234567890")).toBe("mobb...7890");
  });
});
