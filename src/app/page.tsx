import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "next/link";
import { readPlan, readSchedule, listReports } from "@/lib/vault";
import { COMMON_TEST_DATE, daysUntil, EVENT_KIND_LABELS } from "@/lib/constants";
import { formatLocalDate } from "@/lib/date";
import { collectWeakTopics } from "@/lib/karte/weak-topics";

export const dynamic = "force-dynamic";

const UPCOMING_DUE_WITHIN_DAYS = 7;

export default async function HomePage() {
  const today = formatLocalDate(new Date());
  const daysToExam = daysUntil(COMMON_TEST_DATE);
  const [planBlocks, scheduleEvents, dailyReports, weakTopics] = await Promise.all([
    readPlan(today),
    readSchedule(),
    listReports("daily"),
    collectWeakTopics(5),
  ]);
  const incompleteEvents = scheduleEvents.filter((event) => !event.done);
  const overdueEvents = incompleteEvents.filter((event) => daysUntil(event.due) < 0).sort((a, b) => a.due.localeCompare(b.due));
  const upcomingEvents = incompleteEvents.filter((event) => {
    const days = daysUntil(event.due);
    return days >= 0 && days <= UPCOMING_DUE_WITHIN_DAYS;
  }).sort((a, b) => a.due.localeCompare(b.due));
  const latestDailyReport = dailyReports[0] ?? null;

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>今日</Typography>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">共通テストまで</Typography>
          <Typography variant="h4" fontWeight={700}>{daysToExam >= 0 ? `${daysToExam}日` : "終了"}</Typography>
          <Typography variant="caption" color="text.secondary">{COMMON_TEST_DATE} 予定</Typography>
        </Paper>

        {overdueEvents.length > 0 && <Paper variant="outlined" sx={{ p: 2, borderColor: "error.main", bgcolor: "error.50" }}>
          <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>期限超過</Typography>
          <Stack spacing={1}>{overdueEvents.map((event) => <Stack key={event.id} direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Chip size="small" label={EVENT_KIND_LABELS[event.kind] ?? event.kind} color="error" sx={{ mb: 0.5 }} />
              <Typography variant="body1">{event.title}</Typography>
              <Typography variant="caption" color="text.secondary">{event.due}</Typography>
            </Box>
            <Typography variant="h5" fontWeight={700} color="error.main">期限超過</Typography>
          </Stack>)}</Stack>
        </Paper>}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>今日の計画</Typography>
          {planBlocks.length === 0 ? <Typography variant="body2">今日の計画はまだありません</Typography> : <Stack spacing={1}>
            {planBlocks.map((block) => <Stack key={block.id} direction="row" alignItems="flex-start" spacing={1}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 88 }}>{block.start}〜{block.end}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ textDecoration: block.status === "done" ? "line-through" : "none", color: block.status === "done" ? "text.disabled" : "text.primary" }}>
                  {block.subject}{block.status === "skipped" ? "(見送り)" : ""}
                </Typography>
                {block.memo && <Typography variant="caption" color="text.secondary">{block.memo}</Typography>}
              </Box>
            </Stack>)}
          </Stack>}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ mb: 1 }}
          >
            弱点ハイライト
          </Typography>
          {weakTopics.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              学習状態データがまだありません
            </Typography>
          ) : (
            <Stack spacing={1}>
              {weakTopics.map((entry) => (
                <Stack
                  key={`${entry.subjectKey}-${entry.topic.key}`}
                  component={Link}
                  href={`/karte/${encodeURIComponent(entry.subjectKey)}`}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ textDecoration: "none", color: "inherit" }}
                >
                  <Box>
                    <Typography variant="body2">{entry.topic.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.subjectKey}・{entry.topic.correct}/
                      {entry.topic.attempts}
                    </Typography>
                  </Box>
                  <Chip size="small" color="error" label="弱い" />
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>締切が近い予定({UPCOMING_DUE_WITHIN_DAYS}日以内)</Typography>
          {upcomingEvents.length === 0 ? <Typography variant="body2">締切が近い予定はありません</Typography> : <Stack spacing={1}>
            {upcomingEvents.map((event) => {
              const days = daysUntil(event.due);
              const isUrgent = days <= 3;
              return <Stack key={event.id} direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Chip size="small" label={EVENT_KIND_LABELS[event.kind] ?? event.kind} color={isUrgent ? "error" : "default"} sx={{ mb: 0.5 }} />
                  <Typography variant="body1">{event.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{event.due}</Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color={isUrgent ? "error.main" : "text.primary"}>あと{days}日</Typography>
              </Stack>;
            })}
          </Stack>}
          {upcomingEvents.some((event) => daysUntil(event.due) <= 3) && <Alert severity="warning" sx={{ mt: 1.5 }}>締切まで3日以内の予定があります</Alert>}
        </Paper>

        {latestDailyReport && <Button component={Link} href="/reports" variant="outlined" fullWidth>最新のレポートを見る(日次 {latestDailyReport.date})</Button>}
      </Stack>
    </Box>
  );
}
