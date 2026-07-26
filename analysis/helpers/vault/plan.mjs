import { readVaultFile, writeVaultFile } from './read-write.mjs';
import { assertSafeValue } from './line-format.mjs';

const PREFIX = '- ';
export function parsePlanBlocks(body) {
  const blocks = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith(PREFIX)) continue;
    const fields = {};
    for (const part of line.slice(PREFIX.length).split(' | ')) {
      const eq = part.indexOf('='); if (eq !== -1) fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.start || !fields.end || !fields.subject || !fields.status) continue;
    blocks.push({ id: fields.id, start: fields.start, end: fields.end, subject: fields.subject, status: fields.status, memo: fields.memo ?? '' });
  }
  return blocks;
}
export function formatPlanBlockLine(block) {
  for (const field of ['id', 'start', 'end', 'subject', 'status', 'memo']) assertSafeValue(block[field], field);
  return `${PREFIX}id=${block.id} | start=${block.start} | end=${block.end} | subject=${block.subject} | status=${block.status} | memo=${block.memo}`;
}
export function nextPlanId(blocks) {
  const max = blocks.reduce((n, block) => Math.max(n, Number(/^p-(\d+)$/.exec(block.id)?.[1] ?? 0)), 0);
  return `p-${max + 1}`;
}

const HEADING = '## 計画';
const ANY_HEADING_RE = /^#{1,6}\s/;
const relPath = (date) => `plans/${date}.md`;
async function readPlanFile(date) {
  try { return await readVaultFile(relPath(date)); }
  catch (error) { if (error.code === 'ENOENT') return { frontmatter: { type: 'study-plan', date, schema_version: 1 }, body: `${HEADING}\n` }; throw error; }
}
function locateLineIndex(lines, id) { return lines.findIndex((line) => line.startsWith(PREFIX) && line.slice(PREFIX.length).startsWith(`id=${id} |`)); }
function locateSectionInsertIndex(lines) {
  const heading = lines.findIndex((line) => line.trim() === HEADING); if (heading === -1) return -1;
  let insertAt = heading + 1;
  for (let i = heading + 1; i < lines.length; i += 1) { if (ANY_HEADING_RE.test(lines[i])) break; if (lines[i].trim() !== '') insertAt = i + 1; }
  return insertAt;
}
export async function appendPlanBlock(date, block) {
  const { frontmatter, body } = await readPlanFile(date); const lines = body.split('\n'); const index = locateSectionInsertIndex(lines); const line = formatPlanBlockLine(block);
  const next = index === -1 ? `${body.endsWith('\n') ? body.slice(0, -1) : body}${body.trim() ? '\n' : ''}${HEADING}\n${line}\n`.split('\n') : [...lines.slice(0, index), line, ...lines.slice(index)];
  await writeVaultFile(relPath(date), { ...frontmatter, updated: new Date().toISOString() }, next.join('\n'));
}
export async function updatePlanBlock(date, id, patch) {
  const { frontmatter, body } = await readPlanFile(date); const current = parsePlanBlocks(body).find((block) => block.id === id); if (!current) throw new Error(`plan block not found: ${id}`);
  const lines = body.split('\n'); const index = locateLineIndex(lines, id); if (index === -1) throw new Error(`plan block line not found: ${id}`); lines[index] = formatPlanBlockLine({ ...current, ...patch, id });
  await writeVaultFile(relPath(date), { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
export async function deletePlanBlock(date, id) {
  const { frontmatter, body } = await readPlanFile(date); const lines = body.split('\n'); const index = locateLineIndex(lines, id); if (index === -1) throw new Error(`plan block line not found: ${id}`); lines.splice(index, 1);
  await writeVaultFile(relPath(date), { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
