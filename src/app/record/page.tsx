"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { createClient } from "@/lib/supabase/client";
import { RECORD_TYPES, type RecordType } from "@/lib/study-session";
import {
  UNDERSTANDING_LABELS,
  UNDERSTANDING_OPTIONS,
  describeProgress,
  type Understanding,
} from "@/lib/learning";

export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number };
type Unit = { id: string; subject_id: string; name: string; sort_order: number };
type Material = { id: string; subject_id: string; name: string; difficulty: string };
type Entry = {
  key: string;
  subjectId: string;
  unitId: string;
  materialId: string;
  recordType: RecordType;
  minutes: number;
  understanding: Understanding;
  commonTestYear: string;
  commonTestSection: string;
  commonTestMode: "by_year" | "by_section";
  memo: string;
};
type PreviousSession = { unit_id: string | null; understanding: Understanding | null };
type SavedSummary = {
  total: number;
  bySubject: Array<{ name: string; minutes: number }>;
  progress: string[];
  challenges: string[];
  nextStep: string;
  firstSessionId: string | null;
};

const TIME_OPTIONS = [30, 45, 60, 90];
const COMMON_TEST_YEARS = Array.from({ length: new Date().getFullYear() - 2020 }, (_, index) => String(new Date().getFullYear() - index));
const COMMON_TEST_SECTIONS = Array.from({ length: 8 }, (_, index) => `大問${index + 1}`);
const DIFFICULTY_LABELS: Record<string, string> = { basic: "基礎", standard: "標準", advanced: "応用" };

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newEntry(subjectId = ""): Entry {
  return {
    key: crypto.randomUUID(),
    subjectId,
    unitId: "",
    materialId: "",
    recordType: "material",
    minutes: 60,
    understanding: "uncertain",
    commonTestYear: String(new Date().getFullYear()),
    commonTestSection: "大問1",
    commonTestMode: "by_year",
    memo: "",
  };
}

export default function RecordPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [previous, setPrevious] = useState<PreviousSession[]>([]);
  const [studyDate, setStudyDate] = useState(todayString());
  const [entries, setEntries] = useState<Entry[]>([newEntry()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SavedSummary | null>(null);
  const [photoKind, setPhotoKind] = useState<"exercise" | "essay" | "pdf_mock_exam" | "pdf_quiz">("exercise");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("subjects").select("id,name,color,sort_order").order("sort_order"),
      supabase.from("units").select("id,subject_id,name,sort_order").order("sort_order"),
      supabase.from("materials").select("id,subject_id,name,difficulty").order("name"),
      supabase
        .from("study_sessions")
        .select("unit_id,understanding,subject_id,material_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]).then(([s, u, m, h]) => {
      if (!active) return;
      const firstError = s.error ?? u.error ?? m.error ?? h.error;
      if (firstError) setError(firstError.message);
      const subjectRows = (s.data ?? []) as Subject[];
      setSubjects(subjectRows);
      setUnits((u.data ?? []) as Unit[]);
      setMaterials((m.data ?? []) as Material[]);
      setPrevious((h.data ?? []) as PreviousSession[]);
      const last = (h.data?.[0] ?? null) as { subject_id?: string; material_id?: string; unit_id?: string } | null;
      setEntries([{
        ...newEntry(last?.subject_id ?? subjectRows[0]?.id ?? ""),
        unitId: last?.unit_id ?? "",
        materialId: last?.material_id ?? "",
      }]);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previousByUnit = useMemo(() => {
    const map = new Map<string, Understanding>();
    previous.forEach((row) => {
      if (row.unit_id && row.understanding && !map.has(row.unit_id)) map.set(row.unit_id, row.understanding);
    });
    return map;
  }, [previous]);

  const updateEntry = (key: string, patch: Partial<Entry>) => {
    setEntries((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
  };

  const saveAll = async () => {
    if (entries.some((entry) => !entry.subjectId || entry.minutes <= 0)) {
      setError("すべての行で科目と学習時間を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const batchId = crypto.randomUUID();
    const rows = entries.map((entry) => ({
      subject_id: entry.subjectId,
      unit_id: entry.unitId || null,
      material_id: entry.materialId || null,
      minutes: entry.minutes,
      study_date: studyDate,
      record_type: entry.recordType,
      common_test_year: entry.recordType === "common_test" && entry.commonTestMode === "by_year" ? Number(entry.commonTestYear) : null,
      common_test_section: entry.recordType === "common_test" && entry.commonTestMode === "by_section" ? entry.commonTestSection : null,
      understanding: entry.understanding,
      memo: entry.memo.trim() || null,
      batch_id: batchId,
    }));
    const { data, error: insertError } = await supabase
      .from("study_sessions")
      .insert(rows)
      .select("id");
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    const bySubject = new Map<string, number>();
    entries.forEach((entry) => bySubject.set(entry.subjectId, (bySubject.get(entry.subjectId) ?? 0) + entry.minutes));
    const progress: string[] = [];
    const challenges: string[] = [];
    entries.forEach((entry) => {
      const unit = units.find((item) => item.id === entry.unitId);
      if (!unit) return;
      const change = describeProgress(previousByUnit.get(entry.unitId) ?? null, entry.understanding);
      const text = `${unit.name}: ${change}（${UNDERSTANDING_LABELS[entry.understanding]}）`;
      if (["要確認", "課題継続"].includes(change) || entry.understanding !== "understood") challenges.push(text);
      else progress.push(text);
    });
    const firstChallenge = entries.find((entry) => entry.understanding !== "understood" && entry.unitId);
    const nextUnit = units.find((unit) => unit.id === firstChallenge?.unitId)?.name;
    setSummary({
      total: entries.reduce((sum, entry) => sum + entry.minutes, 0),
      bySubject: [...bySubject.entries()].map(([id, minutes]) => ({
        name: subjects.find((subject) => subject.id === id)?.name ?? "不明",
        minutes,
      })),
      progress,
      challenges,
      nextStep: nextUnit ? `${nextUnit}を明日最初に15分確認する` : "今日できた内容を明日もう一度短く確認する",
      firstSessionId: (data?.[0]?.id as string | undefined) ?? null,
    });
    setSaving(false);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !summary?.firstSessionId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${summary.firstSessionId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(path, file);
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from("photos").insert({
          session_id: summary.firstSessionId,
          storage_path: path,
          kind: photoKind,
          status: "pending",
        });
        if (rowError) throw rowError;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真のアップロードに失敗しました。");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;

  if (summary) {
    return (
      <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>今日の頑張り</Typography>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h4" fontWeight={700}>{summary.total}分</Typography>
            <Typography color="text.secondary">{summary.bySubject.map((item) => `${item.name} ${item.minutes}分`).join(" / ")}</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700}>今日の前進</Typography>
            {(summary.progress.length ? summary.progress : ["今日取り組んだ内容を記録しました"]).map((text) => <Typography key={text} variant="body2">・{text}</Typography>)}
            <Typography fontWeight={700} sx={{ mt: 2 }}>残った課題</Typography>
            {(summary.challenges.length ? summary.challenges : ["大きな課題は記録されていません"]).map((text) => <Typography key={text} variant="body2">・{text}</Typography>)}
            <Typography fontWeight={700} sx={{ mt: 2 }}>明日の最初の一歩</Typography>
            <Typography variant="body2">{summary.nextStep}</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>丸付け済み写真・小論文・PDFを追加</Typography>
            <ToggleButtonGroup exclusive value={photoKind} onChange={(_, value) => value && setPhotoKind(value)} size="small" sx={{ mb: 1, flexWrap: "wrap" }}>
              <ToggleButton value="exercise">演習写真</ToggleButton>
              <ToggleButton value="essay">小論文写真</ToggleButton>
              <ToggleButton value="pdf_mock_exam">模試PDF</ToggleButton>
              <ToggleButton value="pdf_quiz">演習解説PDF</ToggleButton>
            </ToggleButtonGroup>
            <input
              ref={fileInputRef}
              hidden
              multiple
              accept={photoKind.startsWith("pdf") ? "application/pdf" : "image/*"}
              type="file"
              onChange={(event) => uploadPhotos(event.target.files)}
            />
            <Button fullWidth variant="outlined" startIcon={<PhotoCameraIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "アップロード中..." : photoKind.startsWith("pdf") ? "PDFを選ぶ" : "写真を選ぶ"}
            </Button>
          </Paper>
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" onClick={() => { setSummary(null); setEntries([newEntry(subjects[0]?.id)]); }}>続けて記録する</Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700}>一日のまとめ記録</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>おおよその時間で大丈夫です。最後にまとめて保存します。</Typography>
      <TextField label="記録日" type="date" value={studyDate} onChange={(event) => setStudyDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth size="small" sx={{ mb: 2 }} />
      <Stack spacing={2}>
        {entries.map((entry, index) => {
          const filteredUnits = units.filter((unit) => unit.subject_id === entry.subjectId);
          const filteredMaterials = materials.filter((material) => material.subject_id === entry.subjectId);
          return (
            <Paper key={entry.key} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography fontWeight={700}>学習 {index + 1}</Typography>
                {entries.length > 1 && <IconButton size="small" onClick={() => setEntries((current) => current.filter((item) => item.key !== entry.key))}><DeleteIcon /></IconButton>}
              </Stack>
              <Stack spacing={1.5}>
                <TextField select label="科目" value={entry.subjectId} onChange={(event) => updateEntry(entry.key, { subjectId: event.target.value, unitId: "", materialId: "" })} size="small" fullWidth>
                  {subjects.map((subject) => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
                </TextField>
                <ToggleButtonGroup exclusive fullWidth size="small" value={entry.recordType} onChange={(_, value: RecordType | null) => value && updateEntry(entry.key, { recordType: value })}>
                  {RECORD_TYPES.map(([value, label]) => <ToggleButton key={value} value={value}>{label}</ToggleButton>)}
                </ToggleButtonGroup>
                {entry.recordType === "common_test" ? (
                  <Stack spacing={1}>
                    <ToggleButtonGroup exclusive fullWidth size="small" value={entry.commonTestMode} onChange={(_, value: Entry["commonTestMode"] | null) => value && updateEntry(entry.key, { commonTestMode: value })}>
                      <ToggleButton value="by_year">年度別（共通テスト）</ToggleButton>
                      <ToggleButton value="by_section">大問別（センター試験）</ToggleButton>
                    </ToggleButtonGroup>
                    {entry.commonTestMode === "by_year" ? <TextField select label="年度" value={entry.commonTestYear} onChange={(event) => updateEntry(entry.key, { commonTestYear: event.target.value })} size="small" fullWidth>
                      {COMMON_TEST_YEARS.map((year) => <MenuItem key={year} value={year}>{year}年度</MenuItem>)}
                    </TextField> : <TextField select label="大問" value={entry.commonTestSection} onChange={(event) => updateEntry(entry.key, { commonTestSection: event.target.value, unitId: "" })} size="small" fullWidth>
                      {COMMON_TEST_SECTIONS.map((section) => <MenuItem key={section} value={section}>{section}</MenuItem>)}
                    </TextField>}
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1}>
                    <TextField select label="単元" value={entry.unitId} onChange={(event) => updateEntry(entry.key, { unitId: event.target.value })} size="small" fullWidth>
                      <MenuItem value="">未指定</MenuItem>
                      {filteredUnits.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
                    </TextField>
                    <TextField select label="教材" value={entry.materialId} onChange={(event) => updateEntry(entry.key, { materialId: event.target.value })} size="small" fullWidth>
                      <MenuItem value="">未指定</MenuItem>
                      {filteredMaterials.map((material) => <MenuItem key={material.id} value={material.id}>{material.name}・{DIFFICULTY_LABELS[material.difficulty]}</MenuItem>)}
                    </TextField>
                  </Stack>
                )}
                <Stack direction="row" spacing={0.5}>{TIME_OPTIONS.map((minutes) => <Button key={minutes} size="small" fullWidth variant={entry.minutes === minutes ? "contained" : "outlined"} onClick={() => updateEntry(entry.key, { minutes })}>{minutes}</Button>)}</Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button variant="outlined" onClick={() => updateEntry(entry.key, { minutes: Math.max(5, entry.minutes - 5) })}>−5</Button>
                  <TextField type="number" label="分" value={entry.minutes} onChange={(event) => updateEntry(entry.key, { minutes: Math.max(0, Number(event.target.value)) })} size="small" slotProps={{ htmlInput: { step: 5, min: 5 } }} sx={{ width: 100 }} />
                  <Button variant="outlined" onClick={() => updateEntry(entry.key, { minutes: entry.minutes + 5 })}>＋5</Button>
                </Stack>
                <ToggleButtonGroup exclusive fullWidth value={entry.understanding} onChange={(_, value: Understanding | null) => value && updateEntry(entry.key, { understanding: value })} size="small">
                  {UNDERSTANDING_OPTIONS.map(([value, label]) => <ToggleButton key={value} value={value}>{label}</ToggleButton>)}
                </ToggleButtonGroup>
                <TextField label="コメント・メモ（任意）" value={entry.memo} onChange={(event) => updateEntry(entry.key, { memo: event.target.value })} multiline minRows={2} size="small" fullWidth placeholder="できたこと、迷ったこと、次回確認したいことなど" />
              </Stack>
            </Paper>
          );
        })}
        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setEntries((current) => [...current, newEntry(current.at(-1)?.subjectId)])}>学習を追加</Button>
        {error && <Alert severity="error">{error}</Alert>}
        <Button size="large" variant="contained" disabled={saving} onClick={saveAll}>{saving ? "保存中..." : `${entries.length}件をまとめて保存`}</Button>
      </Stack>
    </Box>
  );
}
