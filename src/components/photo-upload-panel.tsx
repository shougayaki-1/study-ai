"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { createClient } from "@/lib/supabase/client";

export type PhotoKind = "exercise" | "essay" | "pdf_mock_exam" | "pdf_quiz";

type PhotoRow = {
  id: string;
  session_id: string | null;
  storage_path: string;
  original_name: string | null;
  kind: PhotoKind;
  status: "pending" | "analyzed" | "failed";
  confidence: number | null;
  needs_review: boolean;
  created_at: string;
  file_hash: string | null;
};

type LocalUpload = {
  key: string;
  name: string;
  state: "hashing" | "uploading" | "pending" | "duplicate" | "error";
  message?: string;
};

const STATUS_LABELS: Record<PhotoRow["status"], string> = {
  pending: "解析待ち",
  analyzed: "解析済み",
  failed: "判読不能",
};

const KIND_LABELS: Record<PhotoKind, string> = {
  exercise: "演習写真",
  essay: "小論文写真",
  pdf_mock_exam: "模試PDF",
  pdf_quiz: "演習解説PDF",
};

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fileLabel(row: PhotoRow) {
  return row.original_name || row.storage_path.split("/").at(-1) || "アップロードファイル";
}

export function PhotoUploadPanel({
  sessionId,
  onBusyChange,
}: {
  sessionId: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PhotoKind>("exercise");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);

  const loadPhotos = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("photos")
      .select("id,session_id,storage_path,original_name,kind,status,confidence,needs_review,created_at,file_hash")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setPhotos((data ?? []) as PhotoRow[]);
  }, [sessionId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPhotos();
  }, [loadPhotos]);

  const hasPending = photos.some((photo) => photo.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void loadPhotos(), 15_000);
    return () => window.clearInterval(timer);
  }, [hasPending, loadPhotos]);

  const updateUpload = (key: string, patch: Partial<LocalUpload>) => {
    setUploads((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const selected = Array.from(files).map((file) => ({ file, key: crypto.randomUUID() }));
    setUploads(selected.map(({ file, key }) => ({ key, name: file.name, state: "hashing" })));
    setBusy(true);
    onBusyChange?.(true);
    setError(null);

    for (const { file, key } of selected) {
      let path: string | null = null;
      try {
        const hash = await sha256(file);
        const { data: duplicate, error: duplicateError } = await supabase
          .from("photos")
          .select("id,created_at,status,original_name")
          .eq("file_hash", hash)
          .limit(1)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) {
          const date = new Date(duplicate.created_at).toLocaleString("ja-JP");
          updateUpload(key, { state: "duplicate", message: `${date}にアップロード済み（${STATUS_LABELS[duplicate.status as PhotoRow["status"]]}）` });
          continue;
        }

        updateUpload(key, { state: "uploading" });
        const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
        path = `${sessionId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: storageError } = await supabase.storage.from("photos").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (storageError) throw storageError;

        const { error: rowError } = await supabase.from("photos").insert({
          session_id: sessionId,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type || null,
          byte_size: file.size,
          file_hash: hash,
          kind,
          status: "pending",
        });
        if (rowError) {
          await supabase.storage.from("photos").remove([path]);
          path = null;
          if (rowError.code === "23505") {
            updateUpload(key, { state: "duplicate", message: "同じ内容のファイルが同時に登録されたためスキップしました" });
            continue;
          }
          throw rowError;
        }
        path = null;
        updateUpload(key, { state: "pending", message: "アップロード完了。夜間バッチの解析待ちです" });
      } catch (uploadError) {
        if (path) await supabase.storage.from("photos").remove([path]);
        const message = uploadError instanceof Error ? uploadError.message : "アップロードに失敗しました";
        updateUpload(key, { state: "error", message });
        setError("一部のファイルをアップロードできませんでした。ファイルごとの状態を確認してください。");
      }
    }

    await loadPhotos();
    setBusy(false);
    onBusyChange?.(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Stack spacing={1.5}>
      <ToggleButtonGroup
        exclusive
        value={kind}
        onChange={(_, value: PhotoKind | null) => value && setKind(value)}
        size="small"
        sx={{ flexWrap: "wrap" }}
      >
        <ToggleButton value="exercise">演習写真</ToggleButton>
        <ToggleButton value="essay">小論文写真</ToggleButton>
        <ToggleButton value="pdf_mock_exam">模試PDF</ToggleButton>
        <ToggleButton value="pdf_quiz">演習解説PDF</ToggleButton>
      </ToggleButtonGroup>
      <input
        ref={inputRef}
        hidden
        multiple
        accept={kind.startsWith("pdf") ? "application/pdf" : "image/*"}
        type="file"
        onChange={(event) => void uploadFiles(event.target.files)}
      />
      <Button
        fullWidth
        variant="outlined"
        startIcon={busy ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "処理中..." : kind.startsWith("pdf") ? "PDFを選ぶ" : "写真を選ぶ"}
      </Button>

      {uploads.length > 0 && (
        <Stack spacing={0.75}>
          {uploads.map((upload) => (
            <Box key={upload.key} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              {(["hashing", "uploading"] as LocalUpload["state"][]).includes(upload.state) ? (
                <CircularProgress size={16} sx={{ mt: 0.25 }} />
              ) : (
                <Chip
                  size="small"
                  label={upload.state === "duplicate" ? "重複" : upload.state === "error" ? "失敗" : "完了"}
                  color={upload.state === "error" ? "error" : upload.state === "duplicate" ? "warning" : "success"}
                />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>{upload.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {upload.message ?? (upload.state === "hashing" ? "重複を確認中" : "アップロード中")}
                </Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {photos.length > 0 && (
        <Box>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>アップロード履歴</Typography>
          <Stack spacing={0.75}>
            {photos.map((photo) => (
              <Box key={photo.id} sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ minWidth: 0, flex: 1 }} noWrap>{fileLabel(photo)}</Typography>
                <Chip size="small" variant="outlined" label={KIND_LABELS[photo.kind]} />
                <Chip
                  size="small"
                  label={STATUS_LABELS[photo.status]}
                  color={photo.status === "analyzed" ? "success" : photo.status === "failed" ? "error" : "warning"}
                />
                {photo.needs_review && <Chip size="small" color="warning" label="要確認" />}
              </Box>
            ))}
          </Stack>
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
