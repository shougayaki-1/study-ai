"use client";

import { useEffect, useMemo, useState } from "react";
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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { createClient } from "@/lib/supabase/client";
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
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKind, setNewKind] = useState<EventKind>("assignment");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, kind, title, due_date, done")
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
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDialog = () => {
    setNewKind("assignment");
    setNewTitle("");
    setNewDate(todayStr());
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
      const { error } = await supabase.from("events").insert({
        kind: newKind,
        title: newTitle.trim(),
        due_date: newDate,
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
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, done: !e.done } : e)),
    );
    try {
      await supabase.from("events").update({ done: !event.done }).eq("id", event.id);
    } catch {
      // 次回読み込みで整合
    }
  };

  const deleteEvent = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await supabase.from("events").delete().eq("id", id);
    } catch {
      await loadEvents();
    }
  };

  const upcoming = useMemo(
    () => events.filter((e) => !e.done).sort((a, b) => a.due_date.localeCompare(b.due_date)),
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          予定
        </Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={openDialog}>
          追加
        </Button>
      </Stack>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      <Stack spacing={2}>
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
              const dateStr = date.toISOString().slice(0, 10);
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
                    <IconButton size="small" onClick={() => deleteEvent(e.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Paper>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>予定を追加</DialogTitle>
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
    </Box>
  );
}
