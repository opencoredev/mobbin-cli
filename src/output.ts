export function printJsonOrText(
  payload: Record<string, unknown>,
  json: boolean,
  lines: Array<string | undefined>,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${lines.filter(Boolean).join("\n")}\n`);
}
