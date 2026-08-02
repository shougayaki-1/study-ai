import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readSkills, readVaultFile } from "@/lib/vault";
import { SkillMap } from "./_components/SkillMap";

export const dynamic = "force-dynamic";

export default async function KarteSubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const subjectName = decodeURIComponent(subject);

  const skills = await readSkills(subjectName);
  let body: string | null = null;
  try {
    ({ body } = await readVaultFile(`subjects/${subjectName}/弱点カルテ.md`));
  } catch {
    if (skills !== null) {
      body = null;
    } else {
      return (
        <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            {subjectName} 弱点カルテ
          </Typography>
          <Alert severity="error">
            カルテを取得できませんでした。環境変数 STUDY_AI_VAULT_DIR
            (vaultディレクトリの絶対パス)が設定されているか確認してください。
          </Alert>
        </Box>
      );
    }
  }

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {subjectName} 弱点カルテ
      </Typography>
      {skills && skills.topics.length > 0 ? (
        <SkillMap skills={skills} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          この科目の単元マップはまだ集計されていません。
        </Typography>
      )}
      {body !== null ? (
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
      ) : (
        <Typography variant="body2" color="text.secondary">
          この科目のカルテ本文はまだ作成されていません。
        </Typography>
      )}
    </Box>
  );
}
