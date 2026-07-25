import type { ConfirmTodo, CorrectionEntry } from "@/lib/vault";
import { formatIsoWithJstOffset } from "@/lib/date";

export function buildCorrectionEntry(params: {
  reportPath: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
  now: Date;
}): CorrectionEntry {
  const entry: CorrectionEntry = {
    timestamp: formatIsoWithJstOffset(params.now),
    report: params.reportPath,
    todo: params.todo.id,
    choice: params.choice,
  };
  if (params.note) {
    entry.note = params.note;
  }
  return entry;
}
