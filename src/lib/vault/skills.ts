import { readVaultFile } from "./read";

export type SkillState = "insufficient" | "weak" | "unstable" | "stable";

export type SkillAttempt = {
  date: string | null;
  result: string;
  duration_sec: number | null;
  question_no: string | null;
  artifact_ref: string;
};

export type SkillTopic = {
  key: string;
  topic_path: string[];
  group: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number;
  recent: string[];
  last_practiced_date: string | null;
  avg_duration_sec: number | null;
  state: SkillState;
  recent_attempts: SkillAttempt[];
};

export type SkillsFile = {
  schema_version: number;
  subject: string;
  generated_at: string;
  topics: SkillTopic[];
};

export const DERIVED_REL_DIR = "data/derived";

export function skillsRelPath(subject: string): string {
  const safe = subject.replace(/[/\\:*?"<>|]/g, "_");
  return `${DERIVED_REL_DIR}/skills-${safe}.json`;
}

export async function readSkills(subject: string): Promise<SkillsFile | null> {
  try {
    const { raw } = await readVaultFile(skillsRelPath(subject));
    const parsed = JSON.parse(raw) as SkillsFile;
    if (parsed.schema_version !== 1 || typeof parsed.subject !== "string" || !Array.isArray(parsed.topics)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
