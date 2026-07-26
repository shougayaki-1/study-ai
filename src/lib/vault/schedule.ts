import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeValue } from "./line-format";
import { readVaultFile } from "./read";
import { getVaultRoot } from "./root";
import { writeVaultFileAtomic } from "./write";

export type ScheduleKind = "assignment" | "application" | "mock_exam" | "exam" | "other";
export type ScheduleEvent = { id: string; kind: ScheduleKind; title: string; due: string; done: boolean };

const DONE_PREFIX = "- [x] ";
const TODO_PREFIX = "- [ ] ";
const SCHEDULE_REL_PATH = "schedule.md";

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

export async function readSchedule(): Promise<ScheduleEvent[]> {
  let body: string;
  try {
    ({ body } = await readVaultFile(SCHEDULE_REL_PATH));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseScheduleEvents(body);
}

export async function setScheduleEventDone(id: string, done: boolean): Promise<void> {
  const fullPath = path.join(getVaultRoot(), SCHEDULE_REL_PATH);
  const raw = await readFile(fullPath, "utf8");
  const marker = `id=${id} |`;
  const nextPrefix = done ? DONE_PREFIX : TODO_PREFIX;
  const lines = raw.split("\n").map((line) => {
    let rest: string | null = null;
    if (line.startsWith(DONE_PREFIX)) rest = line.slice(DONE_PREFIX.length);
    else if (line.startsWith(TODO_PREFIX)) rest = line.slice(TODO_PREFIX.length);
    if (rest === null || !rest.startsWith(marker)) return line;
    return `${nextPrefix}${rest}`;
  });
  await writeVaultFileAtomic(fullPath, lines.join("\n"));
}
