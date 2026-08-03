import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { listReports } from "@/lib/vault";
import { reportLabel } from "./report-label";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [dailyReports, weeklyReports] = await Promise.all([
    listReports("daily"),
    listReports("weekly"),
  ]);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        レポート
      </Typography>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        日次
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {dailyReports.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            まだ日次レポートがありません。
          </Typography>
        )}
        {dailyReports.map((meta) => (
          <Paper
            key={meta.path}
            component={Link}
            href={`/reports/daily/${meta.date}`}
            variant="outlined"
            sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
          >
            <Typography>{reportLabel(meta)}</Typography>
          </Paper>
        ))}
      </Stack>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        週次
      </Typography>
      <Stack spacing={1}>
        {weeklyReports.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            まだ週次レポートがありません。
          </Typography>
        )}
        {weeklyReports.map((meta) => (
          <Paper
            key={meta.path}
            component={Link}
            href={`/reports/weekly/${meta.date}`}
            variant="outlined"
            sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
          >
            <Typography>{reportLabel(meta)}</Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
