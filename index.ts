#!/usr/bin/env bun
import { main } from "./src/cli";
import { errorMessage } from "./src/utils";

export { main } from "./src/cli";
export { parseArgs } from "./src/args";
export { buildSearchBody, collectImageUrls } from "./src/search";
export { redactSecret } from "./src/utils";

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exit(1);
  });
}
