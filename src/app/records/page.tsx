"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import { createClient } from "@/lib/supabase/client";
import { PhotoUploadPanel } from "@/components/photo-upload-panel";
import { UNDERSTANDING_LABELS, type Understanding } from "@/lib/learning";
import { RECORD_TYPE_LABELS, type RecordType } from "@/lib/study-session";

type Session = {
  id: string; subject_id: string; unit_id: string | null; material_id: string | null;
  minutes: number; study_date: string; understanding: Understanding | null;
  record_type: RecordType; common_test_year: number | null; common_test_section: string | null;
  memo: string | null;
};
type Named = { id: string; name: string; color?: string; subject_id?: string };
type Result = { is_correct: boolean | null; created_at: string };
type PeriodMode = "day" | "week" | "month";
const COMMON_TEST_SECTIONS = ["年度通し", ...Array.from({ length: 8 }, (_, index) => `大問${index + 1}`)];

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function rangeFor(mode: PeriodMode, refDate: string) {
  const ref = parseLocalDate(refDate);
  if (mode === "day") return { start: ref, end: ref };
  if (mode === "week") {
    const mondayOffset = (ref.getDay() + 6) % 7;
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - mondayOffset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start, end };
  }
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start, end };
}
function shiftRefDate(mode: PeriodMode, refDate: string, delta: number) {
  const ref = parseLocalDate(refDate);
  if (mode === "day") ref.setDate(ref.getDate() + delta);
  else if (mode === "week") ref.setDate(ref.getDate() + delta * 7);
  else ref.setMonth(ref.getMonth() + delta);
  return localDateString(ref);
}
function formatRangeLabel(mode: PeriodMode, start: Date, end: Date) {
  if (mode === "day") return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
  if (mode === "week") return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 〜 ${end.getMonth() + 1}月${end.getDate()}日`;
  return `${start.getFullYear()}年${start.getMonth() + 1}月`;
}

export default function RecordsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);
  const [units, setUnits] = useState<Named[]>([]);
  const [materials, setMaterials] = useState<Named[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [mode, setMode] = useState<PeriodMode>("day");
  const [refDate, setRefDate] = useState(() => localDateString(new Date()));
  const [editing, setEditing] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoSession, setPhotoSession] = useState<Session | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 400);
    Promise.all([
      supabase.from("study_sessions").select("id,subject_id,unit_id,material_id,minutes,study_date,understanding,record_type,common_test_year,common_test_section,memo").gte("study_date", since.toISOString().slice(0, 10)).order("study_date", { ascending: false }),
      supabase.from("subjects").select("id,name,color"),
      supabase.from("units").select("id,name,subject_id"),
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

  const { start: rangeStart, end: rangeEnd } = useMemo(() => rangeFor(mode, refDate), [mode, refDate]);
  const startKey = localDateString(rangeStart);
  const endKey = localDateString(rangeEnd);

  const visibleSessions = useMemo(() => {
    return sessions.filter((session) => session.study_date >= startKey && session.study_date <= endKey);
  }, [sessions, startKey, endKey]);

  const total = visibleSessions.reduce((sum, session) => sum + session.minutes, 0);
  const bySubject = subjects.map((subject) => ({
    ...subject,
    minutes: visibleSessions.filter((session) => session.subject_id === subject.id).reduce((sum, session) => sum + session.minutes, 0),
  })).filter((subject) => subject.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const recentResults = useMemo(() => {
    const startInstant = rangeStart.toISOString();
    const endExclusive = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1).toISOString();
    return results.filter((result) => result.created_at >= startInstant && result.created_at < endExclusive);
  }, [results, rangeStart, rangeEnd]);
  const correct = recentResults.filter((result) => result.is_correct === true).length;
  const accuracy = recentResults.length ? Math.round(correct / recentResults.length * 100) : null;
  const nameOf = (rows: Named[], id: string | null) => rows.find((row) => row.id === id)?.name;
  const commonTestLabel = (session: Session) => session.record_type === "common_test" ? `${session.common_test_year ?? "年度未指定"}年度・${session.common_test_section ?? "年度通し"}` : nameOf(units, session.unit_id) ?? "単元未指定";

  const saveEdit = async () => {
    if (!editing || editing.minutes <= 0) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from("study_sessions").update({
      study_date: editing.study_date,
      minutes: editing.minutes,
      unit_id: editing.record_type === "common_test" && (!editing.common_test_section || editing.common_test_section === "年度通し") ? null : editing.unit_id || null,
      material_id: editing.material_id || null,
      understanding: editing.understanding,
      record_type: editing.record_type,
      common_test_year: editing.record_type === "common_test" ? editing.common_test_year : null,
      common_test_section: editing.record_type === "common_test" && editing.common_test_section !== "年度通し" ? editing.common_test_section : null,
      memo: editing.memo?.trim() || null,
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
      <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, value: PeriodMode | null) => value && setMode(value)} sx={{ mb: 1 }}>
        <ToggleButton value="day">日</ToggleButton>
        <ToggleButton value="week">週</ToggleButton>
        <ToggleButton value="month">月</ToggleButton>
      </ToggleButtonGroup>
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
        <IconButton aria-label="前へ" size="small" onClick={() => setRefDate((current) => shiftRefDate(mode, current, -1))}><ChevronLeftIcon /></IconButton>
        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 180, textAlign: "center" }}>{formatRangeLabel(mode, rangeStart, rangeEnd)}</Typography>
        <IconButton aria-label="次へ" size="small" onClick={() => setRefDate((current) => shiftRefDate(mode, current, 1))}><ChevronRightIcon /></IconButton>
        <IconButton aria-label="今日に戻る" size="small" onClick={() => setRefDate(localDateString(new Date()))}><TodayIcon fontSize="small" /></IconButton>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}><Typography variant="caption">学習時間</Typography><Typography variant="h5" fontWeight={700}>{total}分</Typography></Paper>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}><Typography variant="caption">演習</Typography><Typography variant="h5" fontWeight={700}>{recentResults.length}問</Typography><Typography variant="caption">正答率 {accuracy == null ? "-" : `${accuracy}%`}</Typography></Paper>
        </Stack>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>科目の比率</Typography>
          {bySubject.length === 0 ? <Typography variant="body2">記録がありません</Typography> : <Stack direction="row" spacing={2} alignItems="center">
            <Box aria-label="科目の学習時間比率" sx={{ width: 150, height: 150, flex: "0 0 auto", borderRadius: "50%", background: `conic-gradient(${bySubject.map((subject, index) => `${subject.color ?? "#777"} ${bySubject.slice(0, index).reduce((sum, item) => sum + item.minutes / total * 100, 0)}% ${bySubject.slice(0, index + 1).reduce((sum, item) => sum + item.minutes / total * 100, 0)}%`).join(", ")})` }} />
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>{bySubject.map((subject) => <Stack key={subject.id} direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: subject.color ?? "#777" }} /><Typography variant="caption">{subject.name} {Math.round(subject.minutes / total * 100)}%（{subject.minutes}分）</Typography></Stack>)}</Stack>
          </Stack>}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>学習記録</Typography>
          <Stack spacing={1.5}>
            {visibleSessions.map((session) => (
              <Box key={session.id}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2" fontWeight={700}>{nameOf(subjects, session.subject_id)} ・ {commonTestLabel(session)}</Typography><Stack direction="row" alignItems="center"><Typography variant="body2">{session.minutes}分</Typography><IconButton aria-label="写真を追加" size="small" onClick={() => setPhotoSession(session)}><PhotoCameraIcon fontSize="small" /></IconButton><IconButton aria-label="記録を編集" size="small" onClick={() => setEditing(session)}><EditIcon fontSize="small" /></IconButton><IconButton aria-label="記録を削除" size="small" color="error" onClick={() => deleteSession(session)}><DeleteIcon fontSize="small" /></IconButton></Stack></Stack>
                <Typography variant="caption" color="text.secondary">{session.study_date} ・ {RECORD_TYPE_LABELS[session.record_type]}{nameOf(materials, session.material_id) ? ` ・ ${nameOf(materials, session.material_id)}` : ""}</Typography>
                {session.understanding && <Chip size="small" label={UNDERSTANDING_LABELS[session.understanding]} sx={{ ml: 1 }} />}
                {session.memo && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>メモ: {session.memo}</Typography>}
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
          {editing.record_type === "common_test" ? <Stack spacing={1}><Stack direction="row" spacing={1}><TextField label="年度" type="number" value={editing.common_test_year ?? ""} onChange={(event) => setEditing({ ...editing, common_test_year: Number(event.target.value) || null })} fullWidth /><TextField select label="範囲" value={editing.common_test_section ?? "年度通し"} onChange={(event) => setEditing({ ...editing, common_test_section: event.target.value, unit_id: event.target.value === "年度通し" ? null : editing.unit_id })} fullWidth>{COMMON_TEST_SECTIONS.map((section) => <MenuItem key={section} value={section}>{section}</MenuItem>)}</TextField></Stack>{editing.common_test_section && editing.common_test_section !== "年度通し" && <TextField select label="単元（変更可）" value={editing.unit_id ?? ""} onChange={(event) => setEditing({ ...editing, unit_id: event.target.value || null })} fullWidth><MenuItem value="">未指定</MenuItem>{units.filter((unit) => unit.subject_id === editing.subject_id).map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}</TextField>}</Stack> : <TextField select label="単元" value={editing.unit_id ?? ""} onChange={(event) => setEditing({ ...editing, unit_id: event.target.value || null })} fullWidth><MenuItem value="">未指定</MenuItem>{units.filter((unit) => unit.subject_id === editing.subject_id).map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}</TextField>}
          <TextField select label="教材" value={editing.material_id ?? ""} onChange={(event) => setEditing({ ...editing, material_id: event.target.value || null })} fullWidth><MenuItem value="">未指定</MenuItem>{materials.map((material) => <MenuItem key={material.id} value={material.id}>{material.name}</MenuItem>)}</TextField>
          <TextField select label="理解度" value={editing.understanding ?? ""} onChange={(event) => setEditing({ ...editing, understanding: (event.target.value || null) as Understanding | null })} fullWidth><MenuItem value="">未指定</MenuItem>{Object.entries(UNDERSTANDING_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <TextField label="コメント・メモ" value={editing.memo ?? ""} onChange={(event) => setEditing({ ...editing, memo: event.target.value })} multiline minRows={2} fullWidth />
        </Stack>}</DialogContent>
        <DialogActions><Button onClick={() => setEditing(null)} disabled={saving}>キャンセル</Button><Button variant="contained" onClick={saveEdit} disabled={saving}>{saving ? "保存中..." : "保存"}</Button></DialogActions>
      </Dialog>
      <Dialog open={!!photoSession} onClose={() => !uploading && setPhotoSession(null)} fullWidth maxWidth="xs">
        <DialogTitle>あとから写真・PDFを追加</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>{photoSession?.study_date}の記録に、丸付け済みの写真やPDFを追加します。</Typography>
          {photoSession && <PhotoUploadPanel sessionId={photoSession.id} onBusyChange={setUploading} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhotoSession(null)} disabled={uploading}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
