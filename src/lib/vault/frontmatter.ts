export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const lines = raw.split("\n");
  if (lines[0] !== "---") {
    throw new Error("vault file is missing frontmatter opening delimiter (---)");
  }
  const closeIndex = lines.indexOf("---", 1);
  if (closeIndex === -1) {
    throw new Error("vault file is missing frontmatter closing delimiter (---)");
  }
  const frontmatter: Record<string, unknown> = {};
  for (const line of lines.slice(1, closeIndex)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(": ");
    if (sep === -1) continue;
    const key = line.slice(0, sep);
    const rawValue = line.slice(sep + 2);
    frontmatter[key] = /^-?\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
  }
  const bodyLines = lines.slice(closeIndex + 1);
  if (bodyLines[0] === "") bodyLines.shift();
  return { frontmatter, body: bodyLines.join("\n") };
}

export function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${String(value)}`);
  }
  lines.push("---", "", body);
  return lines.join("\n");
}
