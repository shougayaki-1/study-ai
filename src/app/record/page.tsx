"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { createClient } from "@/lib/supabase/client";

// Supabase未設定でもビルドが壊れないよう、このページは静的プリレンダリング対象外にする
export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number };
type Unit = { id: string; name: string; sort_order: number };
type Material = { id: string; name: string; kind: string };
type PhotoKind = "exercise" | "essay";
type PendingPhoto = { file: File; previewUrl: string; kind: PhotoKind };

const TIME_OPTIONS = [15, 30, 45, 60];

function formatSeconds(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function RecordPage() {
  const supabase = createClient();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null,
  );

  // タイマー
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  // 写真
  const [photoKind, setPhotoKind] = useState<PhotoKind>("exercise");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function loadSubjects() {
      try {
        const { data, error } = await supabase
          .from("subjects")
          .select("id, name, color, sort_order")
          .order("sort_order", { ascending: true });
        if (!active) return;
        if (error) {
          setConfigError(
            "科目データを取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
          );
          return;
        }
        setSubjects((data ?? []) as Subject[]);
      } catch {
        if (active) {
          setConfigError(
            "Supabaseに接続できません。.env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。",
          );
        }
      } finally {
        if (active) setLoadingSubjects(false);
      }
    }
    loadSubjects();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSubject = useCallback(
    async (subject: Subject) => {
      setSelectedSubject(subject);
      setSelectedUnit(null);
      setSelectedMaterial(null);
      setSavedSessionId(null);
      setSaveError(null);
      const [{ data: unitData }, { data: materialData }] = await Promise.all([
        supabase
          .from("units")
          .select("id, name, sort_order")
          .eq("subject_id", subject.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("materials")
          .select("id, name, kind")
          .eq("subject_id", subject.id)
          .order("name", { ascending: true }),
      ]);
      setUnits((unitData ?? []) as Unit[]);
      setMaterials((materialData ?? []) as Material[]);
    },
    [supabase],
  );

  const startTimer = () => {
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveSession = async (minutes: number) => {
    if (!selectedSubject) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from("study_sessions")
        .insert({
          subject_id: selectedSubject.id,
          unit_id: selectedUnit?.id ?? null,
          material_id: selectedMaterial?.id ?? null,
          minutes,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedSessionId(data.id as string);
      stopTimer();
      setElapsedSeconds(0);
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : "記録の保存に失敗しました。時間をおいて再度お試しください。",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveTimerSession = async () => {
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
    await saveSession(minutes);
  };

  const handleFilesSelected = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;
    const newPhotos: PendingPhoto[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      kind: photoKind,
    }));
    setPendingPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingPhoto = (index: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async () => {
    if (pendingPhotos.length === 0) return;
    setUploadingPhotos(true);
    setUploadedCount(0);
    try {
      for (const photo of pendingPhotos) {
        const ext = photo.file.name.split(".").pop() || "jpg";
        const path = `${savedSessionId ?? "unlinked"}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, photo.file, { upsert: false });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("photos").insert({
          session_id: savedSessionId,
          storage_path: path,
          kind: photo.kind,
          status: "pending",
        });
        if (insertError) throw insertError;
        setUploadedCount((c) => c + 1);
      }
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingPhotos([]);
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : "写真のアップロードに失敗しました。",
      );
    } finally {
      setUploadingPhotos(false);
    }
  };

  const resetForm = () => {
    setSelectedSubject(null);
    setSelectedUnit(null);
    setSelectedMaterial(null);
    setSavedSessionId(null);
    setSaveError(null);
    setElapsedSeconds(0);
    stopTimer();
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingPhotos([]);
    setUploadedCount(0);
  };

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        記録
      </Typography>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      {/* Step 1: 科目 */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        1. 科目を選ぶ
      </Typography>
      {loadingSubjects ? (
        <CircularProgress size={24} />
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            mb: 3,
          }}
        >
          {subjects.map((subject) => (
            <Button
              key={subject.id}
              variant={
                selectedSubject?.id === subject.id ? "contained" : "outlined"
              }
              onClick={() => selectSubject(subject)}
              sx={{
                py: 1.2,
                minWidth: 0,
                borderColor: subject.color,
                color:
                  selectedSubject?.id === subject.id ? "#fff" : subject.color,
                backgroundColor:
                  selectedSubject?.id === subject.id
                    ? subject.color
                    : "transparent",
                "&:hover": {
                  backgroundColor:
                    selectedSubject?.id === subject.id
                      ? subject.color
                      : `${subject.color}14`,
                  borderColor: subject.color,
                },
              }}
            >
              {subject.name}
            </Button>
          ))}
        </Box>
      )}

      {selectedSubject && (
        <>
          {/* Step 2: 単元(任意) */}
          {units.length > 0 && (
            <>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                2. 単元(任意)
              </Typography>
              <Stack
                direction="row"
                flexWrap="wrap"
                gap={1}
                sx={{ mb: 3 }}
              >
                {units.map((unit) => (
                  <Chip
                    key={unit.id}
                    label={unit.name}
                    clickable
                    color={selectedUnit?.id === unit.id ? "primary" : "default"}
                    variant={selectedUnit?.id === unit.id ? "filled" : "outlined"}
                    onClick={() =>
                      setSelectedUnit(
                        selectedUnit?.id === unit.id ? null : unit,
                      )
                    }
                  />
                ))}
              </Stack>
            </>
          )}

          {/* Step 3: 教材(任意) */}
          {materials.length > 0 && (
            <>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                3. 教材(任意)
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
                {materials.map((material) => (
                  <Chip
                    key={material.id}
                    label={material.name}
                    clickable
                    color={
                      selectedMaterial?.id === material.id
                        ? "secondary"
                        : "default"
                    }
                    variant={
                      selectedMaterial?.id === material.id
                        ? "filled"
                        : "outlined"
                    }
                    onClick={() =>
                      setSelectedMaterial(
                        selectedMaterial?.id === material.id ? null : material,
                      )
                    }
                  />
                ))}
              </Stack>
            </>
          )}

          {/* Step 4: 時間 */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            4. 時間を選んで保存
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
              mb: 2,
            }}
          >
            {TIME_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                variant="contained"
                disabled={saving}
                onClick={() => saveSession(minutes)}
                sx={{ py: 1.5 }}
              >
                {minutes}分
              </Button>
            ))}
          </Box>

          <Divider sx={{ my: 2 }}>または</Divider>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={2}
            sx={{ mb: 2 }}
          >
            <Typography variant="h4" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatSeconds(elapsedSeconds)}
            </Typography>
            {!timerRunning ? (
              <IconButton color="primary" onClick={startTimer} size="large">
                <PlayArrowIcon fontSize="large" />
              </IconButton>
            ) : (
              <IconButton color="error" onClick={stopTimer} size="large">
                <StopIcon fontSize="large" />
              </IconButton>
            )}
          </Stack>
          {(timerRunning || elapsedSeconds > 0) && (
            <Button
              fullWidth
              variant="outlined"
              disabled={saving || elapsedSeconds === 0}
              onClick={saveTimerSession}
              sx={{ mb: 3 }}
            >
              タイマーの時間で保存
            </Button>
          )}

          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {saveError}
            </Alert>
          )}

          {savedSessionId && (
            <Alert
              icon={<CheckCircleIcon fontSize="inherit" />}
              severity="success"
              sx={{ mb: 3 }}
            >
              記録を保存しました
            </Alert>
          )}

          {/* 写真アップロード */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            写真を追加(任意)
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 1.5 }}
          >
            丸付け済み(○✕記入済み)の問題集ページを撮影してください
          </Typography>

          <ToggleButtonGroup
            exclusive
            value={photoKind}
            onChange={(_, value) => value && setPhotoKind(value)}
            size="small"
            sx={{ mb: 1.5 }}
          >
            <ToggleButton value="exercise">演習(丸付け済み)</ToggleButton>
            <ToggleButton value="essay">小論文答案</ToggleButton>
          </ToggleButtonGroup>

          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              hidden
              onChange={handleFilesSelected}
            />
            <Button
              variant="outlined"
              startIcon={<PhotoCameraIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ mb: 2 }}
            >
              写真を選択
            </Button>
          </Box>

          {pendingPhotos.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {pendingPhotos.map((photo, index) => (
                <Box
                  key={index}
                  sx={{
                    position: "relative",
                    width: 84,
                    height: 84,
                    borderRadius: 1.5,
                    overflow: "hidden",
                    border: "1px solid #eee",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt={photo.kind}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <Chip
                    size="small"
                    label={photo.kind === "exercise" ? "演習" : "小論文"}
                    sx={{
                      position: "absolute",
                      bottom: 2,
                      left: 2,
                      height: 18,
                      fontSize: 10,
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removePendingPhoto(index)}
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      backgroundColor: "rgba(255,255,255,0.8)",
                      p: 0.3,
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}

          {pendingPhotos.length > 0 && (
            <Button
              fullWidth
              variant="contained"
              color="secondary"
              disabled={uploadingPhotos}
              onClick={uploadPhotos}
              sx={{ mb: 1 }}
            >
              {uploadingPhotos
                ? `アップロード中... (${uploadedCount}/${pendingPhotos.length})`
                : `写真をアップロード (${pendingPhotos.length}枚)`}
            </Button>
          )}

          {(savedSessionId || pendingPhotos.length > 0) && (
            <Button fullWidth variant="text" onClick={resetForm} sx={{ mt: 1 }}>
              新しい記録を始める
            </Button>
          )}
        </>
      )}
    </Box>
  );
}
