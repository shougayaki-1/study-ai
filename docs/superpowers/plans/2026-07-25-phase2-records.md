# Phase 2: Study Records via Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対話(Claude Code / Codex)から勉強記録を`vault/records/YYYY-MM-DD.md`へ追記・編集・削除できるようにし、`/records`をvault読みの履歴ビューアに置き換える。

**Architecture:** Node側(`analysis/helpers/vault/study-sessions.mjs`)が記録行のパース/フォーマット/追記/編集/削除を担う書き込み専用実装、TS側(`src/lib/vault/study-sessions.ts`)が同じ行フォーマットを読むだけの実装を持つ。両者は同一フィクスチャファイルで解釈結果が一致することをテストで担保する。追記・編集・削除は本文をパース結果から再生成せず、対象行だけを操作する行保存型のライタとして実装する。対話は`analysis/helpers/`直下の薄いCLIラッパー(`record-session.mjs`等)をシェル経由で呼び、入口で値の妥当性を検査する。Webは`/records`がServer Componentとして`vault/records/*.md`を`fs`で読むだけになり、`/record`(入力フォーム)は削除する。既存の`writeVaultFile`もこの計画でアトミック書き込みに変更し、Phase 1からの全呼び出し元がその恩恵を受ける。

**Tech Stack:** Next.js (App Router, Server Components) / TypeScript / Node.js標準ライブラリ(`node:fs/promises`, `node:test`) / Vitest / Playwright

## Global Constraints

- vaultルートは Phase 1 と同じ環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw（黙って別パスに書かない）。
- **TS実装（`src/lib/vault/`）と Node実装（`analysis/helpers/vault/`）は同一フォーマットを完全に同じ構造へ解釈すること。** 同一フィクスチャファイル（`analysis/test/fixtures/study-record.md`）を両テストがそのまま`readFileSync`で読み込んで検証する(コピペしない)。加えて両実装の解釈結果が一致することを検証するparityテストを1本用意する。
- Node側は **Node標準ライブラリのみ**（追加npm禁止）。TS側の fs アクセスは**サーバ側のみ**。
- 既存ヘルパ（`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/`stringifyFrontmatter`）は**再実装せず import して使う**。
- 行フォーマットの区切りは Phase 1 の要確認TODO行と同じ流儀：フィールドは **` | `**、`key=value` は**最初の `=` で分割**。**値に含めてはならないのは ` | ` と改行の2つだけ**（`=`は含めてよい。最初の`=`で分割するため`memo=y=mx+b`は正しく`y=mx+b`と解釈される）。**この禁止はコードで強制する**：`formatStudySessionLine`が値に` | `または改行を検出したら throw する。プロンプト(`docs/study-dialogue.md`)の注意書きだけに頼らない。
- 壊れた行・必須キー欠落の行は**その行だけスキップ**し、全体を落とさない。
- **ライタは認識できない行を保存する(破壊しない)。** `appendStudySession`/`updateStudySession`/`deleteStudySession`は本文をパース結果から再生成せず、`body.split("\n")`して対象行だけを挿入・差し替え・削除し、他の行(壊れた行・人間が書き足した見出しやメモ)はそのまま残す。
- `records/YYYY-MM-DD.md`の行頭は **`- `**（チェックボックスなし）。キー順固定：`id` `subject` `minutes` `kind`（`kind=common_test`のときのみ`year` `section`）`understanding` `memo`。`id`は`s-<連番>`。
- `listStudyRecordDates`は**ファイル名が`^\d{4}-\d{2}-\d{2}\.md$`に一致するものだけ**を日付として扱う(Googleドライブが競合時に作る`2026-07-25 (1).md`等を除外する)。
- CLIラッパー(`record-session.mjs`/`edit-session.mjs`)の入口で、`subject`は13科目allowlist、`kind`/`understanding`は各enum、`date`は`YYYY-MM-DD`を検査し、外れたら throw する(黙って書かない)。
- `writeVaultFile`(`analysis/helpers/vault/read-write.mjs`)は同一ディレクトリに一時ファイルを書いて`rename`するアトミック書き込みに変更する。Phase 1からの既存呼び出し元すべて(karte/reportsなど)がこの変更の恩恵を受ける。

---

## Task 1: Node側 — `writeVaultFile` をアトミック書き込みに変更(`analysis/helpers/vault/read-write.mjs`)

**Files:**
- Modify: `analysis/helpers/vault/read-write.mjs`
- Modify: `analysis/test/vault-read-write.test.mjs`

**Interfaces:**
- Consumes: 既存の`vaultRoot`(`./root.mjs`)、`parseFrontmatter`/`stringifyFrontmatter`(`./frontmatter.mjs`)。いずれも変更しない。
- Produces: `writeVaultFile(relPath, frontmatter, body)`の**外部シグネチャは維持したまま**、内部実装を「同一ディレクトリに一時ファイルを書いて`rename`」方式に変更する。Task 7(`appendStudySession`等)・Task 12(E2Eフィクスチャの書き込み)、および既存の全呼び出し元(Phase 1の`archive.mjs`/`corrections.mjs`等)がこの変更の恩恵を受ける。

### ステップ

このTaskは「途中でプロセスが落ちた場合にファイルが切り詰められた状態で残らない」という性質を検証するもので、確定的な失敗を起こす単体テストを書きにくい(実際にディスク書き込み中にプロセスを殺す必要がある)。そのため他のTaskと異なり「現状把握→実装→検証→commit」の形にする(Task 11・12の全文置換と同じ扱い)。

1. 現状を確認する。

```bash
cat analysis/helpers/vault/read-write.mjs
```

現在の`writeVaultFile`は`mkdir`してから`writeFile`で直接書き込んでいる(一時ファイルを経由しない)ことを確認する。

2. `analysis/test/vault-read-write.test.mjs`に検証テストを追記する(1本目は「同時に2回書いても中身が混ざらない」ことを見るtorn-write検出テスト、2本目は「書き込み後に一時ファイルが残らない」ことを見るテスト)。

```js
// analysis/test/vault-read-write.test.mjs に追記
// (先頭のimportに readdir を追加する: import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';)

test('writeVaultFile writes atomically: concurrent writes never produce a torn/mixed file', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-atomic-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    const frontmatter = { type: 'karte', schema_version: 1 };
    const bodyA = 'A'.repeat(2_000_000);
    const bodyB = 'B'.repeat(2_000_000);

    await Promise.all([
      writeVaultFile('race.md', frontmatter, bodyA),
      writeVaultFile('race.md', frontmatter, bodyB),
    ]);

    const raw = await readFile(path.join(vaultDir, 'race.md'), 'utf8');
    const isFullyA = raw.includes(bodyA) && !raw.includes('B');
    const isFullyB = raw.includes(bodyB) && !raw.includes('A');
    assert.ok(isFullyA || isFullyB, 'written file must be entirely one write or the other, never a mix');
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('writeVaultFile leaves no leftover temp files after a successful write', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-tmp-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await writeVaultFile('note.md', { type: 'karte', schema_version: 1 }, 'body');
    const entries = await readdir(vaultDir);
    assert.deepEqual(entries, ['note.md']);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});
```

3. 実行して現状の実装でも通ることを確認する(この2本は将来のリグレッション防止が目的であり、必ずしも赤くはならない)。

```bash
node --test analysis/test/vault-read-write.test.mjs
```

4. `writeVaultFile`を一時ファイル+`rename`方式に書き換える。

```js
// analysis/helpers/vault/read-write.mjs
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { vaultRoot } from './root.mjs';

export async function readVaultFile(relPath) {
  const root = vaultRoot();
  const full = path.resolve(root, relPath);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('relPath escapes vault root: ' + relPath);
  }
  const raw = await readFile(full, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return { frontmatter, body, raw };
}

export async function writeVaultFile(relPath, frontmatter, body) {
  const fullPath = path.join(vaultRoot(), relPath);
  const dir = path.dirname(fullPath);
  await mkdir(dir, { recursive: true });
  const raw = stringifyFrontmatter(frontmatter, body);
  const tmpPath = path.join(dir, `.${path.basename(fullPath)}.tmp-${randomUUID()}`);
  await writeFile(tmpPath, raw, 'utf8');
  try {
    await rename(tmpPath, fullPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}
```

5. 成功を確認する(Phase 1からの既存テストを含め全て通ることを確認する)。

```bash
node --test analysis/test/vault-read-write.test.mjs
npm run test:analysis
```

期待する出力: いずれもエラーなく完了する(`# fail 0`)。

6. コミットする。

```bash
git add analysis/helpers/vault/read-write.mjs analysis/test/vault-read-write.test.mjs
git commit -m "$(cat <<'EOF'
fix(vault): make writeVaultFile write atomically via temp-file + rename

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 共有フィクスチャ + TS側 — 記録のパース/フォーマット(`src/lib/vault/study-sessions.ts`)

**Files:**
- Create: `analysis/test/fixtures/study-record.md`
- Create: `src/lib/vault/line-format.ts`（禁止文字チェックの共有実装。契約 §0 により**TS側で1箇所に集約**する。計画2の `schedule.ts`/`plan.ts` もこれを import する）
- Create: `src/lib/vault/study-sessions.ts`
- Create: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: なし(新規ファイル)。
- Produces: `src/lib/vault/line-format.ts` から
  `export function assertSafeValue(value: string, field: string): void`
  （値に ` | ` または改行が含まれるとthrow）。**計画2がこれを import する**ので、
  名前・シグネチャ・エラーメッセージを変更しないこと。
- Produces: `StudyKind`, `Understanding`, `StudySession`型、`parseStudySessions(body: string): StudySession[]`、`formatStudySessionLine(session: StudySession): string`。Task 3・Task 4・Task 5・Task 6の他タスクが利用する。

### ステップ

1. 共有フィクスチャを作成する(TSテスト・Nodeテスト・parityテストの3箇所が同じファイルを読む。契約1aの例と同一内容)。

```md
<!-- analysis/test/fixtures/study-record.md -->
## セッション
- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題
- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=
```

2. 失敗するテストを書く。

```ts
// src/lib/vault/study-sessions.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStudySessions, formatStudySessionLine, type StudySession } from "./study-sessions";

// NOTE: フィクスチャは analysis/test/fixtures/study-record.md を直接読む。
//       analysis/test/vault-study-sessions.test.mjs も同じファイルを読むため、
//       コピペしてBODY文字列を二重管理しない(契約: TS版とNode版でパース結果を完全一致させる)。
const REPO_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const BODY = readFileSync(path.join(REPO_ROOT, "analysis/test/fixtures/study-record.md"), "utf8");

describe("parseStudySessions", () => {
  it("parses session lines including the common_test-only year/section", () => {
    expect(parseStudySessions(BODY)).toEqual([
      {
        id: "s-1",
        subject: "英語R",
        minutes: 60,
        kind: "material",
        understanding: "understood",
        memo: "長文2題",
      },
      {
        id: "s-2",
        subject: "数学IA",
        minutes: 90,
        kind: "common_test",
        year: 2025,
        section: "第3問",
        understanding: "uncertain",
        memo: "",
      },
    ]);
  });

  it("returns an empty array when there are no session lines", () => {
    expect(parseStudySessions("本文だけ\n")).toEqual([]);
  });

  it("skips a line missing a required key", () => {
    const broken = "- id=s-9 | subject=英語R | kind=material | understanding=understood | memo=";
    expect(parseStudySessions(broken)).toEqual([]);
  });
});

describe("formatStudySessionLine", () => {
  it("formats a material session without year/section", () => {
    const session: StudySession = {
      id: "s-1",
      subject: "英語R",
      minutes: 60,
      kind: "material",
      understanding: "understood",
      memo: "長文2題",
    };
    expect(formatStudySessionLine(session)).toBe(
      "- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題"
    );
  });

  it("formats a common_test session with year/section", () => {
    const session: StudySession = {
      id: "s-2",
      subject: "数学IA",
      minutes: 90,
      kind: "common_test",
      year: 2025,
      section: "第3問",
      understanding: "uncertain",
      memo: "",
    };
    expect(formatStudySessionLine(session)).toBe(
      "- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo="
    );
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const session: StudySession = {
      id: "s-1",
      subject: "英語R",
      minutes: 60,
      kind: "material",
      understanding: "understood",
      memo: "長文2題 | 時間切れ",
    };
    expect(() => formatStudySessionLine(session)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const session: StudySession = {
      id: "s-1",
      subject: "英語R",
      minutes: 60,
      kind: "material",
      understanding: "understood",
      memo: "1行目\n2行目",
    };
    expect(() => formatStudySessionLine(session)).toThrow();
  });

  it("allows '=' in a field value", () => {
    const session: StudySession = {
      id: "s-1",
      subject: "英語R",
      minutes: 60,
      kind: "material",
      understanding: "understood",
      memo: "y=mx+b",
    };
    expect(formatStudySessionLine(session)).toContain("memo=y=mx+b");
  });
});
```

3. 失敗を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Cannot find module './study-sessions'` またはそれに類するインポートエラーでテストが失敗する。

4. 最小実装を書く。

```ts
// src/lib/vault/line-format.ts
// 契約 §0: 行フォーマットの値に含めてはならない文字の検査。TS側はこの1箇所に集約し、
// 記録(study-sessions.ts)・予定(schedule.ts)・学習計画(plan.ts)のフォーマッタが共有する。
// `=` は禁止しない(最初の `=` で分割するため値に含めても安全)。
export function assertSafeValue(value: string, field: string): void {
  if (value.includes(" | ") || value.includes("\n")) {
    throw new Error(`${field} must not contain ' | ' or a newline: ${JSON.stringify(value)}`);
  }
}
```

```ts
// src/lib/vault/study-sessions.ts
import { assertSafeValue } from "./line-format";

export type StudyKind = "material" | "common_test" | "secondary";
export type Understanding = "understood" | "uncertain" | "not_understood";
export type StudySession = {
  id: string;
  subject: string;
  minutes: number;
  kind: StudyKind;
  year?: number;
  section?: string;
  understanding: Understanding;
  memo: string;
};

const PREFIX = "- ";

export function parseStudySessions(body: string): StudySession[] {
  const sessions: StudySession[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    const fields: Record<string, string> = {};
    for (const part of line.slice(PREFIX.length).split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.subject || !fields.minutes || !fields.kind || !fields.understanding) continue;
    const minutes = Number(fields.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) continue;
    const session: StudySession = {
      id: fields.id,
      subject: fields.subject,
      minutes,
      kind: fields.kind as StudyKind,
      understanding: fields.understanding as Understanding,
      memo: fields.memo ?? "",
    };
    if (fields.kind === "common_test") {
      if (fields.year) session.year = Number(fields.year);
      if (fields.section) session.section = fields.section;
    }
    sessions.push(session);
  }
  return sessions;
}

export function formatStudySessionLine(session: StudySession): string {
  assertSafeValue(session.id, "id");
  assertSafeValue(session.subject, "subject");
  assertSafeValue(session.understanding, "understanding");
  assertSafeValue(session.memo, "memo");
  if (session.kind === "common_test" && session.section) assertSafeValue(session.section, "section");

  const parts = [
    `id=${session.id}`,
    `subject=${session.subject}`,
    `minutes=${session.minutes}`,
    `kind=${session.kind}`,
  ];
  if (session.kind === "common_test") {
    parts.push(`year=${session.year}`, `section=${session.section}`);
  }
  parts.push(`understanding=${session.understanding}`, `memo=${session.memo}`);
  return `${PREFIX}${parts.join(" | ")}`;
}
```

5. 成功を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Test Files  1 passed (1)` / `Tests  8 passed (8)`。

6. コミットする。

```bash
git add analysis/test/fixtures/study-record.md src/lib/vault/line-format.ts src/lib/vault/study-sessions.ts src/lib/vault/study-sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add TS parser/formatter for study record session lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TS側 — `readStudyRecord` / `listStudyRecordDates`

**Files:**
- Modify: `src/lib/vault/study-sessions.ts`
- Modify: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: `readVaultFile`(`./read`)、`getVaultRoot`(`./root`)、Task 2の`parseStudySessions`。
- Produces: `StudyRecordDay`型、`readStudyRecord(date: string): Promise<StudyRecordDay>`、`listStudyRecordDates(): Promise<string[]>`。Task 4のバレル・`/records`ページ(Task 11)が利用する。

### ステップ

1. 失敗するテストを追記する。

```ts
// src/lib/vault/study-sessions.test.ts に追記
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach } from "vitest";
import { readStudyRecord, listStudyRecordDates } from "./study-sessions";

describe("readStudyRecord / listStudyRecordDates", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-study-sessions-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("reads sessions for a date that has a record file", async () => {
    const dir = path.join(vaultDir, "records");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "2026-07-25.md"),
      [
        "---",
        "type: study-record",
        "date: 2026-07-25",
        "source: dialogue",
        "schema_version: 1",
        "updated: 2026-07-25T22:10:00+09:00",
        "---",
        "",
        "## セッション",
        "- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題",
        "",
      ].join("\n"),
      "utf8"
    );

    const day = await readStudyRecord("2026-07-25");
    expect(day.date).toBe("2026-07-25");
    expect(day.sessions).toHaveLength(1);
    expect(day.sessions[0].subject).toBe("英語R");
  });

  it("returns an empty sessions array when the date has no file", async () => {
    const day = await readStudyRecord("2026-01-01");
    expect(day).toEqual({ date: "2026-01-01", sessions: [] });
  });

  it("lists record dates in descending order", async () => {
    const dir = path.join(vaultDir, "records");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-20.md"), "---\ntype: study-record\ndate: 2026-07-20\nsource: dialogue\nschema_version: 1\nupdated: 2026-07-20T00:00:00+09:00\n---\n\n## セッション\n", "utf8");
    await writeFile(path.join(dir, "2026-07-25.md"), "---\ntype: study-record\ndate: 2026-07-25\nsource: dialogue\nschema_version: 1\nupdated: 2026-07-25T00:00:00+09:00\n---\n\n## セッション\n", "utf8");

    expect(await listStudyRecordDates()).toEqual(["2026-07-25", "2026-07-20"]);
  });

  it("returns an empty array when the records directory does not exist", async () => {
    expect(await listStudyRecordDates()).toEqual([]);
  });

  it("ignores files whose name does not match YYYY-MM-DD.md (e.g. Google Drive conflict copies)", async () => {
    const dir = path.join(vaultDir, "records");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-25.md"), "---\ntype: study-record\ndate: 2026-07-25\nsource: dialogue\nschema_version: 1\nupdated: 2026-07-25T00:00:00+09:00\n---\n\n## セッション\n", "utf8");
    await writeFile(path.join(dir, "2026-07-25 (1).md"), "---\ntype: study-record\ndate: 2026-07-25\nsource: dialogue\nschema_version: 1\nupdated: 2026-07-25T00:00:01+09:00\n---\n\n## セッション\n", "utf8");
    await writeFile(path.join(dir, "notes.txt"), "memo", "utf8");

    expect(await listStudyRecordDates()).toEqual(["2026-07-25"]);
  });
});
```

2. 失敗を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `readStudyRecord`/`listStudyRecordDates`が存在しないためインポートエラーで失敗する。

3. 最小実装を追記する。

```ts
// src/lib/vault/study-sessions.ts に追記
import { readdir } from "node:fs/promises";
import path from "node:path";
import { readVaultFile } from "./read";
import { getVaultRoot } from "./root";

export type StudyRecordDay = { date: string; sessions: StudySession[] };

const RECORD_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

export async function readStudyRecord(date: string): Promise<StudyRecordDay> {
  try {
    const { body } = await readVaultFile(`records/${date}.md`);
    return { date, sessions: parseStudySessions(body) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { date, sessions: [] };
    throw error;
  }
}

export async function listStudyRecordDates(): Promise<string[]> {
  const dir = path.join(getVaultRoot(), "records");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((name) => RECORD_FILENAME_RE.test(name))
    .map((name) => name.slice(0, -3))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
```

4. 成功を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Tests  13 passed (13)`。

5. コミットする。

```bash
git add src/lib/vault/study-sessions.ts src/lib/vault/study-sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add readStudyRecord and listStudyRecordDates readers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: TS側 — バレル再エクスポート

**Files:**
- Modify: `src/lib/vault/index.ts`
- Modify: `src/lib/vault/index.test.ts`

**Interfaces:**
- Consumes: Task 2・3の全エクスポート。
- Produces: `@/lib/vault`から`StudyKind`/`Understanding`/`StudySession`/`StudyRecordDay`/`parseStudySessions`/`formatStudySessionLine`/`readStudyRecord`/`listStudyRecordDates`をimport可能にする。Task 11(`/records`ページ)が利用する。

### ステップ

1. 失敗するテストを追記する。

```ts
// src/lib/vault/index.test.ts の it 内に追記
    expect(typeof vault.parseStudySessions).toBe("function");
    expect(typeof vault.formatStudySessionLine).toBe("function");
    expect(typeof vault.readStudyRecord).toBe("function");
    expect(typeof vault.listStudyRecordDates).toBe("function");
```

2. 失敗を確認する。

```bash
npx vitest run src/lib/vault/index.test.ts
```

期待する出力: `expect(typeof vault.parseStudySessions).toBe("function")`で`undefined`が返り失敗する。

3. 最小実装を書く。

```ts
// src/lib/vault/index.ts に追記
export type { StudyKind, Understanding, StudySession, StudyRecordDay } from "./study-sessions";
export { parseStudySessions, formatStudySessionLine, readStudyRecord, listStudyRecordDates } from "./study-sessions";
```

4. 成功を確認する。

```bash
npx vitest run src/lib/vault/index.test.ts
```

期待する出力: `Tests  1 passed (1)`。

5. コミットする。

```bash
git add src/lib/vault/index.ts src/lib/vault/index.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): re-export study-sessions readers from the vault barrel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Node側 — 記録のパース/フォーマット/採番(`analysis/helpers/vault/study-sessions.mjs`)

**Files:**
- Create: `analysis/helpers/vault/line-format.mjs`（禁止文字チェックの共有実装。契約 §0 により**Node側で1箇所に集約**する。計画2の `schedule.mjs`/`plan.mjs` もこれを import する）
- Create: `analysis/helpers/vault/study-sessions.mjs`
- Create: `analysis/test/vault-study-sessions.test.mjs`

**Interfaces:**
- Consumes: Task 2で作成した共有フィクスチャ`analysis/test/fixtures/study-record.md`。
- Produces: `analysis/helpers/vault/line-format.mjs` から
  `export function assertSafeValue(value, field)`（TS版 `src/lib/vault/line-format.ts` と
  同じ判定・同じエラーメッセージ）。**計画2がこれを import する**ので名前・シグネチャを変更しないこと。
- Produces: `parseStudySessions(body)`、`formatStudySessionLine(session)`、`nextSessionId(sessions)`。Task 6・7・9が利用する。TS版(Task 2)と同一フィクスチャで解釈結果が一致することはTask 6のparityテストで検証する。

### ステップ

1. 失敗するテストを書く。

```js
// analysis/test/vault-study-sessions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStudySessions, formatStudySessionLine, nextSessionId } from '../helpers/vault/study-sessions.mjs';

// NOTE: src/lib/vault/study-sessions.test.ts と同じ analysis/test/fixtures/study-record.md を
//       readFileSync で直接読む(コピペしない。契約: TS版とNode版でパース結果を完全一致させる)。
const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BODY = readFileSync(path.join(FIXTURE_DIR, 'fixtures', 'study-record.md'), 'utf8');

test('parseStudySessions parses session lines including the common_test-only year/section', () => {
  assert.deepEqual(parseStudySessions(BODY), [
    {
      id: 's-1',
      subject: '英語R',
      minutes: 60,
      kind: 'material',
      understanding: 'understood',
      memo: '長文2題',
    },
    {
      id: 's-2',
      subject: '数学IA',
      minutes: 90,
      kind: 'common_test',
      year: 2025,
      section: '第3問',
      understanding: 'uncertain',
      memo: '',
    },
  ]);
});

test('parseStudySessions returns [] for a body with no session lines', () => {
  assert.deepEqual(parseStudySessions('本文だけ\n'), []);
});

test('parseStudySessions skips a line missing a required key', () => {
  const broken = '- id=s-9 | subject=英語R | kind=material | understanding=understood | memo=';
  assert.deepEqual(parseStudySessions(broken), []);
});

test('formatStudySessionLine formats a material session without year/section', () => {
  const line = formatStudySessionLine({
    id: 's-1',
    subject: '英語R',
    minutes: 60,
    kind: 'material',
    understanding: 'understood',
    memo: '長文2題',
  });
  assert.equal(line, '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題');
});

test('formatStudySessionLine formats a common_test session with year/section', () => {
  const line = formatStudySessionLine({
    id: 's-2',
    subject: '数学IA',
    minutes: 90,
    kind: 'common_test',
    year: 2025,
    section: '第3問',
    understanding: 'uncertain',
    memo: '',
  });
  assert.equal(line, '- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=');
});

test('formatStudySessionLine throws when a value contains the field delimiter', () => {
  assert.throws(() => formatStudySessionLine({
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題 | 時間切れ',
  }));
});

test('formatStudySessionLine throws when a value contains a newline', () => {
  assert.throws(() => formatStudySessionLine({
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '1行目\n2行目',
  }));
});

test('formatStudySessionLine allows "=" in a value', () => {
  const line = formatStudySessionLine({
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'y=mx+b',
  });
  assert.match(line, /memo=y=mx\+b/);
});

test('nextSessionId returns s-1 for an empty list and max+1 otherwise', () => {
  assert.equal(nextSessionId([]), 's-1');
  assert.equal(nextSessionId([{ id: 's-1' }, { id: 's-2' }]), 's-3');
});
```

2. 失敗を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `Cannot find module '../helpers/vault/study-sessions.mjs'`でテストが失敗する。

3. 最小実装を書く。

```js
// analysis/helpers/vault/line-format.mjs
// 契約 §0: 行フォーマットの値に含めてはならない文字の検査。Node側はこの1箇所に集約し、
// 記録(study-sessions.mjs)・予定(schedule.mjs)・学習計画(plan.mjs)のフォーマッタが共有する。
// `=` は禁止しない(最初の `=` で分割するため値に含めても安全)。
// TS版 src/lib/vault/line-format.ts と同じ判定・同じエラーメッセージにすること。
export function assertSafeValue(value, field) {
  if (typeof value === 'string' && (value.includes(' | ') || value.includes('\n'))) {
    throw new Error(`${field} must not contain ' | ' or a newline: ${JSON.stringify(value)}`);
  }
}
```

```js
// analysis/helpers/vault/study-sessions.mjs
import { assertSafeValue } from './line-format.mjs';

const PREFIX = '- ';

export function parseStudySessions(body) {
  const sessions = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith(PREFIX)) continue;
    const fields = {};
    for (const part of line.slice(PREFIX.length).split(' | ')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id || !fields.subject || !fields.minutes || !fields.kind || !fields.understanding) continue;
    const minutes = Number(fields.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) continue;
    const session = {
      id: fields.id,
      subject: fields.subject,
      minutes,
      kind: fields.kind,
      understanding: fields.understanding,
      memo: fields.memo ?? '',
    };
    if (fields.kind === 'common_test') {
      if (fields.year) session.year = Number(fields.year);
      if (fields.section) session.section = fields.section;
    }
    sessions.push(session);
  }
  return sessions;
}

export function formatStudySessionLine(session) {
  assertSafeValue(session.id, 'id');
  assertSafeValue(session.subject, 'subject');
  assertSafeValue(session.understanding, 'understanding');
  assertSafeValue(session.memo, 'memo');
  if (session.kind === 'common_test' && session.section) assertSafeValue(session.section, 'section');

  const parts = [
    `id=${session.id}`,
    `subject=${session.subject}`,
    `minutes=${session.minutes}`,
    `kind=${session.kind}`,
  ];
  if (session.kind === 'common_test') {
    parts.push(`year=${session.year}`, `section=${session.section}`);
  }
  parts.push(`understanding=${session.understanding}`, `memo=${session.memo}`);
  return `${PREFIX}${parts.join(' | ')}`;
}

export function nextSessionId(sessions) {
  let max = 0;
  for (const session of sessions) {
    const match = /^s-(\d+)$/.exec(session.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `s-${max + 1}`;
}
```

4. 成功を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `# pass 9` (9テストすべて成功、failが0)。

5. コミットする。

```bash
git add analysis/helpers/vault/line-format.mjs analysis/helpers/vault/study-sessions.mjs analysis/test/vault-study-sessions.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add Node parser/formatter/id-allocator for study sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: TS/Node parityテスト(記録フォーマット)

**Files:**
- Modify: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: Task 2の`parseStudySessions`(TS)、Task 5の`analysis/helpers/vault/study-sessions.mjs`の`parseStudySessions`(Node)、共有フィクスチャ(Task 2)。
- Produces: なし(検証専用テスト)。TS版とNode版のパース結果が将来ズレたときにここで検知する。

### ステップ

1. 失敗しない可能性があることを踏まえつつ、まずテストを追記する(現時点でTask 2とTask 5の実装は同一ロジックのため通る想定だが、契約が要求するparity担保の実体としてここに置く)。

> **この機構は検証済み**: vitest(`src/**/*.test.ts`)から `pathToFileURL` 経由で
> `analysis/` 配下の `.mjs` を動的importできることは、既存の `analysis/helpers/vault/frontmatter.mjs`
> を使った使い捨てテストで実機確認済み(2026-07-26)。`vitest.config.ts` の
> `include: ["src/**/*.test.ts"]` と `environment: "node"` の設定で追加設定なしに動く。

```ts
// src/lib/vault/study-sessions.test.ts に追記
import { pathToFileURL } from "node:url";

describe("TS/Node parity", () => {
  it("parses the shared study-record fixture identically in both implementations", async () => {
    const nodeModulePath = path.join(REPO_ROOT, "analysis/helpers/vault/study-sessions.mjs");
    const nodeModule = await import(pathToFileURL(nodeModulePath).href);

    const tsResult = parseStudySessions(BODY);
    const nodeResult = nodeModule.parseStudySessions(BODY);

    expect(JSON.stringify(nodeResult)).toBe(JSON.stringify(tsResult));
  });
});
```

2. 実行して確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Tests  14 passed (14)`。もし将来どちらかの実装だけを直して乖離させると、この1本だけが失敗するようになる(想定挙動)。

3. コミットする。

```bash
git add src/lib/vault/study-sessions.test.ts
git commit -m "$(cat <<'EOF'
test(vault): add a TS/Node parity check for the shared study-record fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Node側 — `appendStudySession` / `updateStudySession` / `deleteStudySession`(行保存型)

**Files:**
- Modify: `analysis/helpers/vault/study-sessions.mjs`
- Modify: `analysis/test/vault-study-sessions.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`(`./read-write.mjs`、Task 1でアトミック化済み)、Task 5の`parseStudySessions`/`formatStudySessionLine`。
- Produces: `appendStudySession(date, session)`、`updateStudySession(date, id, patch)`、`deleteStudySession(date, id)`。Task 8のバレル・Task 9のCLIラッパーが利用する。**本文を再生成せず、対象行だけを操作する**(計画2の`appendScheduleEvent`と同じ方式)。

### ステップ

1. 失敗するテストを追記する。

```js
// analysis/test/vault-study-sessions.test.mjs に追記
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { appendStudySession, updateStudySession, deleteStudySession } from '../helpers/vault/study-sessions.mjs';

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-study-sessions-'));
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

test('appendStudySession creates records/<date>.md when it does not exist', withVault(async (dir) => {
  await appendStudySession('2026-07-25', {
    id: 's-1',
    subject: '英語R',
    minutes: 60,
    kind: 'material',
    understanding: 'understood',
    memo: '長文2題',
  });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /type: study-record/);
  assert.match(raw, /date: 2026-07-25/);
  assert.match(raw, /## セッション/);
  assert.match(raw, /- id=s-1 \| subject=英語R \| minutes=60 \| kind=material \| understanding=understood \| memo=長文2題/);
}));

test('appendStudySession appends a second session without losing the first', withVault(async (dir) => {
  await appendStudySession('2026-07-25', {
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '',
  });
  await appendStudySession('2026-07-25', {
    id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '',
  });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1/);
  assert.match(raw, /id=s-2/);
}));

test('updateStudySession rewrites only the targeted line', withVault(async (dir) => {
  await appendStudySession('2026-07-25', {
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '',
  });
  await appendStudySession('2026-07-25', {
    id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '',
  });
  await updateStudySession('2026-07-25', 's-2', { minutes: 120, understanding: 'understood' });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=60/);
  assert.match(raw, /id=s-2 \| subject=数学IA \| minutes=120 \| kind=material \| understanding=understood/);
}));

test('deleteStudySession removes only the targeted line', withVault(async (dir) => {
  await appendStudySession('2026-07-25', {
    id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '',
  });
  await appendStudySession('2026-07-25', {
    id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '',
  });
  await deleteStudySession('2026-07-25', 's-1');
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.doesNotMatch(raw, /id=s-1/);
  assert.match(raw, /id=s-2/);
}));

test('appendStudySession preserves lines it cannot parse and human-added notes', withVault(async (dir) => {
  const recordsDir = path.join(dir, 'records');
  await mkdir(recordsDir, { recursive: true });
  await writeFile(
    path.join(recordsDir, '2026-07-25.md'),
    [
      '---',
      'type: study-record',
      'date: 2026-07-25',
      'source: dialogue',
      'schema_version: 1',
      'updated: 2026-07-25T00:00:00+09:00',
      '---',
      '',
      '## セッション',
      '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=',
      '- id=s-broken | subject=英語R',
      '',
      '### 手書きメモ',
      '今日は集中できた。',
      '',
    ].join('\n'),
    'utf8'
  );

  await appendStudySession('2026-07-25', {
    id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '',
  });

  const raw = await readFile(path.join(recordsDir, '2026-07-25.md'), 'utf8');
  assert.match(raw, /- id=s-broken \| subject=英語R/);
  assert.match(raw, /### 手書きメモ/);
  assert.match(raw, /今日は集中できた。/);
  assert.match(raw, /id=s-2/);

  // 追記は「本文末尾」ではなく `## セッション` セクション内に入ること。
  // 末尾追記だと後続の `### 手書きメモ` の中に紛れ込むため、順序で検証する。
  const rawLines = raw.split('\n');
  const newIndex = rawLines.findIndex((line) => line.includes('id=s-2'));
  const memoIndex = rawLines.findIndex((line) => line.includes('### 手書きメモ'));
  assert.ok(newIndex !== -1 && memoIndex !== -1, '新しい行と手書きメモの見出しが両方存在すること');
  assert.ok(newIndex < memoIndex, '新しいセッション行が `### 手書きメモ` より前(=セッションセクション内)にあること');
}));

test('updateStudySession preserves lines it cannot parse when rewriting a target line', withVault(async (dir) => {
  const recordsDir = path.join(dir, 'records');
  await mkdir(recordsDir, { recursive: true });
  await writeFile(
    path.join(recordsDir, '2026-07-25.md'),
    [
      '---',
      'type: study-record',
      'date: 2026-07-25',
      'source: dialogue',
      'schema_version: 1',
      'updated: 2026-07-25T00:00:00+09:00',
      '---',
      '',
      '## セッション',
      '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=',
      '- id=s-broken | subject=英語R',
      '',
    ].join('\n'),
    'utf8'
  );

  await updateStudySession('2026-07-25', 's-1', { minutes: 90 });

  const raw = await readFile(path.join(recordsDir, '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=90/);
  assert.match(raw, /- id=s-broken \| subject=英語R/);
}));
```

2. 失敗を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `appendStudySession`等が存在しないためインポートエラーで失敗する。

3. 最小実装を追記する。**本文を`sessions.map(...).join()`で再生成するのではなく、`body.split('\n')`して対象行だけを操作する**(計画2の`schedule.mjs`の`appendScheduleEvent`/`updateScheduleEvent`/`deleteScheduleEvent`と同じ方式)。

```js
// analysis/helpers/vault/study-sessions.mjs に追記
import { readVaultFile, writeVaultFile } from './read-write.mjs';

const HEADING = '## セッション';

async function readRecordFile(date) {
  const relPath = `records/${date}.md`;
  try {
    const { frontmatter, body } = await readVaultFile(relPath);
    return { relPath, frontmatter, body };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      relPath,
      frontmatter: { type: 'study-record', date, source: 'dialogue', schema_version: 1 },
      body: `${HEADING}\n`,
    };
  }
}

function locateSessionLineIndex(lines, id) {
  const marker = `id=${id} |`;
  return lines.findIndex((line) => line.startsWith(PREFIX) && line.slice(PREFIX.length).startsWith(marker));
}

/**
 * `## セッション` セクションの「最後の行の次」の挿入位置を返す。
 * セクションが無ければ本文末尾に見出しごと足す位置を返す。
 * 本文末尾に足すのではなく**セクション内**に挿入するのが要点
 * (後続に `## メモ` 等の手書きセクションがあると、末尾追記ではそちらに紛れ込むため)。
 */
const ANY_HEADING_RE = /^#{1,6}\s/;

function locateSectionInsertIndex(lines) {
  const headingIndex = lines.findIndex((line) => line.trim() === HEADING);
  if (headingIndex === -1) return -1;
  let insertAt = headingIndex + 1;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    // `## ` だけでなく `### 手書きメモ` のような任意のレベルの見出しで止める。
    // `## ` だけを見ると h3 セクションを跨いでその中に挿入してしまう。
    if (ANY_HEADING_RE.test(lines[i])) break;
    if (lines[i].trim() !== '') insertAt = i + 1; // 空行はセクション末尾の余白として跨がない
  }
  return insertAt;
}

export async function appendStudySession(date, session) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const line = formatStudySessionLine(session);
  const lines = body.split('\n');
  const insertAt = locateSectionInsertIndex(lines);

  let nextLines;
  if (insertAt === -1) {
    // `## セッション` が無い場合のみ、本文末尾に見出しごと追加する
    const trimmed = body.endsWith('\n') ? body.slice(0, -1) : body;
    nextLines = `${trimmed ? `${trimmed}\n` : ''}${HEADING}\n${line}\n`.split('\n');
  } else {
    nextLines = [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)];
  }
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, nextLines.join('\n'));
}

export async function updateStudySession(date, id, patch) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const sessions = parseStudySessions(body);
  const current = sessions.find((session) => session.id === id);
  if (!current) throw new Error(`updateStudySession: session not found: ${id}`);
  const updated = { ...current, ...patch, id };

  const lines = body.split('\n');
  const lineIndex = locateSessionLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`updateStudySession: session line not found: ${id}`);
  lines[lineIndex] = formatStudySessionLine(updated);
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}

export async function deleteStudySession(date, id) {
  const { relPath, frontmatter, body } = await readRecordFile(date);
  const lines = body.split('\n');
  const lineIndex = locateSessionLineIndex(lines, id);
  if (lineIndex === -1) throw new Error(`deleteStudySession: session not found: ${id}`);
  lines.splice(lineIndex, 1);
  await writeVaultFile(relPath, { ...frontmatter, updated: new Date().toISOString() }, lines.join('\n'));
}
```

4. 成功を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `# pass 15` (15テストすべて成功、failが0)。

5. コミットする。

```bash
git add analysis/helpers/vault/study-sessions.mjs analysis/test/vault-study-sessions.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add line-preserving append/update/delete writers for study sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Node側 — バレル再エクスポート

**Files:**
- Modify: `analysis/helpers/vault/index.mjs`
- Modify: `analysis/test/vault-index.test.mjs`

**Interfaces:**
- Consumes: Task 5・7の全エクスポート。
- Produces: `analysis/helpers/vault/index.mjs`から`parseStudySessions`/`formatStudySessionLine`/`nextSessionId`/`appendStudySession`/`updateStudySession`/`deleteStudySession`をimport可能にする。Task 9のCLIラッパーが利用する。

### ステップ

1. 失敗するテストを追記する。

```js
// analysis/test/vault-index.test.mjs に追記
  assert.equal(typeof vault.parseStudySessions, 'function');
  assert.equal(typeof vault.formatStudySessionLine, 'function');
  assert.equal(typeof vault.nextSessionId, 'function');
  assert.equal(typeof vault.appendStudySession, 'function');
  assert.equal(typeof vault.updateStudySession, 'function');
  assert.equal(typeof vault.deleteStudySession, 'function');
```

2. 失敗を確認する。

```bash
node --test analysis/test/vault-index.test.mjs
```

期待する出力: `assert.equal(typeof vault.parseStudySessions, 'function')`で`undefined`が返り失敗する。

3. 最小実装を書く。

```js
// analysis/helpers/vault/index.mjs に追記
export {
  parseStudySessions,
  formatStudySessionLine,
  nextSessionId,
  appendStudySession,
  updateStudySession,
  deleteStudySession,
} from './study-sessions.mjs';
```

4. 成功を確認する。

```bash
node --test analysis/test/vault-index.test.mjs
```

期待する出力: `# pass 1` (fail 0)。

5. コミットする。

```bash
git add analysis/helpers/vault/index.mjs analysis/test/vault-index.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): re-export study-sessions writers from the vault barrel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CLIラッパー — `record-session.mjs` / `edit-session.mjs` / `delete-session.mjs`(入力検査つき)

**Files:**
- Create: `analysis/helpers/study-session-validation.mjs`
- Create: `analysis/helpers/record-session.mjs`
- Create: `analysis/helpers/edit-session.mjs`
- Create: `analysis/helpers/delete-session.mjs`
- Create: `analysis/test/session-cli-wrappers.test.mjs`

**Interfaces:**
- Consumes: `analysis/helpers/vault/index.mjs`の`readVaultFile`/`parseStudySessions`/`nextSessionId`/`appendStudySession`/`updateStudySession`/`deleteStudySession`、`analysis/helpers/lib.mjs`の`printJson`。
- Produces: 各ファイルが`run(argv)`をエクスポート(対話がシェルから`node analysis/helpers/record-session.mjs ...`等で呼ぶ)。`docs/study-dialogue.md`(Task 10)が使い方を参照する。`study-session-validation.mjs`は契約に無い内部ヘルパで、`subject`/`kind`/`understanding`/`date`の妥当性検査を`record-session.mjs`/`edit-session.mjs`の入口で行うために両者から共有する(契約が定める公開インターフェースの名前は変更しない)。

### ステップ

1. 失敗するテストを書く。

```js
// analysis/test/session-cli-wrappers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-session-cli-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('record-session appends a session and assigns the next id', withVault(async (dir) => {
  const { run } = await import('../helpers/record-session.mjs');
  const result = await run(['2026-07-25', '英語R', '60', 'material', 'understood', '長文2題']);
  assert.equal(result.session.id, 's-1');
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=60 \| kind=material \| understanding=understood \| memo=長文2題/);
}));

test('record-session records year/section only for kind=common_test', withVault(async (dir) => {
  const { run } = await import('../helpers/record-session.mjs');
  await run(['2026-07-25', '数学IA', '90', 'common_test', 'uncertain', '', '2025', '第3問']);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /kind=common_test \| year=2025 \| section=第3問/);
}));

test('edit-session rewrites only the targeted session via a JSON patch', withVault(async (dir) => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: editRun } = await import('../helpers/edit-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await editRun(['2026-07-25', 's-1', JSON.stringify({ minutes: 90, memo: 'やり直し' })]);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /minutes=90/);
  assert.match(raw, /memo=やり直し/);
}));

test('delete-session removes the targeted session', withVault(async (dir) => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: deleteRun } = await import('../helpers/delete-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await deleteRun(['2026-07-25', 's-1']);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.doesNotMatch(raw, /id=s-1/);
}));

test('record-session throws for an unknown subject', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026-07-25', '英語Ｒ', '60', 'material', 'understood', '']), /subject/);
}));

test('record-session throws for an invalid date', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026/07/25', '英語R', '60', 'material', 'understood', '']), /date/);
}));

test('record-session throws when memo contains the field delimiter', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026-07-25', '英語R', '60', 'material', 'understood', '長文2題 | 時間切れ']), / \| /);
}));

test('edit-session throws when the patch contains an unknown kind', withVault(async () => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: editRun } = await import('../helpers/edit-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await assert.rejects(() => editRun(['2026-07-25', 's-1', JSON.stringify({ kind: 'unknown' })]), /kind/);
}));
```

2. 失敗を確認する。

```bash
node --test analysis/test/session-cli-wrappers.test.mjs
```

期待する出力: `Cannot find module '../helpers/record-session.mjs'`等でテストが失敗する。

3. 最小実装を書く。

```js
// analysis/helpers/study-session-validation.mjs
// record-session.mjs / edit-session.mjs の入口で使う値検査ヘルパ。契約I5対応。
export const STUDY_SUBJECTS = [
  '英語R', '英語L', '現代文', '古文', '漢文', '数学IA', '数学2BC',
  '化学基礎', '地学基礎', '地理', '政治経済', '情報', '小論文',
];
const KINDS = ['material', 'common_test', 'secondary'];
const UNDERSTANDINGS = ['understood', 'uncertain', 'not_understood'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidStudySessionFields({ date, subject, minutes, kind, understanding } = {}) {
  if (date !== undefined && !DATE_RE.test(date)) {
    throw new Error(`date must match YYYY-MM-DD: ${date}`);
  }
  // minutes を検査しないと 0/負数/NaN が書き込めてしまう。しかも parseStudySessions は
  // `minutes <= 0` の行をスキップするため、「書き込みは成功したのに読めない」データ喪失になる。
  if (minutes !== undefined) {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`minutes must be a positive integer: ${minutes}`);
    }
  }
  if (subject !== undefined && !STUDY_SUBJECTS.includes(subject)) {
    throw new Error(`subject must be one of the 13 known subjects: ${subject}`);
  }
  if (kind !== undefined && !KINDS.includes(kind)) {
    throw new Error(`kind must be one of ${KINDS.join('/')}: ${kind}`);
  }
  if (understanding !== undefined && !UNDERSTANDINGS.includes(understanding)) {
    throw new Error(`understanding must be one of ${UNDERSTANDINGS.join('/')}: ${understanding}`);
  }
}
```

```js
// analysis/helpers/record-session.mjs
#!/usr/bin/env node
// vault/records/<date>.md に学習セッションを1件追記する。契約3a `appendStudySession`/`nextSessionId` のCLIラッパー。
// 使い方: node analysis/helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo> [year] [section]
//   kind=common_test のときのみ year/section を渡す(それ以外は省略してよい)。
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, subject, minutes, kind, understanding, memo, year, section]) {
  if (!date || !subject || !minutes || !kind || !understanding) {
    throw new Error('使い方: node helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo> [year] [section]');
  }
  assertValidStudySessionFields({ date, subject, minutes, kind, understanding });
  const { readVaultFile, parseStudySessions, nextSessionId, appendStudySession } = await import('./vault/index.mjs');
  let existingSessions = [];
  try {
    const { body } = await readVaultFile(`records/${date}.md`);
    existingSessions = parseStudySessions(body);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const session = {
    id: nextSessionId(existingSessions),
    subject,
    minutes: Number(minutes),
    kind,
    understanding,
    memo: memo ?? '',
  };
  if (kind === 'common_test') {
    if (year) session.year = Number(year);
    if (section) session.section = section;
  }
  await appendStudySession(date, session);
  return { date, session };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

```js
// analysis/helpers/edit-session.mjs
#!/usr/bin/env node
// vault/records/<date>.md の既存セッション1件を書き換える。契約3a `updateStudySession` のCLIラッパー。
// 使い方: node analysis/helpers/edit-session.mjs <date> <id> <patchJSON>
//   patchJSON は StudySession のうち書き換えたいキーのみを含むJSON(例: {"minutes":90,"memo":"やり直し"})。
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, id, patchArg]) {
  if (!date || !id || !patchArg) {
    throw new Error('使い方: node helpers/edit-session.mjs <date> <id> <patchJSON>');
  }
  const patch = JSON.parse(patchArg);
  assertValidStudySessionFields({ date, ...patch });
  const { updateStudySession } = await import('./vault/index.mjs');
  await updateStudySession(date, id, patch);
  return { date, id, patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

```js
// analysis/helpers/delete-session.mjs
#!/usr/bin/env node
// vault/records/<date>.md から既存セッション1件を削除する。契約3a `deleteStudySession` のCLIラッパー。
// 使い方: node analysis/helpers/delete-session.mjs <date> <id>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { assertValidStudySessionFields } from './study-session-validation.mjs';

export async function run([date, id]) {
  if (!date || !id) {
    throw new Error('使い方: node helpers/delete-session.mjs <date> <id>');
  }
  assertValidStudySessionFields({ date });
  const { deleteStudySession } = await import('./vault/index.mjs');
  await deleteStudySession(date, id);
  return { date, id, deleted: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
```

4. 成功を確認する。

```bash
node --test analysis/test/session-cli-wrappers.test.mjs
```

期待する出力: `# pass 8` (fail 0)。

5. コミットする。

```bash
git add analysis/helpers/study-session-validation.mjs analysis/helpers/record-session.mjs analysis/helpers/edit-session.mjs analysis/helpers/delete-session.mjs analysis/test/session-cli-wrappers.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add record/edit/delete-session CLI wrappers with input validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 対話手順書 `docs/study-dialogue.md` + `CLAUDE.md`/`AGENTS.md`参照

**Files:**
- Create: `docs/study-dialogue.md`
- Create: `AGENTS.md`（リポジトリ直下に存在しないため新規作成）
- Create: `CLAUDE.md`（リポジトリ直下に存在しないため新規作成。契約は既存ファイルへの追記を想定しているが、実際には存在しないため新規作成する。詳細は本タスク末尾の逸脱メモ参照）

**Interfaces:**
- Consumes: なし(プロンプト文書)。
- Produces: `docs/study-dialogue.md`の「共通の前提」節・「記録フロー」節・「記録の編集・削除フロー」節。計画2がこのファイルに「予定フロー」「学習計画フロー」節を追記する(見出しのみ用意)。

### ステップ

1. `docs/study-dialogue.md`を新規作成する(プロンプト文書のため自動テスト対象外。全文を掲載)。

```md
# 対話での記録・予定・学習計画 手順書

**この手順の質問順・選択肢を変更してはならない。** ユーザーが手順外の情報を先に出した場合も、
すでに分かっている項目は聞き返さず、抜けている項目だけを手順の順序で聞くこと。

このファイルは、Claude Code / Codex との対話で「今日の記録つけて」「予定に追加して」
「明日の計画立てて」等と言われたときに読み込む手順書である。
docs/superpowers/specs/2026-07-25-vault-dialogue-records-schedule-design.md の
「対話フロー」節を実装する。**CLI固有のツール名(`AskUserQuestion`等)には依存しない**
(`analysis/nightly.md`と同じ方針)。番号を選んで答える、プレーンテキスト形式で進める。

## 共通の前提

- 書き込みの前に、環境変数`STUDY_AI_VAULT_DIR`が解決できることを確認する
  (シェル環境にあればそれを使う。無ければ`analysis/.env`の`STUDY_AI_VAULT_DIR=`行を読む)。
  **どちらにも無ければエラーを提示し、書き込みを一切行わない**(黙って別の場所に書かない)。
- vaultへの書き込みは、必ず`analysis/helpers/`配下のスクリプトをシェルコマンド実行
  (`node analysis/helpers/<name>.mjs ...`)で呼ぶ。ファイルを直接編集しない。
- 各スクリプトは標準出力にJSONを返す(既存の `printJson` は `JSON.stringify(data, null, 2)` を使うため、1行ではなく整形された複数行JSONになる)。エラー時は非ゼロ終了・標準エラーに
  メッセージを出す。エラーになった場合は、その場でユーザーにエラー内容を提示し、
  どこまで書けたか分かるものは分かる範囲で伝える。
- どの操作でも、最後に必ず「何を書いたか」を要約して提示する(例:
  「2026-07-25の記録に英語R 60分(教材・理解した)を追加しました」)。

## 記録フロー(「今日の記録つけて」等)

### 高速パス(まとめて1行で言われた場合)

ユーザーが「英語R 60 教材 理解した」「数学IA 90 共通2025第3問 曖昧」のように
**科目・時間・種別・理解度をひとまとめに1行(または科目ごとに1行)で言った場合は、
以降の番号選択の質問を省略し、そのまま解釈して書き込み内容の要約提示だけ行う**
(対象日は明示が無ければ今日とする)。あいまいで解釈できない項目だけ、
下記の番号選択フローで**その項目だけ**を聞き返す。

以下の番号選択フローは、ユーザーが科目名だけ言った場合や、高速パスで
解釈できなかった項目があった場合の**フォールバック**として使う。

### 番号選択フロー(聞き返しが必要なとき)

1. 科目を聞く。以下13科目を番号付きで提示し、スペース区切りで複数選択してよいことを伝える。

   ```
   1) 英語R  2) 英語L  3) 現代文  4) 古文  5) 漢文  6) 数学IA  7) 数学2BC
   8) 化学基礎  9) 地学基礎  10) 地理  11) 政治経済  12) 情報  13) 小論文
   ```

2. 選択された科目ごとに、以下を順番に聞く。

   1. 種別: `1) 教材 2) 共通テスト演習 3) 二次・記述`
      - `2) 共通テスト演習`を選んだ場合のみ追加で聞く: 年度(例: 2025)、大問(例: 第3問)。
   2. 時間: `1) 30分 2) 60分 3) 90分 4) 120分 5) その他(分数を直接入力)`
   3. 理解度: `1) 理解した 2) 曖昧 3) 理解できてない`
   4. メモ: 任意。スキップしてよい。
      **メモに` | `や改行を含めることはできない**(vaultの行フォーマットが壊れるため。
      `=`は含めてよい)。含まれていたら別の言い方に直してもらう。

3. 対象日(既定は今日、`YYYY-MM-DD`)を確認する。

4. 全科目分の入力が終わったら、書き込む内容を一覧にして提示し、確定してよいか確認する。

5. 確定後、科目ごとに以下のコマンドを実行する(`<date>`は対象日、`kind`は
   `material`/`common_test`/`secondary`、`understanding`は
   `understood`/`uncertain`/`not_understood`)。

   ```
   node analysis/helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo>
   # kind=common_test のときのみ year/section を末尾に追加:
   node analysis/helpers/record-session.mjs <date> <subject> <minutes> common_test <understanding> <memo> <year> <section>
   ```

6. 各コマンドの標準出力(JSON)から書き込まれた`session`を確認し、最後に
   「何を書いたか」を要約して提示する。

### 複数日分をまとめて入れる場合

「昨日と今日の記録をまとめて」のように複数日分をまとめて言われた場合は、
対象日ごとに上記フローを繰り返す(高速パスで解釈できるならその日ごとに要約だけ出す)。
コマンド実行(ステップ5)は日付・科目の組み合わせごとに1回ずつ行う。

### 後から思い出して直す場合

「そういえば昨日も英語やってた、追加しといて」のように後から過去の日付に
追記したい場合も記録フローと同じ手順で進める。対象日(ステップ3)を過去の日付に
読み替えるだけでよい。

### やってはいけないこと

- vaultのファイルを直接編集しない(`analysis/helpers/*.mjs`経由のみ)。
- ユーザーの確認前に書き込みコマンドを実行しない。
- メモに` | `や改行を入れない(スクリプトがエラーで拒否するので、言い直してもらう)。

## 記録の編集・削除フロー(「さっきの記録直して」「今日の記録消して」等)

1. 対象日(既定は今日)を確認し、その日の記録一覧をidつきで提示する。
   一覧の取得は次のコマンドで行う(`body`をこのファイルの規約([記録フォーマット]
   (../superpowers/specs/2026-07-25-phase2-conventions-contract.md)の1a節)に沿って
   人間可読な形にまとめて提示する)。

   ```
   node analysis/helpers/read-vault-file.mjs records/<date>.md
   ```

2. どのid(例: `s-2`)を、どう直すか(または削除するか)を選んでもらう。
   - 直す場合: 変更したい項目(時間・種別・理解度・メモ等)と新しい値を聞く。
   - 削除する場合: 対象idを確認し、本当に削除してよいか確認する。

3. 確定後、以下のいずれかを実行する。

   ```
   # 編集(patchJSONは変更したいキーのみを含むJSON)
   node analysis/helpers/edit-session.mjs <date> <id> '{"minutes":90,"memo":"やり直し"}'

   # 削除
   node analysis/helpers/delete-session.mjs <date> <id>
   ```

4. 結果(JSON)を確認し、何を変更/削除したかを要約して提示する。

### やってはいけないこと

- vaultのファイルを直接編集しない(`analysis/helpers/*.mjs`経由のみ)。
- ユーザーの確認前に編集・削除コマンドを実行しない。
- メモに` | `や改行を入れない。

## 予定フロー(「予定に追加して」「予定確認して」等)

(計画2が追記する。予定・締切の追加/一覧/変更/削除フローをここに書く。)

## 学習計画フロー(「明日の計画立てて」等)

(計画2が追記する。学習計画ブロックの作成・実行状況更新フローをここに書く。)
```

2. `AGENTS.md`をリポジトリ直下に新規作成する(全文)。

```md
# AGENTS.md

このリポジトリで対話エージェント(Claude Code / Codex CLI)として作業する際の
参照先をまとめる。

- 勉強記録・予定・学習計画の話題が出たら、**まず`docs/study-dialogue.md`を読み**、
  その手順書に従うこと(vaultへの書き込みは`analysis/helpers/*.mjs`経由に限る。
  ファイルを直接編集しない)。
- 夜間分析バッチについては `analysis/nightly.md` を参照。
- vaultのファイル規約は `docs/superpowers/specs/2026-07-24-vault-conventions-contract.md`
  および `docs/superpowers/specs/2026-07-25-phase2-conventions-contract.md` を参照。
```

3. `CLAUDE.md`をリポジトリ直下に新規作成する(全文)。

```md
# CLAUDE.md

このリポジトリでClaude Codeとして作業する際の参照先をまとめる。

- 勉強記録・予定・学習計画の話題が出たら、**まず`docs/study-dialogue.md`を読み**、
  その手順書に従うこと(vaultへの書き込みは`analysis/helpers/*.mjs`経由に限る。
  ファイルを直接編集しない)。
- 夜間分析バッチについては `analysis/nightly.md` を参照。
- vaultのファイル規約は `docs/superpowers/specs/2026-07-24-vault-conventions-contract.md`
  および `docs/superpowers/specs/2026-07-25-phase2-conventions-contract.md` を参照。
```

4. 手動確認する(自動テスト対象外)。

```bash
test -f docs/study-dialogue.md && test -f AGENTS.md && test -f CLAUDE.md && echo OK
```

期待する出力: `OK`。

5. コミットする。

```bash
git add docs/study-dialogue.md AGENTS.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add study-dialogue.md with a fast path and enforcement wording, reference it from AGENTS.md/CLAUDE.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

**逸脱メモ**: 契約4は「`CLAUDE.md`と`AGENTS.md`の双方に…追記する(`AGENTS.md`が無ければ新規作成)」としており、`CLAUDE.md`は既存を前提にしていた。しかし本リポジトリの直下には`CLAUDE.md`・`AGENTS.md`のどちらも存在しない(確認済み)。そのため本タスクでは両方を新規作成する。将来的にどちらかが別の目的で追加された場合は、本タスクが書いた参照行をマージすること。

---

## Task 11: Web — `/records`をvault読みビューアに置き換え、`/record`削除、BottomNav更新、E2E破損分の始末

**Files:**
- Modify: `src/app/records/page.tsx`
- Delete: `src/app/record/` ディレクトリ一式(`src/app/record/page.tsx`ほか)
- Modify: `src/components/BottomNav.tsx`
- Modify: `e2e/extended-flows.spec.ts`

**Interfaces:**
- Consumes: `@/lib/vault`の`listStudyRecordDates`/`readStudyRecord`/`StudyRecordDay`(Task 4)、既存`@/lib/study-session`の`RECORD_TYPE_LABELS`、既存`@/lib/learning`の`UNDERSTANDING_LABELS`(キー集合が契約の`StudyKind`/`Understanding`と完全一致するため、表示ラベルとして再利用する。契約の型・関数名は変更しない)。
- Produces: なし(ページ・ナビゲーションの末端コンポーネント)。Task 12(E2E)がこの表示を検証する。

### ステップ

このタスクはページ全文置き換えのためTDDではなく「全文掲載→検証コマンド→commit」の形にする。

1. `src/app/records/page.tsx`を以下の内容で全置換する。**1日分の読み込みが失敗しても他の日の表示を道連れにしない**よう、日ごとに`try/catch`する(frontmatter破損などで`readStudyRecord`が想定外にthrowしても、その日だけ「読み込めませんでした」と控えめに表示し、ページ全体は500にしない)。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import {
  listStudyRecordDates,
  readStudyRecord,
  type StudyRecordDay,
  type StudySession,
} from "@/lib/vault";
import { RECORD_TYPE_LABELS } from "@/lib/study-session";
import { UNDERSTANDING_LABELS } from "@/lib/learning";

export const dynamic = "force-dynamic";

type DayResult = { status: "ok"; day: StudyRecordDay } | { status: "error"; date: string };

function sessionDetailLine(session: StudySession): string {
  if (session.kind === "common_test") {
    return `${RECORD_TYPE_LABELS[session.kind]} ・ ${session.year ?? "年度未指定"}年度・${session.section ?? "年度通し"}`;
  }
  return RECORD_TYPE_LABELS[session.kind];
}

export default async function RecordsPage() {
  const dates = await listStudyRecordDates();
  const results: DayResult[] = await Promise.all(
    dates.map(async (date): Promise<DayResult> => {
      try {
        return { status: "ok", day: await readStudyRecord(date) };
      } catch {
        return { status: "error", date };
      }
    })
  );

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        履歴
      </Typography>
      {results.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          まだ学習記録がありません。
        </Typography>
      )}
      <Stack spacing={3}>
        {results.map((result) => {
          if (result.status === "error") {
            return (
              <Paper key={result.date} variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {result.date}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  この日の記録を読み込めませんでした。
                </Typography>
              </Paper>
            );
          }

          const day = result.day;
          const bySubject = new Map<string, number>();
          for (const session of day.sessions) {
            bySubject.set(session.subject, (bySubject.get(session.subject) ?? 0) + session.minutes);
          }
          const subjectTotals = Array.from(bySubject.entries()).sort((a, b) => b[1] - a[1]);

          return (
            <Box key={day.date}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {day.date}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
                {subjectTotals.map(([subject, minutes]) => (
                  <Chip key={subject} label={`${subject} ${minutes}分`} size="small" />
                ))}
              </Stack>
              <Stack spacing={1}>
                {day.sessions.map((session) => (
                  <Paper key={session.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" fontWeight={700}>
                        {session.subject} ・ {session.minutes}分
                      </Typography>
                      <Chip size="small" label={UNDERSTANDING_LABELS[session.understanding]} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {sessionDetailLine(session)}
                    </Typography>
                    {session.memo && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                        メモ: {session.memo}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
```

2. `src/app/record/`ディレクトリを削除する。

```bash
git rm -r src/app/record
```

3. `src/components/BottomNav.tsx`を編集し、「記録」タブを削除する(`NAV_ITEMS`から該当行を除去する。他のタブ・アイコンimportは変更しない)。

```tsx
// 変更前:
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

// 変更後:
const NAV_ITEMS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "履歴", value: "/records", icon: <ListAltIcon /> },
  { label: "分析", value: "/stats", icon: <InsightsIcon /> },
  { label: "予定", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "レポート", value: "/reports", icon: <ArticleIcon /> },
  { label: "カルテ", value: "/karte", icon: <MedicalInformationIcon /> },
  { label: "設定", value: "/settings", icon: <SettingsIcon /> },
];
```

未使用になった`EditNoteIcon`のimportも削除する:

```tsx
// 削除する行
import EditNoteIcon from "@mui/icons-material/EditNote";
```

`MOBILE_TABS`は先頭4件(`NAV_ITEMS.slice(0, 4)`)のロジックのまま変更不要
(結果として今日/履歴/分析/予定の4タブになる)。

4. `e2e/extended-flows.spec.ts`から1件目のテスト(「履歴の記録を編集して削除できる」、`/record`へ`goto`するため`/record`削除と同時に壊れる)を削除する。**自分が壊したテストは自分のTask内で始末する**。2件目「繰り返し時間割を作成できる」・3件目「週の学習時間を保存できる」は計画2の担当(前者は削除、後者は`/stats`の唯一のE2Eカバレッジとして保全)のため触らない。

```ts
// e2e/extended-flows.spec.ts を以下の内容で全置換する(1件目のテストのみ削除)
import { expect, test } from "@playwright/test";

test("繰り返し時間割を作成できる", async ({ page }) => {
  const memo = `E2E時間割-${crypto.randomUUID()}`;
  // plan_blocks are only rendered for the currently selected date, and the
  // recurring plan only creates rows on the chosen weekdays starting today.
  // Pick today's weekday chip so the first generated block lands on the
  // already-selected date (today) and is visible without navigating.
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const todayLabel = weekdayLabels[new Date().getDay()];

  await page.goto("/schedule");
  await page.getByRole("button", { name: "時間割" }).click();
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("button", { name: "毎週繰り返し" }).click();
  await page.getByText(todayLabel, { exact: true }).last().click();
  await page.getByLabel("メモ（任意）").fill(memo);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(memo, { exact: true }).first()).toBeVisible();
});

test("週の学習時間を保存できる", async ({ page }) => {
  await page.goto("/stats");
  await page.getByLabel("週合計（分）").fill("345");
  await page.getByRole("button", { name: "保存" }).first().click();
  await expect(page.getByText("週次振り返り・来週の重点")).toBeVisible();
});
```

5. 検証する。

```bash
npx tsc --noEmit
npm run lint
```

期待する出力: どちらもエラー0件で終了する(`tsc`は無出力で終了コード0、`lint`は`✔ No ESLint warnings or errors`相当)。

6. コミットする。

```bash
git add src/app/records/page.tsx src/components/BottomNav.tsx e2e/extended-flows.spec.ts
git commit -m "$(cat <<'EOF'
feat(web): replace /records with a vault-backed viewer, drop /record and its nav tab

Also removes the extended-flows E2E test that exercised the now-deleted
/record page (own the E2E breakage caused by this task; the other two
tests in that spec remain plan2's responsibility).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: E2E — `e2e/core-flows.spec.ts`改廃 + vaultフィクスチャ追加

**Files:**
- Modify: `e2e/core-flows.spec.ts`
- Create: `e2e/fixtures/vault/records/2026-07-24.md`

**Interfaces:**
- Consumes: Task 11の`/records`ページ、既存`e2e/fixtures/vault/`ディレクトリ構成。
- Produces: なし(E2Eテストの末端)。

### ステップ

このタスクはE2EのためTDDのstep構成ではなく「全文掲載→実行コマンド→期待結果→commit」とする。

1. `e2e/fixtures/vault/records/2026-07-24.md`を新規作成する。

```md
---
type: study-record
date: 2026-07-24
source: dialogue
schema_version: 1
updated: 2026-07-24T22:10:00+09:00
---

## セッション
- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題
```

2. `e2e/core-flows.spec.ts`を以下の内容で全置換する(`/record`での保存フローのテストを削除し、
   vaultフィクスチャに対する`/records`表示検証に差し替える。3件目の
   「締切予定を作成して編集できる」テストは`/schedule`の対話化(計画2)が担当するため
   本タスクでは変更しない)。

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

test("締切予定を作成して編集できる", async ({ page }) => {
  const title = `E2E締切-${crypto.randomUUID()}`;
  const updatedTitle = `${title}-更新`;
  await page.goto("/schedule");
  await page.getByRole("button", { name: /追加/ }).click();
  await page.getByLabel("タイトル").fill(title);
  await page.getByRole("button", { name: "保存" }).click();
  const eventTitle = page.getByText(title, { exact: true });
  await expect(eventTitle).toBeVisible();
  await eventTitle.locator("xpath=../..").getByLabel("予定を編集").click();
  await page.getByLabel("タイトル").fill(updatedTitle);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
});
```

3. 検証する。**この計画(計画1)が保証できるのは新設した2件だけであり、3件目「締切予定を作成して編集できる」は`/schedule`(計画2の担当領域)に依存するため、`--grep`で新設した2件だけを対象に実行し、結果を確定させる。**

```bash
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- e2e/core-flows.spec.ts --grep "主要画面を認証済みで表示できる|vaultフィクスチャの学習記録が履歴に表示される"
```

期待する出力: `2 passed`。

4. コミットする。

```bash
git add e2e/core-flows.spec.ts e2e/fixtures/vault/records/2026-07-24.md
git commit -m "$(cat <<'EOF'
test(e2e): replace /record save flow with a vault-fixture /records check

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## 完了確認(全体)

全タスク完了後、以下を通しで実行し、計画1の範囲がグリーンであることを確認する。

```bash
npx vitest run src/lib/vault
npm run test:analysis
npx tsc --noEmit
npm run lint
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- e2e/core-flows.spec.ts e2e/vault-reports.spec.ts
```

`e2e/extended-flows.spec.ts`の残り2件(繰り返し時間割・週の学習時間、計画2の担当)・`e2e/atomicity.spec.ts`・`/schedule`・`/`(今日)・push通知一式・
過去データ移行スクリプトは計画2・計画3の担当であり、本計画では変更しない。
