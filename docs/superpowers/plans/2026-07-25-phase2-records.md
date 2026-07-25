# Phase 2: Study Records via Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対話(Claude Code / Codex)から勉強記録を`vault/records/YYYY-MM-DD.md`へ追記・編集・削除できるようにし、`/records`をvault読みの履歴ビューアに置き換える。

**Architecture:** Node側(`analysis/helpers/vault/study-sessions.mjs`)が記録行のパース/フォーマット/追記/編集/削除を担う書き込み専用実装、TS側(`src/lib/vault/study-sessions.ts`)が同じ行フォーマットを読むだけの実装を持つ。両者は同一フィクスチャ文字列で解釈結果が一致することをテストで担保する。対話は`analysis/helpers/`直下の薄いCLIラッパー(`record-session.mjs`等)をシェル経由で呼ぶ。Webは`/records`がServer Componentとして`vault/records/*.md`を`fs`で読むだけになり、`/record`(入力フォーム)は削除する。

**Tech Stack:** Next.js (App Router, Server Components) / TypeScript / Node.js標準ライブラリ(`node:fs/promises`, `node:test`) / Vitest / Playwright

## Global Constraints

- vaultルートは Phase 1 と同じ環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw（黙って別パスに書かない）。
- **TS実装（`src/lib/vault/`）と Node実装（`analysis/helpers/vault/`）は同一フォーマットを完全に同じ構造へ解釈すること。** 同一フィクスチャ文字列を両テストに置いて検証する（Phase 1 と同じ方式）。
- Node側は **Node標準ライブラリのみ**（追加npm禁止）。TS側の fs アクセスは**サーバ側のみ**。
- 既存ヘルパ（`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/`stringifyFrontmatter`）は**再実装せず import して使う**。
- 行フォーマットの区切りは Phase 1 の要確認TODO行と同じ流儀：フィールドは **` | `**、`key=value` は**最初の `=` で分割**。値に ` | ` や `=` は含められない。
- 壊れた行・必須キー欠落の行は**その行だけスキップ**し、全体を落とさない。
- `records/YYYY-MM-DD.md`の行頭は **`- `**（チェックボックスなし）。キー順固定：`id` `subject` `minutes` `kind`（`kind=common_test`のときのみ`year` `section`）`understanding` `memo`。`id`は`s-<連番>`。

---

## Task 1: TS側 — 記録のパース/フォーマット(`src/lib/vault/study-sessions.ts`)

**Files:**
- Create: `src/lib/vault/study-sessions.ts`
- Create: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: なし(新規ファイル)。
- Produces: `StudyKind`, `Understanding`, `StudySession`型、`parseStudySessions(body: string): StudySession[]`、`formatStudySessionLine(session: StudySession): string`。Task 2・Task 3・計画1の他タスクが利用する。

### ステップ

1. 失敗するテストを書く。

```ts
// src/lib/vault/study-sessions.test.ts
import { describe, expect, it } from "vitest";
import { parseStudySessions, formatStudySessionLine, type StudySession } from "./study-sessions";

// NOTE: analysis/test/vault-study-sessions.test.mjs の同名テストと
//       BODY文字列が一字一句同一 (契約: TS版とNode版でパース結果を完全一致させる)
const BODY = [
  "## セッション",
  "- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題",
  "- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=",
].join("\n");

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
});
```

2. 失敗を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Cannot find module './study-sessions'` またはそれに類するインポートエラーでテストが失敗する。

3. 最小実装を書く。

```ts
// src/lib/vault/study-sessions.ts
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

4. 成功を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Test Files  1 passed (1)` / `Tests  5 passed (5)`。

5. コミットする。

```bash
git add src/lib/vault/study-sessions.ts src/lib/vault/study-sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add TS parser/formatter for study record session lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: TS側 — `readStudyRecord` / `listStudyRecordDates`

**Files:**
- Modify: `src/lib/vault/study-sessions.ts`
- Modify: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: `readVaultFile`(`./read`)、`getVaultRoot`(`./root`)、Task 1の`parseStudySessions`。
- Produces: `StudyRecordDay`型、`readStudyRecord(date: string): Promise<StudyRecordDay>`、`listStudyRecordDates(): Promise<string[]>`。Task 3のバレル・`/records`ページ(Task 9)が利用する。

### ステップ

1. 失敗するテストを追記する。

```ts
// src/lib/vault/study-sessions.test.ts に追記
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
```

4. 成功を確認する。

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```

期待する出力: `Tests  9 passed (9)`。

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

## Task 3: TS側 — バレル再エクスポート

**Files:**
- Modify: `src/lib/vault/index.ts`
- Modify: `src/lib/vault/index.test.ts`

**Interfaces:**
- Consumes: Task 1・2の全エクスポート。
- Produces: `@/lib/vault`から`StudyKind`/`Understanding`/`StudySession`/`StudyRecordDay`/`parseStudySessions`/`formatStudySessionLine`/`readStudyRecord`/`listStudyRecordDates`をimport可能にする。Task 9(`/records`ページ)が利用する。

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

## Task 4: Node側 — 記録のパース/フォーマット/採番(`analysis/helpers/vault/study-sessions.mjs`)

**Files:**
- Create: `analysis/helpers/vault/study-sessions.mjs`
- Create: `analysis/test/vault-study-sessions.test.mjs`

**Interfaces:**
- Consumes: なし(新規ファイル)。
- Produces: `parseStudySessions(body)`、`formatStudySessionLine(session)`、`nextSessionId(sessions)`。Task 5・6・7が利用する。TS版(Task 1)と同一フィクスチャで解釈結果が一致することをここで検証する。

### ステップ

1. 失敗するテストを書く。

```js
// analysis/test/vault-study-sessions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudySessions, formatStudySessionLine, nextSessionId } from '../helpers/vault/study-sessions.mjs';

// NOTE: src/lib/vault/study-sessions.test.ts の parseStudySessions/formatStudySessionLine
//       テストとBODY/期待値が一字一句同一 (契約: TS版とNode版でパース結果を完全一致させる)
const BODY = [
  '## セッション',
  '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題',
  '- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=',
].join('\n');

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
// analysis/helpers/vault/study-sessions.mjs
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

期待する出力: `# pass 6` (6テストすべて成功、failが0)。

5. コミットする。

```bash
git add analysis/helpers/vault/study-sessions.mjs analysis/test/vault-study-sessions.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add Node parser/formatter/id-allocator for study sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Node側 — `appendStudySession` / `updateStudySession` / `deleteStudySession`

**Files:**
- Modify: `analysis/helpers/vault/study-sessions.mjs`
- Modify: `analysis/test/vault-study-sessions.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`/`writeVaultFile`(`./read-write.mjs`)、Task 4の`parseStudySessions`/`formatStudySessionLine`。
- Produces: `appendStudySession(date, session)`、`updateStudySession(date, id, patch)`、`deleteStudySession(date, id)`。Task 6のバレル・Task 7のCLIラッパーが利用する。

### ステップ

1. 失敗するテストを追記する。

```js
// analysis/test/vault-study-sessions.test.mjs に追記
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
```

2. 失敗を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `appendStudySession`等が存在しないためインポートエラーで失敗する。

3. 最小実装を追記する。

```js
// analysis/helpers/vault/study-sessions.mjs に追記
import { readVaultFile, writeVaultFile } from './read-write.mjs';

async function readDay(date) {
  const relPath = `records/${date}.md`;
  try {
    const { frontmatter, body } = await readVaultFile(relPath);
    return { relPath, frontmatter, sessions: parseStudySessions(body) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      relPath,
      frontmatter: { type: 'study-record', date, source: 'dialogue', schema_version: 1 },
      sessions: [],
    };
  }
}

async function writeDay(relPath, frontmatter, sessions) {
  const updated = new Date().toISOString();
  const body = ['## セッション', ...sessions.map((session) => formatStudySessionLine(session))].join('\n') + '\n';
  await writeVaultFile(relPath, { ...frontmatter, updated }, body);
}

export async function appendStudySession(date, session) {
  const day = await readDay(date);
  await writeDay(day.relPath, day.frontmatter, [...day.sessions, session]);
}

export async function updateStudySession(date, id, patch) {
  const day = await readDay(date);
  let found = false;
  const sessions = day.sessions.map((session) => {
    if (session.id !== id) return session;
    found = true;
    return { ...session, ...patch, id };
  });
  if (!found) throw new Error(`updateStudySession: session not found: ${id}`);
  await writeDay(day.relPath, day.frontmatter, sessions);
}

export async function deleteStudySession(date, id) {
  const day = await readDay(date);
  const sessions = day.sessions.filter((session) => session.id !== id);
  if (sessions.length === day.sessions.length) {
    throw new Error(`deleteStudySession: session not found: ${id}`);
  }
  await writeDay(day.relPath, day.frontmatter, sessions);
}
```

4. 成功を確認する。

```bash
node --test analysis/test/vault-study-sessions.test.mjs
```

期待する出力: `# pass 10` (10テストすべて成功、failが0)。

5. コミットする。

```bash
git add analysis/helpers/vault/study-sessions.mjs analysis/test/vault-study-sessions.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add append/update/delete writers for study sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Node側 — バレル再エクスポート

**Files:**
- Modify: `analysis/helpers/vault/index.mjs`
- Modify: `analysis/test/vault-index.test.mjs`

**Interfaces:**
- Consumes: Task 4・5の全エクスポート。
- Produces: `analysis/helpers/vault/index.mjs`から`parseStudySessions`/`formatStudySessionLine`/`nextSessionId`/`appendStudySession`/`updateStudySession`/`deleteStudySession`をimport可能にする。Task 7のCLIラッパーが利用する。

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

## Task 7: CLIラッパー — `record-session.mjs` / `edit-session.mjs` / `delete-session.mjs`

**Files:**
- Create: `analysis/helpers/record-session.mjs`
- Create: `analysis/helpers/edit-session.mjs`
- Create: `analysis/helpers/delete-session.mjs`
- Create: `analysis/test/session-cli-wrappers.test.mjs`

**Interfaces:**
- Consumes: `analysis/helpers/vault/index.mjs`の`readVaultFile`/`parseStudySessions`/`nextSessionId`/`appendStudySession`/`updateStudySession`/`deleteStudySession`、`analysis/helpers/lib.mjs`の`printJson`。
- Produces: 各ファイルが`run(argv)`をエクスポート(対話がシェルから`node analysis/helpers/record-session.mjs ...`等で呼ぶ)。`docs/study-dialogue.md`(Task 8)が使い方を参照する。

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
```

2. 失敗を確認する。

```bash
node --test analysis/test/session-cli-wrappers.test.mjs
```

期待する出力: `Cannot find module '../helpers/record-session.mjs'`等でテストが失敗する。

3. 最小実装を書く。

```js
// analysis/helpers/record-session.mjs
#!/usr/bin/env node
// vault/records/<date>.md に学習セッションを1件追記する。契約3a `appendStudySession`/`nextSessionId` のCLIラッパー。
// 使い方: node analysis/helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo> [year] [section]
//   kind=common_test のときのみ year/section を渡す(それ以外は省略してよい)。
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export async function run([date, subject, minutes, kind, understanding, memo, year, section]) {
  if (!date || !subject || !minutes || !kind || !understanding) {
    throw new Error('使い方: node helpers/record-session.mjs <date> <subject> <minutes> <kind> <understanding> <memo> [year] [section]');
  }
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

export async function run([date, id, patchArg]) {
  if (!date || !id || !patchArg) {
    throw new Error('使い方: node helpers/edit-session.mjs <date> <id> <patchJSON>');
  }
  const patch = JSON.parse(patchArg);
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

export async function run([date, id]) {
  if (!date || !id) {
    throw new Error('使い方: node helpers/delete-session.mjs <date> <id>');
  }
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

期待する出力: `# pass 4` (fail 0)。

5. コミットする。

```bash
git add analysis/helpers/record-session.mjs analysis/helpers/edit-session.mjs analysis/helpers/delete-session.mjs analysis/test/session-cli-wrappers.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add record/edit/delete-session CLI wrappers for dialogue writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 対話手順書 `docs/study-dialogue.md` + `CLAUDE.md`/`AGENTS.md`参照

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
- 各スクリプトは標準出力にJSONを1行で返す。エラー時は非ゼロ終了・標準エラーに
  メッセージを出す。エラーになった場合は、その場でユーザーにエラー内容を提示し、
  どこまで書けたか分かるものは分かる範囲で伝える。
- どの操作でも、最後に必ず「何を書いたか」を要約して提示する(例:
  「2026-07-25の記録に英語R 60分(教材・理解した)を追加しました」)。

## 記録フロー(「今日の記録つけて」等)

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
      **メモに` | `や`=`を含めることはできない**(vaultの行フォーマットが壊れるため)。
      含まれていたら全角に置き換えるか、別の言い方に直してもらう。

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

- 勉強記録・予定・学習計画をユーザーとの対話で追加/編集/削除する場合は、
  必ず `docs/study-dialogue.md` の手順書に従うこと(vaultへの書き込みは
  `analysis/helpers/*.mjs` 経由に限る。ファイルを直接編集しない)。
- 夜間分析バッチについては `analysis/nightly.md` を参照。
- vaultのファイル規約は `docs/superpowers/specs/2026-07-24-vault-conventions-contract.md`
  および `docs/superpowers/specs/2026-07-25-phase2-conventions-contract.md` を参照。
```

3. `CLAUDE.md`をリポジトリ直下に新規作成する(全文)。

```md
# CLAUDE.md

このリポジトリでClaude Codeとして作業する際の参照先をまとめる。

- 勉強記録・予定・学習計画をユーザーとの対話で追加/編集/削除する場合は、
  必ず `docs/study-dialogue.md` の手順書に従うこと(vaultへの書き込みは
  `analysis/helpers/*.mjs` 経由に限る。ファイルを直接編集しない)。
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
docs: add study-dialogue.md skeleton and reference it from AGENTS.md/CLAUDE.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

**逸脱メモ**: 契約4は「`CLAUDE.md`と`AGENTS.md`の双方に…追記する(`AGENTS.md`が無ければ新規作成)」としており、`CLAUDE.md`は既存を前提にしていた。しかし本リポジトリの直下には`CLAUDE.md`・`AGENTS.md`のどちらも存在しない(確認済み)。そのため本タスクでは両方を新規作成する。将来的にどちらかが別の目的で追加された場合は、本タスクが書いた参照行をマージすること。

---

## Task 9: Web — `/records`をvault読みビューアに置き換え、`/record`削除、BottomNav更新

**Files:**
- Modify: `src/app/records/page.tsx`
- Delete: `src/app/record/` ディレクトリ一式(`src/app/record/page.tsx`ほか)
- Modify: `src/components/BottomNav.tsx`

**Interfaces:**
- Consumes: `@/lib/vault`の`listStudyRecordDates`/`readStudyRecord`(Task 3)、既存`@/lib/study-session`の`RECORD_TYPE_LABELS`、既存`@/lib/learning`の`UNDERSTANDING_LABELS`(キー集合が契約の`StudyKind`/`Understanding`と完全一致するため、表示ラベルとして再利用する。契約の型・関数名は変更しない)。
- Produces: なし(ページ・ナビゲーションの末端コンポーネント)。Task 10(E2E)がこの表示を検証する。

### ステップ

このタスクはページ全文置き換えのためTDDではなく「全文掲載→検証コマンド→commit」の形にする。

1. `src/app/records/page.tsx`を以下の内容で全置換する。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import { listStudyRecordDates, readStudyRecord, type StudySession } from "@/lib/vault";
import { RECORD_TYPE_LABELS } from "@/lib/study-session";
import { UNDERSTANDING_LABELS } from "@/lib/learning";

export const dynamic = "force-dynamic";

function sessionDetailLine(session: StudySession): string {
  if (session.kind === "common_test") {
    return `${RECORD_TYPE_LABELS[session.kind]} ・ ${session.year ?? "年度未指定"}年度・${session.section ?? "年度通し"}`;
  }
  return RECORD_TYPE_LABELS[session.kind];
}

export default async function RecordsPage() {
  const dates = await listStudyRecordDates();
  const days = await Promise.all(dates.map((date) => readStudyRecord(date)));

  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        履歴
      </Typography>
      {days.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          まだ学習記録がありません。
        </Typography>
      )}
      <Stack spacing={3}>
        {days.map((day) => {
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

4. 検証する。

```bash
npx tsc --noEmit
npm run lint
```

期待する出力: どちらもエラー0件で終了する(`tsc`は無出力で終了コード0、`lint`は`✔ No ESLint warnings or errors`相当)。

5. コミットする。

```bash
git add src/app/records/page.tsx src/components/BottomNav.tsx
git commit -m "$(cat <<'EOF'
feat(web): replace /records with a vault-backed viewer, drop /record and its nav tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E — `e2e/core-flows.spec.ts`改廃 + vaultフィクスチャ追加

**Files:**
- Modify: `e2e/core-flows.spec.ts`
- Create: `e2e/fixtures/vault/records/2026-07-24.md`

**Interfaces:**
- Consumes: Task 9の`/records`ページ、既存`e2e/fixtures/vault/`ディレクトリ構成。
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

3. 検証する。

```bash
STUDY_AI_VAULT_DIR="$(pwd)/e2e/fixtures/vault" npm run test:e2e -- e2e/core-flows.spec.ts
```

期待する出力: `2 passed`と`1 passed`のいずれか(実行環境に既存Supabaseデータがあれば3件目は
挙動未変更のため従来どおり通る想定)。少なくとも新設した2件(`主要画面を認証済みで表示できる`、
`vaultフィクスチャの学習記録が履歴に表示される`)が失敗しないこと。

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

`e2e/extended-flows.spec.ts`・`e2e/atomicity.spec.ts`・`/schedule`・`/`(今日)・push通知一式・
過去データ移行スクリプトは計画2・計画3の担当であり、本計画では変更しない。
