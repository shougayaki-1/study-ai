import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { buildSubjectSummaries } from "@/lib/karte/subject-summary";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = { unmapped: "未分類" };

export default async function KartePage() {
  let summaries: Awaited<ReturnType<typeof buildSubjectSummaries>>;
  try {
    summaries = await buildSubjectSummaries();
  } catch {
    return (
      <Box sx={{ p: 2, pb: 10, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          学習状態
        </Typography>
        <Alert severity="error">
          カルテを取得できませんでした。環境変数 STUDY_AI_VAULT_DIR
          (vaultディレクトリの絶対パス)が設定されているか確認してください。
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        学習状態
      </Typography>
      <Stack spacing={1.5}>
        {summaries.map((summary) => (
          <Paper key={summary.subject} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body1" fontWeight={700}>
              {SUBJECT_LABELS[summary.subject] ?? summary.subject}
            </Typography>
            {summary.sourceKeys.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                未計測
              </Typography>
            ) : summary.totalTopics === 0 ? (
              <Typography variant="body2" color="text.secondary">
                スキルデータなし(カルテ本文のみ)
              </Typography>
            ) : (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ mb: 0.5, flexWrap: "wrap" }}
              >
                {summary.weakCount > 0 && (
                  <Chip
                    size="small"
                    color="error"
                    label={`弱い ${summary.weakCount}`}
                  />
                )}
                {summary.unstableCount > 0 && (
                  <Chip
                    size="small"
                    color="warning"
                    label={`不安定 ${summary.unstableCount}`}
                  />
                )}
                {summary.stableCount > 0 && (
                  <Chip
                    size="small"
                    color="success"
                    label={`安定 ${summary.stableCount}`}
                  />
                )}
                {summary.insufficientCount > 0 && (
                  <Chip
                    size="small"
                    label={`データ不足 ${summary.insufficientCount}`}
                  />
                )}
              </Stack>
            )}
            {summary.lastPracticedDate && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                最終学習日: {summary.lastPracticedDate}
              </Typography>
            )}
            {summary.sourceKeys.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                {summary.sourceKeys.map((key) => (
                  <Chip
                    key={key}
                    component={Link}
                    href={`/karte/${encodeURIComponent(key)}`}
                    label={key}
                    size="small"
                    clickable
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
