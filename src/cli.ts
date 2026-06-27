import { parseArgs, getBooleanFlag } from "./args";
import {
  commandLogin,
  commandLogout,
  commandRaw,
  commandSearch,
  commandStatus,
  printHelp,
} from "./commands";
import { VERSION } from "./constants";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const { command, positionals, flags } = parsed;

  if (!command || command === "help" || getBooleanFlag(flags, "help")) {
    printHelp();
    return;
  }

  if (command === "version" || getBooleanFlag(flags, "version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (command === "login") return commandLogin(flags);
  if (command === "logout") return commandLogout();
  if (command === "status") return commandStatus(flags);
  if (command === "raw") return commandRaw(positionals, flags);
  if (["search", "screens", "screen", "flows", "flow", "sections", "section"].includes(command)) {
    return commandSearch(command, positionals, flags);
  }

  throw new Error(`Unknown command: ${command}. Run \`mobbin help\`.`);
}
