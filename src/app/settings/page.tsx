"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Switch from "@mui/material/Switch";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { createClient } from "@/lib/supabase/client";
import { MATERIAL_KINDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number };
type Unit = { id: string; subject_id: string; name: string; sort_order: number };
type Material = { id: string; subject_id: string; name: string; kind: string };

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");

  const [pushEnabled, setPushEnabled] = useState(false);

  const [dialogKind, setDialogKind] = useState<"unit" | "material" | null>(null);
  const [newName, setNewName] = useState("");
  const [newMaterialKind, setNewMaterialKind] = useState<string>(MATERIAL_KINDS[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [subjectsRes, unitsRes, materialsRes] = await Promise.all([
        supabase.from("subjects").select("id, name, color, sort_order").order("sort_order"),
        supabase.from("units").select("id, subject_id, name, sort_order").order("sort_order"),
        supabase.from("materials").select("id, subject_id, name, kind").order("name"),
      ]);
      if (subjectsRes.error || unitsRes.error || materialsRes.error) {
        setConfigError(
          "データを取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
        );
        return;
      }
      const subjectData = (subjectsRes.data ?? []) as Subject[];
      setSubjects(subjectData);
      setUnits((unitsRes.data ?? []) as Unit[]);
      setMaterials((materialsRes.data ?? []) as Material[]);
      if (!selectedSubjectId && subjectData.length > 0) {
        setSelectedSubjectId(subjectData[0].id);
      }
    } catch {
      setConfigError("Supabaseに接続できません。.env.local を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unitsForSubject = useMemo(
    () =>
      units
        .filter((u) => u.subject_id === selectedSubjectId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [units, selectedSubjectId],
  );
  const materialsForSubject = useMemo(
    () => materials.filter((m) => m.subject_id === selectedSubjectId),
    [materials, selectedSubjectId],
  );

  const openAddDialog = (kind: "unit" | "material") => {
    setDialogKind(kind);
    setNewName("");
    setNewMaterialKind(MATERIAL_KINDS[0]);
    setFormError(null);
  };

  const submitAdd = async () => {
    if (!selectedSubjectId || !newName.trim()) {
      setFormError("名前を入力してください");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (dialogKind === "unit") {
        const maxSort = unitsForSubject.reduce((m, u) => Math.max(m, u.sort_order), -1);
        const { error } = await supabase.from("units").insert({
          subject_id: selectedSubjectId,
          name: newName.trim(),
          sort_order: maxSort + 1,
        });
        if (error) throw error;
      } else if (dialogKind === "material") {
        const { error } = await supabase.from("materials").insert({
          subject_id: selectedSubjectId,
          name: newName.trim(),
          kind: newMaterialKind,
        });
        if (error) throw error;
      }
      setDialogKind(null);
      await loadAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const renameUnit = async (unit: Unit, name: string) => {
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, name } : u)));
    try {
      await supabase.from("units").update({ name }).eq("id", unit.id);
    } catch {
      await loadAll();
    }
  };

  const renameMaterial = async (material: Material, name: string) => {
    setMaterials((prev) => prev.map((m) => (m.id === material.id ? { ...m, name } : m)));
    try {
      await supabase.from("materials").update({ name }).eq("id", material.id);
    } catch {
      await loadAll();
    }
  };

  const deleteUnit = async (id: string) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
    try {
      await supabase.from("units").delete().eq("id", id);
    } catch {
      await loadAll();
    }
  };

  const deleteMaterial = async (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    try {
      await supabase.from("materials").delete().eq("id", id);
    } catch {
      await loadAll();
    }
  };

  const moveUnit = async (unit: Unit, direction: -1 | 1) => {
    const list = unitsForSubject;
    const idx = list.findIndex((u) => u.id === unit.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const other = list[swapIdx];
    const updated = units.map((u) => {
      if (u.id === unit.id) return { ...u, sort_order: other.sort_order };
      if (u.id === other.id) return { ...u, sort_order: unit.sort_order };
      return u;
    });
    setUnits(updated);
    try {
      await Promise.all([
        supabase.from("units").update({ sort_order: other.sort_order }).eq("id", unit.id),
        supabase.from("units").update({ sort_order: unit.sort_order }).eq("id", other.id),
      ]);
    } catch {
      await loadAll();
    }
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
        設定
      </Typography>

      {configError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {configError}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            科目・単元・教材の管理
          </Typography>

          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <InputLabel id="subject-select-label">科目</InputLabel>
            <Select
              labelId="subject-select-label"
              label="科目"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
            >
              {subjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            sx={{ mb: 1.5, minHeight: 36 }}
          >
            <Tab label="単元" sx={{ minHeight: 36 }} />
            <Tab label="教材" sx={{ minHeight: 36 }} />
          </Tabs>

          {tab === 0 && (
            <Stack spacing={1}>
              {unitsForSubject.map((u, idx) => (
                <Stack key={u.id} direction="row" alignItems="center" spacing={0.5}>
                  <TextField
                    size="small"
                    value={u.name}
                    onChange={(e) => renameUnit(u, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <IconButton
                    size="small"
                    disabled={idx === 0}
                    onClick={() => moveUnit(u, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={idx === unitsForSubject.length - 1}
                    onClick={() => moveUnit(u, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => deleteUnit(u.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={() => openAddDialog("unit")}
                disabled={!selectedSubjectId}
              >
                単元を追加
              </Button>
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={1}>
              {materialsForSubject.map((m) => (
                <Stack key={m.id} direction="row" alignItems="center" spacing={0.5}>
                  <TextField
                    size="small"
                    value={m.name}
                    onChange={(e) => renameMaterial(m, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <Chip size="small" label={m.kind} />
                  <IconButton size="small" onClick={() => deleteMaterial(m.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={() => openAddDialog("material")}
                disabled={!selectedSubjectId}
              >
                教材を追加
              </Button>
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">通知(Push)</Typography>
              <Typography variant="caption" color="text.secondary">
                締切リマインドと復習提案を毎朝通知(フェーズ3で実装)
              </Typography>
            </Box>
            <Switch
              checked={pushEnabled}
              onChange={(e) => setPushEnabled(e.target.checked)}
              disabled
            />
          </Stack>
        </Paper>
      </Stack>

      <Dialog open={dialogKind !== null} onClose={() => setDialogKind(null)} fullWidth maxWidth="xs">
        <DialogTitle>{dialogKind === "unit" ? "単元を追加" : "教材を追加"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="名前"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              size="small"
            />
            {dialogKind === "material" && (
              <FormControl fullWidth size="small">
                <InputLabel id="material-kind-label">種別</InputLabel>
                <Select
                  labelId="material-kind-label"
                  label="種別"
                  value={newMaterialKind}
                  onChange={(e) => setNewMaterialKind(e.target.value)}
                >
                  {MATERIAL_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogKind(null)}>キャンセル</Button>
          <Button variant="contained" onClick={submitAdd} disabled={saving}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
