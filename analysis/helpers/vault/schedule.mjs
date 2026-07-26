import { readVaultFile, writeVaultFile } from './read-write.mjs';
import { assertSafeValue } from './line-format.mjs';

const DONE_PREFIX = '- [x] ';
const TODO_PREFIX = '- [ ] ';

export function parseScheduleEvents(body) {
  const events = [];
  for (const line of body.split('\n')) {
    let done;
    let rest;
    if (line.startsWith(DONE_PREFIX)) {
      done = true;
      rest = line.slice(DONE_PREFIX.length);
    } else if (line.startsWith(TODO_PREFIX)) {
      done = false;
      rest = line.slice(TODO_PREFIX.length);
    } else {
      continue;
    }
    const fields = {};
    for (const part of rest.split(' | ')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.kind || !fields.title || !fields.due) continue;
    events.push({ id: fields.id, kind: fields.kind, title: fields.title, due: fields.due, done });
  }
  return events;
}

export function formatScheduleEventLine(event) {
  assertSafeValue(event.id, 'id');
  assertSafeValue(event.kind, 'kind');
  assertSafeValue(event.title, 'title');
  assertSafeValue(event.due, 'due');
  const prefix = event.done ? DONE_PREFIX : TODO_PREFIX;
  return `${prefix}id=${event.id} | kind=${event.kind} | title=${event.title} | due=${event.due}`;
}

export function nextEventId(events) {
  const max = events.reduce((acc, event) => {
    const match = /^ev-(\d+)$/.exec(event.id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `ev-${max + 1}`;
}

const HEADING = '## 予定';
const ANY_HEADING_RE = /^#{1,6}\s/;

async function readScheduleFile() {
  try { return await readVaultFile('schedule.md'); }
  catch (error) {
    if (error.code === 'ENOENT') return { frontmatter: { type: 'schedule', schema_version: 1 }, body: `${HEADING}\n` };
    throw error;
  }
}

function locateLineIndex(lines, id) {
  const marker = `id=${id} |`;
  return lines.findIndex((line) => {
    const rest = line.startsWith(DONE_PREFIX) ? line.slice(DONE_PREFIX.length) : line.startsWith(TODO_PREFIX) ? line.slice(TODO_PREFIX.length) : null;
    return rest !== null && rest.startsWith(marker);
  });
}

function locateSectionInsertIndex(lines) {
  const headingIndex = lines.findIndex((line) => line.trim() === HEADING);
  if (headingIndex === -1) return -1;
  let insertAt = headingIndex + 1;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (ANY_HEADING_RE.test(lines[i])) break;
    if (lines[i].trim() !== '') insertAt = i + 1;
  }
  return insertAt;
}

export async function appendScheduleEvent(event) {
  const { frontmatter, body } = await readScheduleFile();
  const lines = body.split('\n');
  const insertAt = locateSectionInsertIndex(lines);
  const line = formatScheduleEventLine(event);
  const nextLines = insertAt === -1
    ? `${body.endsWith('\n') ? body.slice(0, -1) : body}${body.trim() ? '\n' : ''}${HEADING}\n${line}\n`.split('\n')
    : [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)];
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, nextLines.join('\n'));
}

export async function updateScheduleEvent(id, patch) {
  const { frontmatter, body } = await readScheduleFile();
  const current = parseScheduleEvents(body).find((event) => event.id === id);
  if (!current) throw new Error(`schedule event not found: ${id}`);
  const lines = body.split('\n');
  const index = locateLineIndex(lines, id);
  if (index === -1) throw new Error(`schedule event line not found: ${id}`);
  lines[index] = formatScheduleEventLine({ ...current, ...patch, id });
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}

export async function deleteScheduleEvent(id) {
  const { frontmatter, body } = await readScheduleFile();
  const lines = body.split('\n');
  const index = locateLineIndex(lines, id);
  if (index === -1) throw new Error(`schedule event line not found: ${id}`);
  lines.splice(index, 1);
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
