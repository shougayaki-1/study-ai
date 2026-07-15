import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";

export default function SettingsPage() {
  return (
    <Box sx={{ p: 2, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        設定
      </Typography>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            科目・単元・教材の管理
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            追加/編集UIはフェーズ2で実装します
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            通知
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Push購読のON/OFFはフェーズ2(PWA + Web Push)で実装します
          </Typography>
        </Paper>
      </Stack>
    </Box>
  );
}
