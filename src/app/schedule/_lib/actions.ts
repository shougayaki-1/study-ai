"use server";

import { revalidatePath } from "next/cache";
import { getVaultSource, setScheduleEventDone } from "@/lib/vault";

export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void> {
  if (getVaultSource() === "supabase") {
    throw new Error(
      "toggleScheduleEventDone is disabled when STUDY_AI_VAULT_SOURCE=supabase: the cloud mirror is read-only"
    );
  }
  await setScheduleEventDone(input.id, input.done);
  revalidatePath("/schedule");
}
