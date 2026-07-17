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
import LogoutIcon from "@mui/icons-material/Logout";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { createClient } from "@/lib/supabase/client";
import { MATERIAL_KINDS } from "@/lib/constants";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push";

export const dynamic = "force-dynamic";

type Subject = { id: string; name: string; color: string; sort_order: number; is_target: boolean };
type Unit = { id: string; subject_id: string; name: string; sort_order: number; is_target: boolean };
type Material = { id: string; subject_id: string; name: string; kind: string; difficulty: string };
const DIFFICULTIES = [["basic", "基礎"], ["standard", "標準"], ["advanced", "応用"]] as const;

export default function SettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialUnits, setMaterialUnits] = useState<Array<{ material_id: string; unit_id: string }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [dialogKind, setDialogKind] = useState<"subject" | "unit" | "material" | null>(null);
  const [newName, setNewName] = useState("");
  const [newMaterialKind, setNewMaterialKind] = useState<string>(MATERIAL_KINDS[0]);
  const [newMaterialDifficulty, setNewMaterialDifficulty] = useState("standard");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [subjectsRes, unitsRes, materialsRes, materialUnitsRes] = await Promise.all([
        supabase.from("subjects").select("id, name, color, sort_order, is_target").order("sort_order"),
        supabase.from("units").select("id, subject_id, name, sort_order, is_target").order("sort_order"),
        supabase.from("materials").select("id, subject_id, name, kind, difficulty").order("name"),
        supabase.from("material_units").select("material_id,unit_id"),
      ]);
      if (subjectsRes.error || unitsRes.error || materialsRes.error || materialUnitsRes.error) {
        setConfigError(
          "データを取得できませんでした。Supabaseの接続設定(.env.local)を確認してください。",
        );
        return;
      }
      const subjectData = (subjectsRes.data ?? []) as Subject[];
      setSubjects(subjectData);
      setUnits((unitsRes.data ?? []) as Unit[]);
      setMaterials((materialsRes.data ?? []) as Material[]);
      setMaterialUnits((materialUnitsRes.data ?? []) as Array<{ material_id: string; unit_id: string }>);
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

  useEffect(() => {
    if (!isPushSupported()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPushSupported(true);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        setPushEnabled(!!sub);
      })
      .catch(() => {
        // 取得失敗時は未購読扱いのままにする
      });
  }, []);

  const togglePush = async (checked: boolean) => {
    setPushError(null);
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;

      if (checked) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          throw new Error("VAPID公開鍵が設定されていません(.env.local を確認してください)");
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("通知が許可されませんでした");
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const json = subscription.toJSON();
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint: json.endpoint,
            keys_json: json.keys,
          },
          { onConflict: "endpoint" },
        );
        if (error) throw error;
        setPushEnabled(true);
      } else {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
      }
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "通知の設定に失敗しました");
    } finally {
      setPushBusy(false);
    }
  };

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

  const openAddDialog = (kind: "subject" | "unit" | "material") => {
    setDialogKind(kind);
    setNewName("");
    setNewMaterialKind(MATERIAL_KINDS[0]);
    setNewMaterialDifficulty("standard");
    setFormError(null);
  };

  const submitAdd = async () => {
    if ((dialogKind !== "subject" && !selectedSubjectId) || !newName.trim()) {
      setFormError("名前を入力してください");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (dialogKind === "subject") {
        const maxSort = subjects.reduce((m, subject) => Math.max(m, subject.sort_order), -1);
        const { data, error } = await supabase.from("subjects").insert({ name: newName.trim(), sort_order: maxSort + 1 }).select("id").single();
        if (error) throw error;
        setSelectedSubjectId(data.id);
      } else if (dialogKind === "unit") {
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
          difficulty: newMaterialDifficulty,
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

  const setTarget = async (table: "subjects" | "units", id: string, value: boolean) => {
    if (table === "subjects") setSubjects((rows) => rows.map((row) => row.id === id ? { ...row, is_target: value } : row));
    else setUnits((rows) => rows.map((row) => row.id === id ? { ...row, is_target: value } : row));
    const { error } = await supabase.from(table).update({ is_target: value }).eq("id", id);
    if (error) await loadAll();
  };

  const setDifficulty = async (material: Material, difficulty: string) => {
    setMaterials((rows) => rows.map((row) => row.id === material.id ? { ...row, difficulty } : row));
    const { error } = await supabase.from("materials").update({ difficulty }).eq("id", material.id);
    if (error) await loadAll();
  };

  const setMaterialUnitIds = async (materialId: string, unitIds: string[]) => {
    const previousRows = materialUnits.filter((row) => row.material_id === materialId);
    setMaterialUnits((rows) => [...rows.filter((row) => row.material_id !== materialId), ...unitIds.map((unit_id) => ({ material_id: materialId, unit_id }))]);
    const { error: deleteError } = await supabase.from("material_units").delete().eq("material_id", materialId);
    const { error: insertError } = unitIds.length ? await supabase.from("material_units").insert(unitIds.map((unit_id) => ({ material_id: materialId, unit_id }))) : { error: null };
    if (deleteError || insertError) {
      setMaterialUnits((rows) => [...rows.filter((row) => row.material_id !== materialId), ...previousRows]);
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

  const logout = async () => {
    setConfigError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setConfigError(error.message);
    else window.location.assign("/login");
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
          <Button startIcon={<AddIcon />} size="small" sx={{ mb: 1.5 }} onClick={() => openAddDialog("subject")}>科目を追加</Button>
          {subjects.find((subject) => subject.id === selectedSubjectId) && (
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="body2">この科目を受験・学習対象にする</Typography>
              <Switch
                checked={subjects.find((subject) => subject.id === selectedSubjectId)?.is_target ?? false}
                onChange={(event) => setTarget("subjects", selectedSubjectId, event.target.checked)}
              />
            </Stack>
          )}

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
                  <Switch size="small" checked={u.is_target} onChange={(event) => setTarget("units", u.id, event.target.checked)} />
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
                <Paper key={m.id} variant="outlined" sx={{ p: 1 }}><Stack direction="row" alignItems="center" spacing={0.5}>
                  <TextField
                    size="small"
                    value={m.name}
                    onChange={(e) => renameMaterial(m, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <TextField select size="small" value={m.difficulty} onChange={(event) => setDifficulty(m, event.target.value)} sx={{ width: 82 }}>
                    {DIFFICULTIES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                  </TextField>
                  <Chip size="small" label={m.kind} />
                  <IconButton size="small" onClick={() => deleteMaterial(m.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <InputLabel id={`material-units-${m.id}`}>対応単元</InputLabel>
                  <Select
                    labelId={`material-units-${m.id}`}
                    multiple
                    label="対応単元"
                    value={materialUnits.filter((row) => row.material_id === m.id).map((row) => row.unit_id)}
                    onChange={(event) => setMaterialUnitIds(m.id, typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value)}
                    renderValue={(ids) => ids.map((id) => unitsForSubject.find((unit) => unit.id === id)?.name).filter(Boolean).join("、") || "未設定"}
                  >
                    {unitsForSubject.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.name}</MenuItem>)}
                  </Select>
                </FormControl></Paper>
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
                毎朝の復習提案と20:30／21:30の記録リマインド
              </Typography>
            </Box>
            <Switch
              checked={pushEnabled}
              onChange={(e) => togglePush(e.target.checked)}
              disabled={!pushSupported || pushBusy}
            />
          </Stack>
          {!pushSupported && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              このブラウザはPush通知に対応していません。iPhoneはホーム画面に追加してから利用してください。
            </Typography>
          )}
          {pushError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {pushError}
            </Alert>
          )}
        </Paper>
        <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>ログアウト</Button>
      </Stack>

      <Dialog open={dialogKind !== null} onClose={() => setDialogKind(null)} fullWidth maxWidth="xs">
        <DialogTitle>{dialogKind === "subject" ? "科目を追加" : dialogKind === "unit" ? "単元を追加" : "教材を追加"}</DialogTitle>
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
              <><FormControl fullWidth size="small">
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
              <FormControl fullWidth size="small">
                <InputLabel id="material-difficulty-label">難易度</InputLabel>
                <Select labelId="material-difficulty-label" label="難易度" value={newMaterialDifficulty} onChange={(e) => setNewMaterialDifficulty(e.target.value)}>
                  {DIFFICULTIES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </Select>
              </FormControl></>
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
