"use server";

import { revalidatePath } from "next/cache";
import { appendCorrection, type ConfirmTodo } from "@/lib/vault";
import { buildCorrectionEntry } from "./build-correction";

export async function performCorrection(input: {
  reportPath: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
}): Promise<void> {
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
