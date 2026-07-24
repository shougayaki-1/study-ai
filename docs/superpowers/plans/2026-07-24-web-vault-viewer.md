# Web Vault Viewer & Confirm UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vault/` の Markdown（日次/週次レポート・弱点カルテ）をサーバ側で読んでブラウザに表示し、レポートの「要確認TODO」をタップで選択して `_inbox/corrections.md` に追記できる、ローカル Next.js のビューア画面を追加する。

**Architecture:** `src/app/reports/*` と `src/app/karte/*` に App Router のページを追加する。一覧・詳細ページは async Server Component として `src/lib/vault/`（Foundation計画が実装済みの `getVaultRoot`/`readVaultFile`/`listReports`/`parseConfirmTodos`/`appendCorrection` 等）を直接 `fs` 越しに呼び出す。要確認TODOのタップ選択は `"use client"` のチップ一覧コンポーネントから Server Action (`submitCorrection`) を呼び、`appendCorrection` で `_inbox/corrections.md` に追記専用で書き込む。既存の勉強記録手入力UI（`/record` `/records` `/stats` 等）は変更せず、`/stats` にビューアへの導線を1つだけ追加する。

**Tech Stack:** Next.js 15 (App Router / Server Components / Server Actions) / React 19 / MUI 7 / react-markdown 10 + remark-gfm 4（既存依存を再利用） / vitest 4（ロジック・Server Action単体テスト） / Playwright（E2E）。

## Global Constraints

- vault ルートは環境変数 `STUDY_AI_VAULT_DIR`。未設定時は `src/lib/vault/` のヘルパが即throwする前提（Web側で別パスにフォールバックしない）。
- `fs` アクセスは Server Component / Server Action からのみ行う。クライアントコンポーネントから直接 `fs` を呼ばない。
- 要確認TODOの修正UIは**選択式優先・自由入力は最小**（本計画では自由入力欄は追加しない。`options` のタップ選択のみ実装する）。
- `_inbox/corrections.md` は**Webは追記のみ**（`appendCorrection` を経由）。バッチ側の消化・クリアには触れない。
- `src/lib/vault/` 契約（関数名・型名: `getVaultRoot`, `parseFrontmatter`, `stringifyFrontmatter`, `readVaultFile`, `ReportMeta`, `listReports`, `ConfirmTodo`, `parseConfirmTodos`, `CorrectionEntry`, `appendCorrection`）は**一切変更・拡張しない**。すべて `@/lib/vault` から import して消費するだけ。
- vault ディレクトリ名（`_inbox` `_archive` `subjects` `materials` `essays` `reports/daily` `reports/weekly` `runs`）・ファイル名（`弱点カルテ.md` 等）は変更しない。
- ライトテーマ固定・ミニマル（既存 `src/theme.ts` の白背景・角丸12・装飾控えめ方針に従う。新規CSSファイルやテーマ変更はしない）。
- 既存の勉強記録手入力UI（`/`, `/record`, `/records`, `/schedule`, `/settings`, `/columns`）のロジック・データ取得は変更しない。`/stats` は導線ボタン1つの追加のみ。
- 変更対象は `src/` と `e2e/` のみ。`playwright.config.ts` や `vitest.config.ts`、`analysis/` 配下、Foundation計画・バッチ計画の担当領域には触れない。
- 検査コマンド: `npm test`（vitest run）、`npm run test:e2e`（playwright、`STUDY_AI_VAULT_DIR` は各Taskで指示するとおり事前に環境変数として渡す）、`npx tsc --noEmit`、`npm run lint`、`npm run build`。

**前提（Foundation計画への依存）**: 本計画は `src/lib/vault/` が契約どおり実装済みであることを前提に着手する。`readdir` によるサブディレクトリ一覧など契約に無い操作は `src/lib/vault/` を拡張せず、本計画側のページ専用ヘルパ（`_lib/` 配下）に閉じて実装する。`ReportMeta.date` は `listReports('weekly')` に対してもファイル名由来のスラッグ（例 `2026-W30`）を返す前提でルーティングする。Foundation実装がこれと異なる場合は Task 3 のリンク生成部分のみ調整すること。

---

## Task 1: JST ISO8601タイムスタンプのヘルパ（`CorrectionEntry.timestamp` 用）

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `export function formatIsoWithJstOffset(date: Date): string`（`+09:00` 固定オフセットの ISO8601 文字列。例 `2026-07-24T08:12:00+09:00`）

**Steps:**

1. `src/lib/date.test.ts` の末尾（`describe` ブロック内）に失敗するテストを追加する。

```ts
import { addDays, formatDateInTimeZone, formatIsoWithJstOffset, formatLocalDate, localDayUtcRange, parseLocalDate, startOfWeek } from "./date";
```

```ts
  it("formats a UTC instant as JST ISO8601 with a +09:00 offset", () => {
    expect(formatIsoWithJstOffset(new Date("2026-07-23T23:12:00.000Z"))).toBe(
      "2026-07-24T08:12:00+09:00",
    );
  });
```

2. 失敗を確認する。

```bash
npx vitest run src/lib/date.test.ts
```

期待: `formatIsoWithJstOffset` が存在せず import エラーで失敗する。

3. `src/lib/date.ts` に最小実装を追加する。

```ts
export function formatIsoWithJstOffset(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}
```

4. 成功を確認する。

```bash
npx vitest run src/lib/date.test.ts
```

期待: 全テストPASS。

5. コミットする。

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "$(cat <<'EOF'
feat(date): add JST ISO8601 timestamp formatter for vault corrections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: レポート一覧ラベル整形ロジック

**Files:**
- Create: `src/app/reports/report-label.ts`
- Test: `src/app/reports/report-label.test.ts`

**Interfaces:**
- Consumes: `ReportMeta`（`@/lib/vault`）
- Produces: `export function reportLabel(meta: ReportMeta): string`

**Steps:**

1. `src/app/reports/report-label.test.ts` を作成する（失敗させる）。

```ts
import { describe, expect, it } from "vitest";
import type { ReportMeta } from "@/lib/vault";
import { reportLabel } from "./report-label";

describe("reportLabel", () => {
  it("labels a daily report with its date", () => {
    const meta: ReportMeta = {
      path: "reports/daily/2026-07-24.md",
      date: "2026-07-24",
      frontmatter: { type: "daily-report", date: "2026-07-24" },
    };
    expect(reportLabel(meta)).toBe("2026-07-24 (日次)");
  });

  it("labels a weekly report with its date", () => {
    const meta: ReportMeta = {
      path: "reports/weekly/2026-W30.md",
      date: "2026-W30",
      frontmatter: { type: "weekly-report", week: "2026-W30" },
    };
    expect(reportLabel(meta)).toBe("2026-W30 (週次)");
  });
});
```

2. 失敗を確認する。

```bash
npx vitest run src/app/reports/report-label.test.ts
```

期待: `report-label.ts` が存在せず失敗。

3. `src/app/reports/report-label.ts` を作成する。

```ts
import type { ReportMeta } from "@/lib/vault";

export function reportLabel(meta: ReportMeta): string {
  const kindLabel = meta.frontmatter.type === "weekly-report" ? "週次" : "日次";
  return `${meta.date} (${kindLabel})`;
}
```

4. 成功を確認する。

```bash
npx vitest run src/app/reports/report-label.test.ts
```

期待: 全テストPASS。

5. コミットする。

```bash
git add src/app/reports/report-label.ts src/app/reports/report-label.test.ts
git commit -m "$(cat <<'EOF'
feat(reports): add report label formatting helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/reports` 一覧ページ

**Files:**
- Create: `src/app/reports/page.tsx`

**Interfaces:**
- Consumes: `listReports`（`@/lib/vault`）、`reportLabel`（`./report-label`）
- Produces: `export default async function ReportsPage(): Promise<JSX.Element>`

**Steps:**

1. `src/app/reports/page.tsx` を作成する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { listReports } from "@/lib/vault";
import { reportLabel } from "./report-label";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [dailyReports, weeklyReports] = await Promise.all([
    listReports("daily"),
    listReports("weekly"),
  ]);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        レポート
      </Typography>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        日次
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {dailyReports.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            まだ日次レポートがありません。
          </Typography>
        )}
        {dailyReports.map((meta) => (
          <Paper
            key={meta.path}
            component={Link}
            href={`/reports/daily/${meta.date}`}
            variant="outlined"
            sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
          >
            <Typography>{reportLabel(meta)}</Typography>
          </Paper>
        ))}
      </Stack>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        週次
      </Typography>
      <Stack spacing={1}>
        {weeklyReports.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            まだ週次レポートがありません。
          </Typography>
        )}
        {weeklyReports.map((meta) => (
          <Paper
            key={meta.path}
            component={Link}
            href={`/reports/weekly/${meta.date}`}
            variant="outlined"
            sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
          >
            <Typography>{reportLabel(meta)}</Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
```

2. 型チェックする。

```bash
npx tsc --noEmit
```

期待: エラーなし（`src/lib/vault` が契約どおり実装されていること前提）。

3. コミットする。

```bash
git add src/app/reports/page.tsx
git commit -m "$(cat <<'EOF'
feat(reports): add /reports index page listing daily and weekly reports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 訂正エントリ組み立てロジック（`CorrectionEntry` ビルダ）

**Files:**
- Create: `src/app/reports/daily/_lib/build-correction.ts`
- Test: `src/app/reports/daily/_lib/build-correction.test.ts`

**Interfaces:**
- Consumes: `ConfirmTodo`, `CorrectionEntry`（`@/lib/vault`）、`formatIsoWithJstOffset`（`@/lib/date`）
- Produces: `export function buildCorrectionEntry(params: { reportPath: string; todo: ConfirmTodo; choice: string; note?: string; now: Date }): CorrectionEntry`

`_lib/` はNext.js App Routerの private folder（先頭 `_`）で、ルーティング対象外になる。`[date]` ディレクトリ名にブラケットを含むテストファイルの配置を避けるため、ロジックはこの private folder に置く。

**Steps:**

1. `src/app/reports/daily/_lib/build-correction.test.ts` を作成する（失敗させる）。

```ts
import { describe, expect, it } from "vitest";
import type { ConfirmTodo } from "@/lib/vault";
import { buildCorrectionEntry } from "./build-correction";

describe("buildCorrectionEntry", () => {
  it("builds a CorrectionEntry from a chosen todo option", () => {
    const todo: ConfirmTodo = {
      id: "todo-1",
      q: "この写真の科目は？",
      options: ["日本史", "世界史", "不明"],
      default: "日本史",
      ref: "_archive/2026/07/abc.jpg",
    };
    const entry = buildCorrectionEntry({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "世界史",
      now: new Date("2026-07-23T23:12:00.000Z"),
    });
    expect(entry).toEqual({
      timestamp: "2026-07-24T08:12:00+09:00",
      report: "reports/daily/2026-07-20.md",
      todo: "todo-1",
      choice: "世界史",
    });
  });

  it("includes an optional note when provided", () => {
    const todo: ConfirmTodo = { id: "todo-2", q: "q", options: ["a", "b"], default: "a" };
    const entry = buildCorrectionEntry({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "b",
      note: "手書きメモ",
      now: new Date("2026-07-23T23:12:00.000Z"),
    });
    expect(entry.note).toBe("手書きメモ");
  });
});
```

2. 失敗を確認する。

```bash
npx vitest run src/app/reports/daily/_lib/build-correction.test.ts
```

期待: `build-correction.ts` が存在せず失敗。

3. `src/app/reports/daily/_lib/build-correction.ts` を作成する。

```ts
import type { ConfirmTodo, CorrectionEntry } from "@/lib/vault";
import { formatIsoWithJstOffset } from "@/lib/date";

export function buildCorrectionEntry(params: {
  reportPath: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
  now: Date;
}): CorrectionEntry {
  const entry: CorrectionEntry = {
    timestamp: formatIsoWithJstOffset(params.now),
    report: params.reportPath,
    todo: params.todo.id,
    choice: params.choice,
  };
  if (params.note) {
    entry.note = params.note;
  }
  return entry;
}
```

4. 成功を確認する。

```bash
npx vitest run src/app/reports/daily/_lib/build-correction.test.ts
```

期待: 全テストPASS。

5. コミットする。

```bash
git add src/app/reports/daily/_lib/build-correction.ts src/app/reports/daily/_lib/build-correction.test.ts
git commit -m "$(cat <<'EOF'
feat(reports): add CorrectionEntry builder for confirm-todo choices

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Server Action `submitCorrection`（`appendCorrection` 経由で追記）

**Files:**
- Create: `src/app/reports/daily/_lib/actions.ts`
- Test: `src/app/reports/daily/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `appendCorrection`, `ConfirmTodo`（`@/lib/vault`）、`buildCorrectionEntry`（`./build-correction`）
- Produces:
  - `export async function performCorrection(input: { reportPath: string; todo: ConfirmTodo; choice: string; note?: string }): Promise<void>`（純粋にappendCorrectionを呼ぶ、テスト対象）
  - `export async function submitCorrection(input: { reportPath: string; date: string; todo: ConfirmTodo; choice: string; note?: string }): Promise<void>`（`"use server"`。`performCorrection` を呼んでから `revalidatePath` する。`revalidatePath` はNextのリクエストスコープ外だとinvariantで落ちるため、vitestでは`performCorrection`のみテストし、`submitCorrection`はTask12のE2Eで検証する）

**Steps:**

1. `src/app/reports/daily/_lib/actions.test.ts` を作成する（失敗させる）。

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConfirmTodo } from "@/lib/vault";
import { performCorrection } from "./actions";

describe("performCorrection", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    await mkdir(path.join(vaultDir, "_inbox"), { recursive: true });
    await writeFile(path.join(vaultDir, "_inbox", "corrections.md"), "", "utf-8");
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    process.env.STUDY_AI_VAULT_DIR = originalEnv;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("appends the chosen correction to _inbox/corrections.md", async () => {
    const todo: ConfirmTodo = { id: "todo-1", q: "q", options: ["日本史", "世界史"], default: "日本史" };
    await performCorrection({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "世界史",
    });
    const corrections = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf-8");
    expect(corrections).toContain("report: reports/daily/2026-07-20.md");
    expect(corrections).toContain("todo: todo-1");
    expect(corrections).toContain("choice: 世界史");
  });
});
```

2. 失敗を確認する。

```bash
npx vitest run src/app/reports/daily/_lib/actions.test.ts
```

期待: `actions.ts` が存在せず失敗。

3. `src/app/reports/daily/_lib/actions.ts` を作成する。

```ts
"use server";

import { revalidatePath } from "next/cache";
import { appendCorrection, type ConfirmTodo } from "@/lib/vault";
import { buildCorrectionEntry } from "./build-correction";

export async function performCorrection(input: {
  reportPath: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
}): Promise<void> {
  const entry = buildCorrectionEntry({ ...input, now: new Date() });
  await appendCorrection(entry);
}

export async function submitCorrection(input: {
  reportPath: string;
  date: string;
  todo: ConfirmTodo;
  choice: string;
  note?: string;
}): Promise<void> {
  await performCorrection(input);
  revalidatePath(`/reports/daily/${input.date}`);
}
```

4. 成功を確認する。

```bash
npx vitest run src/app/reports/daily/_lib/actions.test.ts
```

期待: 全テストPASS。

5. 型チェックする。

```bash
npx tsc --noEmit
```

6. コミットする。

```bash
git add src/app/reports/daily/_lib/actions.ts src/app/reports/daily/_lib/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(reports): add submitCorrection server action appending to corrections.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 要確認TODOのタップ選択コンポーネント

**Files:**
- Create: `src/app/reports/daily/[date]/confirm-todo-list.tsx`

**Interfaces:**
- Consumes: `ConfirmTodo`（`@/lib/vault`）、`submitCorrection`（`../_lib/actions`）
- Produces: `export default function ConfirmTodoList(props: { reportPath: string; date: string; todos: ConfirmTodo[] }): JSX.Element | null`

このコンポーネントは選択肢のタップ操作というUI挙動そのものであり、ロジック（`buildCorrectionEntry`／`performCorrection`）は既にTask4・5でTDD済み。見た目・操作の検証はTask12のPlaywright E2Eで行う。

**Steps:**

1. `src/app/reports/daily/[date]/confirm-todo-list.tsx` を作成する。

```tsx
"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import type { ConfirmTodo } from "@/lib/vault";
import { submitCorrection } from "../_lib/actions";

export default function ConfirmTodoList({
  reportPath,
  date,
  todos,
}: {
  reportPath: string;
  date: string;
  todos: ConfirmTodo[];
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (todos.length === 0) return null;

  const choose = (todo: ConfirmTodo, choice: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await submitCorrection({ reportPath, date, todo, choice });
        setResolved((prev) => ({ ...prev, [todo.id]: choice }));
      } catch {
        setError("訂正を保存できませんでした。");
      }
    });
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        要確認TODO
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={1.5}>
        {todos.map((todo) => {
          const chosen = resolved[todo.id];
          return (
            <Paper key={todo.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {todo.q}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {todo.options.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    color={chosen === option ? "primary" : "default"}
                    onClick={() => choose(todo, option)}
                    disabled={isPending}
                  />
                ))}
              </Stack>
              {chosen && (
                <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1 }}>
                  「{chosen}」で訂正を送信しました
                </Typography>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
```

2. 型チェックする。

```bash
npx tsc --noEmit
```

3. コミットする。

```bash
git add src/app/reports/daily/\[date\]/confirm-todo-list.tsx
git commit -m "$(cat <<'EOF'
feat(reports): add tap-to-choose UI for confirm-todo corrections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/reports/daily/[date]` 詳細ページ

**Files:**
- Create: `src/app/reports/daily/[date]/page.tsx`

**Interfaces:**
- Consumes: `readVaultFile`, `parseConfirmTodos`（`@/lib/vault`）、`ConfirmTodoList`（`./confirm-todo-list`）
- Produces: `export default async function DailyReportPage(props: { params: Promise<{ date: string }> }): Promise<JSX.Element>`

**Steps:**

1. `src/app/reports/daily/[date]/page.tsx` を作成する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile, parseConfirmTodos } from "@/lib/vault";
import ConfirmTodoList from "./confirm-todo-list";

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
      <ConfirmTodoList reportPath={reportPath} date={date} todos={todos} />
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  );
}
```

2. 型チェックする。

```bash
npx tsc --noEmit
```

3. コミットする。

```bash
git add src/app/reports/daily/\[date\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(reports): add /reports/daily/[date] page rendering vault markdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `/reports/weekly/[week]` 詳細ページ

**Files:**
- Create: `src/app/reports/weekly/[week]/page.tsx`

**Interfaces:**
- Consumes: `readVaultFile`（`@/lib/vault`）
- Produces: `export default async function WeeklyReportPage(props: { params: Promise<{ week: string }> }): Promise<JSX.Element>`

週次レポート（`weekly-report`）は契約上 `confirm_todos` フィールドを持たないため、要確認TODO UIは付けず本文表示のみとする。

**Steps:**

1. `src/app/reports/weekly/[week]/page.tsx` を作成する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const { body } = await readVaultFile(`reports/weekly/${week}.md`);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {week} の週次レポート
      </Typography>
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  );
}
```

2. 型チェックする。

```bash
npx tsc --noEmit
```

3. コミットする。

```bash
git add src/app/reports/weekly/\[week\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(reports): add /reports/weekly/[week] page rendering vault markdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 弱点カルテの科目一覧ロジック

**Files:**
- Create: `src/app/karte/_lib/list-subjects.ts`
- Test: `src/app/karte/_lib/list-subjects.test.ts`

**Interfaces:**
- Consumes: `getVaultRoot`（`@/lib/vault`）
- Produces: `export async function listKarteSubjects(): Promise<string[]>`

`subjects/` 配下のディレクトリ一覧は契約4aに列挙が無いため、`src/lib/vault/` は拡張せず、ページ専用の private folder（`_lib/`）に閉じて `node:fs/promises` の `readdir` を直接使う。

**Steps:**

1. `src/app/karte/_lib/list-subjects.test.ts` を作成する（失敗させる）。

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listKarteSubjects } from "./list-subjects";

describe("listKarteSubjects", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    await mkdir(path.join(vaultDir, "subjects", "日本史"), { recursive: true });
    await mkdir(path.join(vaultDir, "subjects", "世界史"), { recursive: true });
    await writeFile(path.join(vaultDir, "subjects", "not-a-subject.md"), "stray file", "utf-8");
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    process.env.STUDY_AI_VAULT_DIR = originalEnv;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("lists subject directory names, ignoring stray files", async () => {
    expect(await listKarteSubjects()).toEqual(["世界史", "日本史"]);
  });

  it("returns an empty array when the subjects directory does not exist", async () => {
    await rm(path.join(vaultDir, "subjects"), { recursive: true, force: true });
    expect(await listKarteSubjects()).toEqual([]);
  });
});
```

2. 失敗を確認する。

```bash
npx vitest run src/app/karte/_lib/list-subjects.test.ts
```

期待: `list-subjects.ts` が存在せず失敗。

3. `src/app/karte/_lib/list-subjects.ts` を作成する。

```ts
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getVaultRoot } from "@/lib/vault";

export async function listKarteSubjects(): Promise<string[]> {
  const subjectsDir = path.join(getVaultRoot(), "subjects");
  let entries;
  try {
    entries = await readdir(subjectsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
```

4. 成功を確認する。

```bash
npx vitest run src/app/karte/_lib/list-subjects.test.ts
```

期待: 全テストPASS（`"世界史" < "日本史"` はコードポイント順で成立する: U+4E16 < U+65E5）。

5. コミットする。

```bash
git add src/app/karte/_lib/list-subjects.ts src/app/karte/_lib/list-subjects.test.ts
git commit -m "$(cat <<'EOF'
feat(karte): add subject directory listing helper for vault subjects/

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `/karte` 一覧ページ・`/karte/[subject]` 詳細ページ

**Files:**
- Create: `src/app/karte/page.tsx`
- Create: `src/app/karte/[subject]/page.tsx`

**Interfaces:**
- Consumes: `listKarteSubjects`（`./_lib/list-subjects`）、`readVaultFile`（`@/lib/vault`）
- Produces:
  - `export default async function KartePage(): Promise<JSX.Element>`
  - `export default async function KarteSubjectPage(props: { params: Promise<{ subject: string }> }): Promise<JSX.Element>`

**Steps:**

1. `src/app/karte/page.tsx` を作成する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Link from "next/link";
import { listKarteSubjects } from "./_lib/list-subjects";

export const dynamic = "force-dynamic";

export default async function KartePage() {
  const subjects = await listKarteSubjects();

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        弱点カルテ
      </Typography>
      {subjects.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          まだカルテがありません。
        </Typography>
      ) : (
        <Stack spacing={1}>
          {subjects.map((subject) => (
            <Paper
              key={subject}
              component={Link}
              href={`/karte/${encodeURIComponent(subject)}`}
              variant="outlined"
              sx={{ p: 1.5, textDecoration: "none", color: "text.primary" }}
            >
              <Typography>{subject}</Typography>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
```

2. `src/app/karte/[subject]/page.tsx` を作成する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readVaultFile } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function KarteSubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const subjectName = decodeURIComponent(subject);
  const { body } = await readVaultFile(`subjects/${subjectName}/弱点カルテ.md`);

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        {subjectName} 弱点カルテ
      </Typography>
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  );
}
```

3. 型チェックする。

```bash
npx tsc --noEmit
```

4. コミットする。

```bash
git add src/app/karte/page.tsx src/app/karte/\[subject\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(karte): add /karte index and /karte/[subject] pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: ナビゲーション導線（BottomNav・/statsからのリンク）

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/app/stats/page.tsx`

**Interfaces:**
- Consumes: なし（既存コンポーネントへのルート項目追加のみ）
- Produces: なし（新規エクスポートは追加しない）

親スペックの未決事項「`/stats` 等の既存画面の扱い」への最小限の対応として、既存 `/stats` の分析ロジックは変更せず、vaultビューアへの導線ボタンを1つ追加するにとどめる。大改修はしない。

**Steps:**

1. `src/components/BottomNav.tsx` の import 群に2アイコンを追加する。

```ts
import ArticleIcon from "@mui/icons-material/Article";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
```

2. `NAV_ITEMS` に「レポート」「カルテ」を追加する（既存4項目 `今日/記録/履歴/分析` は `MOBILE_TABS` のままなので、新規2項目は自動的に `EXTRA_ITEMS`＝ドロワー側に入る）。

```ts
const NAV_ITEMS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "記録", value: "/record", icon: <EditNoteIcon /> },
  { label: "履歴", value: "/records", icon: <ListAltIcon /> },
  { label: "分析", value: "/stats", icon: <InsightsIcon /> },
  { label: "予定", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "レポート", value: "/reports", icon: <ArticleIcon /> },
  { label: "カルテ", value: "/karte", icon: <MedicalInformationIcon /> },
  { label: "設定", value: "/settings", icon: <SettingsIcon /> },
];
```

3. `src/app/stats/page.tsx` の `分析` 見出し直下（`configError` 表示の手前）にビューアへの導線ボタンを追加する。

```tsx
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        分析
      </Typography>

      <Button component={Link} href="/reports" variant="outlined" size="small" sx={{ mb: 2 }}>
        vaultレポート・弱点カルテを見る
      </Button>

      {configError && (
```

（`Button` と `Link` は `src/app/stats/page.tsx` に既にimport済みのため追加import不要。）

4. 型チェック・lintを実行する。

```bash
npx tsc --noEmit
npm run lint
```

5. コミットする。

```bash
git add src/components/BottomNav.tsx src/app/stats/page.tsx
git commit -m "$(cat <<'EOF'
feat(nav): add navigation entries for the vault reports and karte viewers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: E2Eフィクスチャと「要確認TODOタップ選択→corrections.md追記」フロー

**Files:**
- Create: `e2e/fixtures/vault/index.md`
- Create: `e2e/fixtures/vault/_inbox/corrections.md`
- Create: `e2e/fixtures/vault/reports/daily/2026-07-20.md`
- Create: `e2e/fixtures/vault/subjects/日本史/弱点カルテ.md`
- Create: `e2e/vault-reports.spec.ts`

**Interfaces:**
- Consumes: なし（ブラウザ操作とローカル `vault` フィクスチャファイルの読み取りのみ）
- Produces: なし

このTaskは新規ファイル作成のみなので、TDDの「失敗テスト→実装」サイクルではなく、フィクスチャ作成→spec作成→実行確認の順で進める。`STUDY_AI_VAULT_DIR` は `playwright.config.ts` を変更せず、`test:e2e` を実行するシェルの環境変数として渡す（Playwrightの `webServer.command` は実行元プロセスの環境を継承するため、これで `npm run dev` に伝播する）。

**Steps:**

1. `e2e/fixtures/vault/index.md` を作成する。

```md
---
type: material
updated: 2026-07-20T00:00:00+09:00
source: manual
schema_version: 1
---

# E2Eテスト用 vault フィクスチャ

`e2e/vault-reports.spec.ts` からのみ参照される。
```

2. `e2e/fixtures/vault/_inbox/corrections.md` を空ファイルとして作成する（Webは追記のみなので、テスト実行前に空へリセットする責務はspec側の `beforeEach` が持つ）。

```md
```

3. `e2e/fixtures/vault/reports/daily/2026-07-20.md` を作成する。

```md
---
type: daily-report
date: 2026-07-20
confirm_todos: 1
updated: 2026-07-20T23:40:00+09:00
source: nightly-batch
schema_version: 1
---

## 要確認TODO
- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg

## サマリー
E2Eテスト用の日次レポートです。
```

4. `e2e/fixtures/vault/subjects/日本史/弱点カルテ.md` を作成する。

```md
---
type: karte
subject: 日本史
updated: 2026-07-20T23:40:00+09:00
source: manual
schema_version: 1
---

## 弱点

- 江戸時代の政治史が弱い（E2Eテスト用ダミーデータ）。
```

5. `e2e/vault-reports.spec.ts` を作成する。

```ts
import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const vaultDir = path.join(process.cwd(), "e2e", "fixtures", "vault");
const correctionsPath = path.join(vaultDir, "_inbox", "corrections.md");

test.beforeEach(async () => {
  await writeFile(correctionsPath, "", "utf-8");
});

test("要確認TODOをタップ選択するとcorrections.mdに追記される", async ({ page }) => {
  await page.goto("/reports/daily/2026-07-20");
  await expect(page.getByText("この写真の科目は？")).toBeVisible();

  await page.getByRole("button", { name: "世界史", exact: true }).click();
  await expect(page.getByText("「世界史」で訂正を送信しました")).toBeVisible();

  const corrections = await readFile(correctionsPath, "utf-8");
  expect(corrections).toContain("report: reports/daily/2026-07-20.md");
  expect(corrections).toContain("todo: todo-1");
  expect(corrections).toContain("choice: 世界史");
});

test("弱点カルテ一覧から科目を開いて閲覧できる", async ({ page }) => {
  await page.goto("/karte");
  await page.getByRole("link", { name: "日本史" }).click();
  await expect(page.getByRole("heading", { name: "日本史 弱点カルテ" })).toBeVisible();
});

test("ナビゲーションからレポート・カルテを開ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "レポート" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.goto("/");
  await page.getByRole("button", { name: "カルテ" }).click();
  await expect(page).toHaveURL(/\/karte$/);
});
```

6. ローカルで `STUDY_AI_VAULT_DIR` をこのフィクスチャに向けて実行する。既に `npm run dev` がポート3100で起動済みの場合は一度停止してから実行すること（`webServer` の `reuseExistingServer` が既存プロセスの環境変数を再利用してしまうため）。

```bash
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- e2e/vault-reports.spec.ts
```

期待: 3テストすべてPASS。`/reports/daily/2026-07-20` に要確認TODOのチップが表示され、「世界史」タップ後に `_inbox/corrections.md` へ

```
## 2026-07-24T08:12:00+09:00
- report: reports/daily/2026-07-20.md
- todo: todo-1
- choice: 世界史
```

の形式（契約3b準拠、タイムスタンプは実行時刻）が追記されていること。

7. 全体の検査コマンドを一通り実行する。

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e
```

8. コミットする。

```bash
git add e2e/fixtures/vault e2e/vault-reports.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): cover confirm-todo tap-to-choose flow against a vault fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
