import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { listKarteSubjects } from "./_lib/list-subjects";

export const dynamic = "force-dynamic";

export default async function KartePage() {
  const subjects = await listKarteSubjects();

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        弱点カルテ
      </Typography>
      {subjects.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          まだカルテがありません。
        </Typography>
      ) : (
        <Stack spacing={1}>
          {subjects.map((subject) => (
            <Paper
              key={subject}
              component={Link}
              href={`/karte/${encodeURIComponent(subject)}`}
              variant="outlined"
              sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
            >
              <Typography>{subject}</Typography>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
