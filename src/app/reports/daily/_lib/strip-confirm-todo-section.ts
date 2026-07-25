// Removes the "## 要確認TODO" section (its heading and body lines) up to the next heading of any level or EOF,
// so the raw machine-readable todo lines are not shown alongside the ConfirmTodoList chips.
export function stripConfirmTodoSection(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith("## 要確認TODO")) {
      skipping = true;
      continue;
    }
    if (skipping && /^#{1,6}\s/.test(line)) {
      skipping = false;
    }
    if (!skipping) {
      out.push(line);
    }
  }
  return out.join("\n").replace(/^\n+/, "");
}
