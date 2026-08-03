import { readSkills } from "@/lib/vault";
import { listKarteSubjects } from "./list-subjects";
import {
  resolveSubjectGroup,
  SUBJECTS,
  type Subject,
} from "./subject-mapping";

export type SubjectSummary = {
  subject: Subject | "unmapped";
  sourceKeys: string[];
  totalTopics: number;
  weakCount: number;
  unstableCount: number;
  stableCount: number;
  insufficientCount: number;
  lastPracticedDate: string | null;
};

function emptySummary(
  subject: Subject | "unmapped",
  sourceKeys: string[],
): SubjectSummary {
  return {
    subject,
    sourceKeys,
    totalTopics: 0,
    weakCount: 0,
    unstableCount: 0,
    stableCount: 0,
    insufficientCount: 0,
    lastPracticedDate: null,
  };
}

export async function buildSubjectSummaries(): Promise<SubjectSummary[]> {
  const rawKeys = await listKarteSubjects();
  const groups = new Map<Subject | "unmapped", string[]>();
  for (const subject of SUBJECTS) groups.set(subject, []);
  groups.set("unmapped", []);
  for (const rawKey of rawKeys) {
    const subject = resolveSubjectGroup(rawKey);
    groups.get(subject)?.push(rawKey);
  }

  const summaries: SubjectSummary[] = [];
  for (const subject of [...SUBJECTS, "unmapped" as const]) {
    const sourceKeys = groups.get(subject) ?? [];
    const summary = emptySummary(subject, sourceKeys);
    for (const sourceKey of sourceKeys) {
      const skills = await readSkills(sourceKey);
      if (!skills) continue;
      for (const topic of skills.topics) {
        summary.totalTopics += 1;
        if (topic.state === "weak") summary.weakCount += 1;
        else if (topic.state === "unstable") summary.unstableCount += 1;
        else if (topic.state === "stable") summary.stableCount += 1;
        else summary.insufficientCount += 1;
        if (
          topic.last_practiced_date &&
          (!summary.lastPracticedDate ||
            topic.last_practiced_date > summary.lastPracticedDate)
        ) {
          summary.lastPracticedDate = topic.last_practiced_date;
        }
      }
    }
    summaries.push(summary);
  }
  return summaries;
}
