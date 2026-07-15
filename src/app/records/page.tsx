"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Chip from "@mui/material/Chip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { createClient } from "@/lib/supabase/client";
import { UNDERSTANDING_LABELS, type Understanding } from "@/lib/learning";

type Session = {
  id: string; subject_id: string; unit_id: string | null; material_id: string | null;
  minutes: number; study_date: string; understanding: Understanding | null;
};
type Named = { id: string; name: string; color?: string };
type Result = { is_correct: boolean | null; created_at: string };

export default function RecordsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);
  const [units, setUnits] = useState<Named[]>([]);
  const [materials, setMaterials] = useState<Named[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [period, setPeriod] = useState(0);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    Promise.all([
      supabase.from("study_sessions").select("id,subject_id,unit_id,material_id,minutes,study_date,understanding").gte("study_date", since.toISOString().slice(0, 10)).order("study_date", { ascending: false }),
      supabase.from("subjects").select("id,name,color"),
      supabase.from("units").select("id,name"),
      supabase.from("materials").select("id,name"),
      supabase.from("question_results").select("is_correct,created_at").gte("created_at", since.toISOString()),
    ]).then(([s, subjectsResult, unitsResult, materialsResult, questionResult]) => {
      const firstError = s.error ?? subjectsResult.error ?? unitsResult.error ?? materialsResult.error ?? questionResult.error;
      if (firstError) setError(firstError.message);
      setSessions((s.data ?? []) as Session[]);
      setSubjects((subjectsResult.data ?? []) as Named[]);
      setUnits((unitsResult.data ?? []) as Named[]);
      setMaterials((materialsResult.data ?? []) as Named[]);
      setResults((questionResult.data ?? []) as Result[]);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSessions = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - [0, 6, 29][period]);
    const key = since.toISOString().slice(0, 10);
    return sessions.filter((session) => session.study_date >= key);
  }, [sessions, period]);

  const total = visibleSessions.reduce((sum, session) => sum + session.minutes, 0);
  const bySubject = subjects.map((subject) => ({
    ...subject,
    minutes: visibleSessions.filter((session) => session.subject_id === subject.id).reduce((sum, session) => sum + session.minutes, 0),
  })).filter((subject) => subject.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const recentResults = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - [0, 6, 29][period]);
    return results.filter((result) => result.created_at >= since.toISOString());
  }, [results, period]);
  const correct = recentResults.filter((result) => result.is_correct === true).length;
  const accuracy = recentResults.length ? Math.round(correct / recentResults.length * 100) : null;
  const nameOf = (rows: Named[], id: string | null) => rows.find((row) => row.id === id)?.name;

  if (loading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>履歴</Typography>
      <Tabs value={period} onChange={(_, value) => setPeriod(value)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab label="今日" /><Tab label="7日" /><Tab label="30日" />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}><Typography variant="caption">学習時間</Typography><Typography variant="h5" fontWeight={700}>{total}分</Typography></Paper>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}><Typography variant="caption">演習</Typography><Typography variant="h5" fontWeight={700}>{recentResults.length}問</Typography><Typography variant="caption">正答率 {accuracy == null ? "-" : `${accuracy}%`}</Typography></Paper>
        </Stack>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>科目の比率</Typography>
          {bySubject.length === 0 ? <Typography variant="body2">記録がありません</Typography> : bySubject.map((subject) => (
            <Box key={subject.id} sx={{ mb: 1 }}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{subject.name}</Typography><Typography variant="body2">{subject.minutes}分</Typography></Stack>
              <LinearProgress variant="determinate" value={total ? subject.minutes / total * 100 : 0} sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { backgroundColor: subject.color } }} />
            </Box>
          ))}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>学習記録</Typography>
          <Stack spacing={1.5}>
            {visibleSessions.map((session) => (
              <Box key={session.id}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={700}>{nameOf(subjects, session.subject_id)} ・ {nameOf(units, session.unit_id) ?? "単元未指定"}</Typography><Typography variant="body2">{session.minutes}分</Typography></Stack>
                <Typography variant="caption" color="text.secondary">{session.study_date}{nameOf(materials, session.material_id) ? ` ・ ${nameOf(materials, session.material_id)}` : ""}</Typography>
                {session.understanding && <Chip size="small" label={UNDERSTANDING_LABELS[session.understanding]} sx={{ ml: 1 }} />}
              </Box>
            ))}
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
