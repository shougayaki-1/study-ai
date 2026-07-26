"use client";
import { useState, useTransition } from "react";
import Checkbox from "@mui/material/Checkbox";
import { toggleScheduleEventDone } from "./_lib/actions";
export default function ScheduleEventToggle({ id, title, initialDone }: { id: string; title: string; initialDone: boolean }) {
  const [done, setDone] = useState(initialDone); const [isPending, startTransition] = useTransition();
  return <Checkbox size="small" checked={done} disabled={isPending} inputProps={{ "aria-label": `${title}を完了にする` }} onChange={() => { const next = !done; setDone(next); startTransition(async () => { try { await toggleScheduleEventDone({ id, done: next }); } catch { setDone(!next); } }); }} />;
}
