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
type Snapshot = { unit_id: string; snapshot_date: string; state: LearningState; accuracy: number | null; weakness_score: number; understanding: Understanding | null; evidence_json: Record<string, unknown> | null };
type QuestionResult = { id: string; photo_id: string; unit_id: string | null; question_label: string | null; is_correct: boolean | null; error_type: string | null; confidence: number | null; created_at: string };
type ReviewPhoto = { id: string; storage_path: string; confidence: number | null; needs_review: boolean; created_at: string };
type MockExamJudgment = { rank: number; school: string; deviation: number; judgment: string };
type MockExam = {
  id: string;
  exam_title: string;
  taken_date: string;
  total_score: number | null;
  total_deviation: number | null;
  judgments_json: MockExamJudgment[] | null;
};
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
  const [mockExamSubjectId, setMockExamSubjectId] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [weeklyMinutes, setWeeklyMinutes] = useState<number | null>(null);
  const [tab, setTab] = useState(0);

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
        ] = await Promise.all([
          supabase.from("subjects").select("id, name, color, sort_order").order("sort_order"),
          supabase.from("units").select("id, subject_id, name, sort_order").order("sort_order"),
          supabase.from("weakness_scores").select("unit_id, score, accuracy, last_studied_at"),
          supabase
            .from("study_sessions")
            .select("subject_id, minutes, started_at")
            .gte("started_at", sinceDate.toISOString()),
          supabase
            .from("reports")
            .select("id, kind, body_md, created_at")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("essay_reviews")
            .select("id, structure_comment, logic_comment, vocab_comment, overall, created_at")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase.from("unit_state_snapshots").select("unit_id,snapshot_date,state,accuracy,weakness_score,understanding,evidence_json").order("snapshot_date", { ascending: false }).limit(500),
          supabase.from("question_results").select("id,photo_id,unit_id,question_label,is_correct,error_type,confidence,created_at").order("created_at", { ascending: false }).limit(500),
          supabase.from("photos").select("id,storage_path,confidence,needs_review,created_at").eq("needs_review", true).order("created_at", { ascending: false }),
          supabase.from("mock_exams").select("id, exam_title, taken_date, total_score, total_deviation, judgments_json").order("taken_date", { ascending: true }),
          supabase.from("mock_exam_scores").select("id, mock_exam_id, subject_id, score, max_score, score_rate, deviation_value"),
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
          || mockExamsRes.error || mockExamScoresRes.error
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

  const maxScore = useMemo(
    () => weaknesses.reduce((m, w) => Math.max(m, w.score ?? 0), 0),
    [weaknesses],
  );

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
                        return (
                          <Box
                            key={unit.id}
                            title={
                              w
                                ? `${unit.name} score:${score.toFixed(2)} accuracy:${
                                    w.accuracy != null ? Math.round(w.accuracy * 100) + "%" : "-"
                                  }`
                                : unit.name
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
          </Tabs>

          {tab === 0 &&
            (reports.length === 0 ? (
              <Typography variant="body2">
                まだレポートがありません(夜間バッチ実行後に表示されます)
              </Typography>
            ) : (
              <Stack divider={<Divider />} spacing={1.5}>
                {reports.map((r) => (
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
