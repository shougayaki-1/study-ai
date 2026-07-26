"use server";

import { revalidatePath } from "next/cache";
import { setScheduleEventDone } from "@/lib/vault";

export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void> {
  await setScheduleEventDone(input.id, input.done);
  revalidatePath("/schedule");
}
