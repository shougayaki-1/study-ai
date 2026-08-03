import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  EVENT_KIND_COLORS,
  EVENT_KIND_LABELS,
  daysUntil,
} from "@/lib/constants";
import { addDays, formatLocalDate } from "@/lib/date";
import { readPlan, readSchedule, type PlanBlock } from "@/lib/vault";
import ScheduleEventToggle from "./schedule-event-toggle";

export const dynamic = "force-dynamic";
const PLAN_WINDOW_DAYS = 7;

export default async function SchedulePage() {
  const today = formatLocalDate(new Date());
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, index) =>
    addDays(today, index),
  );
  const [events, lists] = await Promise.all([
    readSchedule(),
    Promise.all(dates.map(readPlan)),
  ]);
  const upcoming = events
    .filter((event) => !event.done)
    .sort((a, b) => a.due.localeCompare(b.due));
  const completed = events
    .filter((event) => event.done)
    .sort((a, b) => b.due.localeCompare(a.due));
  const plans: { date: string; blocks: PlanBlock[] }[] = dates.map(
    (date, index) => ({ date, blocks: lists[index] }),
  );

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        計画
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: -1.5, mb: 2 }}
      >
        閲覧専用(変更はMac側の対話から)
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography
          variant="subtitle2"
          color="text.secondary"
          sx={{ mb: 1.5 }}
        >
          締切リスト
        </Typography>
        {upcoming.length === 0 ? (
          <Typography variant="body2">予定はありません</Typography>
        ) : (
          <Stack spacing={1}>
            {upcoming.map((event) => {
              const days = daysUntil(event.due);
              const urgent = days <= 7;
              return (
                <Stack
                  key={event.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    backgroundColor: urgent ? "#fdecea" : "transparent",
                  }}
                >
                  <ScheduleEventToggle done={event.done} />
                  <Chip
                    size="small"
                    label={EVENT_KIND_LABELS[event.kind] ?? event.kind}
                    sx={{
                      backgroundColor: EVENT_KIND_COLORS[event.kind] ?? "#999",
                      color: "#fff",
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {event.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={urgent ? "error.main" : "text.secondary"}
                    >
                      {event.due} ({days >= 0 ? `あと${days}日` : "期限超過"})
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Paper>
      {completed.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            完了済み
          </Typography>
          {completed.map((event) => (
            <Stack
              key={event.id}
              direction="row"
              alignItems="center"
              spacing={1}
            >
              <ScheduleEventToggle done={event.done} />
              <Typography
                variant="body2"
                sx={{ textDecoration: "line-through" }}
              >
                {event.title}
              </Typography>
            </Stack>
          ))}
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          学習計画（今日から{PLAN_WINDOW_DAYS}日間）
        </Typography>
        {plans.map(({ date, blocks }) => (
          <Box key={date} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {date}
              {date === today ? "（今日）" : ""}
            </Typography>
            {blocks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                計画はありません
              </Typography>
            ) : (
              blocks.map((block) => (
                <Stack key={block.id} direction="row" spacing={1}>
                  <Chip size="small" label={`${block.start}-${block.end}`} />
                  <Chip size="small" label={block.subject} />
                  <Typography variant="body2">
                    {block.status === "done"
                      ? "完了"
                      : block.status === "skipped"
                        ? "未実施"
                        : "予定"}
                    {block.memo ? `・${block.memo}` : ""}
                  </Typography>
                </Stack>
              ))
            )}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
