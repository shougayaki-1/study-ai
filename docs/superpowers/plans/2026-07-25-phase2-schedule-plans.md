# Phase 2: Schedule & Study Plans via Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定(`vault/schedule.md`)と学習計画(`vault/plans/YYYY-MM-DD.md`)を、対話(Node CLIラッパー)から書き込み・Web(`/schedule`)から閲覧できるようにする。予定の完了だけはWebからもタップで書き換え可能にする。

**Architecture:** Phase 1と同じ「Node(対話が呼ぶライタ) / TS(Webが読むリーダ)は同一フォーマットを解釈する」構成を、予定・学習計画の2種類のデータに拡張する。`analysis/helpers/vault/` に `schedule.mjs`・`plan.mjs` を追加してNode側のパース/フォーマット/ID採番/追記/更新/削除を実装し、`src/lib/vault/` に `schedule.ts`・`plan.ts` を追加してTS側のパース/フォーマット/読み取り/(予定のみ)完了トグルを実装する。対話(Claude Code / Codex)からは `analysis/helpers/add-event.mjs` 等の薄いCLIラッパーをシェル実行で呼ぶ。`/schedule` はServer Componentで`vault/`を直接読み、予定の完了チェックボックスのみをServer Action経由で書き換える。

**Tech Stack:** TypeScript(Next.js App Router, Server Components/Actions, MUI, vitest) / Node.js標準ライブラリのみ(`node --test`) / Playwright(E2E)。

## Global Constraints

- vaultルートは Phase 1 と同じ環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw（黙って別パスに書かない）。
- **TS実装（`src/lib/vault/`）と Node実装（`analysis/helpers/vault/`）は同一フォーマットを完全に同じ構造へ解釈すること。** 検証は「共有フィクスチャ + parityテスト」で行う（詳細は各Taskを参照。フィクスチャ文字列を2箇所にコピペしない）。
- Node側は **Node標準ライブラリのみ**（追加npm禁止）。TS側の fs アクセスは**サーバ側のみ**。
- 既存ヘルパー（`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/`stringifyFrontmatter`）は**再実装せず import して使う**。
- 行フォーマットの区切りは Phase 1 の要確認TODO行と同じ流儀：フィールドは **` | `**、`key=value` は**最初の `=` で分割**。**値に含めてはならないのは ` | ` と改行の2つだけ**。`=` は値に含めてよい（最初の `=` で分割するため `title=y=mx+b` は正しく `y=mx+b` と解釈される）。
- **禁止文字はコードで強制する。** `formatScheduleEventLine`/`formatPlanBlockLine`（TS版・Node版の両方）は、各フィールド値が ` | ` または改行(`\n`)を含む場合に `throw` する。CLIラッパーはこの throw をそのまま呼び出し元(対話)に伝播させ、握りつぶさない。
- **値の妥当性はCLIラッパーの入口で検査する。** `add-event.mjs`/`edit-event.mjs` は `kind`(5値allowlist)と `due`(`YYYY-MM-DD`)を、`add-plan-block.mjs`/`edit-plan-block.mjs` は `subject`(13科目allowlist)・`start`/`end`(`HH:MM`)・`status`(3値allowlist)・**`end > start`** を検査し、外れたら `throw` する。禁止文字チェック(前項)と同じ場所にまとめてよい。
- 壊れた行・必須キー欠落の行は**その行だけスキップ**し、全体を落とさない。
- 予定の完了トグル(`setScheduleEventDone`)は**チェックボックス記号(`- [ ] `/`- [x] `)のみ**を書き換える。他フィールドは触らない。
- 契約に定義された関数名・型名・行フォーマット・パスは1文字も変えない。契約に無い関数/型/ディレクトリ名は導入しない。
- 本計画固有の決定事項:
  - `/schedule` の学習計画表示ウィンドウは「今日から6日後まで(7日分)」とする(既存Web版の「締切7日以内=urgent」表示と桁を揃える)。
  - E2Eで学習計画表示を検証する際、`plans/<今日の日付>.md` は実行時の実日付に依存するため、**フィクスチャとして固定コミットせず、テストの `beforeEach` で動的に書き込む**(`e2e/vault-reports.spec.ts` の `corrections.md` 動的書き込みと同じ方式)。`e2e/fixtures/vault/plans/` には日付非依存の確認用に過去日付の静的フィクスチャを1つ置く。
  - Node側CLIラッパーの引数はPhase 1の `write-vault-file.mjs`(位置引数+JSONパッチ)の流儀を踏襲する。
  - `updated` フィールドは Phase 1 実装と同じ `new Date().toISOString()`(UTCの `Z` 表記、例: `2026-07-25T13:10:00.000Z`)で書く。本計画の例示・フィクスチャで `+09:00` 表記を使っている箇所は契約書(1a/1b/1c)の説明用表記であり、実装・自動テストで比較する文字列は `toISOString()` 形式である前提で読むこと(Task 6 / Task 8 のテストは `updated` の値自体をアサートしないため矛盾はないが、将来 `updated` を検証するテストを足す場合は `toISOString()` 形式で書くこと)。

### 計画1との並行実行について

計画1（`docs/superpowers/plans/2026-07-25-phase2-records.md`）が扱うTask群と本計画のTask 1〜11（`schedule.ts`/`plan.ts`/`schedule.mjs`/`plan.mjs`とそのCLIラッパー、および対応するテスト）は、ファイルが1つも重ならない。衝突しうるのは次の4ファイルのみ:

- `src/lib/vault/index.ts`（本計画のTask 4）
- `analysis/helpers/vault/index.mjs`（本計画のTask 9）
- `docs/study-dialogue.md`（本計画のTask 14）
- `e2e/core-flows.spec.ts`（本計画のTask 17）／`e2e/extended-flows.spec.ts`（本計画のTask 16）

上記4ファイル（と対応するTask）を除き、本計画のTaskは計画1と並行して着手してよい。Task自体の実行順序（依存関係）は変えない。

---

## Task 1: TS側 予定のパース/フォーマット (`src/lib/vault/schedule.ts`)

**Files:**
- Create: `analysis/test/fixtures/schedule.md`（TS版・Node版共有フィクスチャ。契約1bの本文相当）
- Create: `src/lib/vault/schedule.ts`
- Create: `src/lib/vault/schedule.test.ts`

**Interfaces:**
- Consumes: なし(この Task では純粋関数のみ)
- Produces:
  ```ts
  export type ScheduleKind = 'assignment' | 'application' | 'mock_exam' | 'exam' | 'other';
  export type ScheduleEvent = { id: string; kind: ScheduleKind; title: string; due: string; done: boolean };
  export function parseScheduleEvents(body: string): ScheduleEvent[];
  export function formatScheduleEventLine(event: ScheduleEvent): string;
  ```

### ステップ

1. 共有フィクスチャを作成する。`analysis/test/fixtures/schedule.md` を新規作成
   (このファイルはTSテスト(vitest)とNodeテスト(`node --test`、Task 5)の両方から`readFileSync`で読む。
   フィクスチャ文字列を2箇所にコピペしない — I11対策):

```md
## 予定
- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01
- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20
```

2. 失敗するテストを書く。`src/lib/vault/schedule.test.ts` を新規作成:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScheduleEvents, formatScheduleEventLine, type ScheduleEvent } from "./schedule";

// 共有フィクスチャ(analysis/test/fixtures/schedule.md)を読む。
// analysis/test/vault-schedule.test.mjs も同じファイルを読む
// (契約: TS版とNode版でパース結果を完全一致させる。フィクスチャのコピペ事故を構造的に防ぐ)。
export const SCHEDULE_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), "analysis/test/fixtures/schedule.md"),
  "utf8"
);

describe("parseScheduleEvents", () => {
  it("parses checkbox state and fields in the fixed key order", () => {
    expect(parseScheduleEvents(SCHEDULE_FIXTURE_BODY)).toEqual([
      { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false },
      { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true },
    ]);
  });

  it("returns an empty array when there are no event lines", () => {
    expect(parseScheduleEvents("## 予定\n")).toEqual([]);
  });
});

describe("formatScheduleEventLine", () => {
  it("formats an undone event with the [ ] prefix", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false };
    expect(formatScheduleEventLine(event)).toBe(
      "- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01"
    );
  });

  it("formats a done event with the [x] prefix", () => {
    const event: ScheduleEvent = { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true };
    expect(formatScheduleEventLine(event)).toBe(
      "- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20"
    );
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試 | 会場未定", due: "2026-08-01", done: false };
    expect(() => formatScheduleEventLine(event)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試\n会場未定", due: "2026-08-01", done: false };
    expect(() => formatScheduleEventLine(event)).toThrow();
  });
});
```

3. 失敗確認:
```
npx vitest run src/lib/vault/schedule.test.ts
```
期待する出力: `Cannot find module './schedule'` 相当のエラーで全テストが失敗する。

4. 最小実装。`src/lib/vault/schedule.ts` を新規作成:

```ts
export type ScheduleKind = "assignment" | "application" | "mock_exam" | "exam" | "other";
export type ScheduleEvent = { id: string; kind: ScheduleKind; title: string; due: string; done: boolean };

const DONE_PREFIX = "- [x] ";
const TODO_PREFIX = "- [ ] ";

function assertNoDelimiters(value: string, field: string): void {
  if (value.includes(" | ") || value.includes("\n")) {
    throw new Error(`${field} must not contain " | " or a newline: ${value}`);
  }
}

export function parseScheduleEvents(body: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  for (const line of body.split("\n")) {
    let done: boolean;
    let rest: string;
    if (line.startsWith(DONE_PREFIX)) {
      done = true;
      rest = line.slice(DONE_PREFIX.length);
    } else if (line.startsWith(TODO_PREFIX)) {
      done = false;
      rest = line.slice(TODO_PREFIX.length);
    } else {
      continue;
    }
    const fields: Record<string, string> = {};
    for (const part of rest.split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.kind || !fields.title || !fields.due) continue;
    events.push({ id: fields.id, kind: fields.kind as ScheduleKind, title: fields.title, due: fields.due, done });
  }
  return events;
}

export function formatScheduleEventLine(event: ScheduleEvent): string {
  assertNoDelimiters(event.id, "id");
  assertNoDelimiters(event.kind, "kind");
  assertNoDelimiters(event.title, "title");
  assertNoDelimiters(event.due, "due");
  const prefix = event.done ? DONE_PREFIX : TODO_PREFIX;
  return `${prefix}id=${event.id} | kind=${event.kind} | title=${event.title} | due=${event.due}`;
}
```

5. 成功確認:
```
npx vitest run src/lib/vault/schedule.test.ts
```
期待する出力: `Test Files 1 passed`, `Tests 6 passed`。

6. commit:
```
git add analysis/test/fixtures/schedule.md src/lib/vault/schedule.ts src/lib/vault/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add TS schedule event parser/formatter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 1 完了

---

## Task 2: TS側 予定の読み取り・完了トグル (`schedule.ts` 拡張)

**Files:**
- Modify: `src/lib/vault/schedule.ts`
- Modify: `src/lib/vault/schedule.test.ts`

**Interfaces:**
- Consumes: `readVaultFile`（`./read`）, `getVaultRoot`（`./root`）
- Produces:
  ```ts
  export async function readSchedule(): Promise<ScheduleEvent[]>;               // 無ければ []
  export async function setScheduleEventDone(id: string, done: boolean): Promise<void>;  // 該当行のみ書き換え
  ```

### ステップ

1. 失敗するテストを追記する。`src/lib/vault/schedule.test.ts` の末尾に追加:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { readSchedule, setScheduleEventDone } from "./schedule";

describe("readSchedule / setScheduleEventDone", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-schedule-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  const SCHEDULE_RAW = [
    "---",
    "type: schedule",
    "schema_version: 1",
    "updated: 2026-07-25T22:10:00+09:00",
    "---",
    "",
    SCHEDULE_FIXTURE_BODY,
  ].join("\n");

  it("readSchedule returns [] when schedule.md does not exist", async () => {
    expect(await readSchedule()).toEqual([]);
  });

  it("readSchedule parses the existing schedule.md", async () => {
    await mkdir(vaultDir, { recursive: true });
    await writeFile(path.join(vaultDir, "schedule.md"), SCHEDULE_RAW, "utf8");
    expect(await readSchedule()).toEqual([
      { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false },
      { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true },
    ]);
  });

  it("setScheduleEventDone flips only the target line's checkbox", async () => {
    await mkdir(vaultDir, { recursive: true });
    await writeFile(path.join(vaultDir, "schedule.md"), SCHEDULE_RAW, "utf8");

    await setScheduleEventDone("ev-1", true);

    const raw = await readFile(path.join(vaultDir, "schedule.md"), "utf8");
    expect(raw).toContain("- [x] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01");
    expect(raw).toContain("- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20");
  });
});
```

2. 失敗確認:
```
npx vitest run src/lib/vault/schedule.test.ts
```
期待する出力: `readSchedule is not a function` 等で新規3件が失敗する(既存6件は成功のまま)。

3. 最小実装。`src/lib/vault/schedule.ts` の先頭にimportを追加し、末尾に2関数を追加:

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readVaultFile } from "./read";
import { getVaultRoot } from "./root";
```

(この3行を既存の型定義の直前に挿入する)

```ts
const SCHEDULE_REL_PATH = "schedule.md";

export async function readSchedule(): Promise<ScheduleEvent[]> {
  let body: string;
  try {
    ({ body } = await readVaultFile(SCHEDULE_REL_PATH));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseScheduleEvents(body);
}

export async function setScheduleEventDone(id: string, done: boolean): Promise<void> {
  const fullPath = path.join(getVaultRoot(), SCHEDULE_REL_PATH);
  const raw = await readFile(fullPath, "utf8");
  const marker = `id=${id} |`;
  const nextPrefix = done ? DONE_PREFIX : TODO_PREFIX;
  const lines = raw.split("\n").map((line) => {
    let rest: string | null = null;
    if (line.startsWith(DONE_PREFIX)) rest = line.slice(DONE_PREFIX.length);
    else if (line.startsWith(TODO_PREFIX)) rest = line.slice(TODO_PREFIX.length);
    if (rest === null || !rest.startsWith(marker)) return line;
    return `${nextPrefix}${rest}`;
  });
  await writeFile(fullPath, lines.join("\n"), "utf8");
}
```

(この2関数はファイル末尾、`formatScheduleEventLine` の後に追加する)

4. 成功確認:
```
npx vitest run src/lib/vault/schedule.test.ts
```
期待する出力: `Test Files 1 passed`, `Tests 9 passed`。

5. commit:
```
git add src/lib/vault/schedule.ts src/lib/vault/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add readSchedule and setScheduleEventDone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 2 完了

---

## Task 3: TS側 学習計画のパース/フォーマット/読み取り (`src/lib/vault/plan.ts`)

**Files:**
- Create: `analysis/test/fixtures/study-plan.md`（TS版・Node版共有フィクスチャ。契約1cの本文相当）
- Create: `src/lib/vault/plan.ts`
- Create: `src/lib/vault/plan.test.ts`

**Interfaces:**
- Consumes: `readVaultFile`（`./read`）
- Produces:
  ```ts
  export type PlanStatus = 'planned' | 'done' | 'skipped';
  export type PlanBlock = { id: string; start: string; end: string; subject: string; status: PlanStatus; memo: string };
  export function parsePlanBlocks(body: string): PlanBlock[];
  export function formatPlanBlockLine(block: PlanBlock): string;
  export async function readPlan(date: string): Promise<PlanBlock[]>;
  ```

### ステップ

1. 共有フィクスチャを作成する。`analysis/test/fixtures/study-plan.md` を新規作成
   (TSテストとNodeテスト(Task 7)の両方から`readFileSync`で読む。フィクスチャ文字列を
   2箇所にコピペしない — I11対策):

```md
## 計画
- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=長文演習
- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo=
```

2. 失敗するテストを書く。`src/lib/vault/plan.test.ts` を新規作成:

```ts
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePlanBlocks, formatPlanBlockLine, readPlan, type PlanBlock } from "./plan";

// 共有フィクスチャ(analysis/test/fixtures/study-plan.md)を読む。
// analysis/test/vault-plan.test.mjs も同じファイルを読む
// (契約: TS版とNode版でパース結果を完全一致させる。フィクスチャのコピペ事故を構造的に防ぐ)。
export const PLAN_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), "analysis/test/fixtures/study-plan.md"),
  "utf8"
);

describe("parsePlanBlocks", () => {
  it("parses blocks in the fixed key order, memo can be empty", () => {
    expect(parsePlanBlocks(PLAN_FIXTURE_BODY)).toEqual([
      { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文演習" },
      { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" },
    ]);
  });

  it("returns an empty array when there are no block lines", () => {
    expect(parsePlanBlocks("## 計画\n")).toEqual([]);
  });
});

describe("formatPlanBlockLine", () => {
  it("formats a block with all fields including empty memo", () => {
    const block: PlanBlock = { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" };
    expect(formatPlanBlockLine(block)).toBe(
      "- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo="
    );
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const block: PlanBlock = { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文 | 演習" };
    expect(() => formatPlanBlockLine(block)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const block: PlanBlock = { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文\n演習" };
    expect(() => formatPlanBlockLine(block)).toThrow();
  });
});

describe("readPlan", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-plan-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("returns [] when plans/<date>.md does not exist", async () => {
    expect(await readPlan("2026-07-26")).toEqual([]);
  });

  it("parses an existing plans/<date>.md", async () => {
    await mkdir(path.join(vaultDir, "plans"), { recursive: true });
    await writeFile(
      path.join(vaultDir, "plans", "2026-07-26.md"),
      [
        "---",
        "type: study-plan",
        "date: 2026-07-26",
        "schema_version: 1",
        "updated: 2026-07-25T22:10:00+09:00",
        "---",
        "",
        PLAN_FIXTURE_BODY,
      ].join("\n"),
      "utf8"
    );
    expect(await readPlan("2026-07-26")).toEqual([
      { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文演習" },
      { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" },
    ]);
  });
});
```

3. 失敗確認:
```
npx vitest run src/lib/vault/plan.test.ts
```
期待する出力: `Cannot find module './plan'` 相当で全テストが失敗する。

4. 最小実装。`src/lib/vault/plan.ts` を新規作成:

```ts
import { readVaultFile } from "./read";

export type PlanStatus = "planned" | "done" | "skipped";
export type PlanBlock = { id: string; start: string; end: string; subject: string; status: PlanStatus; memo: string };

const PREFIX = "- ";

function assertNoDelimiters(value: string, field: string): void {
  if (value.includes(" | ") || value.includes("\n")) {
    throw new Error(`${field} must not contain " | " or a newline: ${value}`);
  }
}

export function parsePlanBlocks(body: string): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    const fields: Record<string, string> = {};
    for (const part of line.slice(PREFIX.length).split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.start || !fields.end || !fields.subject || !fields.status) continue;
    blocks.push({
      id: fields.id,
      start: fields.start,
      end: fields.end,
      subject: fields.subject,
      status: fields.status as PlanStatus,
      memo: fields.memo ?? "",
    });
  }
  return blocks;
}

export function formatPlanBlockLine(block: PlanBlock): string {
  assertNoDelimiters(block.id, "id");
  assertNoDelimiters(block.start, "start");
  assertNoDelimiters(block.end, "end");
  assertNoDelimiters(block.subject, "subject");
  assertNoDelimiters(block.status, "status");
  assertNoDelimiters(block.memo, "memo");
  return `${PREFIX}id=${block.id} | start=${block.start} | end=${block.end} | subject=${block.subject} | status=${block.status} | memo=${block.memo}`;
}

export async function readPlan(date: string): Promise<PlanBlock[]> {
  let body: string;
  try {
    ({ body } = await readVaultFile(`plans/${date}.md`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parsePlanBlocks(body);
}
```

5. 成功確認:
```
npx vitest run src/lib/vault/plan.test.ts
```
期待する出力: `Test Files 1 passed`, `Tests 8 passed`。

6. commit:
```
git add analysis/test/fixtures/study-plan.md src/lib/vault/plan.ts src/lib/vault/plan.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add TS study-plan parser/formatter/reader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 3 完了

---

## Task 4: TS側バレル更新 (`src/lib/vault/index.ts`)

**Files:**
- Modify: `src/lib/vault/index.ts`
- Modify: `src/lib/vault/index.test.ts`

**Interfaces:**
- Consumes: Task 1〜3の全export
- Produces: `src/lib/vault/index.ts` から予定・学習計画の型/関数を再エクスポート

### ステップ

1. 失敗するテストを追記する。`src/lib/vault/index.test.ts` の `it(...)` 内アサーションに追加:

```ts
    expect(typeof vault.parseScheduleEvents).toBe("function");
    expect(typeof vault.formatScheduleEventLine).toBe("function");
    expect(typeof vault.readSchedule).toBe("function");
    expect(typeof vault.setScheduleEventDone).toBe("function");
    expect(typeof vault.parsePlanBlocks).toBe("function");
    expect(typeof vault.formatPlanBlockLine).toBe("function");
    expect(typeof vault.readPlan).toBe("function");
```

(既存の `expect(typeof vault.appendCorrection).toBe("function");` の直後に追加する)

2. 失敗確認:
```
npx vitest run src/lib/vault/index.test.ts
```
期待する出力: `vault.parseScheduleEvents is not a function` 等で失敗する。

3. 最小実装。`src/lib/vault/index.ts` の末尾に追加:

```ts
export type { ScheduleKind, ScheduleEvent } from "./schedule";
export { parseScheduleEvents, formatScheduleEventLine, readSchedule, setScheduleEventDone } from "./schedule";
export type { PlanStatus, PlanBlock } from "./plan";
export { parsePlanBlocks, formatPlanBlockLine, readPlan } from "./plan";
```

4. 成功確認:
```
npx vitest run src/lib/vault/index.test.ts && npx tsc --noEmit
```
期待する出力: `Test Files 1 passed`、`tsc`はエラーなしで終了する。

5. commit:
```
git add src/lib/vault/index.ts src/lib/vault/index.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): re-export schedule and plan helpers from the vault barrel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 4 完了

---

## Task 5: Node側 予定のパース/フォーマット/ID採番 (`analysis/helpers/vault/schedule.mjs`)

**Files:**
- Create: `analysis/helpers/vault/schedule.mjs`
- Create: `analysis/test/vault-schedule.test.mjs`
- Modify: `src/lib/vault/schedule.test.ts`（TS版・Node版のparityテストを追加。Node実装が揃う本Taskの末尾で行う）

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`（`./read-write.mjs`）
- Produces:
  ```js
  export function parseScheduleEvents(body);
  export function formatScheduleEventLine(event);
  export function nextEventId(events);
  ```

### ステップ

1. 失敗するテストを書く。`analysis/test/vault-schedule.test.mjs` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseScheduleEvents, formatScheduleEventLine, nextEventId } from '../helpers/vault/schedule.mjs';

// 共有フィクスチャ(analysis/test/fixtures/schedule.md)を読む。
// src/lib/vault/schedule.test.ts も同じファイルを読む
// (契約: TS版とNode版でパース結果を完全一致させる。フィクスチャのコピペ事故を構造的に防ぐ)。
const SCHEDULE_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), 'analysis/test/fixtures/schedule.md'),
  'utf8'
);

test('parseScheduleEvents parses checkbox state and fields in the fixed key order', () => {
  assert.deepEqual(parseScheduleEvents(SCHEDULE_FIXTURE_BODY), [
    { id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false },
    { id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: true },
  ]);
});

test('parseScheduleEvents returns [] when there are no event lines', () => {
  assert.deepEqual(parseScheduleEvents('## 予定\n'), []);
});

test('formatScheduleEventLine formats undone/done events with the correct prefix', () => {
  assert.equal(
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false }),
    '- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01'
  );
  assert.equal(
    formatScheduleEventLine({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: true }),
    '- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20'
  );
});

test('nextEventId returns ev-<max+1>, and ev-1 when there are no events', () => {
  assert.equal(nextEventId([]), 'ev-1');
  assert.equal(nextEventId(parseScheduleEvents(SCHEDULE_FIXTURE_BODY)), 'ev-3');
});

test('formatScheduleEventLine throws when a field value contains the " | " delimiter', () => {
  assert.throws(() =>
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試 | 会場未定', due: '2026-08-01', done: false })
  );
});

test('formatScheduleEventLine throws when a field value contains a newline', () => {
  assert.throws(() =>
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試\n会場未定', due: '2026-08-01', done: false })
  );
});
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `Cannot find module '../helpers/vault/schedule.mjs'` 相当で `vault-schedule.test.mjs` の6件が失敗する。

3. 最小実装。`analysis/helpers/vault/schedule.mjs` を新規作成:

```js
import { readVaultFile, writeVaultFile } from './read-write.mjs';

const DONE_PREFIX = '- [x] ';
const TODO_PREFIX = '- [ ] ';

function assertNoDelimiters(value, field) {
  if (value.includes(' | ') || value.includes('\n')) {
    throw new Error(`${field} must not contain " | " or a newline: ${value}`);
  }
}

export function parseScheduleEvents(body) {
  const events = [];
  for (const line of body.split('\n')) {
    let done;
    let rest;
    if (line.startsWith(DONE_PREFIX)) {
      done = true;
      rest = line.slice(DONE_PREFIX.length);
    } else if (line.startsWith(TODO_PREFIX)) {
      done = false;
      rest = line.slice(TODO_PREFIX.length);
    } else {
      continue;
    }
    const fields = {};
    for (const part of rest.split(' | ')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.kind || !fields.title || !fields.due) continue;
    events.push({ id: fields.id, kind: fields.kind, title: fields.title, due: fields.due, done });
  }
  return events;
}

export function formatScheduleEventLine(event) {
  assertNoDelimiters(event.id, 'id');
  assertNoDelimiters(event.kind, 'kind');
  assertNoDelimiters(event.title, 'title');
  assertNoDelimiters(event.due, 'due');
  const prefix = event.done ? DONE_PREFIX : TODO_PREFIX;
  return `${prefix}id=${event.id} | kind=${event.kind} | title=${event.title} | due=${event.due}`;
}

export function nextEventId(events) {
  const max = events.reduce((acc, event) => {
    const m = /^ev-(\d+)$/.exec(event.id);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `ev-${max + 1}`;
}
```

(`readVaultFile`/`writeVaultFile` は Task 6 の追記(appendScheduleEvent等)で使うため、このTaskの時点でimportしておく。未使用でも実害はない)

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `# pass 6` を含む `vault-schedule.test.mjs` のテスト結果(全体`npm run test:analysis`もエラーなく完了)。

5. parityテストを追加する(I11-2対策)。TS実装とNode実装が両方揃ったので、同一フィクスチャを両方でパースし結果が一致することを検証する。`src/lib/vault/schedule.test.ts` の末尾に追加:

```ts
describe("TS/Node parity", () => {
  it("parseScheduleEvents produces the same structure in TS and Node", async () => {
    const nodeModule = (await import(
      /* @vite-ignore */ path.join(process.cwd(), "analysis/helpers/vault/schedule.mjs")
    )) as { parseScheduleEvents: typeof parseScheduleEvents };
    const tsResult = parseScheduleEvents(SCHEDULE_FIXTURE_BODY);
    const nodeResult = nodeModule.parseScheduleEvents(SCHEDULE_FIXTURE_BODY);
    expect(JSON.stringify(nodeResult)).toBe(JSON.stringify(tsResult));
  });
});
```

6. 成功確認:
```
npx vitest run src/lib/vault/schedule.test.ts
```
期待する出力: `Test Files 1 passed`, `Tests 10 passed`(Task 2完了時点の9件 + 本Taskで追加した1件のparityテスト)。

7. commit:
```
git add analysis/helpers/vault/schedule.mjs analysis/test/vault-schedule.test.mjs src/lib/vault/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Node schedule event parser/formatter/id allocator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 5 完了

---

## Task 6: Node側 予定のライタ (`schedule.mjs` 拡張)

**Files:**
- Modify: `analysis/helpers/vault/schedule.mjs`
- Modify: `analysis/test/vault-schedule.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`（`./read-write.mjs`）
- Produces:
  ```js
  export async function appendScheduleEvent(event);
  export async function updateScheduleEvent(id, patch);
  export async function deleteScheduleEvent(id);
  ```

### ステップ

1. 失敗するテストを追記する。`analysis/test/vault-schedule.test.mjs` の末尾に追加:

```js
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendScheduleEvent, updateScheduleEvent, deleteScheduleEvent } from '../helpers/vault/schedule.mjs';

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-schedule-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('appendScheduleEvent creates schedule.md when it does not exist', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.ok(raw.includes('## 予定'));
  assert.ok(raw.includes('- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01'));
}));

test('appendScheduleEvent appends a second event without disturbing the first', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });
  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.equal(parseScheduleEvents(raw.split('---\n').pop()).length, 2);
}));

test('updateScheduleEvent rewrites only the target line', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });

  await updateScheduleEvent('ev-1', { due: '2026-08-15' });

  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.ok(raw.includes('- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-15'));
  assert.ok(raw.includes('- [ ] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20'));
}));

test('deleteScheduleEvent removes only the target line', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });

  await deleteScheduleEvent('ev-1');

  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.ok(!raw.includes('ev-1'));
  assert.ok(raw.includes('ev-2'));
}));
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `appendScheduleEvent is not a function` 等で新規4件が失敗する(既存6件は成功のまま)。

3. 最小実装。`analysis/helpers/vault/schedule.mjs` の末尾に追加:

```js
const HEADING = '## 予定';

async function readScheduleFile() {
  try {
    return await readVaultFile('schedule.md');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { frontmatter: { type: 'schedule', schema_version: 1 }, body: `${HEADING}\n` };
    }
    throw error;
  }
}

function locateLineIndex(lines, id) {
  const marker = `id=${id} |`;
  return lines.findIndex((line) => {
    let rest = null;
    if (line.startsWith(DONE_PREFIX)) rest = line.slice(DONE_PREFIX.length);
    else if (line.startsWith(TODO_PREFIX)) rest = line.slice(TODO_PREFIX.length);
    return rest !== null && rest.startsWith(marker);
  });
}

export async function appendScheduleEvent(event) {
  const { frontmatter, body } = await readScheduleFile();
  const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
  const withHeading = trimmed.includes(HEADING) ? trimmed : `${trimmed ? `${trimmed}\n` : ''}${HEADING}`;
  const nextBody = `${withHeading}\n${formatScheduleEventLine(event)}\n`;
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, nextBody);
}

export async function updateScheduleEvent(id, patch) {
  const { frontmatter, body } = await readScheduleFile();
  const events = parseScheduleEvents(body);
  const current = events.find((event) => event.id === id);
  if (!current) throw new Error(`schedule event not found: ${id}`);
  const updated = { ...current, ...patch };
  const lines = body.split('\n');
  const lineIndex = locateLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`schedule event line not found: ${id}`);
  lines[lineIndex] = formatScheduleEventLine(updated);
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}

export async function deleteScheduleEvent(id) {
  const { frontmatter, body } = await readScheduleFile();
  const lines = body.split('\n');
  const lineIndex = locateLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`schedule event line not found: ${id}`);
  lines.splice(lineIndex, 1);
  await writeVaultFile('schedule.md', { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-schedule.test.mjs` が `# pass 10` で完了し、`npm run test:analysis` 全体もエラーなく終了する。

5. commit:
```
git add analysis/helpers/vault/schedule.mjs analysis/test/vault-schedule.test.mjs
git commit -m "$(cat <<'EOF'
feat(vault): add Node schedule event append/update/delete writers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 6 完了

---

## Task 7: Node側 学習計画のパース/フォーマット/ID採番 (`analysis/helpers/vault/plan.mjs`)

**Files:**
- Create: `analysis/helpers/vault/plan.mjs`
- Create: `analysis/test/vault-plan.test.mjs`
- Modify: `src/lib/vault/plan.test.ts`（TS版・Node版のparityテストを追加。Node実装が揃う本Taskの末尾で行う）

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`（`./read-write.mjs`）
- Produces:
  ```js
  export function parsePlanBlocks(body);
  export function formatPlanBlockLine(block);
  export function nextPlanId(blocks);
  ```

### ステップ

1. 失敗するテストを書く。`analysis/test/vault-plan.test.mjs` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePlanBlocks, formatPlanBlockLine, nextPlanId } from '../helpers/vault/plan.mjs';

// 共有フィクスチャ(analysis/test/fixtures/study-plan.md)を読む。
// src/lib/vault/plan.test.ts も同じファイルを読む
// (契約: TS版とNode版でパース結果を完全一致させる。フィクスチャのコピペ事故を構造的に防ぐ)。
const PLAN_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), 'analysis/test/fixtures/study-plan.md'),
  'utf8'
);

test('parsePlanBlocks parses blocks in the fixed key order, memo can be empty', () => {
  assert.deepEqual(parsePlanBlocks(PLAN_FIXTURE_BODY), [
    { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文演習' },
    { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' },
  ]);
});

test('parsePlanBlocks returns [] when there are no block lines', () => {
  assert.deepEqual(parsePlanBlocks('## 計画\n'), []);
});

test('formatPlanBlockLine formats a block with empty memo', () => {
  assert.equal(
    formatPlanBlockLine({ id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' }),
    '- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo='
  );
});

test('nextPlanId returns p-<max+1>, and p-1 when there are no blocks', () => {
  assert.equal(nextPlanId([]), 'p-1');
  assert.equal(nextPlanId(parsePlanBlocks(PLAN_FIXTURE_BODY)), 'p-3');
});

test('formatPlanBlockLine throws when a field value contains the " | " delimiter', () => {
  assert.throws(() =>
    formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文 | 演習' })
  );
});

test('formatPlanBlockLine throws when a field value contains a newline', () => {
  assert.throws(() =>
    formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文\n演習' })
  );
});
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `Cannot find module '../helpers/vault/plan.mjs'` 相当で6件が失敗する。

3. 最小実装。`analysis/helpers/vault/plan.mjs` を新規作成:

```js
import { readVaultFile, writeVaultFile } from './read-write.mjs';

const PREFIX = '- ';

function assertNoDelimiters(value, field) {
  if (value.includes(' | ') || value.includes('\n')) {
    throw new Error(`${field} must not contain " | " or a newline: ${value}`);
  }
}

export function parsePlanBlocks(body) {
  const blocks = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith(PREFIX)) continue;
    const fields = {};
    for (const part of line.slice(PREFIX.length).split(' | ')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.start || !fields.end || !fields.subject || !fields.status) continue;
    blocks.push({
      id: fields.id,
      start: fields.start,
      end: fields.end,
      subject: fields.subject,
      status: fields.status,
      memo: fields.memo ?? '',
    });
  }
  return blocks;
}

export function formatPlanBlockLine(block) {
  assertNoDelimiters(block.id, 'id');
  assertNoDelimiters(block.start, 'start');
  assertNoDelimiters(block.end, 'end');
  assertNoDelimiters(block.subject, 'subject');
  assertNoDelimiters(block.status, 'status');
  assertNoDelimiters(block.memo, 'memo');
  return `${PREFIX}id=${block.id} | start=${block.start} | end=${block.end} | subject=${block.subject} | status=${block.status} | memo=${block.memo}`;
}

export function nextPlanId(blocks) {
  const max = blocks.reduce((acc, block) => {
    const m = /^p-(\d+)$/.exec(block.id);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `p-${max + 1}`;
}
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-plan.test.mjs` が `# pass 6` で完了する。

5. parityテストを追加する(I11-2対策)。`src/lib/vault/plan.test.ts` の末尾に追加:

```ts
describe("TS/Node parity", () => {
  it("parsePlanBlocks produces the same structure in TS and Node", async () => {
    const nodeModule = (await import(
      /* @vite-ignore */ path.join(process.cwd(), "analysis/helpers/vault/plan.mjs")
    )) as { parsePlanBlocks: typeof parsePlanBlocks };
    const tsResult = parsePlanBlocks(PLAN_FIXTURE_BODY);
    const nodeResult = nodeModule.parsePlanBlocks(PLAN_FIXTURE_BODY);
    expect(JSON.stringify(nodeResult)).toBe(JSON.stringify(tsResult));
  });
});
```

6. 成功確認:
```
npx vitest run src/lib/vault/plan.test.ts
```
期待する出力: `Test Files 1 passed`, `Tests 9 passed`(Task 3完了時点の8件 + 本Taskで追加した1件のparityテスト)。

7. commit:
```
git add analysis/helpers/vault/plan.mjs analysis/test/vault-plan.test.mjs src/lib/vault/plan.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Node study-plan block parser/formatter/id allocator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 7 完了

---

## Task 8: Node側 学習計画のライタ (`plan.mjs` 拡張)

**Files:**
- Modify: `analysis/helpers/vault/plan.mjs`
- Modify: `analysis/test/vault-plan.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`（`./read-write.mjs`）
- Produces:
  ```js
  export async function appendPlanBlock(date, block);
  export async function updatePlanBlock(date, id, patch);
  export async function deletePlanBlock(date, id);
  ```

### ステップ

1. 失敗するテストを追記する。`analysis/test/vault-plan.test.mjs` の末尾に追加:

```js
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendPlanBlock, updatePlanBlock, deletePlanBlock } from '../helpers/vault/plan.mjs';

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-plan-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('appendPlanBlock creates plans/<date>.md when it does not exist', withVault(async (dir) => {
  await appendPlanBlock('2026-07-26', { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文演習' });
  const raw = await readFile(path.join(dir, 'plans', '2026-07-26.md'), 'utf8');
  assert.ok(raw.includes('## 計画'));
  assert.ok(raw.includes('- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=長文演習'));
}));

test('appendPlanBlock appends a second block without disturbing the first', withVault(async (dir) => {
  await appendPlanBlock('2026-07-26', { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '' });
  await appendPlanBlock('2026-07-26', { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'planned', memo: '' });
  const raw = await readFile(path.join(dir, 'plans', '2026-07-26.md'), 'utf8');
  assert.equal(parsePlanBlocks(raw.split('---\n').pop()).length, 2);
}));

test('updatePlanBlock rewrites only the target line', withVault(async (dir) => {
  await appendPlanBlock('2026-07-26', { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '' });
  await appendPlanBlock('2026-07-26', { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'planned', memo: '' });

  await updatePlanBlock('2026-07-26', 'p-1', { status: 'done' });

  const raw = await readFile(path.join(dir, 'plans', '2026-07-26.md'), 'utf8');
  assert.ok(raw.includes('- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=done | memo='));
  assert.ok(raw.includes('- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=planned | memo='));
}));

test('deletePlanBlock removes only the target line', withVault(async (dir) => {
  await appendPlanBlock('2026-07-26', { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '' });
  await appendPlanBlock('2026-07-26', { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'planned', memo: '' });

  await deletePlanBlock('2026-07-26', 'p-1');

  const raw = await readFile(path.join(dir, 'plans', '2026-07-26.md'), 'utf8');
  assert.ok(!raw.includes('p-1'));
  assert.ok(raw.includes('p-2'));
}));
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `appendPlanBlock is not a function` 等で新規4件が失敗する。

3. 最小実装。`analysis/helpers/vault/plan.mjs` の末尾に追加:

```js
const HEADING = '## 計画';

function planRelPath(date) {
  return `plans/${date}.md`;
}

async function readPlanFile(date) {
  try {
    return await readVaultFile(planRelPath(date));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { frontmatter: { type: 'study-plan', date, schema_version: 1 }, body: `${HEADING}\n` };
    }
    throw error;
  }
}

function locateLineIndex(lines, id) {
  const marker = `${PREFIX}id=${id} |`;
  return lines.findIndex((line) => line.startsWith(marker));
}

export async function appendPlanBlock(date, block) {
  const { frontmatter, body } = await readPlanFile(date);
  const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
  const withHeading = trimmed.includes(HEADING) ? trimmed : `${trimmed ? `${trimmed}\n` : ''}${HEADING}`;
  const nextBody = `${withHeading}\n${formatPlanBlockLine(block)}\n`;
  await writeVaultFile(planRelPath(date), { ...frontmatter, updated: new Date().toISOString() }, nextBody);
}

export async function updatePlanBlock(date, id, patch) {
  const { frontmatter, body } = await readPlanFile(date);
  const blocks = parsePlanBlocks(body);
  const current = blocks.find((block) => block.id === id);
  if (!current) throw new Error(`plan block not found: ${id}`);
  const updated = { ...current, ...patch };
  const lines = body.split('\n');
  const lineIndex = locateLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`plan block line not found: ${id}`);
  lines[lineIndex] = formatPlanBlockLine(updated);
  await writeVaultFile(planRelPath(date), { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}

export async function deletePlanBlock(date, id) {
  const { frontmatter, body } = await readPlanFile(date);
  const lines = body.split('\n');
  const lineIndex = locateLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`plan block line not found: ${id}`);
  lines.splice(lineIndex, 1);
  await writeVaultFile(planRelPath(date), { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-plan.test.mjs` が `# pass 10` で完了し、`npm run test:analysis` 全体もエラーなく終了する。

5. commit:
```
git add analysis/helpers/vault/plan.mjs analysis/test/vault-plan.test.mjs
git commit -m "$(cat <<'EOF'
feat(vault): add Node study-plan append/update/delete writers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 8 完了

---

## Task 9: Node側バレル更新 (`analysis/helpers/vault/index.mjs`)

**Files:**
- Modify: `analysis/helpers/vault/index.mjs`
- Modify: `analysis/test/vault-index.test.mjs`

**Interfaces:**
- Consumes: Task 5〜8の全export
- Produces: `analysis/helpers/vault/index.mjs` から予定・学習計画の関数を再エクスポート

### ステップ

1. 失敗するテストを追記する。`analysis/test/vault-index.test.mjs` の末尾のアサーション群に追加:

```js
  assert.equal(typeof vault.parseScheduleEvents, 'function');
  assert.equal(typeof vault.formatScheduleEventLine, 'function');
  assert.equal(typeof vault.nextEventId, 'function');
  assert.equal(typeof vault.appendScheduleEvent, 'function');
  assert.equal(typeof vault.updateScheduleEvent, 'function');
  assert.equal(typeof vault.deleteScheduleEvent, 'function');
  assert.equal(typeof vault.parsePlanBlocks, 'function');
  assert.equal(typeof vault.formatPlanBlockLine, 'function');
  assert.equal(typeof vault.nextPlanId, 'function');
  assert.equal(typeof vault.appendPlanBlock, 'function');
  assert.equal(typeof vault.updatePlanBlock, 'function');
  assert.equal(typeof vault.deletePlanBlock, 'function');
```

(既存の `assert.equal(typeof vault.clearCorrections, 'function');` の直後、`});` の前に追加する)

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `vault.parseScheduleEvents is not a function` 等で失敗する。

3. 最小実装。`analysis/helpers/vault/index.mjs` の末尾に追加:

```js
export { parseScheduleEvents, formatScheduleEventLine, nextEventId, appendScheduleEvent, updateScheduleEvent, deleteScheduleEvent } from './schedule.mjs';
export { parsePlanBlocks, formatPlanBlockLine, nextPlanId, appendPlanBlock, updatePlanBlock, deletePlanBlock } from './plan.mjs';
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-index.test.mjs` が成功し、`npm run test:analysis` 全体もエラーなく終了する。

5. commit:
```
git add analysis/helpers/vault/index.mjs analysis/test/vault-index.test.mjs
git commit -m "$(cat <<'EOF'
feat(vault): re-export schedule and plan writers from the Node vault barrel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 9 完了

---

## Task 10: CLIラッパー 予定 (`add-event.mjs` / `edit-event.mjs` / `delete-event.mjs`)

**Files:**
- Create: `analysis/helpers/add-event.mjs`
- Create: `analysis/helpers/edit-event.mjs`
- Create: `analysis/helpers/delete-event.mjs`
- Create: `analysis/test/vault-event-cli-wrappers.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `parseScheduleEvents`, `nextEventId`, `appendScheduleEvent`, `updateScheduleEvent`, `deleteScheduleEvent`（`./vault/index.mjs`）, `printJson`（`./lib.mjs`）
- Produces: `run(argv)` を各ファイルからexportするCLIラッパー3本

### ステップ

1. 失敗するテストを書く。`analysis/test/vault-event-cli-wrappers.test.mjs` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-event-cli-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('add-event.mjs allocates ev-1 and appends the event', withVault(async () => {
  const { run } = await import('../helpers/add-event.mjs');
  const result = await run(['mock_exam', '第2回模試', '2026-08-01']);
  assert.equal(result.id, 'ev-1');
  assert.equal(result.title, '第2回模試');
  assert.equal(result.done, false);

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('schedule.md');
  assert.ok(body.includes('id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01'));
}));

test('edit-event.mjs applies a JSON patch to the target event', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-event.mjs');
  await addRun(['mock_exam', '第2回模試', '2026-08-01']);
  const { run: editRun } = await import('../helpers/edit-event.mjs');
  await editRun(['ev-1', JSON.stringify({ due: '2026-08-15' })]);

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('schedule.md');
  assert.ok(body.includes('due=2026-08-15'));
}));

test('delete-event.mjs removes the target event', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-event.mjs');
  await addRun(['mock_exam', '第2回模試', '2026-08-01']);
  const { run: deleteRun } = await import('../helpers/delete-event.mjs');
  await deleteRun(['ev-1']);

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('schedule.md');
  assert.ok(!body.includes('ev-1'));
}));

test('add-event.mjs rejects an invalid kind', withVault(async () => {
  const { run } = await import('../helpers/add-event.mjs');
  await assert.rejects(() => run(['invalid_kind', '第2回模試', '2026-08-01']));
}));

test('add-event.mjs rejects a malformed due date', withVault(async () => {
  const { run } = await import('../helpers/add-event.mjs');
  await assert.rejects(() => run(['mock_exam', '第2回模試', '2026/08/01']));
}));

test('edit-event.mjs rejects a patch with an invalid kind', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-event.mjs');
  await addRun(['mock_exam', '第2回模試', '2026-08-01']);
  const { run: editRun } = await import('../helpers/edit-event.mjs');
  await assert.rejects(() => editRun(['ev-1', JSON.stringify({ kind: 'invalid_kind' })]));
}));

test('edit-event.mjs rejects a patch with a malformed due date', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-event.mjs');
  await addRun(['mock_exam', '第2回模試', '2026-08-01']);
  const { run: editRun } = await import('../helpers/edit-event.mjs');
  await assert.rejects(() => editRun(['ev-1', JSON.stringify({ due: '2026/08/15' })]));
}));
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `Cannot find module '../helpers/add-event.mjs'` 相当で7件が失敗する。

3. 最小実装。3ファイルを新規作成する。CLIラッパーの入口で `kind`/`due` を検査する(I5対策。契約の値検査要件)。

`analysis/helpers/add-event.mjs`:
```js
#!/usr/bin/env node
// vault/schedule.md に予定を追記する。契約3b appendScheduleEvent のCLIラッパー。
// 使い方: node analysis/helpers/add-event.mjs <kind> <title> <due>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

const SCHEDULE_KINDS = ['assignment', 'application', 'mock_exam', 'exam', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function run([kind, title, due]) {
  if (!kind || !title || !due) {
    throw new Error('使い方: node helpers/add-event.mjs <kind> <title> <due>');
  }
  if (!SCHEDULE_KINDS.includes(kind)) {
    throw new Error(`kind は次のいずれかである必要があります: ${SCHEDULE_KINDS.join(', ')}`);
  }
  if (!DATE_RE.test(due)) {
    throw new Error('due は YYYY-MM-DD 形式である必要があります');
  }
  const { readVaultFile, parseScheduleEvents, nextEventId, appendScheduleEvent } = await import('./vault/index.mjs');
  let body = '';
  try {
    ({ body } = await readVaultFile('schedule.md'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const id = nextEventId(parseScheduleEvents(body));
  const event = { id, kind, title, due, done: false };
  await appendScheduleEvent(event);
  return event;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

`analysis/helpers/edit-event.mjs`:
```js
#!/usr/bin/env node
// vault/schedule.md の該当idの予定行のみ書き換える。契約3b updateScheduleEvent のCLIラッパー。
// 使い方: node analysis/helpers/edit-event.mjs <id> <patchJSON>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

const SCHEDULE_KINDS = ['assignment', 'application', 'mock_exam', 'exam', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function run([id, patchArg]) {
  if (!id || !patchArg) {
    throw new Error('使い方: node helpers/edit-event.mjs <id> <patchJSON>');
  }
  const patch = JSON.parse(patchArg);
  if (patch.kind !== undefined && !SCHEDULE_KINDS.includes(patch.kind)) {
    throw new Error(`kind は次のいずれかである必要があります: ${SCHEDULE_KINDS.join(', ')}`);
  }
  if (patch.due !== undefined && !DATE_RE.test(patch.due)) {
    throw new Error('due は YYYY-MM-DD 形式である必要があります');
  }
  const { updateScheduleEvent } = await import('./vault/index.mjs');
  await updateScheduleEvent(id, patch);
  return { id, patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

`analysis/helpers/delete-event.mjs`:
```js
#!/usr/bin/env node
// vault/schedule.md の該当idの予定行のみ削除する。契約3b deleteScheduleEvent のCLIラッパー。
// 使い方: node analysis/helpers/delete-event.mjs <id>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export async function run([id]) {
  if (!id) {
    throw new Error('使い方: node helpers/delete-event.mjs <id>');
  }
  const { deleteScheduleEvent } = await import('./vault/index.mjs');
  await deleteScheduleEvent(id);
  return { id, deleted: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-event-cli-wrappers.test.mjs` が `# pass 7` で完了する。

5. commit:
```
git add analysis/helpers/add-event.mjs analysis/helpers/edit-event.mjs analysis/helpers/delete-event.mjs analysis/test/vault-event-cli-wrappers.test.mjs
git commit -m "$(cat <<'EOF'
feat(vault): add add/edit/delete-event CLI wrappers for dialogue-driven schedule writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 10 完了

---

## Task 11: CLIラッパー 学習計画 (`add-plan-block.mjs` / `edit-plan-block.mjs` / `delete-plan-block.mjs`)

**Files:**
- Create: `analysis/helpers/add-plan-block.mjs`
- Create: `analysis/helpers/edit-plan-block.mjs`
- Create: `analysis/helpers/delete-plan-block.mjs`
- Create: `analysis/test/vault-plan-cli-wrappers.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `parsePlanBlocks`, `nextPlanId`, `appendPlanBlock`, `updatePlanBlock`, `deletePlanBlock`（`./vault/index.mjs`）, `printJson`（`./lib.mjs`）
- Produces: `run(argv)` を各ファイルからexportするCLIラッパー3本

### ステップ

1. 失敗するテストを書く。`analysis/test/vault-plan-cli-wrappers.test.mjs` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-plan-cli-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('add-plan-block.mjs allocates p-1 and appends the block', withVault(async () => {
  const { run } = await import('../helpers/add-plan-block.mjs');
  const result = await run(['2026-07-26', '09:00', '10:30', '英語R', '長文演習']);
  assert.equal(result.id, 'p-1');
  assert.equal(result.status, 'planned');

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('plans/2026-07-26.md');
  assert.ok(body.includes('id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=長文演習'));
}));

test('add-plan-block.mjs accepts an empty memo', withVault(async () => {
  const { run } = await import('../helpers/add-plan-block.mjs');
  const result = await run(['2026-07-26', '09:00', '10:30', '英語R', '']);
  assert.equal(result.memo, '');
}));

test('edit-plan-block.mjs applies a JSON patch to the target block', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-plan-block.mjs');
  await addRun(['2026-07-26', '09:00', '10:30', '英語R', '']);
  const { run: editRun } = await import('../helpers/edit-plan-block.mjs');
  await editRun(['2026-07-26', 'p-1', JSON.stringify({ status: 'done' })]);

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('plans/2026-07-26.md');
  assert.ok(body.includes('status=done'));
}));

test('delete-plan-block.mjs removes the target block', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-plan-block.mjs');
  await addRun(['2026-07-26', '09:00', '10:30', '英語R', '']);
  const { run: deleteRun } = await import('../helpers/delete-plan-block.mjs');
  await deleteRun(['2026-07-26', 'p-1']);

  const { readVaultFile } = await import('../helpers/vault/index.mjs');
  const { body } = await readVaultFile('plans/2026-07-26.md');
  assert.ok(!body.includes('p-1'));
}));

test('add-plan-block.mjs rejects an invalid subject', withVault(async () => {
  const { run } = await import('../helpers/add-plan-block.mjs');
  await assert.rejects(() => run(['2026-07-26', '09:00', '10:30', '存在しない科目', '']));
}));

test('add-plan-block.mjs rejects a malformed time', withVault(async () => {
  const { run } = await import('../helpers/add-plan-block.mjs');
  await assert.rejects(() => run(['2026-07-26', '9:00', '10:30', '英語R', '']));
}));

test('add-plan-block.mjs rejects end <= start', withVault(async () => {
  const { run } = await import('../helpers/add-plan-block.mjs');
  await assert.rejects(() => run(['2026-07-26', '10:30', '09:00', '英語R', '']));
  await assert.rejects(() => run(['2026-07-26', '09:00', '09:00', '英語R', '']));
}));

test('edit-plan-block.mjs rejects a patch with an invalid subject', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-plan-block.mjs');
  await addRun(['2026-07-26', '09:00', '10:30', '英語R', '']);
  const { run: editRun } = await import('../helpers/edit-plan-block.mjs');
  await assert.rejects(() => editRun(['2026-07-26', 'p-1', JSON.stringify({ subject: '存在しない科目' })]));
}));

test('edit-plan-block.mjs rejects a patch that makes end <= start', withVault(async () => {
  const { run: addRun } = await import('../helpers/add-plan-block.mjs');
  await addRun(['2026-07-26', '09:00', '10:30', '英語R', '']);
  const { run: editRun } = await import('../helpers/edit-plan-block.mjs');
  await assert.rejects(() => editRun(['2026-07-26', 'p-1', JSON.stringify({ start: '11:00' })]));
}));
```

2. 失敗確認:
```
npm run test:analysis
```
期待する出力: `Cannot find module '../helpers/add-plan-block.mjs'` 相当で9件が失敗する。

3. 最小実装。3ファイルを新規作成する。CLIラッパーの入口で `subject`/`start`/`end`(`end > start`を含む)/`status` を検査する
   (I5対策。契約 §1c に定義されている `end > start` 制約は、これまでコードで強制されていなかった)。

`analysis/helpers/add-plan-block.mjs`:
```js
#!/usr/bin/env node
// vault/plans/<date>.md に学習計画ブロックを追記する。契約3c appendPlanBlock のCLIラッパー。
// 使い方: node analysis/helpers/add-plan-block.mjs <date> <start> <end> <subject> <memo>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

const SUBJECTS = ['英語R', '英語L', '現代文', '古文', '漢文', '数学IA', '数学2BC', '化学基礎', '地学基礎', '地理', '政治経済', '情報', '小論文'];
const TIME_RE = /^\d{2}:\d{2}$/;

export async function run([date, start, end, subject, memo]) {
  if (!date || !start || !end || !subject || memo === undefined) {
    throw new Error('使い方: node helpers/add-plan-block.mjs <date> <start> <end> <subject> <memo>');
  }
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
    throw new Error('start/end は HH:MM 形式である必要があります');
  }
  if (!(end > start)) {
    throw new Error('end は start より後である必要があります');
  }
  if (!SUBJECTS.includes(subject)) {
    throw new Error(`subject は次のいずれかである必要があります: ${SUBJECTS.join(', ')}`);
  }
  const { readVaultFile, parsePlanBlocks, nextPlanId, appendPlanBlock } = await import('./vault/index.mjs');
  let body = '';
  try {
    ({ body } = await readVaultFile(`plans/${date}.md`));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const id = nextPlanId(parsePlanBlocks(body));
  const block = { id, start, end, subject, status: 'planned', memo };
  await appendPlanBlock(date, block);
  return block;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

`analysis/helpers/edit-plan-block.mjs`:
```js
#!/usr/bin/env node
// vault/plans/<date>.md の該当idの計画行のみ書き換える。契約3c updatePlanBlock のCLIラッパー。
// 使い方: node analysis/helpers/edit-plan-block.mjs <date> <id> <patchJSON>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

const SUBJECTS = ['英語R', '英語L', '現代文', '古文', '漢文', '数学IA', '数学2BC', '化学基礎', '地学基礎', '地理', '政治経済', '情報', '小論文'];
const TIME_RE = /^\d{2}:\d{2}$/;
const PLAN_STATUSES = ['planned', 'done', 'skipped'];

export async function run([date, id, patchArg]) {
  if (!date || !id || !patchArg) {
    throw new Error('使い方: node helpers/edit-plan-block.mjs <date> <id> <patchJSON>');
  }
  const patch = JSON.parse(patchArg);
  if (patch.start !== undefined && !TIME_RE.test(patch.start)) {
    throw new Error('start は HH:MM 形式である必要があります');
  }
  if (patch.end !== undefined && !TIME_RE.test(patch.end)) {
    throw new Error('end は HH:MM 形式である必要があります');
  }
  if (patch.subject !== undefined && !SUBJECTS.includes(patch.subject)) {
    throw new Error(`subject は次のいずれかである必要があります: ${SUBJECTS.join(', ')}`);
  }
  if (patch.status !== undefined && !PLAN_STATUSES.includes(patch.status)) {
    throw new Error(`status は次のいずれかである必要があります: ${PLAN_STATUSES.join(', ')}`);
  }
  const { readVaultFile, parsePlanBlocks, updatePlanBlock } = await import('./vault/index.mjs');
  if (patch.start !== undefined || patch.end !== undefined) {
    const { body } = await readVaultFile(`plans/${date}.md`);
    const current = parsePlanBlocks(body).find((block) => block.id === id);
    if (!current) throw new Error(`plan block not found: ${id}`);
    const nextStart = patch.start ?? current.start;
    const nextEnd = patch.end ?? current.end;
    if (!(nextEnd > nextStart)) {
      throw new Error('end は start より後である必要があります');
    }
  }
  await updatePlanBlock(date, id, patch);
  return { date, id, patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

`analysis/helpers/delete-plan-block.mjs`:
```js
#!/usr/bin/env node
// vault/plans/<date>.md の該当idの計画行のみ削除する。契約3c deletePlanBlock のCLIラッパー。
// 使い方: node analysis/helpers/delete-plan-block.mjs <date> <id>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export async function run([date, id]) {
  if (!date || !id) {
    throw new Error('使い方: node helpers/delete-plan-block.mjs <date> <id>');
  }
  const { deletePlanBlock } = await import('./vault/index.mjs');
  await deletePlanBlock(date, id);
  return { date, id, deleted: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

4. 成功確認:
```
npm run test:analysis
```
期待する出力: `vault-plan-cli-wrappers.test.mjs` が `# pass 9` で完了し、`npm run test:analysis` 全体もエラーなく終了する。

5. commit:
```
git add analysis/helpers/add-plan-block.mjs analysis/helpers/edit-plan-block.mjs analysis/helpers/delete-plan-block.mjs analysis/test/vault-plan-cli-wrappers.test.mjs
git commit -m "$(cat <<'EOF'
feat(vault): add add/edit/delete-plan-block CLI wrappers for dialogue-driven plan writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 11 完了

---

## Task 12: Web Server Action(予定の完了トグル)

**Files:**
- Create: `src/app/schedule/_lib/actions.ts`

**Interfaces:**
- Consumes: `setScheduleEventDone`（`@/lib/vault`）
- Produces:
  ```ts
  export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void>;
  ```

このTaskはServer Actionのみで、Server Component経由のE2Eで検証する(Task 14で使用、Task 16のE2Eで動作確認)ため、専用のvitestテストは書かず、`npx tsc --noEmit` で型検証する。

### ステップ

1. `src/app/schedule/_lib/actions.ts` を新規作成:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { setScheduleEventDone } from "@/lib/vault";

export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void> {
  await setScheduleEventDone(input.id, input.done);
  revalidatePath("/schedule");
}
```

2. 検証コマンド:
```
npx tsc --noEmit
```
期待する結果: エラーなしで終了する(この時点では `src/app/schedule/page.tsx` は未更新のため、`actions.ts` はまだどこからもimportされていないが、型エラーは出ない)。

3. commit:
```
git add src/app/schedule/_lib/actions.ts
git commit -m "$(cat <<'EOF'
feat(schedule): add Server Action to toggle a schedule event's done checkbox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 12 完了

---

## Task 13: Web `/schedule` をvault読みビューアへ書き換え

**Files:**
- Create: `src/app/schedule/schedule-event-toggle.tsx`
- Modify: `src/app/schedule/page.tsx`（全面書き換え）

**Interfaces:**
- Consumes: `readSchedule`, `readPlan`, `type ScheduleEvent`, `type PlanBlock`（`@/lib/vault`）、`toggleScheduleEventDone`（`./_lib/actions`）、`formatLocalDate`/`addDays`（`@/lib/date`）、`EVENT_KIND_LABELS`/`EVENT_KIND_COLORS`/`daysUntil`（`@/lib/constants`）
- Produces: `/schedule` ページ本体(予定一覧+当日から7日分の学習計画。予定の完了チェックボックスのみタップ可)

このTaskはページ全文の書き換えのためTDDに馴染まない。変更後の全文を掲載し、`npx tsc --noEmit` と `npm run lint` で検証する。動作確認はTask 16のE2Eで行う。

### ステップ

1. `src/app/schedule/schedule-event-toggle.tsx` を新規作成:

```tsx
"use client";

import { useState, useTransition } from "react";
import Checkbox from "@mui/material/Checkbox";
import { toggleScheduleEventDone } from "./_lib/actions";

export default function ScheduleEventToggle({
  id,
  title,
  initialDone,
}: {
  id: string;
  title: string;
  initialDone: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [isPending, startTransition] = useTransition();

  return (
    <Checkbox
      size="small"
      checked={done}
      disabled={isPending}
      inputProps={{ "aria-label": `${title}を完了にする` }}
      onChange={() => {
        const next = !done;
        setDone(next);
        startTransition(async () => {
          try {
            await toggleScheduleEventDone({ id, done: next });
          } catch {
            setDone(!next);
          }
        });
      }}
    />
  );
}
```

2. `src/app/schedule/page.tsx` を全面書き換え:

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import { readSchedule, readPlan, type ScheduleEvent, type PlanBlock } from "@/lib/vault";
import { addDays, formatLocalDate } from "@/lib/date";
import { EVENT_KIND_COLORS, EVENT_KIND_LABELS, daysUntil } from "@/lib/constants";
import ScheduleEventToggle from "./schedule-event-toggle";

export const dynamic = "force-dynamic";

const PLAN_WINDOW_DAYS = 7;

export default async function SchedulePage() {
  const today = formatLocalDate(new Date());
  const planDates = Array.from({ length: PLAN_WINDOW_DAYS }, (_, i) => addDays(today, i));

  const [events, planLists] = await Promise.all([
    readSchedule(),
    Promise.all(planDates.map((date) => readPlan(date))),
  ]);

  const plansByDate: { date: string; blocks: PlanBlock[] }[] = planDates.map((date, i) => ({
    date,
    blocks: planLists[i],
  }));

  const upcoming = events.filter((e) => !e.done).sort((a, b) => a.due.localeCompare(b.due));
  const completed = events.filter((e) => e.done).sort((a, b) => b.due.localeCompare(a.due));

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        予定
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          締切リスト
        </Typography>
        {upcoming.length === 0 ? (
          <Typography variant="body2">予定はありません</Typography>
        ) : (
          <Stack spacing={1}>
            {upcoming.map((event: ScheduleEvent) => {
              const d = daysUntil(event.due);
              const urgent = d <= 7;
              return (
                <Stack
                  key={event.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ p: 1, borderRadius: 1.5, backgroundColor: urgent ? "#fdecea" : "transparent" }}
                >
                  <ScheduleEventToggle id={event.id} title={event.title} initialDone={event.done} />
                  <Chip
                    size="small"
                    label={EVENT_KIND_LABELS[event.kind] ?? event.kind}
                    sx={{ backgroundColor: EVENT_KIND_COLORS[event.kind] ?? "#999", color: "#fff" }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {event.title}
                    </Typography>
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
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            完了済み（チェックを外すと復元）
          </Typography>
          <Stack spacing={0.5}>
            {completed.map((event) => (
              <Stack key={event.id} direction="row" alignItems="center" spacing={1}>
                <ScheduleEventToggle id={event.id} title={event.title} initialDone={event.done} />
                <Typography variant="body2" sx={{ flex: 1, textDecoration: "line-through", color: "text.secondary" }}>
                  {event.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {event.due}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          学習計画（今日から{PLAN_WINDOW_DAYS}日間）
        </Typography>
        <Stack spacing={1.5}>
          {plansByDate.map(({ date, blocks }) => (
            <Box key={date}>
              <Typography variant="caption" color="text.secondary">
                {date}
                {date === today ? "（今日）" : ""}
              </Typography>
              {blocks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  計画はありません
                </Typography>
              ) : (
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {blocks.map((block) => (
                    <Stack
                      key={block.id}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ opacity: block.status === "skipped" ? 0.5 : 1 }}
                    >
                      <Chip size="small" label={`${block.start}-${block.end}`} />
                      <Chip size="small" label={block.subject} />
                      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                        {block.status === "done" ? "完了" : block.status === "skipped" ? "未実施" : "予定"}
                        {block.memo ? `・${block.memo}` : ""}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
```

3. 検証:
```
npx tsc --noEmit && npm run lint
```
期待する結果: 両方ともエラーなしで終了する。

4. commit:
```
git add src/app/schedule/page.tsx src/app/schedule/schedule-event-toggle.tsx
git commit -m "$(cat <<'EOF'
feat(schedule): rebuild /schedule as a vault-reading viewer with tap-to-complete events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 13 完了

---

## Task 14: `docs/study-dialogue.md` に予定フロー・学習計画フローを加筆

**Files:**
- Modify: `docs/study-dialogue.md`（計画1が作成した骨格に追記する前提。ファイルが存在しない状態でこのTaskを実行する場合は、計画1の完了を待つ）

**Interfaces:** なし(プロンプト文書)

このTaskはプロンプト文書のためTDDに馴染まない。加筆内容全文を掲載し、検証は目視確認とする(`analysis/nightly.md` と同様、自動テスト対象外)。

### ステップ

1. `docs/study-dialogue.md` の末尾(計画1が書いた「記録の編集・削除フロー」セクションの後)に、以下を追記する:

```md
## 予定フロー

「予定に追加して」「予定確認して」などと言われたら、このフローに従う。

### 予定を追加する

1. 種別を尋ねる:
   ```
   予定の種類を選んでください。
   1) 課題
   2) 出願
   3) 模試
   4) 本番
   5) その他
   ```
   回答を `assignment` / `application` / `mock_exam` / `exam` / `other` に対応させる。
2. タイトルを尋ねる(自由入力)。` | ` や `=` を含む場合は全角に置換するか、含まない形で言い直してもらう。
3. 締切日(`YYYY-MM-DD`)を尋ねる。
4. `node analysis/helpers/add-event.mjs "<kind>" "<title>" "<due>"` を実行し、
   `vault/schedule.md` に追記する。`STUDY_AI_VAULT_DIR` が未設定の場合はエラーが
   その場で表示されるので、書き込みが行われなかった旨をそのまま伝える。
5. 追加した内容(種別・タイトル・締切)を要約提示する。

### 予定を一覧・変更・削除する

1. `node analysis/helpers/read-vault-file.mjs schedule.md` を実行し、現在の予定を
   id付きで提示する(完了済みも含めて一覧する)。
2. 「どの予定を」「どう変更するか(タイトル/締切/種別の変更、または削除)」を尋ねる。
3. 変更の場合: `node analysis/helpers/edit-event.mjs "<id>" '{"title":"...","due":"...","kind":"..."}'`
   のように、変更したいフィールドだけを含むJSONパッチを渡して実行する。
4. 削除の場合: `node analysis/helpers/delete-event.mjs "<id>"` を実行する。
5. 結果を提示する(削除した場合は削除した予定のタイトルを明示する)。

**予定の完了/未完了の切り替えはWebの `/schedule` から行う運用とする**(対話では
新規追加・タイトルや締切の変更・削除のみを扱う)。

## 学習計画フロー

「明日の計画立てて」などと言われたら、このフローに従う。

### 計画を立てる

1. 対象日を確認する(既定は翌日。「今日」「明後日」等の指定があればそれに従う)。
2. ブロックを1つずつ聞く(複数ブロックまとめて聞いてよい):
   - 開始時刻(`HH:MM`)
   - 終了時刻(`HH:MM`、開始時刻より後であること)
   - 科目(13科目から番号選択)
   - メモ(任意、スキップ可)
3. `node analysis/helpers/add-plan-block.mjs "<date>" "<start>" "<end>" "<subject>" "<memo>"`
   を実行し、`vault/plans/<date>.md` に追記する(メモが無ければ空文字 `""` を渡す)。
4. 複数ブロックがあれば2〜3を繰り返す。
5. 立てた計画(日付・時刻・科目)を要約提示する。

**複数日に同じ計画を入れたい場合**(繰り返し設定は持たない)、対象の日ごとに手順1〜3を
繰り返し、各日のファイルに実体行として書く。

### 実行状況を更新する

1. 対象日を確認する。
2. `node analysis/helpers/read-vault-file.mjs plans/<date>.md` を実行し、対象日の
   計画をid付きで提示する。
3. どのidを `done`(完了)/`skipped`(未実施)にするか尋ねる。
4. `node analysis/helpers/edit-plan-block.mjs "<date>" "<id>" '{"status":"done"}'`
   のように実行する。
5. 結果を提示する。
```

2. 検証: 目視で以下を確認する。
   - 番号選択+自由入力のプレーンテキスト形式になっている(`AskUserQuestion` 等のツール名に依存していない)。
   - 呼び出すCLIラッパー名(`add-event.mjs`/`edit-event.mjs`/`delete-event.mjs`/`add-plan-block.mjs`/`edit-plan-block.mjs`/`delete-plan-block.mjs`)が契約3節の命名と一致している。
   - 契約0の「書き込み前に`STUDY_AI_VAULT_DIR`を解決」「未設定なら書き込みを行わない」「最後に要約提示」という共通の前提(計画1が骨格に記載済み)と矛盾しない。

3. commit:
```
git add docs/study-dialogue.md
git commit -m "$(cat <<'EOF'
docs(dialogue): add schedule and study-plan dialogue flows to study-dialogue.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 14 完了

---

## Task 15: E2Eフィクスチャ追加 (`e2e/fixtures/vault/schedule.md` / `plans/`)

**Files:**
- Create: `e2e/fixtures/vault/schedule.md`
- Create: `e2e/fixtures/vault/plans/2026-01-01.md`（日付非依存の静的フィクスチャ。当日以降ウィンドウの外なので `/schedule` には表示されない)

**Interfaces:** なし(静的フィクスチャファイル)

### ステップ

1. `e2e/fixtures/vault/schedule.md` を新規作成:

```md
---
type: schedule
schema_version: 1
updated: 2026-07-24T22:10:00+09:00
---

## 予定
- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01
- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20
```

2. `e2e/fixtures/vault/plans/2026-01-01.md` を新規作成(過去日付。ウィンドウ外であることの確認用):

```md
---
type: study-plan
date: 2026-01-01
schema_version: 1
updated: 2026-01-01T09:00:00+09:00
---

## 計画
- id=p-1 | start=09:00 | end=10:00 | subject=英語R | status=done | memo=元日特訓
```

3. 検証: このTaskはテストを持たない(Task 16で読み込まれて初めて使われる)。ファイルが正しいUTF-8・改行で保存されていることのみ確認する:
```
cat e2e/fixtures/vault/schedule.md
cat e2e/fixtures/vault/plans/2026-01-01.md
```
期待する結果: 上記の内容がそのまま表示される。

4. commit:
```
git add e2e/fixtures/vault/schedule.md e2e/fixtures/vault/plans/2026-01-01.md
git commit -m "$(cat <<'EOF'
test(e2e): add schedule and plan vault fixtures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 15 完了

---

## Task 16: `e2e/extended-flows.spec.ts` 改廃

**Files:**
- Modify: `e2e/extended-flows.spec.ts`（全面書き換え）

**Interfaces:**
- Consumes: Task 13の `/schedule` ページ、Task 15のフィクスチャ

契約 §6 は既存 `e2e/extended-flows.spec.ts` の3件のテストについて**件ごとに担当を固定**している
(自分が壊したテストは自分の計画内で始末する、という原則):

- 1件目「履歴の記録を編集して削除できる」: `/record` へ goto するため、**`/record` を削除する計画1が
  同じファイル内で削除する担当**。本計画のTaskではない。本Task着手時点で計画1が適用済みなら、
  このテストは既にファイルから消えている前提で以下の全文を書く。もしまだ計画1が未適用でこのテストが
  残っている場合は、本Taskで消さず、計画1の適用を待ってから本Taskを実行すること。
- 2件目「繰り返し時間割を作成できる」: `plan_blocks` の繰り返し設定UIを操作するテスト。繰り返しは
  本フェーズのスコープ外であり、Task 13で `/schedule` から該当UIが無くなるため、**本Taskで削除する**。
- 3件目「週の学習時間を保存できる」: **`/stats` の機能テストであり、`/stats` の唯一のE2Eカバレッジ**。
  `/stats` は本フェーズで「変更しない」スコープ。本Taskは2件目の置き換えに集中し、
  **3件目は元の実装のまま一字一句変更せずに残す**(巻き添えで消さない — I3対策)。

このTaskはE2E仕様の全面書き換えのためTDDに馴染まない。変更後の全文を掲載し、`STUDY_AI_VAULT_DIR` をフィクスチャに向けた状態での実行結果を検証する。

**フィクスチャの汚れ対策(I9対策):** 2件目の置き換えである「予定の完了チェックボックスをタップする」テストは
コミット済みの `e2e/fixtures/vault/schedule.md` を実際に書き換える(チェックボックスが `- [x] ` になる)。
`playwright.config.ts` の `webServer` は `STUDY_AI_VAULT_DIR` を環境変数からそのまま継承する構成であり、
本Task側だけでテスト実行前に一時ディレクトリへコピーして向け先を切り替えることはできない
(`webServer` は各テストの `beforeEach` より先に起動しており、`beforeEach` 内で
`process.env.STUDY_AI_VAULT_DIR` を書き換えても既に起動済みのdevサーバプロセスには反映されないため)。
`playwright.config.ts` の変更は本計画のスコープ外とし、代わりに**`afterEach` でフィクスチャの内容を
元の静的な内容(Task 15で定義した内容)に書き戻す**方式にする。これにより、テストを繰り返し実行しても
作業ツリーが汚れたまま残らない。

1. `e2e/extended-flows.spec.ts` を以下の内容で全面書き換え:

```ts
import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const vaultDir = path.join(process.cwd(), "e2e", "fixtures", "vault");
const schedulePath = path.join(vaultDir, "schedule.md");
const plansDir = path.join(vaultDir, "plans");

// Task 15でコミットした e2e/fixtures/vault/schedule.md と同一内容。
// チェックボックスをタップするテストがこのファイルを書き換えるため、
// afterEach でこの内容に書き戻して作業ツリーを汚さない(I9対策)。
const SCHEDULE_FIXTURE = [
  "---",
  "type: schedule",
  "schema_version: 1",
  "updated: 2026-07-24T22:10:00+09:00",
  "---",
  "",
  "## 予定",
  "- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01",
  "- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20",
  "",
].join("\n");

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const today = todayKey();
const todayPlanPath = path.join(plansDir, `${today}.md`);
const TODAY_PLAN_FIXTURE = [
  "---",
  "type: study-plan",
  `date: ${today}`,
  "schema_version: 1",
  "updated: 2026-07-24T22:10:00+09:00",
  "---",
  "",
  "## 計画",
  "- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=E2E計画",
  "",
].join("\n");

// /schedule の学習計画表示ウィンドウ(今日から6日後まで)は実行時の実日付に依存するため、
// plans/<今日の日付>.md はコミットせずテスト実行時に動的生成する
// (e2e/vault-reports.spec.ts の corrections.md 動的書き込みと同じ方式)。
test.beforeEach(async () => {
  await writeFile(schedulePath, SCHEDULE_FIXTURE, "utf-8");
  await mkdir(plansDir, { recursive: true });
  await writeFile(todayPlanPath, TODAY_PLAN_FIXTURE, "utf-8");
});

test.afterEach(async () => {
  // チェックボックスをタップするテストが schedule.md を書き換えるため、コミット済みの
  // 内容に書き戻す(I9対策: 作業ツリーを汚したまま残さない)。
  await writeFile(schedulePath, SCHEDULE_FIXTURE, "utf-8");
  await rm(todayPlanPath, { force: true });
});

test("/scheduleで予定一覧と当日の学習計画が表示される", async ({ page }) => {
  await page.goto("/schedule");
  await expect(page.getByText("第2回模試")).toBeVisible();
  await expect(page.getByText("英語課題")).toBeVisible();
  await expect(page.getByText("E2E計画")).toBeVisible();
});

test("予定の完了チェックボックスをタップするとschedule.mdが書き換わる", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByRole("checkbox", { name: "第2回模試を完了にする" }).click();

  await expect(async () => {
    const raw = await readFile(schedulePath, "utf-8");
    expect(raw).toContain("- [x] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01");
  }).toPass();
});

// 3件目「週の学習時間を保存できる」は `/stats` の唯一のE2Eカバレッジ。`/stats` は本フェーズで
// 変更しないスコープなので、元の実装のまま一字一句変更せずに残す(I3対策)。
test("週の学習時間を保存できる", async ({ page }) => {
  await page.goto("/stats");
  await page.getByLabel("週合計（分）").fill("345");
  await page.getByRole("button", { name: "保存" }).first().click();
  await expect(page.getByText("週次振り返り・来週の重点")).toBeVisible();
});
```

2. 検証コマンド:
```
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- extended-flows.spec.ts
```
期待する結果: `3 passed` で終了する。

3. 検証: `git status` で `e2e/fixtures/vault/schedule.md` が変更されたまま残っていないことを確認する
   (afterEachで元の内容に書き戻されているため、テスト実行後も working tree はクリーンであるべき)。

4. commit:
```
git add e2e/extended-flows.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): replace legacy record/schedule editing flows with vault-reading /schedule checks, keep /stats coverage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 16 完了

---

## Task 17: `e2e/core-flows.spec.ts` から旧`/schedule`操作テストを削除

**Files:**
- Modify: `e2e/core-flows.spec.ts`

**Interfaces:**
- Consumes: Task 13で読み取り専用になった `/schedule` ページ

計画1（`docs/superpowers/plans/2026-07-25-phase2-records.md`）のTask 10は、`core-flows.spec.ts` のうち
3件目のテスト「締切予定を作成して編集できる」を**意図的に手つかずで残している**（`/schedule` は本計画の
担当範囲だから）。そのテストは旧`/schedule`の追加・編集UI（`追加`ボタン、`タイトル`入力、`保存`ボタン、
`予定を編集`ラベル）を操作するが、本計画のTask 13でそれらのUIは無くなる。したがって本Taskで削除する。
削除しないと、本計画の最終検証（E2E全体実行）で必ず失敗する。

このTaskはテストの削除のみでTDDに馴染まない。削除対象を特定し、削除後の全文を掲載して検証する。

### ステップ

1. 削除対象が存在することを確認する。

```bash
grep -n "締切予定を作成して編集できる" e2e/core-flows.spec.ts
```
期待する出力: 該当行が1件見つかる（計画1のTask 10適用後の状態）。もし0件なら、計画1がまだ
適用されていないか、既に削除済み。その場合は本Taskをスキップしてよい。

2. `e2e/core-flows.spec.ts` を以下の内容で全置換する（3件目のテストのみを取り除いた形）。

```ts
import { expect, test } from "@playwright/test";

test("主要画面を認証済みで表示できる", async ({ page }) => {
  for (const [path, heading] of [
    ["/records", "履歴"],
    ["/stats", "分析"],
    ["/schedule", "予定"],
    ["/settings", "設定"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
});

test("vaultフィクスチャの学習記録が履歴に表示される", async ({ page }) => {
  await page.goto("/records");
  await expect(page.getByText("2026-07-24")).toBeVisible();
  await expect(page.getByText("英語R 60分")).toBeVisible();
  await expect(page.getByText("メモ: 長文2題")).toBeVisible();
});
```

3. 検証コマンド:

```bash
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- core-flows.spec.ts
```
期待する結果: `2 passed` で終了する（旧`/schedule`操作テストが消え、残る2件が通る）。

4. commit:

```bash
git add e2e/core-flows.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): drop legacy schedule editing test now that /schedule is read-only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] Task 17 完了

---

## 全体の最終検証

全Task完了後、以下を通しで実行して問題ないことを確認する:

```
npx vitest run
npm run test:analysis
npx tsc --noEmit
npm run lint
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e
```

- [ ] 全体検証 完了
