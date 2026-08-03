import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BarChart from "@/components/BarChart";
import { parseReportSections } from "@/lib/reports/parse-sections";
import { readReportChart, readVaultFile } from "@/lib/vault";

export const dynamic = "force-dynamic";

const MARKDOWN_SX = {
  fontSize: 14,
  lineHeight: 1.8,
  "& table": { width: "100%", borderCollapse: "collapse" },
  "& th, & td": { border: "1px solid #ddd", p: 0.5 },
  "& p": { my: 0.5 },
} as const;

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const reportPath = `reports/weekly/${week}.md`;
  const { body } = await readVaultFile(reportPath);
  const sections = parseReportSections(body);
  const chart = await readReportChart(reportPath);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {week} の週次レポート
      </Typography>
      <Stack spacing={2}>
        {sections.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={MARKDOWN_SX}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {body}
              </ReactMarkdown>
            </Box>
          </Paper>
        ) : (
          sections.map((section) => (
            <Paper key={section.heading} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {section.heading}
              </Typography>
              <Box sx={MARKDOWN_SX}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {section.body}
                </ReactMarkdown>
              </Box>
              {chart?.[section.heading] && (
                <BarChart chart={chart[section.heading]} />
              )}
            </Paper>
          ))
        )}
      </Stack>
    </Box>
  );
}
