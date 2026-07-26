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
