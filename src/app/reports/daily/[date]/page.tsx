import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BarChart from "@/components/BarChart";
import { addDays } from "@/lib/date";
import { parseReportSections } from "@/lib/reports/parse-sections";
import {
  parseConfirmTodos,
  readReportChart,
  readVaultFile,
} from "@/lib/vault";
import { stripConfirmTodoSection } from "../_lib/strip-confirm-todo-section";
import ConfirmTodoList from "./confirm-todo-list";

export const dynamic = "force-dynamic";

const MARKDOWN_SX = {
  fontSize: 14,
  lineHeight: 1.8,
  "& table": { width: "100%", borderCollapse: "collapse" },
  "& th, & td": { border: "1px solid #ddd", p: 0.5 },
  "& p": { my: 0.5 },
} as const;

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const reportPath = `reports/daily/${date}.md`;
  const { body } = await readVaultFile(reportPath);
  const todos = parseConfirmTodos(body);
  const strippedBody = stripConfirmTodoSection(body);
  const sections = parseReportSections(strippedBody);
  const chart = await readReportChart(reportPath);
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Button
          component={Link}
          href={`/reports/daily/${prevDate}`}
          size="small"
        >
          ← {prevDate}
        </Button>
        <Typography variant="h6" fontWeight={700}>
          {date}
        </Typography>
        <Button
          component={Link}
          href={`/reports/daily/${nextDate}`}
          size="small"
        >
          {nextDate} →
        </Button>
      </Stack>
      <ConfirmTodoList todos={todos} />
      <Stack spacing={2}>
        {sections.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={MARKDOWN_SX}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {strippedBody}
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
