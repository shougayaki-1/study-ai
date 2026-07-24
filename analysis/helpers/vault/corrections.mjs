import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vaultRoot } from './root.mjs';

const CORRECTIONS_REL_PATH = '_inbox/corrections.md';

export async function readCorrections() {
  const fullPath = path.join(vaultRoot(), CORRECTIONS_REL_PATH);
  let raw;
  try {
    raw = await readFile(fullPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const blocks = raw
    .split(/\n(?=## )/)
    .map((block) => block.trim())
    .filter(Boolean);

  const entries = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const headingMatch = /^## (.+)$/.exec(lines[0]);
    if (!headingMatch) continue;
    const fields = {};
    for (const line of lines.slice(1)) {
      const m = /^- (\w+): (.*)$/.exec(line);
      if (m) fields[m[1]] = m[2];
    }
    entries.push({
      timestamp: headingMatch[1],
      report: fields.report,
      todo: fields.todo,
      choice: fields.choice,
      note: fields.note,
    });
  }
  return entries;
}

export async function clearCorrections() {
  const fullPath = path.join(vaultRoot(), CORRECTIONS_REL_PATH);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, '', 'utf8');
}
