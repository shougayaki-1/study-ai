import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getVaultRoot } from "./root";

export type CorrectionEntry = { timestamp: string; report: string; todo: string; choice: string; note?: string };

const CORRECTIONS_REL_PATH = "_inbox/corrections.md";

export async function appendCorrection(entry: CorrectionEntry): Promise<void> {
  const fullPath = path.join(getVaultRoot(), CORRECTIONS_REL_PATH);
  await mkdir(path.dirname(fullPath), { recursive: true });

  const lines = [
    `## ${entry.timestamp}`,
    `- report: ${entry.report}`,
    `- todo: ${entry.todo}`,
    `- choice: ${entry.choice}`,
  ];
  if (entry.note !== undefined) lines.push(`- note: ${entry.note}`);
  const block = `${lines.join("\n")}\n`;

  let existing = "";
  try {
    existing = await readFile(fullPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const separator = existing.length > 0 ? "\n" : "";
  await appendFile(fullPath, `${separator}${block}`, "utf8");
}
