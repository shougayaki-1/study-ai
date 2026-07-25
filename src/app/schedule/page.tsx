"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/lib/supabase/use-client";
import { addDays, formatLocalDate } from "@/lib/date";
import { calculatePlanExecution } from "@/lib/study-metrics";
import { throwIfSupabaseError } from "@/lib/supabase/error";
import {
  daysUntil,
  EVENT_KIND_COLORS,
  EVENT_KIND_LABELS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type EventKind = keyof typeof EVENT_KIND_LABELS;
type EventRow = {
  id: string;
  kind: EventKind;
  title: string;
  due_date: string;
  done: boolean;
  event_subjects: Array<{ subject_id: string }>;
  event_units: Array<{ unit_id: string }>;
};
type SubjectRow = { id: string; name: string; color: string };
type UnitRow = { id: string; subject_id: string; name: string };
type PlanBlockRow = {
  id: string;
  plan_date: string;
  start_time: string;
  end_time: string;
  subject_id: string | null;
  unit_id: string | null;
  memo: string | null;
  recurrence_rule: string | null;
  source_plan_id: string | null;
  status: "planned" | "done" | "skipped";
  linked_session_batch_id: string | null;
};

const WEEKDAYS = [
  ["mon", "月"], ["tue", "火"], ["wed", "水"], ["thu", "木"],
  ["fri", "金"], ["sat", "土"], ["sun", "日"],
] as const;
const TIME_PRESETS: Array<[string, string]> = [["19:00", "20:00"], ["20:00", "21:30"], ["21:00", "22:00"]];
const RECURRING_WEEKS = 6;

function todayStr() {
  return formatLocalDate(new Date());
}

function addDaysStr(dateStr: string, days: number) {
  return addDays(dateStr, days);
}

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export default function SchedulePage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [view, setView] = useState<"deadline" | "plan">("deadline");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<EventKind>("assignment");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState<string>(todayStr());
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newUnitId, setNewUnitId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // --- 学習時間割(plan_blocks) ---
  const [planBlocks, setPlanBlocks] = useState<PlanBlockRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planMode, setPlanMode] = useState<"single" | "weekly">("single");
  const [planDate, setPlanDate] = useState<string>(todayStr());
  const [planWeekdays, setPlanWeekdays] = useState<string[]>([]);
  const [planStart, setPlanStart] = useState("19:00");
  const [planEnd, setPlanEnd] = useState("20:00");
  const [planSubjectId, setPlanSubjectId] = useState("");
  const [planUnitId, setPlanUnitId] = useState("");
  const [planMemo, setPlanMemo] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const loadPlanBlocks = useCallback(async () => {
    const { data, error } = await supabase
      .from("plan_blocks")
      .select("id,plan_date,start_time,end_time,subject_id,unit_id,memo,recurrence_rule,source_plan_id,status,linked_session_batch_id")
      .is("recurrence_rule", null)
      .order("plan_date")
      .order("start_time");
    if (!error) setPlanBlocks((data ?? []) as PlanBlockRow[]);
  }, [supabase]);

  useEffect(() => {
    loadPlanBlocks();
  }, [loadPlanBlocks]);

  const openPlanDialog = () => {
    setPlanMode("single");
    setPlanDate(selectedDate);
    setPlanWeekdays([]);
    setPlanStart("19:00");
    setPlanEnd("20:00");
    setPlanSubjectId("");
    setPlanUnitId("");
    setPlanMemo("");
    setPlanError(null);
    setPlanDialogOpen(true);
  };

  const createPlanBlock = async () => {
    if (planEnd <= planStart) {
      setPlanError("終了時刻は開始時刻より後にしてください");
      return;
    }
    if (planMode === "weekly" && planWeekdays.length === 0) {
      setPlanError("繰り返す曜日を選んでください");
      return;
    }
    setPlanSaving(true);
    setPlanError(null);
    try {
      const base = {
        start_time: planStart,
        end_time: planEnd,
        subject_id: planSubjectId || null,
        unit_id: planUnitId || null,
        memo: planMemo.trim() || null,
        status: "planned" as const,
      };
      if (planMode === "single") {
        const { error } = await supabase.from("plan_blocks").insert({ ...base, plan_date: planDate, recurrence_rule: null });
        if (error) throw error;
      } else {
        const { error: recurringError } = await supabase.rpc("create_recurring_plan", {
          p_plan_date: planDate,
          p_start_time: planStart,
          p_end_time: planEnd,
          p_subject_id: planSubjectId,
          p_unit_id: planUnitId,
          p_memo: planMemo,
          p_weekdays: planWeekdays,
          p_weeks: RECURRING_WEEKS,
        });
        if (recurringError) throw recurringError;
      }
      setPlanDialogOpen(false);
      await loadPlanBlocks();
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setPlanSaving(false);
    }
  };

  const setPlanStatus = async (block: PlanBlockRow, status: PlanBlockRow["status"]) => {
    setPlanBlocks((rows) => rows.map((row) => row.id === block.id ? { ...row, status } : row));
    const { error } = await supabase.from("plan_blocks").update({ status }).eq("id", block.id);
    if (error) {
      setPlanError(error.message);
      await loadPlanBlocks();
    }
  };

  const deletePlanBlock = async (id: string) => {
    setPlanBlocks((rows) => rows.filter((row) => row.id !== id));
    try {
      const { error } = await supabase.from("plan_blocks").delete().eq("id", id);
      throwIfSupabaseError(error);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "予定を削除できませんでした。");
      await loadPlanBlocks();
    }
  };

  const recordFromPlanBlock = (block: PlanBlockRow) => {
    const params = new URLSearchParams({
      planBlockId: block.id,
      subjectId: block.subject_id ?? "",
      unitId: block.unit_id ?? "",
      minutes: String(Math.max(5, minutesBetween(block.start_time, block.end_time))),
      studyDate: block.plan_date,
    });
    router.push(`/record?${params.toString()}`);
  };

  const planBlocksForSelectedDate = useMemo(
    () => planBlocks.filter((row) => row.plan_date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [planBlocks, selectedDate],
  );
  const planExecution = useMemo(() => {
    return calculatePlanExecution(planBlocks, todayStr());
  }, [planBlocks]);

  const loadEvents = useCallback(async () => {
    try {
      // ログイン直後はクライアントのセッション初期化が非同期で完了するため、
      // 完了を待ってからクエリを発行しないと(特に初回ログイン時に)401相当のエラーになる。
      await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("events")
        .select("id, kind, title, due_date, done, event_subjects(subject_id), event_units(unit_id)")
        .order("due_date", { ascending: true });
      if (error) {
        setConfigError(
          "予定を取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
        );
        return;
      }
      setEvents((data ?? []) as EventRow[]);
    } catch {
      setConfigError("Supabaseに接続できません。.env.local を確認してください。");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    Promise.all([
      supabase.from("subjects").select("id,name,color").eq("is_target", true).order("sort_order"),
      supabase.from("units").select("id,subject_id,name").eq("is_target", true).order("sort_order"),
    ]).then(([subjectResult, unitResult]) => {
      setSubjects((subjectResult.data ?? []) as SubjectRow[]);
      setUnits((unitResult.data ?? []) as UnitRow[]);
    });
  }, [supabase]);

  const openDialog = () => {
    setEditingEventId(null);
    setNewKind("assignment");
    setNewTitle("");
    setNewDate(todayStr());
    setNewSubjectId("");
    setNewUnitId("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (event: EventRow) => {
    setEditingEventId(event.id);
    setNewKind(event.kind);
    setNewTitle(event.title);
    setNewDate(event.due_date);
    setNewSubjectId(event.event_subjects[0]?.subject_id ?? "");
    setNewUnitId(event.event_units[0]?.unit_id ?? "");
    setFormError(null);
    setDialogOpen(true);
  };

  const createEvent = async () => {
    if (!newTitle.trim()) {
      setFormError("タイトルを入力してください");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { error } = await supabase.rpc("save_event_with_links", {
        p_event_id: editingEventId ?? "",
        p_kind: newKind,
        p_title: newTitle.trim(),
        p_due_date: newDate,
        p_subject_id: newSubjectId,
        p_unit_id: newUnitId,
      });
      if (error) throw error;
      setDialogOpen(false);
      await loadEvents();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (event: EventRow) => {
    const previous = event.done;
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, done: !previous } : e)),
    );
    try {
      const { error } = await supabase.from("events").update({ done: !previous }).eq("id", event.id);
      throwIfSupabaseError(error);
    } catch (error) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done: previous } : e)));
      setFormError(error instanceof Error ? error.message : "予定を更新できませんでした。");
    }
  };

  const deleteEvent = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      const { error } = await supabase.from("events").delete().eq("id", id);
      throwIfSupabaseError(error);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "予定を削除できませんでした。");
      await loadEvents();
    }
  };

  const upcoming = useMemo(
    () => events.filter((e) => !e.done).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [events],
  );
  const completed = useMemo(
    () => events.filter((e) => e.done).sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [events],
  );
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    events.forEach((e) => {
      const arr = map.get(e.due_date) ?? [];
      arr.push(e);
      map.set(e.due_date, arr);
    });
    return map;
  }, [events]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // 月曜始まり
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700}>
          予定
        </Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={view === "deadline" ? openDialog : openPlanDialog}>
          追加
        </Button>
      </Stack>

      <ToggleButtonGroup exclusive fullWidth size="small" value={view} onChange={(_, v) => v && setView(v)} sx={{ mb: 2 }}>
        <ToggleButton value="deadline">締切</ToggleButton>
        <ToggleButton value="plan">時間割</ToggleButton>
      </ToggleButtonGroup>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      {view === "plan" && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">直近28日の計画実行率</Typography>
            {planExecution.total >= 5 ? <>
              <Typography variant="h5" fontWeight={700}>{planExecution.rate}%</Typography>
              <Typography variant="caption">{planExecution.done}/{planExecution.total}ブロック完了・記録連携{planExecution.linked}件</Typography>
            </> : <Typography variant="body2">集計準備中（{planExecution.total}/5ブロック）</Typography>}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <IconButton size="small" onClick={() => setSelectedDate((d) => addDaysStr(d, -1))}>
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="subtitle2">
                {selectedDate}{selectedDate === todayStr() ? "（今日）" : ""}
              </Typography>
              <IconButton size="small" onClick={() => setSelectedDate((d) => addDaysStr(d, 1))}>
                <ChevronRightIcon />
              </IconButton>
            </Stack>
            {planBlocksForSelectedDate.length === 0 ? (
              <Typography variant="body2" color="text.secondary">この日の時間割はありません</Typography>
            ) : (
              <Stack spacing={1}>
                {planBlocksForSelectedDate.map((block) => {
                  const subject = subjects.find((s) => s.id === block.subject_id);
                  const unit = units.find((u) => u.id === block.unit_id);
                  return (
                    <Stack key={block.id} direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderRadius: 1.5, backgroundColor: block.status === "done" ? "#f1f8f1" : "transparent", opacity: block.status === "skipped" ? 0.5 : 1 }}>
                      <Checkbox size="small" checked={block.status === "done"} onChange={() => setPlanStatus(block, block.status === "done" ? "planned" : "done")} />
                      <Chip size="small" label={`${block.start_time.slice(0, 5)}-${block.end_time.slice(0, 5)}`} />
                      {subject && <Chip size="small" label={subject.name} sx={{ backgroundColor: subject.color, color: "#fff" }} />}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {unit && <Typography variant="body2" noWrap>{unit.name}</Typography>}
                        {block.memo && <Typography variant="caption" color="text.secondary" noWrap>{block.memo}</Typography>}
                      </Box>
                      <IconButton size="small" aria-label="記録する" onClick={() => recordFromPlanBlock(block)}>
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => deletePlanBlock(block.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      {view === "deadline" && <Stack spacing={2}>
        {/* 月カレンダー */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <IconButton
              size="small"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="subtitle2">
              {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
            </Typography>
            <IconButton
              size="small"
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRightIcon />
            </IconButton>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
            {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
              <Typography
                key={d}
                variant="caption"
                color="text.secondary"
                textAlign="center"
              >
                {d}
              </Typography>
            ))}
            {calendarCells.map((date, i) => {
              if (!date) return <Box key={i} />;
              const dateStr = formatLocalDate(date);
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr();
              return (
                <Box
                  key={i}
                  sx={{
                    minHeight: 44,
                    borderRadius: 1,
                    border: isToday ? "1.5px solid #3f51b5" : "1px solid transparent",
                    p: 0.5,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="caption">{date.getDate()}</Typography>
                  <Stack spacing={0.3} sx={{ mt: 0.3 }}>
                    {dayEvents.slice(0, 2).map((e) => (
                      <Box
                        key={e.id}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: EVENT_KIND_COLORS[e.kind] ?? "#999",
                          opacity: e.done ? 0.3 : 1,
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Paper>

        {/* 締切リスト */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            締切リスト
          </Typography>
          {upcoming.length === 0 ? (
            <Typography variant="body2">予定はありません</Typography>
          ) : (
            <Stack spacing={1}>
              {upcoming.map((e) => {
                const d = daysUntil(e.due_date);
                const urgent = d <= 7;
                return (
                  <Stack
                    key={e.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                      p: 1,
                      borderRadius: 1.5,
                      backgroundColor: urgent ? "#fdecea" : "transparent",
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={e.done}
                      onChange={() => toggleDone(e)}
                    />
                    <Chip
                      size="small"
                      label={EVENT_KIND_LABELS[e.kind] ?? e.kind}
                      sx={{
                        backgroundColor: EVENT_KIND_COLORS[e.kind] ?? "#999",
                        color: "#fff",
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {e.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color={urgent ? "error.main" : "text.secondary"}
                      >
                        {e.due_date} ({d >= 0 ? `あと${d}日` : "期限超過"})
                      </Typography>
                    </Box>
                    <IconButton size="small" aria-label="予定を編集" onClick={() => openEditDialog(e)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => deleteEvent(e.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Paper>
        {completed.length > 0 && <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>完了済み（チェックを外すと復元）</Typography>
          <Stack spacing={0.5}>{completed.map((event) => <Stack key={event.id} direction="row" alignItems="center" spacing={1}><Checkbox size="small" checked onChange={() => toggleDone(event)} /><Typography variant="body2" sx={{ flex: 1, textDecoration: "line-through", color: "text.secondary" }}>{event.title}</Typography><Typography variant="caption" color="text.secondary">{event.due_date}</Typography></Stack>)}</Stack>
        </Paper>}
      </Stack>}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingEventId ? "締切を編集" : "予定を追加"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              value={newKind}
              onChange={(_, v) => v && setNewKind(v)}
              size="small"
              sx={{ flexWrap: "wrap" }}
            >
              {Object.entries(EVENT_KIND_LABELS).map(([kind, label]) => (
                <ToggleButton key={kind} value={kind}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              label="タイトル"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              fullWidth
              size="small"
              placeholder="例: 数学課題プリント提出"
            />
            <TextField select label="対象科目（任意）" value={newSubjectId} onChange={(event) => { setNewSubjectId(event.target.value); setNewUnitId(""); }} fullWidth size="small">
              <MenuItem value="">指定しない</MenuItem>
              {subjects.map((subject) => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
            </TextField>
            <TextField select label="対象単元（任意）" value={newUnitId} onChange={(event) => setNewUnitId(event.target.value)} disabled={!newSubjectId} fullWidth size="small">
              <MenuItem value="">指定しない</MenuItem>
              {units.filter((unit) => unit.subject_id === newSubjectId).map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
            </TextField>
            <TextField
              label="締切日"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              fullWidth
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={createEvent} disabled={saving}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={planDialogOpen} onClose={() => setPlanDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>時間割を追加</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <ToggleButtonGroup exclusive fullWidth value={planMode} onChange={(_, v) => v && setPlanMode(v)} size="small">
              <ToggleButton value="single">単発</ToggleButton>
              <ToggleButton value="weekly">毎週繰り返し</ToggleButton>
            </ToggleButtonGroup>
            {planMode === "single" ? (
              <TextField
                label="日付"
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ) : (
              <Stack spacing={1}>
                <TextField
                  label="開始日"
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  fullWidth
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                  {WEEKDAYS.map(([code, label]) => (
                    <Chip
                      key={code}
                      label={label}
                      size="small"
                      color={planWeekdays.includes(code) ? "primary" : "default"}
                      onClick={() => setPlanWeekdays((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code])}
                    />
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary">直近{RECURRING_WEEKS}週間分の予定を作成します</Typography>
              </Stack>
            )}
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
              {TIME_PRESETS.map(([start, end]) => (
                <Chip key={`${start}-${end}`} size="small" label={`${start}-${end}`} onClick={() => { setPlanStart(start); setPlanEnd(end); }} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField label="開始時刻" type="time" value={planStart} onChange={(e) => setPlanStart(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="終了時刻" type="time" value={planEnd} onChange={(e) => setPlanEnd(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField select label="科目（任意）" value={planSubjectId} onChange={(event) => { setPlanSubjectId(event.target.value); setPlanUnitId(""); }} fullWidth size="small">
              <MenuItem value="">指定しない</MenuItem>
              {subjects.map((subject) => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
            </TextField>
            <TextField select label="単元（任意）" value={planUnitId} onChange={(event) => setPlanUnitId(event.target.value)} disabled={!planSubjectId} fullWidth size="small">
              <MenuItem value="">指定しない</MenuItem>
              {units.filter((unit) => unit.subject_id === planSubjectId).map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
            </TextField>
            <TextField label="メモ（任意）" value={planMemo} onChange={(e) => setPlanMemo(e.target.value)} fullWidth size="small" />
            {planError && <Alert severity="error">{planError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={createPlanBlock} disabled={planSaving}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
