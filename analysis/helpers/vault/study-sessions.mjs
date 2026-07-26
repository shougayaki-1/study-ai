import { assertSafeValue } from './line-format.mjs';
import { readVaultFile, writeVaultFile } from './read-write.mjs';

const PREFIX = '- ';

export function parseStudySessions(body) {
  const sessions = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith(PREFIX)) continue;
    const fields = {};
    for (const part of line.slice(PREFIX.length).split(' | ')) {
      const eq = part.indexOf('=');
      if (eq !== -1) fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.subject || !fields.minutes || !fields.kind || !fields.understanding) continue;
    const minutes = Number(fields.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) continue;
    const session = { id: fields.id, subject: fields.subject, minutes, kind: fields.kind, understanding: fields.understanding, memo: fields.memo ?? '' };
    if (fields.kind === 'common_test') {
      if (fields.year) session.year = Number(fields.year);
      if (fields.section) session.section = fields.section;
    }
    sessions.push(session);
  }
  return sessions;
}

export function formatStudySessionLine(session) {
  assertSafeValue(session.id, 'id');
  assertSafeValue(session.subject, 'subject');
  assertSafeValue(session.understanding, 'understanding');
  assertSafeValue(session.memo, 'memo');
  if (session.kind === 'common_test' && session.section) assertSafeValue(session.section, 'section');
  const parts = [`id=${session.id}`, `subject=${session.subject}`, `minutes=${session.minutes}`, `kind=${session.kind}`];
  if (session.kind === 'common_test') parts.push(`year=${session.year}`, `section=${session.section}`);
  parts.push(`understanding=${session.understanding}`, `memo=${session.memo}`);
  return `${PREFIX}${parts.join(' | ')}`;
}

export function nextSessionId(sessions) {
  let max = 0;
  for (const session of sessions) {
    const match = /^s-(\d+)$/.exec(session.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `s-${max + 1}`;
}

const HEADING = '## セッション';
const ANY_HEADING_RE = /^#{1,6}\s/;

async function readRecordFile(date) {
  const relPath = `records/${date}.md`;
  try {
    const { frontmatter, body } = await readVaultFile(relPath);
    return { relPath, frontmatter, body };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      relPath,
      frontmatter: { type: 'study-record', date, source: 'dialogue', schema_version: 1 },
      body: `${HEADING}\n`,
    };
  }
}

function locateSessionLineIndex(lines, id) {
  const marker = `id=${id} |`;
  return lines.findIndex((line) => line.startsWith(PREFIX) && line.slice(PREFIX.length).startsWith(marker));
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

export async function appendStudySession(date, session) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const line = formatStudySessionLine(session);
  const lines = body.split('\n');
  const insertAt = locateSectionInsertIndex(lines);
  let nextLines;
  if (insertAt === -1) {
    const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
    nextLines = `${trimmed ? `${trimmed}\n` : ''}${HEADING}\n${line}\n`.split('\n');
  } else {
    nextLines = [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)];
  }
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, nextLines.join('\n'));
}

export async function updateStudySession(date, id, patch) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const sessions = parseStudySessions(body);
  const current = sessions.find((session) => session.id === id);
  if (!current) throw new Error(`updateStudySession: session not found: ${id}`);
  const lines = body.split('\n');
  const lineIndex = locateSessionLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`updateStudySession: session line not found: ${id}`);
  lines[lineIndex] = formatStudySessionLine({ ...current, ...patch, id });
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}

export async function deleteStudySession(date, id) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const lines = body.split('\n');
  const lineIndex = locateSessionLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`deleteStudySession: session not found: ${id}`);
  lines.splice(lineIndex, 1);
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
