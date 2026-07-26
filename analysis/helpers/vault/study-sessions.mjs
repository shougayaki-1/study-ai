import { assertSafeValue } from './line-format.mjs';

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
