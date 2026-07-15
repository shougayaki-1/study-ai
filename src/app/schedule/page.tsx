import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";

export default function SchedulePage() {
  return (
    <Box sx={{ p: 2, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        予定
      </Typography>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            締切リスト
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            events テーブルのCRUD UI(種別バッジ+月カレンダー)はフェーズ2で実装します
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}
