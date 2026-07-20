"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Link from "next/link";
import { useSupabase } from "@/lib/supabase/use-client";
import { COMMON_TEST_DATE, daysUntil, EVENT_KIND_LABELS } from "@/lib/constants";
import { formatLocalDate } from "@/lib/date";
import { throwIfSupabaseError } from "@/lib/supabase/error";

export const dynamic = "force-dynamic";

type ReviewTask = {
  id: string;
  subject_id: string | null;
  unit_id: string | null;
  material_id: string | null;
  range_text: string | null;
  reason: string | null;
  due_date: string;
  done: boolean;
  status?: "pending" | "completed" | "expired";
  units?: { name: string } | null;
  subjects?: { name: string } | null;
  materials?: { name: string } | null;
};

type EventRow = {
  id: string;
  kind: string;
  title: string;
  due_date: string;
  done: boolean;
};

type Report = {
  id: string;
  kind: string;
  created_at: string;
};

export default function HomePage() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [nextEvent, setNextEvent] = useState<EventRow | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [latestReport, setLatestReport] = useState<Report | null>(null);

  const daysToExam = daysUntil(COMMON_TEST_DATE);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const today = formatLocalDate(new Date());
        const [eventsRes, tasksRes, reportRes] = await Promise.all([
          supabase
            .from("events")
            .select("id, kind, title, due_date, done")
            .eq("done", false)
            .order("due_date", { ascending: true })
            .limit(1),
          supabase
            .from("review_tasks")
            .select(
              "id, subject_id, unit_id, material_id, range_text, reason, due_date, done, status, subjects(name), units(name), materials(name)",
            )
            .lte("due_date", today)
            .in("status", ["pending", "completed"])
            .order("due_date", { ascending: true }),
          supabase
            .from("reports")
            .select("id, kind, created_at")
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        if (!active) return;
        if (eventsRes.error || tasksRes.error || reportRes.error) {
          setConfigError(
            "データを取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
          );
          return;
        }
        setNextEvent(((eventsRes.data ?? [])[0] as EventRow) ?? null);
        setTasks((tasksRes.data ?? []) as unknown as ReviewTask[]);
        setLatestReport(((reportRes.data ?? [])[0] as Report) ?? null);
      } catch {
        if (active) {
          setConfigError(
            "Supabaseに接続できません。.env.local を確認してください。",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  const toggleTask = async (task: ReviewTask) => {
    const previous = task.done;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: !previous } : t)),
    );
    try {
      const { error } = await supabase
        .from("review_tasks")
        .update({ done: !previous, status: !previous ? "completed" : "pending", completed_at: !previous ? new Date().toISOString() : null })
        .eq("id", task.id);
      throwIfSupabaseError(error);
    } catch (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: previous } : t)));
      setConfigError(error instanceof Error ? error.message : "復習タスクを更新できませんでした。");
    }
  };

  const nextEventDays = nextEvent ? daysUntil(nextEvent.due_date) : null;
  const isUrgent = nextEventDays !== null && nextEventDays <= 7;

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        今日
      </Typography>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            共通テストまで
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {daysToExam >= 0 ? `${daysToExam}日` : "終了"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {COMMON_TEST_DATE} 予定
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            直近の締切
          </Typography>
          {loading ? (
            <CircularProgress size={20} sx={{ mt: 1 }} />
          ) : nextEvent ? (
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mt: 1 }}
            >
              <Box>
                <Chip
                  size="small"
                  label={EVENT_KIND_LABELS[nextEvent.kind] ?? nextEvent.kind}
                  color={isUrgent ? "error" : "default"}
                  sx={{ mb: 0.5 }}
                />
                <Typography variant="body1">{nextEvent.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {nextEvent.due_date}
                </Typography>
              </Box>
              <Typography
                variant="h5"
                fontWeight={700}
                color={isUrgent ? "error.main" : "text.primary"}
              >
                {nextEventDays}日
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ mt: 1 }}>
              予定はありません
            </Typography>
          )}
          {isUrgent && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              締切まで7日以内です
            </Alert>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            今日の復習提案
          </Typography>
          {loading ? (
            <CircularProgress size={20} />
          ) : tasks.length === 0 ? (
            <Typography variant="body2">
              まだ提案がありません(夜間バッチ実行後に表示されます)
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {tasks.filter((task) => showCompleted || !task.done).map((task) => (
                <Stack
                  key={task.id}
                  direction="row"
                  alignItems="flex-start"
                  spacing={0.5}
                >
                  <Checkbox
                  checked={task.done}
                    onChange={() => toggleTask(task)}
                    size="small"
                    sx={{ mt: -0.5 }}
                  />
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        textDecoration: task.done ? "line-through" : "none",
                        color: task.done ? "text.disabled" : "text.primary",
                      }}
                    >
                      {task.units?.name ?? task.subjects?.name ?? "対象不明"}
                      {task.materials?.name ? ` ・ ${task.materials.name}` : ""}
                      {task.range_text ? ` ${task.range_text}` : ""}
                    </Typography>
                    {task.reason && (
                      <Typography variant="caption" color="text.secondary">
                        {task.reason}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
          {tasks.some((task) => task.done) && <Button size="small" onClick={() => setShowCompleted((current) => !current)}>
            {showCompleted ? "完了済みを隠す" : "完了済みを表示・復元"}
          </Button>}
        </Paper>

        {latestReport && (
          <Button
            component={Link}
            href="/stats"
            variant="outlined"
            fullWidth
          >
            最新のレポートを見る({latestReport.kind === "daily" ? "日次" : "週次"})
          </Button>
        )}

        <Button
          component={Link}
          href="/record"
          variant="contained"
          size="large"
          fullWidth
        >
          記録を始める
        </Button>
      </Stack>
    </Box>
  );
}
