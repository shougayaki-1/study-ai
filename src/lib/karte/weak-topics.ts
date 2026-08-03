import { readSkills, type SkillTopic } from "@/lib/vault";
import { listKarteSubjects } from "./list-subjects";
import { resolveSubjectGroup, type Subject } from "./subject-mapping";

export type WeakTopicEntry = {
  subjectKey: string;
  canonicalSubject: Subject | "unmapped";
  topic: SkillTopic;
};

export async function collectWeakTopics(
  limit: number,
): Promise<WeakTopicEntry[]> {
  const subjectKeys = await listKarteSubjects();
  const entries: WeakTopicEntry[] = [];
  for (const subjectKey of subjectKeys) {
    const skills = await readSkills(subjectKey);
    if (!skills) continue;
    for (const topic of skills.topics) {
      if (topic.state !== "weak") continue;
      entries.push({
        subjectKey,
        canonicalSubject: resolveSubjectGroup(subjectKey),
        topic,
      });
    }
  }
  entries.sort(
    (a, b) =>
      a.topic.accuracy - b.topic.accuracy || b.topic.attempts - a.topic.attempts,
  );
  return entries.slice(0, limit);
}
