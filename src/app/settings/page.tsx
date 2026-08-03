"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LogoutIcon from "@mui/icons-material/Logout";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useSupabase } from "@/lib/supabase/use-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const supabase = useSupabase();
  const [configError, setConfigError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const logout = async () => {
    setConfigError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setConfigError(error.message);
    else window.location.assign("/login");
  };

  const togglePrompt = async () => {
    const nextOpen = !promptOpen;
    setPromptOpen(nextOpen);
    if (!nextOpen || promptText) return;
    setPromptLoading(true);
    setPromptError(null);
    try {
      const response = await fetch("/api/nightly-prompt", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "再ログインが必要です"
            : "プロンプトを読み込めませんでした",
        );
      }
      setPromptText(await response.text());
    } catch (error) {
      setPromptError(
        error instanceof Error
          ? error.message
          : "プロンプトを読み込めませんでした",
      );
    } finally {
      setPromptLoading(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptError("クリップボードへコピーできませんでした");
    }
  };

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        設定
      </Typography>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2">
            夜間分析バッチの起動プロンプト
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Claude Codeの対話セッションへ貼り付ける最新の指示です。
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1,
              mb: 1,
              p: 1,
              bgcolor: "grey.50",
              borderRadius: 1,
              overflow: "hidden",
              maxHeight: promptOpen ? "none" : 72,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {promptText ||
              "# study-ai 夜間分析バッチ\n（全文を表示すると読み込みます）"}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              onClick={() => void togglePrompt()}
              disabled={promptLoading}
            >
              {promptLoading
                ? "読込中..."
                : promptOpen
                  ? "閉じる"
                  : "全文を表示"}
            </Button>
            <Collapse in={promptOpen && !!promptText} orientation="horizontal">
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => void copyPrompt()}
              >
                {promptCopied ? "コピーしました" : "コピー"}
              </Button>
            </Collapse>
          </Stack>
          {promptError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {promptError}
            </Alert>
          )}
        </Paper>
        <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>
          ログアウト
        </Button>
      </Stack>
    </Box>
  );
}
