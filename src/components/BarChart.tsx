import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReportBarChart } from "@/lib/vault";

// 色だけに頼らず、ラベルと数値を必ず併記する(アクセシビリティ方針)。
export default function BarChart({ chart }: { chart: ReportBarChart }) {
  const max = Math.max(...chart.series.map((item) => item.value), 1);
  return (
    <Stack
      spacing={0.75}
      sx={{ mt: 1 }}
      role="img"
      aria-label={`棒グラフ: ${chart.series
        .map((series) => `${series.label} ${series.value}${chart.unit}`)
        .join("、")}`}
    >
      {chart.series.map((item) => (
        <Stack key={item.label} direction="row" alignItems="center" spacing={1}>
          <Typography
            variant="caption"
            sx={{ width: 88, flexShrink: 0 }}
            noWrap
          >
            {item.label}
          </Typography>
          <Box
            sx={{
              flex: 1,
              height: 12,
              bgcolor: "grey.100",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                width: `${(item.value / max) * 100}%`,
                height: "100%",
                bgcolor: "primary.main",
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{ width: 56, flexShrink: 0, textAlign: "right" }}
          >
            {item.value}
            {chart.unit}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
