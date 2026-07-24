import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const { body } = await readVaultFile(`reports/weekly/${week}.md`);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {week} の週次レポート
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          sx={{
            fontSize: 14,
            lineHeight: 1.8,
            "& table": { width: "100%", borderCollapse: "collapse" },
            "& th, & td": { border: "1px solid #ddd", p: 0.5 },
            "& p": { my: 0.5 },
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  );
}
