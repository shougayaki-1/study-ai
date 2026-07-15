import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";

export default function StatsPage() {
  return (
    <Box sx={{ p: 2, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        分析
      </Typography>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            弱点ヒートマップ(科目×単元)
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            weakness_scores のデータが揃うと表示されます(フェーズ2)
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            勉強時間の推移
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            週/科目別の棒グラフ(フェーズ2)
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            最新レポート・小論文講評
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            reports / essay_reviews の一覧(フェーズ2)
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}
