"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SkillState, SkillTopic, SkillsFile } from "@/lib/vault";

const STATE_LABEL: Record<SkillState, string> = {
  weak: "弱い",
  unstable: "不安定",
  stable: "安定",
  insufficient: "データ不足",
};

const STATE_COLOR: Record<SkillState, "error" | "warning" | "success" | "default"> = {
  weak: "error",
  unstable: "warning",
  stable: "success",
  insufficient: "default",
};

const STATE_ORDER: SkillState[] = ["weak", "unstable", "insufficient", "stable"];
const RESULT_MARK: Record<string, string> = { correct: "○", incorrect: "✕", partial: "△", unknown: "?" };

function TopicRow({ topic }: { topic: SkillTopic }) {
  const [open, setOpen] = useState(false);
  const detailId = `skill-${topic.key.replace(/[^\p{L}\p{N}]+/gu, "-")}`;

  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
      <ButtonBase
        onClick={() => setOpen((value) => !value)}
        sx={{ width: "100%", display: "block", textAlign: "left" }}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 120 }}>{topic.name}</Typography>
          <Typography variant="caption" component="span" sx={{ fontFamily: "monospace" }}>
            {topic.recent.map((result) => RESULT_MARK[result] ?? "?").join("")}
          </Typography>
          <Typography variant="caption" color="text.secondary">{topic.correct}/{topic.attempts}</Typography>
          <Chip size="small" label={STATE_LABEL[topic.state]} color={STATE_COLOR[topic.state]} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {topic.avg_duration_sec !== null ? `平均${topic.avg_duration_sec}秒` : "所要時間なし"}
          {topic.last_practiced_date ? ` ・ 最終 ${topic.last_practiced_date}` : ""}
        </Typography>
      </ButtonBase>

      <Collapse id={detailId} in={open} unmountOnExit>
        <Stack spacing={0.5} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider" }}>
          {topic.recent_attempts.length === 0 ? (
            <Typography variant="caption" color="text.secondary">試行の詳細がありません。</Typography>
          ) : topic.recent_attempts.slice().reverse().map((attempt, index) => (
            <Typography key={`${attempt.artifact_ref}-${attempt.question_no}-${index}`} variant="caption" component="div">
              {attempt.date ?? "日付不明"} ・ {RESULT_MARK[attempt.result] ?? "?"} ・{" "}
              {attempt.duration_sec !== null ? `${attempt.duration_sec}秒` : "時間不明"}
              {attempt.question_no ? ` ・ 問${attempt.question_no}` : ""}
              <Box component="span" sx={{ display: "block", color: "text.secondary", wordBreak: "break-all" }}>
                {attempt.artifact_ref}
              </Box>
            </Typography>
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export function SkillMap({ skills }: { skills: SkillsFile }) {
  const groups = new Map<string, SkillTopic[]>();
  for (const topic of skills.topics) {
    const group = topic.group || "その他";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)?.push(topic);
  }
  for (const topics of groups.values()) {
    topics.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name, "ja"));
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>単元マップ</Typography>
      <Stack spacing={2}>
        {Array.from(groups.entries()).map(([group, topics]) => (
          <Box key={group}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>{group}</Typography>
            <Stack spacing={0.75}>
              {topics.map((topic) => <TopicRow key={topic.key} topic={topic} />)}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
