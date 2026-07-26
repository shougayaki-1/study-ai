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
