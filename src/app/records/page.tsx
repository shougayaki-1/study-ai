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
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { createClient } from "@/lib/supabase/client";
import { UNDERSTANDING_LABELS, type Understanding } from "@/lib/learning";
import { RECORD_TYPE_LABELS, type RecordType } from "@/lib/study-session";

type Session = {
  id: string; subject_id: string; unit_id: string | null; material_id: string | null;
  minutes: number; study_date: string; understanding: Understanding | null;
  record_type: RecordType; common_test_year: number | null; common_test_section: string | null;
};
type Named = { id: string; name: string; color?: string; subject_id?: string };
type Result = { is_correct: boolean | null; created_at: string };
const COMMON_TEST_SECTIONS = ["年度通し", ...Array.from({ length: 8 }, (_, index) => `大問${index + 1}`)];

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
  const [editing, setEditing] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    Promise.all([
      supabase.from("study_sessions").select("id,subject_id,unit_id,material_id,minutes,study_date,understanding,record_type,common_test_year,common_test_section").gte("study_date", since.toISOString().slice(0, 10)).order("study_date", { ascending: false }),
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
  const commonTestLabel = (session: Session) => session.record_type === "common_test" ? `${session.common_test_year ?? "年度未指定"}年度・${session.common_test_section ?? "大問未指定"}` : nameOf(units, session.unit_id) ?? "単元未指定";

  const saveEdit = async () => {
    if (!editing || editing.minutes <= 0) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from("study_sessions").update({
      study_date: editing.study_date,
      minutes: editing.minutes,
      unit_id: editing.record_type === "common_test" ? null : editing.unit_id || null,
      material_id: editing.material_id || null,
      understanding: editing.understanding,
      record_type: editing.record_type,
      common_test_year: editing.record_type === "common_test" ? editing.common_test_year : null,
      common_test_section: editing.record_type === "common_test" ? editing.common_test_section : null,
    }).eq("id", editing.id);
    if (updateError) setError(updateError.message);
    else {
      setSessions((current) => current.map((session) => session.id === editing.id ? editing : session));
      setEditing(null);
    }
    setSaving(false);
  };

  const deleteSession = async (session: Session) => {
    if (!window.confirm(`${session.study_date}の記録を削除しますか？`)) return;
    setError(null);
    const { error: deleteError } = await supabase.from("study_sessions").delete().eq("id", session.id);
    if (deleteError) setError(deleteError.message);
    else setSessions((current) => current.filter((item) => item.id !== session.id));
  };

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
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2" fontWeight={700}>{nameOf(subjects, session.subject_id)} ・ {commonTestLabel(session)}</Typography><Stack direction="row" alignItems="center"><Typography variant="body2">{session.minutes}分</Typography><IconButton aria-label="記録を編集" size="small" onClick={() => setEditing(session)}><EditIcon fontSize="small" /></IconButton><IconButton aria-label="記録を削除" size="small" color="error" onClick={() => deleteSession(session)}><DeleteIcon fontSize="small" /></IconButton></Stack></Stack>
                <Typography variant="caption" color="text.secondary">{session.study_date} ・ {RECORD_TYPE_LABELS[session.record_type]}{nameOf(materials, session.material_id) ? ` ・ ${nameOf(materials, session.material_id)}` : ""}</Typography>
                {session.understanding && <Chip size="small" label={UNDERSTANDING_LABELS[session.understanding]} sx={{ ml: 1 }} />}
              </Box>
            ))}
          </Stack>
        </Paper>
      </Stack>
      <Dialog open={!!editing} onClose={() => !saving && setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>学習記録を編集</DialogTitle>
        <DialogContent>{editing && <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="記録日" type="date" value={editing.study_date} onChange={(event) => setEditing({ ...editing, study_date: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          <TextField label="学習時間（分）" type="number" value={editing.minutes} onChange={(event) => setEditing({ ...editing, minutes: Math.max(1, Number(event.target.value)) })} fullWidth />
          <TextField select label="演習区分" value={editing.record_type} onChange={(event) => setEditing({ ...editing, record_type: event.target.value as RecordType })} fullWidth>{Object.entries(RECORD_TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          {editing.record_type === "common_test" ? <Stack direction="row" spacing={1}><TextField label="年度" type="number" value={editing.common_test_year ?? ""} onChange={(event) => setEditing({ ...editing, common_test_year: Number(event.target.value) || null })} fullWidth /><TextField select label="大問" value={editing.common_test_section ?? "年度通し"} onChange={(event) => setEditing({ ...editing, common_test_section: event.target.value })} fullWidth>{COMMON_TEST_SECTIONS.map((section) => <MenuItem key={section} value={section}>{section}</MenuItem>)}</TextField></Stack> : <TextField select label="単元" value={editing.unit_id ?? ""} onChange={(event) => setEditing({ ...editing, unit_id: event.target.value || null })} fullWidth><MenuItem value="">未指定</MenuItem>{units.filter((unit) => unit.subject_id === editing.subject_id).map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}</TextField>}
          <TextField select label="教材" value={editing.material_id ?? ""} onChange={(event) => setEditing({ ...editing, material_id: event.target.value || null })} fullWidth><MenuItem value="">未指定</MenuItem>{materials.map((material) => <MenuItem key={material.id} value={material.id}>{material.name}</MenuItem>)}</TextField>
          <TextField select label="理解度" value={editing.understanding ?? ""} onChange={(event) => setEditing({ ...editing, understanding: (event.target.value || null) as Understanding | null })} fullWidth><MenuItem value="">未指定</MenuItem>{Object.entries(UNDERSTANDING_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        </Stack>}</DialogContent>
        <DialogActions><Button onClick={() => setEditing(null)} disabled={saving}>キャンセル</Button><Button variant="contained" onClick={saveEdit} disabled={saving}>{saving ? "保存中..." : "保存"}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
