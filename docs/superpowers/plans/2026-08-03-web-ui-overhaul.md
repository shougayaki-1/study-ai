# Web UI テコ入れ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** study-aiのWeb UIを、実際に機能するナビゲーション(今日/計画/学習状態/記録/その他)に再編し、vault移行後に凍結した旧ページを削除し、レポートをカード化+グラフ対応し、Webの書き込み経路を全廃して完全read-onlyにする。

**Architecture:** Next.js App Routerの既存ページを直接改修する。データソースは既存のvault(`STUDY_AI_VAULT_DIR`、fsまたはSupabaseミラー経由)のみを使い、新しいバックエンド・DBスキーマは追加しない。新規ロジックは`src/lib/karte/`(科目名寄せ・弱点集計)と`src/lib/reports/`(レポートセクション分割)に切り出し、vitestでユニットテストする。レポートのグラフ用データは、既存の`data/derived/skills-*.json`と同じ「Markdownと別のJSONサイドカーファイル」パターンに揃え、`analysis/helpers/`側(Node)で生成する。

**Tech Stack:** Next.js 15 (App Router) / MUI / TypeScript / vitest (src/) / node:test (analysis/) / 既存のvault CLIヘルパー(`analysis/helpers/*.mjs`)。新規の外部依存パッケージは追加しない。

## Global Constraints

- 親設計: [`docs/superpowers/specs/2026-08-03-web-ui-overhaul-design.md`](../specs/2026-08-03-web-ui-overhaul-design.md)。矛盾があれば設計を優先する。
- Phase8-9(推薦エンジン等)、教材/模試/志望/Inbox/AI記憶画面は今回のスコープ外。作らない。
- `knowledge_columns`/`subjects`/`units`/`weakness_scores`のSupabaseテーブル自体は削除しない。Webから見えなくするだけ。
- vaultへの書き込みは、対話/CLI経由の`analysis/helpers/*.mjs`に一本化する。Webから到達可能なmutation用Server Actionは新設しない(既存2箇所は本計画で撤去する)。
- 科目正式名の13科目リスト(`SUBJECTS`)は`analysis/helpers/add-plan-block.mjs`の`SUBJECTS`定数と同じ集合を維持する(手動同期。ズレたらdocs/study-dialogue.mdの一覧を正とする)。
- `.tsx`ページ/コンポーネントはこのリポジトリの既存方針として自動テスト対象外(`vitest.config.ts`の`include`は`src/**/*.test.ts`のみ)。ロジックを`.ts`へ切り出した部分にはユニットテストを書く。
- 各タスクの最後に`npm run lint`(または該当フェーズの検証タスク)が通ることを確認する。

---

## File Structure(概要)

**新規作成**

- `src/app/more/page.tsx` — 「その他」ハブページ
- `src/lib/karte/subject-mapping.ts` / `.test.ts` — 13科目の名寄せ表
- `src/lib/karte/list-subjects.ts` / `.test.ts` — `src/app/karte/_lib/list-subjects.ts`から移設
- `src/lib/karte/weak-topics.ts` / `.test.ts` — 弱点単元の横断集計
- `src/lib/karte/subject-summary.ts` / `.test.ts` — 科目別サマリ集計
- `src/lib/reports/parse-sections.ts` / `.test.ts` — レポートMarkdownのセクション分割
- `src/lib/vault/report-charts.ts` / `.test.ts` — レポートchartサイドカーの読み取り(TS側)
- `src/components/BarChart.tsx` — 簡易棒グラフ表示
- `analysis/helpers/report-charts.mjs` — レポートchartサイドカーの書き込み(Node側)
- `analysis/test/report-charts.test.mjs`
- `analysis/helpers/compute-weekly-study-minutes.mjs` — 週次学習時間の集計
- `analysis/test/compute-weekly-study-minutes.test.mjs`

**変更**

- `src/app/layout.tsx` — BottomNavを組み込む
- `src/components/BottomNav.tsx` — 5タブ構成へ再編
- `src/app/settings/page.tsx` — 科目/単元/教材管理セクションを削除
- `src/app/karte/page.tsx` — 科目横断サマリ表示へ書き換え
- `src/app/page.tsx` — 弱点ハイライト帯を追加
- `src/app/schedule/page.tsx` — read-only化、ラベルを「計画」に変更
- `src/app/schedule/schedule-event-toggle.tsx` — 表示専用化
- `src/app/reports/daily/[date]/confirm-todo-list.tsx` — 表示専用化
- `src/app/reports/daily/[date]/page.tsx` — read-only化+カード化
- `src/app/reports/weekly/[week]/page.tsx` — カード化
- `src/lib/vault/index.ts` — `readReportChart`等をエクスポート
- `analysis/helpers/build-daily-report.mjs` — chartサイドカー書き込みを追加
- `analysis/helpers/build-weekly-report.mjs` — 同上
- `analysis/nightly.md` — 週次レポート生成手順にchart計算ステップを追加

**削除**

- `src/app/columns/` 一式
- `src/app/stats/page.tsx`、`src/lib/study-metrics.ts`、`src/lib/study-metrics.test.ts`
- `src/app/schedule/_lib/actions.ts`、`src/app/schedule/_lib/actions.test.ts`
- `src/app/reports/daily/_lib/actions.ts`、`actions.test.ts`、`build-correction.ts`、`build-correction.test.ts`
- `src/app/karte/_lib/list-subjects.ts`、`list-subjects.test.ts`(→ `src/lib/karte/`へ移設)

---

# Phase 1: ナビゲーション有効化 + レガシーページ削除

### Task 1: 「その他」ハブページを新設する

**Files:**
- Create: `src/app/more/page.tsx`

**Interfaces:**
- Produces: ルート`/more`(Phase 1 Task 2でBottomNavからリンクされる)

- [ ] **Step 1: ページを作成する**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import ArticleIcon from "@mui/icons-material/Article";
import SettingsIcon from "@mui/icons-material/Settings";

const MORE_LINKS = [
  { href: "/reports", label: "レポート", description: "日次・週次のレポートを見る", icon: <ArticleIcon /> },
  { href: "/settings", label: "設定", description: "夜間分析バッチの起動プロンプト・ログアウト", icon: <SettingsIcon /> },
];

export default function MorePage() {
  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        その他
      </Typography>
      <Stack spacing={1}>
        {MORE_LINKS.map((item) => (
          <Paper
            key={item.href}
            component={Link}
            href={item.href}
            variant="outlined"
            sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, textDecoration: "none", color: "text.primary" }}
          >
            {item.icon}
            <Box>
              <Typography variant="body1">{item.label}</Typography>
              <Typography variant="caption" color="text.secondary">{item.description}</Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: 動作確認**

`npm run dev`で`/more`を開き、レポート・設定へのリンクが表示されることを確認する。

- [ ] **Step 3: Commit**

```bash
git add src/app/more/page.tsx
git commit -m "feat(web): add /more hub page for reports and settings"
```

---

### Task 2: BottomNavを5タブに再編し、layoutへ組み込む

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: Task 1で作成した`/more`
- Produces: 全ページ共通のナビゲーション。以降のタスクで新設するページ(`/karte`拡張等)は既存パスのままなので、このタスクの変更だけで自動的にリンクされる。

- [ ] **Step 1: `BottomNav.tsx`を書き換える**

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Toolbar from "@mui/material/Toolbar";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import TodayIcon from "@mui/icons-material/Today";
import EventNoteIcon from "@mui/icons-material/EventNote";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

const NAV_ITEMS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "計画", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "学習状態", value: "/karte", icon: <MedicalInformationIcon /> },
  { label: "記録", value: "/records", icon: <ListAltIcon /> },
  { label: "その他", value: "/more", icon: <MoreHorizIcon /> },
];

const DRAWER_WIDTH = 224;

function isActive(pathname: string, value: string): boolean {
  if (value === "/") return pathname === "/";
  if (value === "/more") return pathname === "/more" || pathname.startsWith("/reports") || pathname.startsWith("/settings");
  return pathname === value || pathname.startsWith(`${value}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  const current = NAV_ITEMS.find((item) => isActive(pathname, item.value))?.value ?? "";
  const navigate = (value: string) => router.push(value);

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{ display: { xs: "none", md: "block" }, width: DRAWER_WIDTH, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}
      >
        <Toolbar><Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>Study AI</Box></Toolbar>
        <Divider />
        <List sx={{ px: 1 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton key={item.value} selected={current === item.value} onClick={() => navigate(item.value)} sx={{ borderRadius: 1 }}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box sx={{ display: { xs: "block", md: "none" }, position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, borderTop: "1px solid #eeeeee", bgcolor: "background.paper", pb: "env(safe-area-inset-bottom)" }}>
        <BottomNavigation showLabels value={current || false} onChange={(_, newValue) => navigate(newValue)} sx={{ minHeight: 56 }}>
          {NAV_ITEMS.map((item) => (
            <BottomNavigationAction key={item.value} label={item.label} value={item.value} icon={item.icon} />
          ))}
        </BottomNavigation>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: `layout.tsx`にBottomNavを組み込む**

`src/app/layout.tsx`の`import`群に追加:

```tsx
import Box from "@mui/material/Box";
import BottomNav from "@/components/BottomNav";
```

`RootLayout`の`return`を次のように変更する(既存の`ThemeRegistry`の中身を`Box`レイアウトで包む):

```tsx
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <AppRouterCacheProvider options={{ enableCssLayer: false }}>
          <ThemeRegistry>
            <Box sx={{ display: "flex" }}>
              <BottomNav />
              <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                {children}
              </Box>
            </Box>
          </ThemeRegistry>
        </AppRouterCacheProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
```

- [ ] **Step 3: 動作確認**

`npm run dev`で以下を確認する。

1. デスクトップ幅(≥900px)で左側に5項目の常設Drawerが表示される。
2. モバイル幅(<900px)で下部に5項目のBottomNavigationが表示され、ハンバーガーメニューが無いこと。
3. 各タブをクリックし、`/`, `/schedule`, `/karte`, `/records`, `/more`へ遷移できること。
4. `/reports`と`/settings`を直接開いたとき、「その他」タブがハイライトされること。
5. `/login`ではナビが表示されないこと。

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomNav.tsx src/app/layout.tsx
git commit -m "feat(web): wire up BottomNav and reduce to 5-tab IA"
```

---

### Task 3: `/columns`を削除する

**Files:**
- Delete: `src/app/columns/page.tsx`(ディレクトリごと)

**Interfaces:**
- Consumes: なし(Task 2でナビから既に外れている。旧`BottomNav`にも`/columns`は元々含まれていなかった)

- [ ] **Step 1: 削除する**

```bash
rm -rf src/app/columns
```

- [ ] **Step 2: 参照が残っていないか確認する**

```bash
grep -rn '"/columns"\|from "@/app/columns' src/ analysis/ || echo "no references"
```

Expected: `no references`(削除前に確認済みで、`/stats`からの1件のみだったため`/stats`ごと消えている)。

- [ ] **Step 3: Commit**

```bash
git add -A src/app/columns
git commit -m "chore(web): remove legacy /columns page (frozen since vault migration)"
```

---

### Task 4: `/stats`を削除する

**Files:**
- Delete: `src/app/stats/page.tsx`(ディレクトリごと)
- Delete: `src/lib/study-metrics.ts`
- Delete: `src/lib/study-metrics.test.ts`

**Interfaces:**
- Consumes: なし

- [ ] **Step 1: 削除する**

```bash
rm -rf src/app/stats
rm -f src/lib/study-metrics.ts src/lib/study-metrics.test.ts
```

- [ ] **Step 2: 他ファイルからの参照が無いことを確認する**

```bash
grep -rln "study-metrics\|from \"\\./stats\"\|\"/stats\"" src/ || echo "no references"
```

Expected: `no references`(`/stats`への唯一の参照元だった`BottomNav.tsx`はTask 2で既に書き換え済み)。

- [ ] **Step 3: `npm run build`を実行し、型エラーが無いことを確認する**

Run: `npm run build`
Expected: ビルド成功(削除済みファイルへの参照が残っていればここで検出される)。

- [ ] **Step 4: Commit**

```bash
git add -A src/app/stats src/lib/study-metrics.ts src/lib/study-metrics.test.ts
git commit -m "chore(web): remove legacy /stats page and its Supabase-only metrics lib"
```

---

### Task 5: `/settings`から科目・単元・教材の管理セクションを削除する

**Files:**
- Modify: `src/app/settings/page.tsx`(全面書き換え)

**Interfaces:**
- Consumes: なし
- Produces: `/settings`は夜間バッチ起動プロンプト表示とログアウトのみになる

- [ ] **Step 1: ファイル全体を次の内容に置き換える**

```tsx
"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Alert from "@mui/material/Alert";
import LogoutIcon from "@mui/icons-material/Logout";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
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
      const response = await fetch("/api/nightly-prompt", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "再ログインが必要です" : "プロンプトを読み込めませんでした");
      setPromptText(await response.text());
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : "プロンプトを読み込めませんでした");
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
          <Typography variant="subtitle2">夜間分析バッチの起動プロンプト</Typography>
          <Typography variant="caption" color="text.secondary">
            Claude Codeの対話セッションへ貼り付ける最新の指示です。
          </Typography>
          <Box
            component="pre"
            sx={{ mt: 1, mb: 1, p: 1, bgcolor: "grey.50", borderRadius: 1, overflow: "hidden", maxHeight: promptOpen ? "none" : 72, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "monospace", fontSize: 12 }}
          >
            {promptText || "# study-ai 夜間分析バッチ\n（全文を表示すると読み込みます）"}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => void togglePrompt()} disabled={promptLoading}>
              {promptLoading ? "読込中..." : promptOpen ? "閉じる" : "全文を表示"}
            </Button>
            <Collapse in={promptOpen && !!promptText} orientation="horizontal">
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyPrompt()}>
                {promptCopied ? "コピーしました" : "コピー"}
              </Button>
            </Collapse>
          </Stack>
          {promptError && <Alert severity="error" sx={{ mt: 1 }}>{promptError}</Alert>}
        </Paper>
        <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>ログアウト</Button>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: 動作確認**

`npm run dev`で`/settings`を開き、夜間バッチ起動プロンプトの表示・コピーとログアウトボタンが動くことを確認する。科目・単元・教材の管理UIが表示されないこと。

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "chore(web): remove settings sections that only configured the removed /stats and /columns pages"
```

---

### Task 6: Phase 1 検証

**Files:** なし(検証のみ)

- [ ] **Step 1: lintとビルドを実行する**

Run: `npm run lint && npm run build`
Expected: どちらも成功する。

- [ ] **Step 2: 既存テストが壊れていないことを確認する**

Run: `npm test`
Expected: 全テストがパスする(削除したファイルのテストは既に消えているため対象から外れる)。

---

# Phase 2: 「学習状態」科目名寄せ + 「今日」弱点ハイライト

### Task 7: 13科目の名寄せ表を作る(TDD)

**Files:**
- Create: `src/lib/karte/subject-mapping.ts`
- Test: `src/lib/karte/subject-mapping.test.ts`

**Interfaces:**
- Produces: `SUBJECTS: readonly string[]`、`type Subject`、`resolveSubjectGroup(rawKey: string): Subject | "unmapped"`(Task 9, 10, 11で使用)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/karte/subject-mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSubjectGroup, SUBJECTS } from "./subject-mapping";

describe("resolveSubjectGroup", () => {
  it("正式科目名はそのまま返す", () => {
    expect(resolveSubjectGroup("英語R")).toBe("英語R");
    expect(resolveSubjectGroup("化学基礎")).toBe("化学基礎");
  });

  it("既知のエイリアスを正式科目名へ変換する", () => {
    expect(resolveSubjectGroup("古文単語")).toBe("古文");
    expect(resolveSubjectGroup("古文文法")).toBe("古文");
    expect(resolveSubjectGroup("地理総合")).toBe("地理");
    expect(resolveSubjectGroup("ベストフィット情報Ⅰ（実教出版）")).toBe("情報");
  });

  it("範囲が異なる可能性がある名称や未確定の名称は未分類のままにする", () => {
    expect(resolveSubjectGroup("数学C")).toBe("unmapped");
    expect(resolveSubjectGroup("公共")).toBe("unmapped");
    expect(resolveSubjectGroup("高校英単語")).toBe("unmapped");
  });

  it("SUBJECTSは13科目である", () => {
    expect(SUBJECTS).toHaveLength(13);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/karte/subject-mapping.test.ts`
Expected: FAIL(`./subject-mapping`が存在しない)。

- [ ] **Step 3: 実装する**

`src/lib/karte/subject-mapping.ts`:

```ts
// 対話/CLIで使う13科目の正式名一覧。analysis/helpers/add-plan-block.mjs の
// SUBJECTS 定数と同じ集合を維持すること(手動同期)。
export const SUBJECTS = [
  "英語R", "英語L", "現代文", "古文", "漢文",
  "数学IA", "数学2BC", "化学基礎", "地学基礎",
  "地理", "政治経済", "情報", "小論文",
] as const;

export type Subject = (typeof SUBJECTS)[number];

// vault内の実データ(subjects/ ディレクトリ名、data/derived/skills-*.json の教材名)を
// 正式科目名へ名寄せする対応表。範囲が異なる可能性がある組(政治経済/公共、数学2BC/数学C)や、
// 複数科目にまたがる可能性がある教材(高校英単語)は、誤って紐付けるより「未分類」として
// 目視確認できる状態を維持するため、意図的にここへ含めない。
export const SUBJECT_ALIASES: Record<string, Subject> = {
  古文単語: "古文",
  古文文法: "古文",
  地理総合: "地理",
  "ベストフィット情報Ⅰ（実教出版）": "情報",
};

export function resolveSubjectGroup(rawKey: string): Subject | "unmapped" {
  if ((SUBJECTS as readonly string[]).includes(rawKey)) return rawKey as Subject;
  return SUBJECT_ALIASES[rawKey] ?? "unmapped";
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/karte/subject-mapping.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/karte/subject-mapping.ts src/lib/karte/subject-mapping.test.ts
git commit -m "feat(web): add canonical subject list and raw-key alias mapping"
```

---

### Task 8: `listKarteSubjects`を`src/lib/karte/`へ移設する

**Files:**
- Create: `src/lib/karte/list-subjects.ts`(`src/app/karte/_lib/list-subjects.ts`の内容をそのまま移す)
- Create: `src/lib/karte/list-subjects.test.ts`(同様に移す)
- Delete: `src/app/karte/_lib/list-subjects.ts`
- Delete: `src/app/karte/_lib/list-subjects.test.ts`
- Modify: `src/app/karte/page.tsx`(importパス変更。Task 11で内容ごと書き換えるためここでは変更しない)

**Interfaces:**
- Produces: `listKarteSubjects(): Promise<string[]>`、`listKarteSubjectsFromSupabase(client): Promise<string[]>`(Task 9, 10で使用)

- [ ] **Step 1: ファイルを移設する**

```bash
mkdir -p src/lib/karte
git mv src/app/karte/_lib/list-subjects.ts src/lib/karte/list-subjects.ts
git mv src/app/karte/_lib/list-subjects.test.ts src/lib/karte/list-subjects.test.ts
```

中身は変更不要(既存コードは`@/lib/vault`をエイリアス経由で参照しており、相対パスに依存していないため)。

- [ ] **Step 2: `src/app/karte/page.tsx`のimportを更新する**

`src/app/karte/page.tsx`内の以下の行:

```tsx
import { listKarteSubjects } from "./_lib/list-subjects";
```

を次に置き換える:

```tsx
import { listKarteSubjects } from "@/lib/karte/list-subjects";
```

(このページはTask 11で全面書き換えするため、ここでは import 行だけ直す。)

- [ ] **Step 3: テストが通ることを確認する**

Run: `npx vitest run src/lib/karte/list-subjects.test.ts`
Expected: PASS(内容は変わっていないため元々通っていたテストがそのまま通る)。

- [ ] **Step 4: `npm run build`でimportエラーが無いことを確認する**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/karte src/app/karte
git commit -m "refactor(web): move listKarteSubjects to src/lib/karte for cross-route reuse"
```

---

### Task 9: 弱点単元の横断集計を作る(TDD)

**Files:**
- Create: `src/lib/karte/weak-topics.ts`
- Test: `src/lib/karte/weak-topics.test.ts`

**Interfaces:**
- Consumes: `listKarteSubjects()`(Task 8)、`resolveSubjectGroup()`(Task 7)、`readSkills(subject): Promise<SkillsFile | null>`(既存 `@/lib/vault`)
- Produces: `type WeakTopicEntry = { subjectKey: string; canonicalSubject: Subject | "unmapped"; topic: SkillTopic }`、`collectWeakTopics(limit: number): Promise<WeakTopicEntry[]>`(Task 12で使用)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/karte/weak-topics.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { SkillsFile } from "@/lib/vault";

const readSkills = vi.fn();
const listKarteSubjects = vi.fn();
vi.mock("@/lib/vault", () => ({ readSkills: (subject: string) => readSkills(subject) }));
vi.mock("./list-subjects", () => ({ listKarteSubjects: () => listKarteSubjects() }));

import { collectWeakTopics } from "./weak-topics";

function skillsFile(subject: string, topics: SkillsFile["topics"]): SkillsFile {
  return { schema_version: 1, subject, generated_at: "2026-08-01T00:00:00+09:00", topics };
}

function topic(overrides: Partial<SkillsFile["topics"][number]>): SkillsFile["topics"][number] {
  return {
    key: "k", topic_path: ["a"], group: "a", name: "n",
    attempts: 5, correct: 1, accuracy: 0.2, recent: [], last_practiced_date: null,
    avg_duration_sec: null, state: "weak", recent_attempts: [],
    ...overrides,
  };
}

describe("collectWeakTopics", () => {
  it("state=weak の単元だけを集め、正答率が低い順・試行数が多い順に並べる", async () => {
    listKarteSubjects.mockResolvedValue(["英語R", "古文単語"]);
    readSkills.mockImplementation(async (subject: string) => {
      if (subject === "英語R") {
        return skillsFile("英語R", [
          topic({ key: "r1", name: "語彙", state: "weak", accuracy: 0.4, attempts: 10 }),
          topic({ key: "r2", name: "読解", state: "stable", accuracy: 0.9, attempts: 10 }),
        ]);
      }
      return skillsFile("古文単語", [
        topic({ key: "k1", name: "助動詞", state: "weak", accuracy: 0.2, attempts: 8 }),
      ]);
    });
    const result = await collectWeakTopics(5);
    expect(result.map((entry) => entry.topic.key)).toEqual(["k1", "r1"]);
    expect(result[0].canonicalSubject).toBe("古文");
    expect(result[0].subjectKey).toBe("古文単語");
  });

  it("skills.jsonが無い科目はスキップする", async () => {
    listKarteSubjects.mockResolvedValue(["英語R"]);
    readSkills.mockResolvedValue(null);
    expect(await collectWeakTopics(5)).toEqual([]);
  });

  it("limitで件数を絞る", async () => {
    listKarteSubjects.mockResolvedValue(["化学基礎"]);
    readSkills.mockResolvedValue(
      skillsFile("化学基礎", [
        topic({ key: "c1", accuracy: 0.1, attempts: 5 }),
        topic({ key: "c2", accuracy: 0.2, attempts: 5 }),
        topic({ key: "c3", accuracy: 0.3, attempts: 5 }),
      ]),
    );
    const result = await collectWeakTopics(2);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/karte/weak-topics.test.ts`
Expected: FAIL(`./weak-topics`が存在しない)。

- [ ] **Step 3: 実装する**

`src/lib/karte/weak-topics.ts`:

```ts
import { readSkills, type SkillTopic } from "@/lib/vault";
import { listKarteSubjects } from "./list-subjects";
import { resolveSubjectGroup, type Subject } from "./subject-mapping";

export type WeakTopicEntry = {
  subjectKey: string;
  canonicalSubject: Subject | "unmapped";
  topic: SkillTopic;
};

export async function collectWeakTopics(limit: number): Promise<WeakTopicEntry[]> {
  const subjectKeys = await listKarteSubjects();
  const entries: WeakTopicEntry[] = [];
  for (const subjectKey of subjectKeys) {
    const skills = await readSkills(subjectKey);
    if (!skills) continue;
    for (const topic of skills.topics) {
      if (topic.state !== "weak") continue;
      entries.push({ subjectKey, canonicalSubject: resolveSubjectGroup(subjectKey), topic });
    }
  }
  entries.sort((a, b) => a.topic.accuracy - b.topic.accuracy || b.topic.attempts - a.topic.attempts);
  return entries.slice(0, limit);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/karte/weak-topics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/karte/weak-topics.ts src/lib/karte/weak-topics.test.ts
git commit -m "feat(web): add cross-subject weak topic aggregation"
```

---

### Task 10: 科目別サマリ集計を作る(TDD)

**Files:**
- Create: `src/lib/karte/subject-summary.ts`
- Test: `src/lib/karte/subject-summary.test.ts`

**Interfaces:**
- Consumes: `listKarteSubjects()`(Task 8)、`resolveSubjectGroup()`、`SUBJECTS`(Task 7)、`readSkills()`(既存)
- Produces: `type SubjectSummary`、`buildSubjectSummaries(): Promise<SubjectSummary[]>`(Task 11で使用)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/karte/subject-summary.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { SkillsFile } from "@/lib/vault";

const readSkills = vi.fn();
const listKarteSubjects = vi.fn();
vi.mock("@/lib/vault", () => ({ readSkills: (subject: string) => readSkills(subject) }));
vi.mock("./list-subjects", () => ({ listKarteSubjects: () => listKarteSubjects() }));

import { buildSubjectSummaries } from "./subject-summary";
import { SUBJECTS } from "./subject-mapping";

function skillsFile(subject: string, topics: SkillsFile["topics"]): SkillsFile {
  return { schema_version: 1, subject, generated_at: "2026-08-01T00:00:00+09:00", topics };
}

function topic(overrides: Partial<SkillsFile["topics"][number]>): SkillsFile["topics"][number] {
  return {
    key: "k", topic_path: ["a"], group: "a", name: "n",
    attempts: 5, correct: 3, accuracy: 0.6, recent: [], last_practiced_date: null,
    avg_duration_sec: null, state: "stable", recent_attempts: [],
    ...overrides,
  };
}

describe("buildSubjectSummaries", () => {
  it("13科目 + unmapped の全グループを返す", async () => {
    listKarteSubjects.mockResolvedValue([]);
    const result = await buildSubjectSummaries();
    expect(result.map((s) => s.subject)).toEqual([...SUBJECTS, "unmapped"]);
  });

  it("エイリアスされた複数の教材キーを1つの科目に集約し、件数と最終学習日を集計する", async () => {
    listKarteSubjects.mockResolvedValue(["古文単語", "古文文法"]);
    readSkills.mockImplementation(async (key: string) => {
      if (key === "古文単語") {
        return skillsFile(key, [
          topic({ key: "w1", state: "weak", last_practiced_date: "2026-08-01" }),
          topic({ key: "s1", state: "stable", last_practiced_date: "2026-07-20" }),
        ]);
      }
      return skillsFile(key, [topic({ key: "u1", state: "unstable", last_practiced_date: "2026-08-02" })]);
    });
    const result = await buildSubjectSummaries();
    const kobun = result.find((s) => s.subject === "古文");
    expect(kobun).toMatchObject({
      sourceKeys: ["古文単語", "古文文法"],
      totalTopics: 3,
      weakCount: 1,
      unstableCount: 1,
      stableCount: 1,
      insufficientCount: 0,
      lastPracticedDate: "2026-08-02",
    });
  });

  it("紐付け先の無い教材キーはunmappedへ入る", async () => {
    listKarteSubjects.mockResolvedValue(["数学C"]);
    readSkills.mockResolvedValue(skillsFile("数学C", [topic({ key: "m1", state: "weak" })]));
    const result = await buildSubjectSummaries();
    const unmapped = result.find((s) => s.subject === "unmapped");
    expect(unmapped?.sourceKeys).toEqual(["数学C"]);
    expect(unmapped?.weakCount).toBe(1);
  });

  it("データが無い科目はtotalTopics=0のまま返す", async () => {
    listKarteSubjects.mockResolvedValue([]);
    const result = await buildSubjectSummaries();
    const eigo = result.find((s) => s.subject === "英語R");
    expect(eigo).toMatchObject({ sourceKeys: [], totalTopics: 0, lastPracticedDate: null });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/karte/subject-summary.test.ts`
Expected: FAIL(`./subject-summary`が存在しない)。

- [ ] **Step 3: 実装する**

`src/lib/karte/subject-summary.ts`:

```ts
import { readSkills } from "@/lib/vault";
import { listKarteSubjects } from "./list-subjects";
import { resolveSubjectGroup, SUBJECTS, type Subject } from "./subject-mapping";

export type SubjectSummary = {
  subject: Subject | "unmapped";
  sourceKeys: string[];
  totalTopics: number;
  weakCount: number;
  unstableCount: number;
  stableCount: number;
  insufficientCount: number;
  lastPracticedDate: string | null;
};

function emptySummary(subject: Subject | "unmapped", sourceKeys: string[]): SubjectSummary {
  return {
    subject,
    sourceKeys,
    totalTopics: 0,
    weakCount: 0,
    unstableCount: 0,
    stableCount: 0,
    insufficientCount: 0,
    lastPracticedDate: null,
  };
}

export async function buildSubjectSummaries(): Promise<SubjectSummary[]> {
  const rawKeys = await listKarteSubjects();
  const groups = new Map<Subject | "unmapped", string[]>();
  for (const subject of SUBJECTS) groups.set(subject, []);
  groups.set("unmapped", []);
  for (const rawKey of rawKeys) {
    const subject = resolveSubjectGroup(rawKey);
    groups.get(subject)?.push(rawKey);
  }

  const summaries: SubjectSummary[] = [];
  for (const subject of [...SUBJECTS, "unmapped" as const]) {
    const sourceKeys = groups.get(subject) ?? [];
    const summary = emptySummary(subject, sourceKeys);
    for (const sourceKey of sourceKeys) {
      const skills = await readSkills(sourceKey);
      if (!skills) continue;
      for (const topic of skills.topics) {
        summary.totalTopics += 1;
        if (topic.state === "weak") summary.weakCount += 1;
        else if (topic.state === "unstable") summary.unstableCount += 1;
        else if (topic.state === "stable") summary.stableCount += 1;
        else summary.insufficientCount += 1;
        if (topic.last_practiced_date && (!summary.lastPracticedDate || topic.last_practiced_date > summary.lastPracticedDate)) {
          summary.lastPracticedDate = topic.last_practiced_date;
        }
      }
    }
    summaries.push(summary);
  }
  return summaries;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/karte/subject-summary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/karte/subject-summary.ts src/lib/karte/subject-summary.test.ts
git commit -m "feat(web): add per-subject cross-source summary aggregation"
```

---

### Task 11: 「学習状態」トップページを科目横断サマリへ書き換える

**Files:**
- Modify: `src/app/karte/page.tsx`(全面書き換え)

**Interfaces:**
- Consumes: `buildSubjectSummaries()`(Task 10)

- [ ] **Step 1: ファイル全体を次の内容に置き換える**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Link from "next/link";
import { buildSubjectSummaries } from "@/lib/karte/subject-summary";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = { unmapped: "未分類" };

export default async function KartePage() {
  let summaries: Awaited<ReturnType<typeof buildSubjectSummaries>>;
  try {
    summaries = await buildSubjectSummaries();
  } catch {
    return (
      <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          学習状態
        </Typography>
        <Alert severity="error">
          カルテを取得できませんでした。環境変数 STUDY_AI_VAULT_DIR
          (vaultディレクトリの絶対パス)が設定されているか確認してください。
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        学習状態
      </Typography>
      <Stack spacing={1.5}>
        {summaries.map((summary) => (
          <Paper key={summary.subject} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body1" fontWeight={700}>
              {SUBJECT_LABELS[summary.subject] ?? summary.subject}
            </Typography>
            {summary.sourceKeys.length === 0 ? (
              <Typography variant="body2" color="text.secondary">未計測</Typography>
            ) : summary.totalTopics === 0 ? (
              <Typography variant="body2" color="text.secondary">スキルデータなし(カルテ本文のみ)</Typography>
            ) : (
              <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, flexWrap: "wrap" }}>
                {summary.weakCount > 0 && <Chip size="small" color="error" label={`弱い ${summary.weakCount}`} />}
                {summary.unstableCount > 0 && <Chip size="small" color="warning" label={`不安定 ${summary.unstableCount}`} />}
                {summary.stableCount > 0 && <Chip size="small" color="success" label={`安定 ${summary.stableCount}`} />}
                {summary.insufficientCount > 0 && <Chip size="small" label={`データ不足 ${summary.insufficientCount}`} />}
              </Stack>
            )}
            {summary.lastPracticedDate && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                最終学習日: {summary.lastPracticedDate}
              </Typography>
            )}
            {summary.sourceKeys.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                {summary.sourceKeys.map((key) => (
                  <Chip
                    key={key}
                    component={Link}
                    href={`/karte/${encodeURIComponent(key)}`}
                    label={key}
                    size="small"
                    clickable
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: 動作確認**

`npm run dev`で`/karte`を開き、13科目+未分類が一覧され、データがある科目には状態Chipと元教材へのリンクが出ることを確認する。既存の`/karte/[subject]`(例: `/karte/英語R`)への遷移が引き続き動くことも確認する。

- [ ] **Step 3: Commit**

```bash
git add src/app/karte/page.tsx
git commit -m "feat(web): show cross-subject summary on the karte top page"
```

---

### Task 12: 「今日」ページに弱点ハイライト帯を追加する

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `collectWeakTopics(limit)`(Task 9)

- [ ] **Step 1: importを追加する**

`src/app/page.tsx`の先頭付近、既存の`import { formatLocalDate } from "@/lib/date";`の後に追加:

```tsx
import { collectWeakTopics } from "@/lib/karte/weak-topics";
```

- [ ] **Step 2: データ取得を`Promise.all`へ加える**

既存コード:

```tsx
  const [planBlocks, scheduleEvents, dailyReports] = await Promise.all([
    readPlan(today),
    readSchedule(),
    listReports("daily"),
  ]);
```

を次に置き換える:

```tsx
  const [planBlocks, scheduleEvents, dailyReports, weakTopics] = await Promise.all([
    readPlan(today),
    readSchedule(),
    listReports("daily"),
    collectWeakTopics(5),
  ]);
```

- [ ] **Step 3: 弱点ハイライトのカードを追加する**

既存の「今日の計画」`<Paper>`ブロックの直後(「締切が近い予定」`<Paper>`の直前)に挿入:

```tsx
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>弱点ハイライト</Typography>
          {weakTopics.length === 0 ? (
            <Typography variant="body2" color="text.secondary">学習状態データがまだありません</Typography>
          ) : (
            <Stack spacing={1}>
              {weakTopics.map((entry) => (
                <Stack
                  key={`${entry.subjectKey}-${entry.topic.key}`}
                  component={Link}
                  href={`/karte/${encodeURIComponent(entry.subjectKey)}`}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ textDecoration: "none", color: "inherit" }}
                >
                  <Box>
                    <Typography variant="body2">{entry.topic.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{entry.subjectKey}・{entry.topic.correct}/{entry.topic.attempts}</Typography>
                  </Box>
                  <Chip size="small" color="error" label="弱い" />
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

```

- [ ] **Step 4: 動作確認**

`npm run dev`で`/`を開き、「弱点ハイライト」カードが表示され、タップで該当科目の`/karte/<科目>`へ遷移することを確認する。データが無い場合は「学習状態データがまだありません」と表示されることを確認する。

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(web): show cross-subject weak topic highlights on the today page"
```

---

### Task 13: Phase 2 検証

**Files:** なし(検証のみ)

- [ ] **Step 1: 全ユニットテストを実行する**

Run: `npm test`
Expected: 全テストがパスする。

- [ ] **Step 2: lintとビルド**

Run: `npm run lint && npm run build`
Expected: どちらも成功する。

---

# Phase 3: 完全read-only化

### Task 14: `ScheduleEventToggle`を表示専用にし、書き込み経路を撤去する

**Files:**
- Modify: `src/app/schedule/schedule-event-toggle.tsx`(全面書き換え)
- Modify: `src/app/schedule/page.tsx`(全面書き換え)
- Delete: `src/app/schedule/_lib/actions.ts`
- Delete: `src/app/schedule/_lib/actions.test.ts`

**Interfaces:**
- Produces: `ScheduleEventToggle({ done: boolean })` — 表示専用のChip

- [ ] **Step 1: `schedule-event-toggle.tsx`を書き換える**

```tsx
import Chip from "@mui/material/Chip";

export default function ScheduleEventToggle({ done }: { done: boolean }) {
  return (
    <Chip
      size="small"
      label={done ? "完了" : "未完了"}
      color={done ? "success" : "default"}
      variant={done ? "filled" : "outlined"}
    />
  );
}
```

- [ ] **Step 2: `schedule/page.tsx`を書き換える**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import { readSchedule, readPlan, type PlanBlock } from "@/lib/vault";
import { addDays, formatLocalDate } from "@/lib/date";
import { EVENT_KIND_COLORS, EVENT_KIND_LABELS, daysUntil } from "@/lib/constants";
import ScheduleEventToggle from "./schedule-event-toggle";

export const dynamic = "force-dynamic";
const PLAN_WINDOW_DAYS = 7;

export default async function SchedulePage() {
  const today = formatLocalDate(new Date());
  const dates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, i) => addDays(today, i));
  const [events, lists] = await Promise.all([readSchedule(), Promise.all(dates.map(readPlan))]);
  const upcoming = events.filter((e) => !e.done).sort((a, b) => a.due.localeCompare(b.due));
  const completed = events.filter((e) => e.done).sort((a, b) => b.due.localeCompare(a.due));
  const plans: { date: string; blocks: PlanBlock[] }[] = dates.map((date, i) => ({ date, blocks: lists[i] }));

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>計画</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -1.5, mb: 2 }}>
        閲覧専用(変更はMac側の対話から)
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>締切リスト</Typography>
        {upcoming.length === 0 ? (
          <Typography variant="body2">予定はありません</Typography>
        ) : (
          <Stack spacing={1}>
            {upcoming.map((event) => {
              const d = daysUntil(event.due);
              const urgent = d <= 7;
              return (
                <Stack key={event.id} direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderRadius: 1.5, backgroundColor: urgent ? "#fdecea" : "transparent" }}>
                  <ScheduleEventToggle done={event.done} />
                  <Chip size="small" label={EVENT_KIND_LABELS[event.kind] ?? event.kind} sx={{ backgroundColor: EVENT_KIND_COLORS[event.kind] ?? "#999", color: "#fff" }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{event.title}</Typography>
                    <Typography variant="caption" color={urgent ? "error.main" : "text.secondary"}>
                      {event.due} ({d >= 0 ? `あと${d}日` : "期限超過"})
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Paper>
      {completed.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">完了済み</Typography>
          {completed.map((event) => (
            <Stack key={event.id} direction="row" alignItems="center" spacing={1}>
              <ScheduleEventToggle done={event.done} />
              <Typography variant="body2" sx={{ textDecoration: "line-through" }}>{event.title}</Typography>
            </Stack>
          ))}
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">学習計画（今日から{PLAN_WINDOW_DAYS}日間）</Typography>
        {plans.map(({ date, blocks }) => (
          <Box key={date} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">{date}{date === today ? "（今日）" : ""}</Typography>
            {blocks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">計画はありません</Typography>
            ) : (
              blocks.map((b) => (
                <Stack key={b.id} direction="row" spacing={1}>
                  <Chip size="small" label={`${b.start}-${b.end}`} />
                  <Chip size="small" label={b.subject} />
                  <Typography variant="body2">
                    {b.status === "done" ? "完了" : b.status === "skipped" ? "未実施" : "予定"}
                    {b.memo ? `・${b.memo}` : ""}
                  </Typography>
                </Stack>
              ))
            )}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 3: mutation Server Actionを削除する**

```bash
rm -f src/app/schedule/_lib/actions.ts src/app/schedule/_lib/actions.test.ts
```

- [ ] **Step 4: `setScheduleEventDone`が他から使われていないことを確認する**

```bash
grep -rln "setScheduleEventDone" src/app src/components
```

Expected: 何も出力されない(`src/lib/vault/schedule.ts`とそのテストにのみ残る。ライブラリ関数自体は削除しない — 用途外の削除であり、TS/Node双方のvault実装パリティ契約に影響するため)。

- [ ] **Step 5: 動作確認**

`npm run dev`で`/schedule`を開き、チェックボックスが無く「完了」「未完了」のChip表示のみになっていること、「閲覧専用」の案内文が常に出ることを確認する。

- [ ] **Step 6: `npm run build`でビルドが通ることを確認する**

Run: `npm run build`
Expected: 成功(`toggleScheduleEventDone`への参照が残っていればここで検出される)。

- [ ] **Step 7: Commit**

```bash
git add -A src/app/schedule
git commit -m "chore(web): make schedule event completion read-only, remove the mutation server action"
```

---

### Task 15: `ConfirmTodoList`を表示専用にし、訂正の書き込み経路を撤去する

**Files:**
- Modify: `src/app/reports/daily/[date]/confirm-todo-list.tsx`(全面書き換え)
- Modify: `src/app/reports/daily/[date]/page.tsx`(全面書き換え)
- Delete: `src/app/reports/daily/_lib/actions.ts`
- Delete: `src/app/reports/daily/_lib/actions.test.ts`
- Delete: `src/app/reports/daily/_lib/build-correction.ts`
- Delete: `src/app/reports/daily/_lib/build-correction.test.ts`

**Interfaces:**
- Produces: `ConfirmTodoList({ todos: ConfirmTodo[] })` — 表示専用

- [ ] **Step 1: `confirm-todo-list.tsx`を書き換える**

```tsx
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import type { ConfirmTodo } from "@/lib/vault";

export default function ConfirmTodoList({ todos }: { todos: ConfirmTodo[] }) {
  if (todos.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        要確認TODO
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        閲覧専用(訂正はMac側の対話から)
      </Typography>
      <Stack spacing={1.5}>
        {todos.map((todo) => (
          <Paper key={todo.id} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>{todo.q}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {todo.options.map((option) => (
                <Chip key={option} label={option} variant="outlined" />
              ))}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: `page.tsx`を書き換える(読み取り専用化のみ、カード化はTask 20で行う)**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile, parseConfirmTodos } from "@/lib/vault";
import ConfirmTodoList from "./confirm-todo-list";
import { stripConfirmTodoSection } from "../_lib/strip-confirm-todo-section";

export const dynamic = "force-dynamic";

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const reportPath = `reports/daily/${date}.md`;
  const { body } = await readVaultFile(reportPath);
  const todos = parseConfirmTodos(body);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {date} の日次レポート
      </Typography>
      <ConfirmTodoList todos={todos} />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          sx={{
            fontSize: 14,
            lineHeight: 1.8,
            "& table": { width: "100%", borderCollapse: "collapse" },
            "& th, & td": { border: "1px solid #ddd", p: 0.5 },
            "& p": { my: 0.5 },
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {stripConfirmTodoSection(body)}
          </ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 3: mutation Server Actionと関連ヘルパーを削除する**

```bash
rm -f src/app/reports/daily/_lib/actions.ts src/app/reports/daily/_lib/actions.test.ts
rm -f src/app/reports/daily/_lib/build-correction.ts src/app/reports/daily/_lib/build-correction.test.ts
```

- [ ] **Step 4: `appendCorrection`が他から使われていないことを確認する**

```bash
grep -rln "appendCorrection" src/app src/components
```

Expected: 何も出力されない(`src/lib/vault/corrections.ts`とそのテストにのみ残る。理由はTask 14 Step 4と同様)。

- [ ] **Step 5: 動作確認**

`npm run dev`で要確認TODOのある日次レポート(例: 過去のテストデータで作成するか、存在しなければ`analysis/helpers/build-daily-report.mjs`で仮データを作って確認)を開き、選択肢が押せないChip表示のみで「閲覧専用」の案内が出ることを確認する。

- [ ] **Step 6: `npm run build`でビルドが通ることを確認する**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 7: Commit**

```bash
git add -A src/app/reports/daily
git commit -m "chore(web): make confirm-todo review read-only, remove the correction mutation server action"
```

---

### Task 16: Phase 3 検証

**Files:** なし(検証のみ)

- [ ] **Step 1: 全ユニットテストを実行する**

Run: `npm test`
Expected: 全テストがパスする。

- [ ] **Step 2: Webからmutationへ到達できないことを確認する**

```bash
grep -rn "\"use server\"" src/app
```

Expected: 何も出力されない(mutation用Server Actionが1つも残っていない)。

- [ ] **Step 3: lintとビルド**

Run: `npm run lint && npm run build`
Expected: どちらも成功する。

---

# Phase 4: レポートのカード化 + グラフ対応

### Task 17: レポートMarkdownをセクション分割する関数を作る(TDD)

**Files:**
- Create: `src/lib/reports/parse-sections.ts`
- Test: `src/lib/reports/parse-sections.test.ts`

**Interfaces:**
- Produces: `type ReportSection = { heading: string; body: string }`、`parseReportSections(markdownBody: string): ReportSection[]`(Task 20で使用)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/reports/parse-sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReportSections } from "./parse-sections";

describe("parseReportSections", () => {
  it("##見出しごとにセクションへ分割する", () => {
    const body = [
      "# 2026-08-01 日次レポート",
      "",
      "## 今日の学習",
      "",
      "合計117分。",
      "",
      "## 次に取り組むこと",
      "",
      "英語の誤答を復習する。",
    ].join("\n");
    expect(parseReportSections(body)).toEqual([
      { heading: "今日の学習", body: "合計117分。" },
      { heading: "次に取り組むこと", body: "英語の誤答を復習する。" },
    ]);
  });

  it("##見出しが無ければ空配列を返す", () => {
    expect(parseReportSections("# タイトルのみ\n\n本文だけ")).toEqual([]);
  });

  it("セクション内の### など下位見出しは分割しない", () => {
    const body = ["## 見出し", "", "### 小見出し", "", "本文"].join("\n");
    expect(parseReportSections(body)).toEqual([
      { heading: "見出し", body: "### 小見出し\n\n本文" },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/reports/parse-sections.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/reports/parse-sections.ts`:

```ts
export type ReportSection = { heading: string; body: string };

// "# タイトル" 直下から始まる "## 見出し" ごとにMarkdown本文を分割する。
// build-daily-report.mjs / build-weekly-report.mjs が生成する
// "# <date> 日次レポート\n\n## 見出し\n\n本文..." という形式に対応する。
export function parseReportSections(markdownBody: string): ReportSection[] {
  const lines = markdownBody.split("\n");
  const sections: ReportSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
  };

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      flush();
      currentHeading = match[1].trim();
      currentLines = [];
      continue;
    }
    if (currentHeading !== null) currentLines.push(line);
  }
  flush();
  return sections;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/reports/parse-sections.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/parse-sections.ts src/lib/reports/parse-sections.test.ts
git commit -m "feat(web): add report markdown section parser"
```

---

### Task 18: レポートchartサイドカーの読み取りを追加する(TS側、TDD)

**Files:**
- Create: `src/lib/vault/report-charts.ts`
- Test: `src/lib/vault/report-charts.test.ts`
- Modify: `src/lib/vault/index.ts`

**Interfaces:**
- Consumes: `readVaultFile(relPath)`(既存、`.json`パスはfrontmatter無しで`raw`を返す)
- Produces: `type ReportBarChart`、`type ReportChartFile`、`readReportChart(reportPath: string): Promise<ReportChartFile | null>`(Task 20, 21で使用)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/vault/report-charts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const readVaultFile = vi.fn();
vi.mock("./read", () => ({ readVaultFile: (path: string) => readVaultFile(path) }));

import { readReportChart } from "./report-charts";

describe("readReportChart", () => {
  it("レポートパスから.chart.jsonを読む", async () => {
    const file = { 週次学習時間: { type: "bar", unit: "分", series: [{ label: "英語R", value: 360 }] } };
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: JSON.stringify(file) });
    const result = await readReportChart("reports/weekly/2026-W31.md");
    expect(readVaultFile).toHaveBeenCalledWith("reports/weekly/2026-W31.chart.json");
    expect(result?.["週次学習時間"].series[0].value).toBe(360);
  });

  it("ファイルが無い、またはJSONが壊れていればnull", async () => {
    readVaultFile.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "ENOENT" }));
    expect(await readReportChart("reports/daily/2026-08-01.md")).toBeNull();
    readVaultFile.mockResolvedValueOnce({ frontmatter: {}, body: "", raw: "{ broken" });
    expect(await readReportChart("reports/daily/2026-08-01.md")).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/lib/vault/report-charts.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/vault/report-charts.ts`:

```ts
import { readVaultFile } from "./read";

export type ReportBarChart = {
  type: "bar";
  unit: string;
  series: { label: string; value: number }[];
};

export type ReportChartFile = Record<string, ReportBarChart>;

function chartRelPath(reportPath: string): string {
  return reportPath.replace(/\.md$/, ".chart.json");
}

export async function readReportChart(reportPath: string): Promise<ReportChartFile | null> {
  try {
    const { raw } = await readVaultFile(chartRelPath(reportPath));
    return JSON.parse(raw) as ReportChartFile;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: `src/lib/vault/index.ts`にエクスポートを追加する**

末尾に追加:

```ts
export type { ReportBarChart, ReportChartFile } from "./report-charts";
export { readReportChart } from "./report-charts";
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/lib/vault/report-charts.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/vault/report-charts.ts src/lib/vault/report-charts.test.ts src/lib/vault/index.ts
git commit -m "feat(web): read report chart sidecar JSON files"
```

---

### Task 19: 簡易棒グラフ表示コンポーネントを作る

**Files:**
- Create: `src/components/BarChart.tsx`

**Interfaces:**
- Consumes: `ReportBarChart`(Task 18)

- [ ] **Step 1: コンポーネントを作成する**

```tsx
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReportBarChart } from "@/lib/vault";

// 色だけに頼らず、ラベルと数値を必ず併記する(アクセシビリティ方針)。
export default function BarChart({ chart }: { chart: ReportBarChart }) {
  const max = Math.max(...chart.series.map((item) => item.value), 1);
  return (
    <Stack
      spacing={0.75}
      sx={{ mt: 1 }}
      role="img"
      aria-label={`棒グラフ: ${chart.series.map((s) => `${s.label} ${s.value}${chart.unit}`).join("、")}`}
    >
      {chart.series.map((item) => (
        <Stack key={item.label} direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" sx={{ width: 88, flexShrink: 0 }} noWrap>
            {item.label}
          </Typography>
          <Box sx={{ flex: 1, height: 12, bgcolor: "grey.100", borderRadius: 1, overflow: "hidden" }}>
            <Box sx={{ width: `${(item.value / max) * 100}%`, height: "100%", bgcolor: "primary.main" }} />
          </Box>
          <Typography variant="caption" sx={{ width: 56, flexShrink: 0, textAlign: "right" }}>
            {item.value}{chart.unit}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BarChart.tsx
git commit -m "feat(web): add simple accessible bar chart component"
```

(Task 20で実際にレポートページへ組み込んで見た目を確認する。)

---

### Task 20: 日次・週次レポートページをカード化する

**Files:**
- Modify: `src/app/reports/daily/[date]/page.tsx`(全面書き換え、Task 15の続き)
- Modify: `src/app/reports/weekly/[week]/page.tsx`(全面書き換え)

**Interfaces:**
- Consumes: `parseReportSections()`(Task 17)、`readReportChart()`(Task 18)、`BarChart`(Task 19)、`addDays()`(既存`@/lib/date`)

- [ ] **Step 1: `reports/daily/[date]/page.tsx`を書き換える**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { readVaultFile, parseConfirmTodos, readReportChart } from "@/lib/vault";
import { parseReportSections } from "@/lib/reports/parse-sections";
import { addDays } from "@/lib/date";
import ConfirmTodoList from "./confirm-todo-list";
import { stripConfirmTodoSection } from "../_lib/strip-confirm-todo-section";
import BarChart from "@/components/BarChart";

export const dynamic = "force-dynamic";

const MARKDOWN_SX = {
  fontSize: 14,
  lineHeight: 1.8,
  "& table": { width: "100%", borderCollapse: "collapse" },
  "& th, & td": { border: "1px solid #ddd", p: 0.5 },
  "& p": { my: 0.5 },
} as const;

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const reportPath = `reports/daily/${date}.md`;
  const { body } = await readVaultFile(reportPath);
  const todos = parseConfirmTodos(body);
  const strippedBody = stripConfirmTodoSection(body);
  const sections = parseReportSections(strippedBody);
  const chart = await readReportChart(reportPath);
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button component={Link} href={`/reports/daily/${prevDate}`} size="small">← {prevDate}</Button>
        <Typography variant="h6" fontWeight={700}>{date}</Typography>
        <Button component={Link} href={`/reports/daily/${nextDate}`} size="small">{nextDate} →</Button>
      </Stack>
      <ConfirmTodoList todos={todos} />
      <Stack spacing={2}>
        {sections.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={MARKDOWN_SX}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{strippedBody}</ReactMarkdown>
            </Box>
          </Paper>
        ) : (
          sections.map((section) => (
            <Paper key={section.heading} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {section.heading}
              </Typography>
              <Box sx={MARKDOWN_SX}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
              </Box>
              {chart?.[section.heading] && <BarChart chart={chart[section.heading]} />}
            </Paper>
          ))
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: `reports/weekly/[week]/page.tsx`を書き換える**

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile, readReportChart } from "@/lib/vault";
import { parseReportSections } from "@/lib/reports/parse-sections";
import BarChart from "@/components/BarChart";

export const dynamic = "force-dynamic";

const MARKDOWN_SX = {
  fontSize: 14,
  lineHeight: 1.8,
  "& table": { width: "100%", borderCollapse: "collapse" },
  "& th, & td": { border: "1px solid #ddd", p: 0.5 },
  "& p": { my: 0.5 },
} as const;

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const reportPath = `reports/weekly/${week}.md`;
  const { body } = await readVaultFile(reportPath);
  const sections = parseReportSections(body);
  const chart = await readReportChart(reportPath);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {week} の週次レポート
      </Typography>
      <Stack spacing={2}>
        {sections.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={MARKDOWN_SX}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </Box>
          </Paper>
        ) : (
          sections.map((section) => (
            <Paper key={section.heading} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {section.heading}
              </Typography>
              <Box sx={MARKDOWN_SX}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
              </Box>
              {chart?.[section.heading] && <BarChart chart={chart[section.heading]} />}
            </Paper>
          ))
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 3: 動作確認**

`npm run dev`で既存の`reports/daily/2026-07-28.md`等を開き、セクションごとにカード化されていること、前日・翌日ボタンで日付が移動できることを確認する。`/reports/weekly/2026-W30`もカード化されていることを確認する。

- [ ] **Step 4: `npm run build`でビルドが通ることを確認する**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add src/app/reports/daily/\[date\]/page.tsx src/app/reports/weekly/\[week\]/page.tsx
git commit -m "feat(web): render daily/weekly reports as per-section cards with prev/next nav and charts"
```

---

### Task 21: 週次学習時間の集計ヘルパーを作る(Node側、TDD)

**Files:**
- Create: `analysis/helpers/compute-weekly-study-minutes.mjs`
- Test: `analysis/test/compute-weekly-study-minutes.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `parseStudySessions`(既存 `analysis/helpers/vault/index.mjs`)
- Produces: `isoWeekToMonday(weekStr)`, `datesInWeek(weekStr)`, `computeWeeklyStudyMinutes(recordDays)`(Task 22で間接的に、`analysis/nightly.md`のCLI呼び出しから使用)

- [ ] **Step 1: 失敗するテストを書く**

`analysis/test/compute-weekly-study-minutes.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekToMonday, datesInWeek, computeWeeklyStudyMinutes } from '../helpers/compute-weekly-study-minutes.mjs';

test('isoWeekToMonday returns the Monday of the given ISO week', () => {
  assert.equal(isoWeekToMonday('2026-W31'), '2026-07-27');
});

test('datesInWeek returns 7 consecutive dates starting from Monday', () => {
  assert.deepEqual(datesInWeek('2026-W31'), [
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
    '2026-07-31', '2026-08-01', '2026-08-02',
  ]);
});

test('computeWeeklyStudyMinutes sums minutes per subject across days, sorted descending', () => {
  const result = computeWeeklyStudyMinutes([
    { date: '2026-07-27', sessions: [{ subject: '英語R', minutes: 60 }, { subject: '数学2BC', minutes: 30 }] },
    { date: '2026-07-28', sessions: [{ subject: '英語R', minutes: 30 }] },
  ]);
  assert.deepEqual(result, {
    type: 'bar',
    unit: '分',
    series: [
      { label: '英語R', value: 90 },
      { label: '数学2BC', value: 30 },
    ],
  });
});

test('computeWeeklyStudyMinutes returns an empty series when there are no sessions', () => {
  assert.deepEqual(
    computeWeeklyStudyMinutes([{ date: '2026-07-27', sessions: [] }]),
    { type: 'bar', unit: '分', series: [] },
  );
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test analysis/test/compute-weekly-study-minutes.test.mjs`
Expected: FAIL(モジュールが存在しない)。

- [ ] **Step 3: 実装する**

`analysis/helpers/compute-weekly-study-minutes.mjs`:

```js
#!/usr/bin/env node
// 指定されたISO週(YYYY-Www)の月曜〜日曜について、records/*.mdの実績から
// 科目別の合計学習時間(分)を集計する。週次レポートのchartデータ生成に使う。
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { printJson } from './lib.mjs';

export function isoWeekToMonday(weekStr) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekStr);
  if (!match) throw new Error(`Invalid ISO week: ${weekStr}`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target.toISOString().slice(0, 10);
}

export function datesInWeek(weekStr) {
  const monday = isoWeekToMonday(weekStr);
  const start = new Date(`${monday}T00:00:00Z`);
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function computeWeeklyStudyMinutes(recordDays) {
  const bySubject = new Map();
  for (const day of recordDays) {
    for (const session of day.sessions) {
      bySubject.set(session.subject, (bySubject.get(session.subject) ?? 0) + session.minutes);
    }
  }
  const series = Array.from(bySubject.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  return { type: 'bar', unit: '分', series };
}

export async function run([weekStr]) {
  if (!weekStr) throw new Error('使い方: node helpers/compute-weekly-study-minutes.mjs <weekStr(YYYY-Www)>');
  const { readVaultFile, parseStudySessions } = await import('./vault/index.mjs');
  const dates = datesInWeek(weekStr);
  const recordDays = [];
  for (const date of dates) {
    try {
      const { body } = await readVaultFile(`records/${date}.md`);
      recordDays.push({ date, sessions: parseStudySessions(body) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      recordDays.push({ date, sessions: [] });
    }
  }
  return computeWeeklyStudyMinutes(recordDays);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `node --test analysis/test/compute-weekly-study-minutes.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analysis/helpers/compute-weekly-study-minutes.mjs analysis/test/compute-weekly-study-minutes.test.mjs
git commit -m "feat(analysis): compute per-subject weekly study minutes for report charts"
```

---

### Task 22: レポート生成にchartサイドカー書き込みを追加する(Node側、TDD)

**Files:**
- Create: `analysis/helpers/report-charts.mjs`
- Test: `analysis/test/report-charts.test.mjs`
- Modify: `analysis/helpers/build-daily-report.mjs`
- Modify: `analysis/helpers/build-weekly-report.mjs`

**Interfaces:**
- Consumes: `vaultRoot()`(既存`analysis/helpers/vault/root.mjs`)
- Produces: `extractReportCharts(sections)`, `reportChartRelPath(reportRelPath)`, `writeReportChartFile(reportRelPath, sections)`

- [ ] **Step 1: 失敗するテストを書く**

`analysis/test/report-charts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractReportCharts, reportChartRelPath, writeReportChartFile } from '../helpers/report-charts.mjs';

test('extractReportCharts collects chart fields keyed by heading, skipping sections without one', () => {
  const charts = extractReportCharts([
    { heading: 'A', body: 'x', chart: { type: 'bar', unit: '分', series: [{ label: 'L', value: 1 }] } },
    { heading: 'B', body: 'y' },
  ]);
  assert.deepEqual(charts, { A: { type: 'bar', unit: '分', series: [{ label: 'L', value: 1 }] } });
});

test('reportChartRelPath swaps the .md extension for .chart.json', () => {
  assert.equal(reportChartRelPath('reports/weekly/2026-W31.md'), 'reports/weekly/2026-W31.chart.json');
});

test('writeReportChartFile writes a sidecar file and returns its path when charts exist', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'study-ai-vault-'));
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    const relPath = await writeReportChartFile('reports/weekly/2026-W31.md', [
      { heading: '学習時間推移', body: 'x', chart: { type: 'bar', unit: '分', series: [{ label: '英語R', value: 90 }] } },
    ]);
    assert.equal(relPath, 'reports/weekly/2026-W31.chart.json');
    const written = JSON.parse(await readFile(path.join(vaultDir, relPath), 'utf8'));
    assert.deepEqual(written, { 学習時間推移: { type: 'bar', unit: '分', series: [{ label: '英語R', value: 90 }] } });
  } finally {
    delete process.env.STUDY_AI_VAULT_DIR;
  }
});

test('writeReportChartFile removes a stale sidecar file and returns null when no section has a chart', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'study-ai-vault-'));
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await mkdir(path.join(vaultDir, 'reports', 'daily'), { recursive: true });
    await writeFile(path.join(vaultDir, 'reports', 'daily', '2026-08-01.chart.json'), '{}', 'utf8');
    const result = await writeReportChartFile('reports/daily/2026-08-01.md', [{ heading: 'A', body: 'x' }]);
    assert.equal(result, null);
    await assert.rejects(access(path.join(vaultDir, 'reports', 'daily', '2026-08-01.chart.json')));
  } finally {
    delete process.env.STUDY_AI_VAULT_DIR;
  }
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test analysis/test/report-charts.test.mjs`
Expected: FAIL

- [ ] **Step 3: 実装する**

`analysis/helpers/report-charts.mjs`:

```js
// sections[].chart から見出しごとのグラフデータを抽出し、レポート本体とは別の
// JSONサイドカーファイル(<report>.chart.json)として書き出す。
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { vaultRoot } from './vault/root.mjs';

export function extractReportCharts(sections) {
  const charts = {};
  for (const section of sections) {
    if (section.chart) charts[section.heading] = section.chart;
  }
  return charts;
}

export function reportChartRelPath(reportRelPath) {
  return reportRelPath.replace(/\.md$/, '.chart.json');
}

export async function writeReportChartFile(reportRelPath, sections) {
  const charts = extractReportCharts(sections);
  const relPath = reportChartRelPath(reportRelPath);
  const fullPath = path.join(vaultRoot(), relPath);
  if (Object.keys(charts).length === 0) {
    await unlink(fullPath).catch(() => {});
    return null;
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(charts, null, 2)}\n`, 'utf8');
  return relPath;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `node --test analysis/test/report-charts.test.mjs`
Expected: PASS

- [ ] **Step 5: `build-daily-report.mjs`の`run()`を編集する**

`analysis/helpers/build-daily-report.mjs`内の以下の箇所:

```js
  const { writeVaultFile } = await import('./vault/index.mjs');
  const relPath = `reports/daily/${dateStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  return { path: relPath, confirm_todos: confirmTodos.length };
```

を次に置き換える:

```js
  const { writeVaultFile } = await import('./vault/index.mjs');
  const { writeReportChartFile } = await import('./report-charts.mjs');
  const relPath = `reports/daily/${dateStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  const chartPath = await writeReportChartFile(relPath, sections);
  return { path: relPath, confirm_todos: confirmTodos.length, chartPath };
```

- [ ] **Step 6: `build-weekly-report.mjs`の`run()`を編集する**

`analysis/helpers/build-weekly-report.mjs`内の以下の箇所:

```js
  const { writeVaultFile } = await import('./vault/index.mjs');
  const relPath = `reports/weekly/${weekStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  return { path: relPath };
```

を次に置き換える:

```js
  const { writeVaultFile } = await import('./vault/index.mjs');
  const { writeReportChartFile } = await import('./report-charts.mjs');
  const relPath = `reports/weekly/${weekStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  const chartPath = await writeReportChartFile(relPath, sections);
  return { path: relPath, chartPath };
```

- [ ] **Step 7: 既存の`build-daily-report.test.mjs`/`build-weekly-report.test.mjs`が壊れていないことを確認する**

Run: `node --test analysis/test/build-daily-report.test.mjs analysis/test/build-weekly-report.test.mjs analysis/test/report-charts.test.mjs`
Expected: 全てPASS(既存テストは`buildDailyReportBody`/`buildWeeklyReportBody`などの純関数のみを見ており、`run()`のI/O変更の影響を受けない)。

- [ ] **Step 8: Commit**

```bash
git add analysis/helpers/report-charts.mjs analysis/test/report-charts.test.mjs analysis/helpers/build-daily-report.mjs analysis/helpers/build-weekly-report.mjs
git commit -m "feat(analysis): write report chart sidecar JSON alongside daily/weekly reports"
```

---

### Task 23: `analysis/nightly.md`の週次レポート手順にchart計算を追記する

**Files:**
- Modify: `analysis/nightly.md`

**Interfaces:** なし(ドキュメントのみ)

- [ ] **Step 1: 週次レポート手順を書き換える**

`analysis/nightly.md`内、「3. **実行日が日曜日の場合**、追加で週次総括を作成する:」以下の箇所(既存の該当ブロック全体)を次に置き換える:

```markdown
3. **実行日が日曜日の場合**、追加で週次総括を作成する:
   - 今日のISO週番号(`YYYY-Www`、例:`2026-W30`)を`WEEK`とし、
     `node analysis/helpers/compute-weekly-study-minutes.mjs "$WEEK"`を実行して、
     その週(月〜日)の科目別合計学習時間(分)を`{"type":"bar","unit":"分","series":[...]}`
     の形で取得する。
   - 直近7日分の`reports/daily/*.md`(`node analysis/helpers/read-vault-file.mjs`で
     日付ごとに読む)を踏まえ、学習時間推移・弱点の変化・来週の重点科目をまとめる。
   - `analysis/tmp/weekly-report-data.json`を作成する。形式:
     ```json
     {
       "sections": [
         {
           "heading": "学習時間推移",
           "body": "平均105分/日、前週比+10分。...",
           "chart": { "type": "bar", "unit": "分", "series": [{ "label": "英語R", "value": 360 }] }
         },
         { "heading": "弱点の変化", "body": "数学: 計算ミスが減少傾向。..." },
         { "heading": "来週の重点科目", "body": "日本史(直近の誤答が集中)、数学(検算習慣)" }
       ]
     }
     ```
     `学習時間推移`セクションの`chart`には、直前で計算した
     `compute-weekly-study-minutes.mjs`の出力をそのまま入れる。他のセクションに
     `chart`を付けるかどうかは任意で、数値の根拠が明確な場合だけ付ける。
   - `node analysis/helpers/build-weekly-report.mjs "$WEEK" analysis/tmp/weekly-report-data.json`
     を実行し、`reports/weekly/$WEEK.md`と、`chart`を含むセクションがあれば
     `reports/weekly/$WEEK.chart.json`を保存する。
```

- [ ] **Step 2: Commit**

```bash
git add analysis/nightly.md
git commit -m "docs(analysis): compute weekly study-minutes chart data in the nightly weekly report step"
```

---

### Task 24: Phase 4 検証(最終検証)

**Files:** なし(検証のみ)

- [ ] **Step 1: 全ユニットテストを実行する**

Run: `npm test`
Expected: 全テストがパスする。

- [ ] **Step 2: analysisのNodeテストを実行する**

Run: `npm run test:analysis`
Expected: 全テストがパスする。

- [ ] **Step 3: lintとビルド**

Run: `npm run lint && npm run build`
Expected: どちらも成功する。

- [ ] **Step 4: 手動での通し確認**

`npm run dev`を起動し、以下を一通り確認する。

1. `/` — 今日の計画・締切・弱点ハイライトが表示される
2. `/schedule` — 予定と学習計画が読み取り専用で表示される
3. `/karte` — 13科目+未分類のサマリが表示され、ドリルダウンできる
4. `/records` — 従来通り記録が表示される
5. `/more` → `/reports` → 日次レポート — セクションがカード化され、前日/翌日ナビが動く
6. `/more` → `/settings` — 夜間バッチプロンプトとログアウトのみ表示される
7. `/columns`, `/stats`へ直接アクセスすると404になる
