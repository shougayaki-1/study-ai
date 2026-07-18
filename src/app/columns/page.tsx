"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number };
type KnowledgeColumn = {
  id: string;
  subject_id: string;
  unit_id: string | null;
  topic_tag: string | null;
  title: string;
  body_md: string;
  trigger_reason: string | null;
  read_at: string | null;
  created_at: string;
};

function relativeDate(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "今日";
  if (days === 1) return "昨日";
  return `${days}日前`;
}

function ColumnMarkdown({ text }: { text: string }) {
  return (
    <Box sx={{ fontSize: 14, lineHeight: 1.8, "& table": { width: "100%", borderCollapse: "collapse" }, "& th, & td": { border: "1px solid #ddd", p: 0.5 }, "& p": { my: 0.5 } }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </Box>
  );
}

export default function ColumnsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [columns, setColumns] = useState<KnowledgeColumn[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("subjects").select("id,name,color,sort_order").order("sort_order"),
      supabase
        .from("knowledge_columns")
        .select("id,subject_id,unit_id,topic_tag,title,body_md,trigger_reason,read_at,created_at")
        .order("created_at", { ascending: false }),
    ]).then(([s, c]) => {
      if (!active) return;
      const firstError = s.error ?? c.error;
      if (firstError) setError(firstError.message);
      setSubjects((s.data ?? []) as Subject[]);
      setColumns((c.data ?? []) as KnowledgeColumn[]);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => (subjectFilter ? columns.filter((c) => c.subject_id === subjectFilter) : columns),
    [columns, subjectFilter],
  );
  const eligibleSubjects = useMemo(
    () => subjects.filter((s) => columns.some((c) => c.subject_id === s.id)),
    [subjects, columns],
  );
  const open = columns.find((c) => c.id === openId) ?? null;

  const openColumn = async (column: KnowledgeColumn) => {
    setOpenId(column.id);
    if (!column.read_at) {
      const readAt = new Date().toISOString();
      setColumns((rows) => rows.map((row) => row.id === column.id ? { ...row, read_at: readAt } : row));
      await supabase.from("knowledge_columns").update({ read_at: readAt }).eq("id", column.id);
    }
  };

  if (loading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;

  if (open) {
    const subject = subjects.find((s) => s.id === open.subject_id);
    return (
      <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton size="small" onClick={() => setOpenId(null)}><ArrowBackIcon /></IconButton>
          <Typography variant="h6" fontWeight={700}>コラム</Typography>
        </Stack>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            {subject && <Chip size="small" label={subject.name} sx={{ backgroundColor: subject.color, color: "#fff" }} />}
            {open.topic_tag && <Chip size="small" variant="outlined" label={open.topic_tag} />}
            <Typography variant="caption" color="text.secondary">{relativeDate(open.created_at)}</Typography>
          </Stack>
          <Typography variant="h6" fontWeight={700}>{open.title}</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <ColumnMarkdown text={open.body_md} />
          </Paper>
          {open.trigger_reason && (
            <Typography variant="caption" color="text.secondary">生成理由: {open.trigger_reason}</Typography>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>知識コラム</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {eligibleSubjects.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: "wrap", rowGap: 0.5 }}>
          <Chip size="small" label="すべて" color={subjectFilter === "" ? "primary" : "default"} onClick={() => setSubjectFilter("")} />
          {eligibleSubjects.map((subject) => (
            <Chip
              key={subject.id}
              size="small"
              label={subject.name}
              color={subjectFilter === subject.id ? "primary" : "default"}
              onClick={() => setSubjectFilter(subject.id)}
            />
          ))}
        </Stack>
      )}
      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          まだコラムがありません。設定画面で「知識コラム生成」をONにした科目で夜間バッチが実行されると、弱点トピックの解説が届きます。
        </Typography>
      ) : (
        <Stack spacing={1}>
          {filtered.map((column) => {
            const subject = subjects.find((s) => s.id === column.subject_id);
            return (
              <Paper key={column.id} variant="outlined" sx={{ p: 1.5, cursor: "pointer" }} onClick={() => openColumn(column)}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {!column.read_at && <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "error.main", flexShrink: 0 }} />}
                  {subject && <Chip size="small" label={subject.name} sx={{ backgroundColor: subject.color, color: "#fff" }} />}
                  <Typography variant="caption" color="text.secondary">{relativeDate(column.created_at)}</Typography>
                </Stack>
                <Typography fontWeight={700} sx={{ mt: 0.5 }}>{column.title}</Typography>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
