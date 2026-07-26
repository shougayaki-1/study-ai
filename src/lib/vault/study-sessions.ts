import { assertSafeValue } from "./line-format";

export type StudyKind = "material" | "common_test" | "secondary";
export type Understanding = "understood" | "uncertain" | "not_understood";
export type StudySession = {
  id: string;
  subject: string;
  minutes: number;
  kind: StudyKind;
  year?: number;
  section?: string;
  understanding: Understanding;
  memo: string;
};

const PREFIX = "- ";

export function parseStudySessions(body: string): StudySession[] {
  const sessions: StudySession[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    const fields: Record<string, string> = {};
    for (const part of line.slice(PREFIX.length).split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.subject || !fields.minutes || !fields.kind || !fields.understanding) continue;
    const minutes = Number(fields.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) continue;
    const session: StudySession = {
      id: fields.id,
      subject: fields.subject,
      minutes,
      kind: fields.kind as StudyKind,
      understanding: fields.understanding as Understanding,
      memo: fields.memo ?? "",
    };
    if (fields.kind === "common_test") {
      if (fields.year) session.year = Number(fields.year);
      if (fields.section) session.section = fields.section;
    }
    sessions.push(session);
  }
  return sessions;
}

export function formatStudySessionLine(session: StudySession): string {
  assertSafeValue(session.id, "id");
  assertSafeValue(session.subject, "subject");
  assertSafeValue(session.understanding, "understanding");
  assertSafeValue(session.memo, "memo");
  if (session.kind === "common_test" && session.section) assertSafeValue(session.section, "section");

  const parts = [
    `id=${session.id}`,
    `subject=${session.subject}`,
    `minutes=${session.minutes}`,
    `kind=${session.kind}`,
  ];
  if (session.kind === "common_test") {
    parts.push(`year=${session.year}`, `section=${session.section}`);
  }
  parts.push(`understanding=${session.understanding}`, `memo=${session.memo}`);
  return `${PREFIX}${parts.join(" | ")}`;
}
