"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { createClient } from "@/lib/supabase/client";
import { LEARNING_STATE_LABELS, type LearningState, type Understanding } from "@/lib/learning";
import { startOfWeekDate } from "@/lib/learning";

export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number };
type Unit = { id: string; subject_id: string; name: string; sort_order: number };
type WeaknessScore = {
  unit_id: string;
  score: number;
  accuracy: number | null;
  last_studied_at: string | null;
};
type Session = {
  subject_id: string;
  minutes: number;
  started_at: string;
  study_date: string;
};
type Report = { id: string; kind: string; body_md: string; created_at: string };
type EssayReview = {
  id: string;
  structure_comment: string | null;
  logic_comment: string | null;
  vocab_comment: string | null;
  overall: string | null;
  created_at: string;
};
type Snapshot = {
  unit_id: string;
  snapshot_date: string;
  state: LearningState;
  accuracy: number | null;
  weakness_score: number;
  understanding: Understanding | null;
  stability_days: number | null;
  next_review_date: string | null;
  review_count: number;
  evidence_json: Record<string, unknown> | null;
};
type QuestionResult = { id: string; photo_id: string; subject_id: string | null; unit_id: string | null; question_label: string | null; is_correct: boolean | null; score_rate: number | null; result_granularity: "question" | "section"; error_type: string | null; confidence: number | null; corrected_at: string | null; created_at: string; source: string; raw_topic_tags: Record<string, unknown> | null };

const SOURCE_LABELS: Record<string, string> = { photo: "写真", pdf_mock_exam: "模試", pdf_quiz: "演習PDF", notion_import: "Notion" };
type ReviewPhoto = { id: string; storage_path: string; confidence: number | null; needs_review: boolean; created_at: string };
type MockExamJudgment = { rank: number; school: string; deviation: number; judgment: string };
type MockExam = {
  id: string;
  provider: string;
  exam_title: string;
  taken_date: string;
  total_score: number | null;
  total_deviation: number | null;
  judgments_json: MockExamJudgment[] | null;
};
type ReviewTaskMetric = { id: string; status: "pending" | "completed" | "expired"; due_date: string; completed_at: string | null };
type SectionTiming = { id: string; mock_exam_score_id: string; section: string; actual_seconds: number | null; target_seconds: number | null };
type MockExamScore = {
  id: string;
  mock_exam_id: string;
  subject_id: string;
  score: number | null;
  max_score: number | null;
  score_rate: number | null;
  deviation_value: number | null;
};

function heatColor(score: number, max: number) {
  if (max <= 0) return "#f5f5f5";
  const ratio = Math.min(1, score / max);
  // 0(弱くない)=薄い、1(弱い)=濃い赤
  const alpha = 0.08 + ratio * 0.72;
  return `rgba(229, 57, 53, ${alpha.toFixed(2)})`;
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = (day + 6) % 7; // 月曜始まり
  date.setDate(date.getDate() - diff);
  return date;
}

function fmtWeekLabel(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function SimpleMarkdown({ text }: { text: string }) {
  return (
    <Box sx={{ fontSize: 14, lineHeight: 1.8, "& table": { width: "100%", borderCollapse: "collapse" }, "& th, & td": { border: "1px solid #ddd", p: 0.5 }, "& p": { my: 0.5 } }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </Box>
  );
}

export default function StatsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [weaknesses, setWeaknesses] = useState<WeaknessScore[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [essays, setEssays] = useState<EssayReview[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const [reviewPhotos, setReviewPhotos] = useState<ReviewPhoto[]>([]);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [mockExamScores, setMockExamScores] = useState<MockExamScore[]>([]);
  const [reviewTaskMetrics, setReviewTaskMetrics] = useState<ReviewTaskMetric[]>([]);
  const [sectionTimings, setSectionTimings] = useState<SectionTiming[]>([]);
  const [mockExamSubjectId, setMockExamSubjectId] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [weeklyMinutes, setWeeklyMinutes] = useState<number | null>(null);
  const [tab, setTab] = useState(0);
  const [unreadColumnsCount, setUnreadColumnsCount] = useState(0);
  const [reportDate, setReportDate] = useState(() => localDateStr(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => localDateStr(new Date()).slice(0, 7));
  const [errorSubjectId, setErrorSubjectId] = useState("");
  const [errorType, setErrorType] = useState("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 56); // 直近8週間
        const [
          subjectsRes,
          unitsRes,
          weaknessRes,
          sessionsRes,
          reportsRes,
          essaysRes,
          snapshotsRes,
          questionResultsRes,
          reviewPhotosRes,
          mockExamsRes,
          mockExamScoresRes,
          unreadColumnsRes,
          reviewTasksRes,
          sectionTimingsRes,
        ] = await Promise.all([
          supabase.from("subjects").select("id, name, color, sort_order").order("sort_order"),
          supabase.from("units").select("id, subject_id, name, sort_order").order("sort_order"),
          supabase.from("weakness_scores").select("unit_id, score, accuracy, last_studied_at"),
          supabase
            .from("study_sessions")
            .select("subject_id, minutes, started_at, study_date")
            .gte("started_at", sinceDate.toISOString()),
          supabase
            .from("reports")
            .select("id, kind, body_md, created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("essay_reviews")
            .select("id, structure_comment, logic_comment, vocab_comment, overall, created_at")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase.from("unit_state_snapshots").select("unit_id,snapshot_date,state,accuracy,weakness_score,understanding,stability_days,next_review_date,review_count,evidence_json").order("snapshot_date", { ascending: false }).limit(500),
          supabase.from("question_results").select("id,photo_id,subject_id,unit_id,question_label,is_correct,score_rate,result_granularity,error_type,confidence,corrected_at,created_at,source,raw_topic_tags").order("created_at", { ascending: false }).limit(500),
          supabase.from("photos").select("id,storage_path,confidence,needs_review,created_at").eq("needs_review", true).order("created_at", { ascending: false }),
          supabase.from("mock_exams").select("id, provider, exam_title, taken_date, total_score, total_deviation, judgments_json").order("taken_date", { ascending: true }),
          supabase.from("mock_exam_scores").select("id, mock_exam_id, subject_id, score, max_score, score_rate, deviation_value"),
          supabase.from("knowledge_columns").select("id", { count: "exact", head: true }).is("read_at", null),
          supabase.from("review_tasks").select("id,status,due_date,completed_at").order("due_date", { ascending: false }).limit(500),
          supabase.from("mock_exam_section_timings").select("id,mock_exam_score_id,section,actual_seconds,target_seconds"),
        ]);
        if (!active) return;
        if (
          subjectsRes.error ||
          unitsRes.error ||
          weaknessRes.error ||
          sessionsRes.error ||
          reportsRes.error ||
          essaysRes.error
          || snapshotsRes.error || questionResultsRes.error || reviewPhotosRes.error
          || mockExamsRes.error || mockExamScoresRes.error || unreadColumnsRes.error || reviewTasksRes.error || sectionTimingsRes.error
        ) {
          setConfigError(
            "データを取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
          );
          return;
        }
        setSubjects((subjectsRes.data ?? []) as Subject[]);
        setUnits((unitsRes.data ?? []) as Unit[]);
        setWeaknesses((weaknessRes.data ?? []) as WeaknessScore[]);
        setSessions((sessionsRes.data ?? []) as Session[]);
        setReports((reportsRes.data ?? []) as Report[]);
        setEssays((essaysRes.data ?? []) as EssayReview[]);
        setSnapshots((snapshotsRes.data ?? []) as Snapshot[]);
        setQuestionResults((questionResultsRes.data ?? []) as QuestionResult[]);
        setReviewPhotos((reviewPhotosRes.data ?? []) as ReviewPhoto[]);
        setMockExams((mockExamsRes.data ?? []) as MockExam[]);
        setMockExamScores((mockExamScoresRes.data ?? []) as MockExamScore[]);
        setReviewTaskMetrics((reviewTasksRes.data ?? []) as ReviewTaskMetric[]);
        setSectionTimings((sectionTimingsRes.data ?? []) as SectionTiming[]);
        setUnreadColumnsCount(unreadColumnsRes.count ?? 0);
      } catch {
        if (active) setConfigError("Supabaseに接続できません。.env.local を確認してください。");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weaknessByUnit = useMemo(() => {
    const map = new Map<string, WeaknessScore>();
    weaknesses.forEach((w) => map.set(w.unit_id, w));
    return map;
  }, [weaknesses]);

  const reportsByDate = useMemo(() => {
    const map = new Map<string, Report[]>();
    reports.forEach((r) => {
      const key = localDateStr(new Date(r.created_at));
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return map;
  }, [reports]);

  const calendarCells = useMemo(() => {
    const [y, m] = calendarMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startWeekday = (first.getDay() + 6) % 7; // 月曜始まり
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<string | null> = Array.from({ length: startWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return cells;
  }, [calendarMonth]);

  const maxScore = useMemo(
    () => weaknesses.reduce((m, w) => Math.max(m, w.score ?? 0), 0),
    [weaknesses],
  );

  const sourceCountsByUnit = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    questionResults.forEach((r) => {
      if (!r.unit_id) return;
      const counts = map.get(r.unit_id) ?? {};
      counts[r.source] = (counts[r.source] ?? 0) + 1;
      map.set(r.unit_id, counts);
    });
    return map;
  }, [questionResults]);

  const estimatedWeeklyMinutes = useMemo(() => Math.round(sessions.reduce((sum, session) => sum + session.minutes, 0) / 8 / 5) * 5, [sessions]);
  const weeklyReview = useMemo(() => {
    const latest = new Map<string, Snapshot>();
    snapshots.forEach((snapshot) => { if (!latest.has(snapshot.unit_id)) latest.set(snapshot.unit_id, snapshot); });
    const named = [...latest.values()].map((snapshot) => ({ ...snapshot, name: units.find((unit) => unit.id === snapshot.unit_id)?.name ?? "不明" }));
    return {
      improved: named.filter((row) => Boolean(row.evidence_json?.improving)).slice(0, 5),
      focus: named.filter((row) => ["foundation", "review", "learning"].includes(row.state)).sort((a, b) => b.weakness_score - a.weakness_score).slice(0, 5),
      undiagnosed: named.filter((row) => row.state === "undiagnosed").slice(0, 5),
    };
  }, [snapshots, units]);

  const unitsBySubject = useMemo(() => {
    const map = new Map<string, Unit[]>();
    units.forEach((u) => {
      const arr = map.get(u.subject_id) ?? [];
      arr.push(u);
      map.set(u.subject_id, arr);
    });
    return map;
  }, [units]);

  // 週別×科目別の勉強時間集計
  const { weekLabels, chartData, maxMinutes } = useMemo(() => {
    const weeks: string[] = [];
    const weekKeys: string[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = startOfWeek(new Date(now.getTime()));
      d.setDate(d.getDate() - i * 7);
      weekKeys.push(d.toISOString().slice(0, 10));
      weeks.push(fmtWeekLabel(d));
    }
    const totals: Record<string, Record<string, number>> = {};
    weekKeys.forEach((wk) => (totals[wk] = {}));
    sessions.forEach((s) => {
      const wkStart = startOfWeek(new Date(s.started_at)).toISOString().slice(0, 10);
      if (!totals[wkStart]) return;
      totals[wkStart][s.subject_id] = (totals[wkStart][s.subject_id] ?? 0) + s.minutes;
    });
    let max = 0;
    const data = weekKeys.map((wk) => {
      const bySubject = totals[wk];
      const total = Object.values(bySubject).reduce((a, b) => a + b, 0);
      max = Math.max(max, total);
      return { weekKey: wk, bySubject, total };
    });
    return { weekLabels: weeks, chartData: data, maxMinutes: max };
  }, [sessions]);

  const mockExamDeviationSeries = useMemo(() => {
    return mockExams.map((exam) => {
      const label = exam.taken_date.slice(5);
      if (!mockExamSubjectId) {
        return { examId: exam.id, label, deviation: exam.total_deviation };
      }
      const row = mockExamScores.find((score) => score.mock_exam_id === exam.id && score.subject_id === mockExamSubjectId);
      return { examId: exam.id, label, deviation: row?.deviation_value ?? null };
    });
  }, [mockExams, mockExamScores, mockExamSubjectId]);

  const reviewCompletion = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffKey = localDateStr(cutoff);
    const today = localDateStr(new Date());
    const matured = reviewTaskMetrics.filter((task) => task.due_date >= cutoffKey && task.due_date <= today);
    const completed = matured.filter((task) => task.status === "completed").length;
    return { total: matured.length, completed, rate: matured.length ? Math.round(completed / matured.length * 100) : null };
  }, [reviewTaskMetrics]);

  const judgmentSeries = useMemo(() => {
    const bySchool = new Map<string, Array<{ date: string; judgment: string }>>();
    mockExams.forEach((exam) => exam.judgments_json?.forEach((item) => {
      const rows = bySchool.get(item.school) ?? [];
      rows.push({ date: exam.taken_date, judgment: item.judgment });
      bySchool.set(item.school, rows);
    }));
    return [...bySchool.entries()].filter(([, rows]) => rows.length >= 2);
  }, [mockExams]);

  const efficiencyRows = useMemo(() => {
    const rows: Array<{ subjectId: string; delta: number; minutes: number; perTenHours: number }> = [];
    for (const subject of subjects) {
      const scores = mockExamScores
        .filter((score) => score.subject_id === subject.id && score.deviation_value != null)
        .map((score) => ({ score, exam: mockExams.find((exam) => exam.id === score.mock_exam_id) }))
        .filter((item): item is { score: MockExamScore; exam: MockExam } => Boolean(item.exam))
        .sort((a, b) => a.exam.taken_date.localeCompare(b.exam.taken_date));
      for (let index = 1; index < scores.length; index++) {
        const previous = scores[index - 1];
        const current = scores[index];
        if (previous.exam.provider !== current.exam.provider) continue;
        const minutes = sessions.filter((session) => session.subject_id === subject.id && session.study_date > previous.exam.taken_date && session.study_date <= current.exam.taken_date).reduce((sum, session) => sum + session.minutes, 0);
        if (minutes < 60) continue;
        const delta = (current.score.deviation_value ?? 0) - (previous.score.deviation_value ?? 0);
        rows.push({ subjectId: subject.id, delta, minutes, perTenHours: delta / minutes * 600 });
      }
    }
    return rows;
  }, [mockExamScores, mockExams, sessions, subjects]);

  const errorRows = useMemo(() => questionResults.filter((result) => {
    const needsReview = result.is_correct === false || (result.result_granularity === "section" && result.score_rate != null && result.score_rate < 70);
    if (!needsReview) return false;
    const subjectId = result.subject_id ?? units.find((unit) => unit.id === result.unit_id)?.subject_id ?? null;
    if (errorSubjectId && subjectId !== errorSubjectId) return false;
    if (errorType && result.error_type !== errorType) return false;
    if (onlyUnreviewed && result.corrected_at) return false;
    return true;
  }), [questionResults, units, errorSubjectId, errorType, onlyUnreviewed]);

  const setResultReviewed = async (result: QuestionResult, reviewed: boolean) => {
    const correctedAt = reviewed ? new Date().toISOString() : null;
    const { error } = await supabase.from("question_results").update({ corrected_at: correctedAt }).eq("id", result.id);
    if (!error) setQuestionResults((rows) => rows.map((row) => row.id === result.id ? { ...row, corrected_at: correctedAt } : row));
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        分析
      </Typography>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">来週使える学習時間</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>直近8週間からの推定値です。週合計だけ調整できます。</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="number" size="small" label="週合計（分）" value={weeklyMinutes ?? estimatedWeeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))} slotProps={{ htmlInput: { step: 30, min: 0 } }} />
            <Button variant="contained" onClick={async () => {
              const value = weeklyMinutes ?? estimatedWeeklyMinutes;
              const next = new Date(); next.setDate(next.getDate() + 7);
              await supabase.from("weekly_plans").upsert({ week_start: startOfWeekDate(next), estimated_minutes: estimatedWeeklyMinutes, adjusted_minutes: value, updated_at: new Date().toISOString() }, { onConflict: "week_start" });
            }}>保存</Button>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>週次振り返り・来週の重点</Typography>
          <Typography fontWeight={700}>伸びた単元</Typography>
          <Typography variant="body2">{weeklyReview.improved.length ? weeklyReview.improved.map((row) => row.name).join("、") : "改善傾向の判定にはもう少し記録が必要です"}</Typography>
          <Typography fontWeight={700} sx={{ mt: 1 }}>重点候補</Typography>
          <Typography variant="body2">{weeklyReview.focus.length ? weeklyReview.focus.map((row) => `${row.name}（${LEARNING_STATE_LABELS[row.state]}）`).join("、") : "現在、大きな課題はありません"}</Typography>
          <Typography fontWeight={700} sx={{ mt: 1 }}>状況確認</Typography>
          <Typography variant="body2">{weeklyReview.undiagnosed.length ? `${weeklyReview.undiagnosed.map((row) => row.name).join("、")}を短い確認学習で診断` : "対象単元はすべて診断済みです"}</Typography>
        </Paper>
        <Paper component={Link} href="/columns" variant="outlined" sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
          <Box>
            <Typography fontWeight={700}>知識コラム</Typography>
            <Typography variant="body2" color="text.secondary">
              {unreadColumnsCount > 0 ? `未読 ${unreadColumnsCount}件` : "弱点トピックの解説を読む"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {unreadColumnsCount > 0 && <Chip size="small" color="primary" label={unreadColumnsCount} />}
            <ArrowForwardIcon fontSize="small" />
          </Stack>
        </Paper>

        {/* 弱点ヒートマップ */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            弱点ヒートマップ(科目×単元)
          </Typography>
          {units.length === 0 ? (
            <Typography variant="body2">単元データがありません</Typography>
          ) : (
            <Stack spacing={1.5}>
              {subjects.map((subject) => {
                const subjectUnits = unitsBySubject.get(subject.id) ?? [];
                if (subjectUnits.length === 0) return null;
                return (
                  <Box key={subject.id}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ color: subject.color }}
                    >
                      {subject.name}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        mt: 0.5,
                      }}
                    >
                      {subjectUnits.map((unit) => {
                        const w = weaknessByUnit.get(unit.id);
                        const score = w?.score ?? 0;
                        const sourceCounts = sourceCountsByUnit.get(unit.id);
                        const sourceBreakdown = sourceCounts
                          ? Object.entries(sourceCounts).filter(([, n]) => n > 0).map(([src, n]) => `${SOURCE_LABELS[src] ?? src}${n}件`).join("・")
                          : "";
                        return (
                          <Box
                            key={unit.id}
                            title={
                              (w
                                ? `${unit.name} score:${score.toFixed(2)} accuracy:${
                                    w.accuracy != null ? Math.round(w.accuracy * 100) + "%" : "-"
                                  }`
                                : unit.name) + (sourceBreakdown ? ` ${sourceBreakdown}` : "")
                            }
                            sx={{
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                              backgroundColor: heatColor(score, maxScore),
                              fontSize: 11,
                              border: "1px solid #eee",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                            }}
                            onClick={() => setSelectedUnitId(unit.id)}
                          >
                            {unit.name}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Paper>

        {/* 勉強時間の棒グラフ */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            勉強時間の推移(週別)
          </Typography>
          {maxMinutes === 0 ? (
            <Typography variant="body2">直近8週間の記録がありません</Typography>
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-end",
                gap: 1,
                height: 140,
              }}
            >
              {chartData.map((wk, i) => (
                <Box
                  key={wk.weekKey}
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column-reverse",
                      borderRadius: "3px 3px 0 0",
                      overflow: "hidden",
                      height: `${(wk.total / maxMinutes) * 100}%`,
                      minHeight: wk.total > 0 ? 4 : 0,
                    }}
                  >
                    {subjects.map((s) => {
                      const minutes = wk.bySubject[s.id] ?? 0;
                      if (minutes === 0) return null;
                      return (
                        <Box
                          key={s.id}
                          sx={{
                            width: "100%",
                            backgroundColor: s.color,
                            height: `${(minutes / wk.total) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {weekLabels[i]}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        {/* 模試の記録 */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>学習フィードバック</Typography>
          <Typography fontWeight={700}>復習提案の消化率（直近28日）</Typography>
          <Typography variant="body2">
            {reviewCompletion.total >= 5 ? `${reviewCompletion.completed}/${reviewCompletion.total}件（${reviewCompletion.rate}%）` : `集計準備中（${reviewCompletion.total}/5件）`}
          </Typography>
          <Typography fontWeight={700} sx={{ mt: 1 }}>科目別の費用対効果</Typography>
          {efficiencyRows.length === 0 ? <Typography variant="body2">同一主催者の模試2回と、その間の学習記録60分以上が必要です</Typography> : efficiencyRows.map((row, index) => (
            <Typography key={`${row.subjectId}-${index}`} variant="body2">
              {subjects.find((subject) => subject.id === row.subjectId)?.name}: 10時間あたり偏差値 {row.perTenHours >= 0 ? "+" : ""}{row.perTenHours.toFixed(1)}（参考値）
            </Typography>
          ))}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            模試の記録
          </Typography>
          {mockExams.length === 0 ? (
            <Typography variant="body2">まだ模試の記録がありません</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                select
                size="small"
                label="偏差値の対象"
                value={mockExamSubjectId}
                onChange={(event) => setMockExamSubjectId(event.target.value)}
              >
                <MenuItem value="">総合</MenuItem>
                {subjects.map((subject) => (
                  <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 100 }}>
                {mockExamDeviationSeries.map((point) => (
                  <Box key={point.examId} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <Typography variant="caption">{point.deviation != null ? point.deviation.toFixed(1) : "-"}</Typography>
                    <Box
                      sx={{
                        width: "100%",
                        backgroundColor: "primary.main",
                        borderRadius: "3px 3px 0 0",
                        height: point.deviation != null ? `${Math.max(4, Math.min(100, ((point.deviation - 30) / 40) * 100))}%` : 0,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{point.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Stack divider={<Divider />} spacing={1}>
                {mockExams.slice().reverse().map((exam) => {
                  const topJudgment = exam.judgments_json?.[0];
                  return (
                    <Box key={exam.id}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={700}>{exam.exam_title}</Typography>
                        <Typography variant="caption" color="text.secondary">{exam.taken_date}</Typography>
                      </Stack>
                      <Typography variant="body2">
                        {exam.total_score != null ? `総合得点 ${exam.total_score}` : ""}
                        {exam.total_deviation != null ? ` / 偏差値 ${exam.total_deviation}` : ""}
                        {topJudgment ? ` / ${topJudgment.school} 判定${topJudgment.judgment}` : ""}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
              <Box>
                <Typography fontWeight={700}>志望校判定の推移</Typography>
                {judgmentSeries.length === 0 ? <Typography variant="body2">同じ志望校の判定が2回以上入ると表示されます</Typography> : judgmentSeries.map(([school, rows]) => (
                  <Box key={school} sx={{ mt: 0.75 }}>
                    <Typography variant="body2">{school}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                      {rows.map((row) => <Chip key={`${row.date}-${row.judgment}`} size="small" label={`${row.date.slice(5)} ${row.judgment}判定`} />)}
                    </Stack>
                  </Box>
                ))}
              </Box>
              {sectionTimings.filter((timing) => timing.actual_seconds != null && timing.target_seconds != null).length >= 2 && <Box>
                <Typography fontWeight={700}>大問別ペース</Typography>
                {sectionTimings.filter((timing) => timing.actual_seconds != null && timing.target_seconds != null).map((timing) => {
                  const diff = timing.actual_seconds! - timing.target_seconds!;
                  return <Stack key={timing.id} direction="row" spacing={1} alignItems="center"><Typography variant="body2">{timing.section}</Typography><Chip size="small" color={diff <= 0 ? "success" : "warning"} label={diff <= 0 ? `目標内 ${Math.abs(diff)}秒余裕` : `${diff}秒超過`} /></Stack>;
                })}
              </Box>}
            </Stack>
          )}
        </Paper>

        {/* レポート/小論文講評 */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            sx={{ mb: 1.5, minHeight: 36 }}
          >
            <Tab label="レポート" sx={{ minHeight: 36 }} />
            <Tab label="小論文講評" sx={{ minHeight: 36 }} />
            <Tab label="誤答・要復習" sx={{ minHeight: 36 }} />
          </Tabs>

          {tab === 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Button size="small" onClick={() => setCalendarMonth((m) => shiftMonth(m, -1))}>‹</Button>
                <Typography variant="body2" fontWeight={700}>{calendarMonth}</Typography>
                <Button size="small" onClick={() => setCalendarMonth((m) => shiftMonth(m, 1))}>›</Button>
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
                {["月", "火", "水", "木", "金", "土", "日"].map((label) => (
                  <Typography key={label} variant="caption" align="center" color="text.secondary">{label}</Typography>
                ))}
                {calendarCells.map((date, i) => {
                  if (!date) return <Box key={`empty-${i}`} />;
                  const dayReports = reportsByDate.get(date) ?? [];
                  const hasDaily = dayReports.some((r) => r.kind === "daily");
                  const hasWeekly = dayReports.some((r) => r.kind === "weekly");
                  const isSelected = date === reportDate;
                  return (
                    <Box
                      key={date}
                      onClick={() => setReportDate(date)}
                      sx={{
                        textAlign: "center",
                        py: 0.5,
                        borderRadius: 1,
                        cursor: "pointer",
                        border: "1px solid",
                        borderColor: isSelected ? "primary.main" : "#eee",
                        backgroundColor: hasDaily || hasWeekly ? "action.hover" : "transparent",
                      }}
                    >
                      <Typography variant="caption">{Number(date.slice(-2))}</Typography>
                      {(hasDaily || hasWeekly) && (
                        <Box sx={{ display: "flex", justifyContent: "center", gap: 0.25, mt: 0.25 }}>
                          {hasDaily && <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "primary.main" }} />}
                          {hasWeekly && <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "secondary.main" }} />}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {tab === 0 &&
            ((reportsByDate.get(reportDate) ?? []).length === 0 ? (
              <Typography variant="body2">
                {reports.length === 0
                  ? "まだレポートがありません(夜間バッチ実行後に表示されます)"
                  : "この日のレポートはありません(色付きの日を選んでください)"}
              </Typography>
            ) : (
              <Stack divider={<Divider />} spacing={1.5}>
                {(reportsByDate.get(reportDate) ?? []).map((r) => (
                  <Box key={r.id}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip
                        size="small"
                        label={r.kind === "daily" ? "日次" : "週次"}
                        color={r.kind === "daily" ? "primary" : "secondary"}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(r.created_at).toLocaleString("ja-JP")}
                      </Typography>
                    </Stack>
                    <SimpleMarkdown text={r.body_md} />
                  </Box>
                ))}
              </Stack>
            ))}

          {tab === 1 &&
            (essays.length === 0 ? (
              <Typography variant="body2">まだ小論文講評がありません</Typography>
            ) : (
              <Stack divider={<Divider />} spacing={1.5}>
                {essays.map((e) => (
                  <Box key={e.id}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(e.created_at).toLocaleString("ja-JP")}
                    </Typography>
                    {e.overall && (
                      <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                        {e.overall}
                      </Typography>
                    )}
                    {e.structure_comment && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        構成: {e.structure_comment}
                      </Typography>
                    )}
                    {e.logic_comment && (
                      <Typography variant="body2">論理: {e.logic_comment}</Typography>
                    )}
                    {e.vocab_comment && (
                      <Typography variant="body2">語彙: {e.vocab_comment}</Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            ))}
          {tab === 2 && <Stack spacing={1.25}>
            <Stack direction="row" spacing={1}>
              <TextField select size="small" label="科目" value={errorSubjectId} onChange={(event) => setErrorSubjectId(event.target.value)} fullWidth>
                <MenuItem value="">すべて</MenuItem>
                {subjects.map((subject) => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="誤答タイプ" value={errorType} onChange={(event) => setErrorType(event.target.value)} fullWidth>
                <MenuItem value="">すべて</MenuItem>
                <MenuItem value="calc">計算</MenuItem><MenuItem value="knowledge">知識</MenuItem><MenuItem value="reading">読解</MenuItem><MenuItem value="logic">論理</MenuItem><MenuItem value="other">その他</MenuItem>
              </TextField>
            </Stack>
            <Button size="small" variant={onlyUnreviewed ? "contained" : "outlined"} onClick={() => setOnlyUnreviewed((value) => !value)}>未復習のみ</Button>
            {errorRows.length === 0 ? <Typography variant="body2">条件に合う誤答・要復習項目はありません</Typography> : errorRows.map((result) => {
              const unit = units.find((row) => row.id === result.unit_id);
              const subjectId = result.subject_id ?? unit?.subject_id;
              const subject = subjects.find((row) => row.id === subjectId);
              return <Box key={result.id} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                  <Chip size="small" label={subject?.name ?? "科目不明"} />
                  <Typography variant="body2" fontWeight={700}>{unit?.name ?? result.question_label ?? "大問"}</Typography>
                  <Chip size="small" color="error" label={result.score_rate != null ? `得点率 ${result.score_rate}%` : "誤答"} />
                  <Chip size="small" variant="outlined" label={SOURCE_LABELS[result.source] ?? result.source} />
                </Stack>
                {unit && result.question_label && <Typography variant="caption" color="text.secondary">{result.question_label}</Typography>}
                <Button size="small" onClick={() => void setResultReviewed(result, !result.corrected_at)}>{result.corrected_at ? "未復習に戻す" : "復習した"}</Button>
              </Box>;
            })}
          </Stack>}
        </Paper>
        {reviewPhotos.length > 0 && (
          <Alert severity="warning">AI判定の確認が必要な写真が{reviewPhotos.length}件あります。単元詳細から設問を修正できます。</Alert>
        )}
      </Stack>
      <UnitDetailDialog
        unit={units.find((unit) => unit.id === selectedUnitId) ?? null}
        snapshots={snapshots.filter((snapshot) => snapshot.unit_id === selectedUnitId).reverse()}
        results={questionResults.filter((result) => result.unit_id === selectedUnitId)}
        onClose={() => setSelectedUnitId(null)}
        onCorrect={async (result, patch) => {
          const { error } = await supabase.from("question_results").update({ ...patch, corrected_at: new Date().toISOString(), confidence: 1 }).eq("id", result.id);
          if (!error) {
            const nextRows = questionResults.map((row) => row.id === result.id ? { ...row, ...patch, confidence: 1 } : row);
            setQuestionResults(nextRows);
            if (!nextRows.some((row) => row.photo_id === result.photo_id && (row.confidence ?? 1) < 0.7)) {
              await supabase.from("photos").update({ needs_review: false, confidence: 1 }).eq("id", result.photo_id);
              setReviewPhotos((rows) => rows.filter((photo) => photo.id !== result.photo_id));
            }
          }
        }}
      />
    </Box>
  );
}

function UnitDetailDialog({ unit, snapshots, results, onClose, onCorrect }: {
  unit: Unit | null;
  snapshots: Snapshot[];
  results: QuestionResult[];
  onClose: () => void;
  onCorrect: (result: QuestionResult, patch: Pick<QuestionResult, "is_correct" | "error_type">) => Promise<void>;
}) {
  const latest = snapshots.at(-1);
  const errorCounts = results.filter((result) => result.is_correct === false).reduce<Record<string, number>>((acc, result) => {
    const key = result.error_type ?? "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <Dialog open={!!unit} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{unit?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <Chip label={latest ? LEARNING_STATE_LABELS[latest.state] : "未診断"} color={latest?.state === "foundation" || latest?.state === "review" ? "warning" : "default"} />
            <Chip label={`正答率 ${latest?.accuracy == null ? "-" : `${Math.round(latest.accuracy * 100)}%`}`} />
          </Stack>
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Typography variant="subtitle2" fontWeight={700}>復習間隔</Typography>
            {latest?.stability_days != null && latest.next_review_date ? (
              <Typography variant="body2">次回 {latest.next_review_date}（{Math.round(latest.stability_days)}日間隔・復習{latest.review_count}回）</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">データ蓄積中です。単元ごとに3回以上、全体で30件以上の評価がそろうと個別の復習間隔を表示します。</Typography>
            )}
          </Paper>
          <Box><Typography fontWeight={700}>状態の推移</Typography><Typography variant="body2">{snapshots.length ? snapshots.map((snapshot) => `${snapshot.snapshot_date} ${LEARNING_STATE_LABELS[snapshot.state]}${snapshot.accuracy == null ? "" : ` ${Math.round(snapshot.accuracy * 100)}%`}`).join(" → ") : "まだ履歴がありません"}</Typography></Box>
          <Box><Typography fontWeight={700}>誤答タイプ</Typography><Typography variant="body2">{Object.keys(errorCounts).length ? Object.entries(errorCounts).map(([key, count]) => `${key}: ${count}件`).join(" / ") : "誤答データはありません"}</Typography></Box>
          <Box><Typography fontWeight={700}>最近の設問</Typography><Stack spacing={1}>{results.slice(0, 20).map((result) => (
            <Stack key={result.id} direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ flex: 1 }}>{result.question_label ?? "設問"}{result.confidence != null && result.confidence < 0.7 ? "（要確認）" : ""}</Typography>
              <Button size="small" variant={result.is_correct === true ? "contained" : "outlined"} onClick={() => onCorrect(result, { is_correct: true, error_type: null })}>○</Button>
              <Button size="small" color="error" variant={result.is_correct === false ? "contained" : "outlined"} onClick={() => onCorrect(result, { is_correct: false, error_type: result.error_type ?? "other" })}>×</Button>
              {result.is_correct === false && <TextField select size="small" value={result.error_type ?? "other"} onChange={(event) => onCorrect(result, { is_correct: false, error_type: event.target.value })} sx={{ width: 100 }}>
                {["calc", "knowledge", "reading", "logic", "other"].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
              </TextField>}
            </Stack>
          ))}</Stack></Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
