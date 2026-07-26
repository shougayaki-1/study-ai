import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import {
  listStudyRecordDates,
  readStudyRecord,
  type StudyRecordDay,
  type StudySession,
} from "@/lib/vault";
import { RECORD_TYPE_LABELS } from "@/lib/study-session";
import { UNDERSTANDING_LABELS } from "@/lib/learning";

export const dynamic = "force-dynamic";

type DayResult = { status: "ok"; day: StudyRecordDay } | { status: "error"; date: string };

function sessionDetailLine(session: StudySession): string {
  if (session.kind === "common_test") {
    return `${RECORD_TYPE_LABELS[session.kind]} ・ ${session.year ?? "年度未指定"}年度・${session.section ?? "年度通し"}`;
  }
  return RECORD_TYPE_LABELS[session.kind];
}

export default async function RecordsPage() {
  const dates = await listStudyRecordDates();
  const results: DayResult[] = await Promise.all(
    dates.map(async (date): Promise<DayResult> => {
      try {
        return { status: "ok", day: await readStudyRecord(date) };
      } catch {
        return { status: "error", date };
      }
    }),
  );

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>履歴</Typography>
      {results.length === 0 && <Typography variant="body2" color="text.secondary">まだ学習記録がありません。</Typography>}
      <Stack spacing={3}>
        {results.map((result) => {
          if (result.status === "error") {
            return <Paper key={result.date} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">{result.date}</Typography>
              <Typography variant="body2" color="text.secondary">この日の記録を読み込めませんでした。</Typography>
            </Paper>;
          }
          const bySubject = new Map<string, number>();
          for (const session of result.day.sessions) {
            bySubject.set(session.subject, (bySubject.get(session.subject) ?? 0) + session.minutes);
          }
          const subjectTotals = Array.from(bySubject.entries()).sort((a, b) => b[1] - a[1]);
          return <Box key={result.day.date}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>{result.day.date}</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
              {subjectTotals.map(([subject, minutes]) => <Chip key={subject} label={`${subject} ${minutes}分`} size="small" />)}
            </Stack>
            <Stack spacing={1}>
              {result.day.sessions.map((session) => <Paper key={session.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={700}>{session.subject} ・ {session.minutes}分</Typography>
                  <Chip size="small" label={UNDERSTANDING_LABELS[session.understanding]} />
                </Stack>
                <Typography variant="caption" color="text.secondary">{sessionDetailLine(session)}</Typography>
                {session.memo && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>メモ: {session.memo}</Typography>}
              </Paper>)}
            </Stack>
          </Box>;
        })}
      </Stack>
    </Box>
  );
}
