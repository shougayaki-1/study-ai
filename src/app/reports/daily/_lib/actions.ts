"use server";

import { revalidatePath } from "next/cache";
import { appendCorrection, getVaultSource, type ConfirmTodo } from "@/lib/vault";
import { buildCorrectionEntry } from "./build-correction";

export async function performCorrection(input: {
  reportPath: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
}): Promise<void> {
  // 書き込みは performCorrection に一本化されているので、ガードもここに置く
  // （submitCorrection は revalidatePath を足すだけのラッパー）。
  if (getVaultSource() === "supabase") {
    throw new Error(
      "performCorrection is disabled when STUDY_AI_VAULT_SOURCE=supabase: the cloud mirror is read-only"
    );
  }
  const entry = buildCorrectionEntry({ ...input, now: new Date() });
  await appendCorrection(entry);
}

export async function submitCorrection(input: {
  reportPath: string;
  date: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
}): Promise<void> {
  await performCorrection(input);
  revalidatePath(`/reports/daily/${input.date}`);
}
