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
import { createClient } from "@/lib/supabase/client";

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

// 簡易Markdownレンダラー(見出し/箇条書き/太字程度)。外部ライブラリ非依存。
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <Box sx={{ fontSize: 14, lineHeight: 1.8 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("### ")) {
          return (
            <Typography key={i} variant="subtitle2" sx={{ mt: 1 }}>
              {trimmed.slice(4)}
            </Typography>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <Typography key={i} variant="subtitle1" fontWeight={700} sx={{ mt: 1 }}>
              {trimmed.slice(3)}
            </Typography>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <Typography key={i} variant="h6" fontWeight={700} sx={{ mt: 1 }}>
              {trimmed.slice(2)}
            </Typography>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <Typography key={i} variant="body2" sx={{ pl: 2 }}>
              ・{trimmed.slice(2)}
            </Typography>
          );
        }
        if (trimmed === "") return <Box key={i} sx={{ height: 6 }} />;
        return (
          <Typography key={i} variant="body2">
            {trimmed}
          </Typography>
        );
      })}
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
        ]);
        if (!active) return;
        if (
          subjectsRes.error ||
          unitsRes.error ||
          weaknessRes.error ||
          sessionsRes.error ||
          reportsRes.error ||
          essaysRes.error
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
                            }}
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
      </Stack>
    </Box>
  );
}
