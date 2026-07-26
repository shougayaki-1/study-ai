import { assertSafeValue } from "./line-format";

export type ScheduleKind = "assignment" | "application" | "mock_exam" | "exam" | "other";
export type ScheduleEvent = { id: string; kind: ScheduleKind; title: string; due: string; done: boolean };

const DONE_PREFIX = "- [x] ";
const TODO_PREFIX = "- [ ] ";

export function parseScheduleEvents(body: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  for (const line of body.split("\n")) {
    let done: boolean;
    let rest: string;
    if (line.startsWith(DONE_PREFIX)) {
      done = true;
      rest = line.slice(DONE_PREFIX.length);
    } else if (line.startsWith(TODO_PREFIX)) {
      done = false;
      rest = line.slice(TODO_PREFIX.length);
    } else {
      continue;
    }
    const fields: Record<string, string> = {};
    for (const part of rest.split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.kind || !fields.title || !fields.due) continue;
    events.push({ id: fields.id, kind: fields.kind as ScheduleKind, title: fields.title, due: fields.due, done });
  }
  return events;
}

export function formatScheduleEventLine(event: ScheduleEvent): string {
  assertSafeValue(event.id, "id");
  assertSafeValue(event.kind, "kind");
  assertSafeValue(event.title, "title");
  assertSafeValue(event.due, "due");
  const prefix = event.done ? DONE_PREFIX : TODO_PREFIX;
  return `${prefix}id=${event.id} | kind=${event.kind} | title=${event.title} | due=${event.due}`;
}
