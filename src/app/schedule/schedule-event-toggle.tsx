"use client";
import { useState, useTransition } from "react";
import Checkbox from "@mui/material/Checkbox";
import { toggleScheduleEventDone } from "./_lib/actions";
export default function ScheduleEventToggle({ id, title, initialDone, readOnly = false }: { id: string; title: string; initialDone: boolean; readOnly?: boolean }) {
  const [done, setDone] = useState(initialDone); const [isPending, startTransition] = useTransition();
  // 設計スペック「読み取り専用モード」: クラウド版では完了チェックボックスを**表示しない**。
  // disabled で見せると「押せそうで押せない」状態になり、閲覧専用であることが伝わりにくい。
  if (readOnly) return null;
  return <Checkbox size="small" checked={done} disabled={isPending} inputProps={{ "aria-label": `${title}を完了にする` }} onChange={() => { const next = !done; setDone(next); startTransition(async () => { try { await toggleScheduleEventDone({ id, done: next }); } catch { setDone(!next); } }); }} />;
}
