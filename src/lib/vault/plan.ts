import { readVaultFile } from "./read";
import { assertSafeValue } from "./line-format";

export type PlanStatus = "planned" | "done" | "skipped";
export type PlanBlock = { id: string; start: string; end: string; subject: string; status: PlanStatus; memo: string };

const PREFIX = "- ";

export function parsePlanBlocks(body: string): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    const fields: Record<string, string> = {};
    for (const part of line.slice(PREFIX.length).split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.start || !fields.end || !fields.subject || !fields.status) continue;
    blocks.push({
      id: fields.id,
      start: fields.start,
      end: fields.end,
      subject: fields.subject,
      status: fields.status as PlanStatus,
      memo: fields.memo ?? "",
    });
  }
  return blocks;
}

export function formatPlanBlockLine(block: PlanBlock): string {
  assertSafeValue(block.id, "id");
  assertSafeValue(block.start, "start");
  assertSafeValue(block.end, "end");
  assertSafeValue(block.subject, "subject");
  assertSafeValue(block.status, "status");
  assertSafeValue(block.memo, "memo");
  return `${PREFIX}id=${block.id} | start=${block.start} | end=${block.end} | subject=${block.subject} | status=${block.status} | memo=${block.memo}`;
}

export async function readPlan(date: string): Promise<PlanBlock[]> {
  let body: string;
  try {
    ({ body } = await readVaultFile(`plans/${date}.md`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parsePlanBlocks(body);
}
