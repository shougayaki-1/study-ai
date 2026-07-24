# Nightly Batch Vault Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 夜間分析バッチ(`analysis/nightly.md`)のSupabase読み書きをvaultファイル操作へ置換し、Inbox解析→仕分け→訂正反映→カルテ差分更新→レポート生成→ラン完了の7ステップ(親スペック「夜間バッチの新フロー」)をvault規約契約(3a/3b/4b)に準拠して実行できるようにする。

**Architecture:** `analysis/helpers/vault/`(Foundation計画が実装する契約4bの汎用ヘルパ: `vaultRoot`/`parseFrontmatter`/`stringifyFrontmatter`/`readVaultFile`/`writeVaultFile`/`archivePhoto`/`readCorrections`/`clearCorrections`)を、`analysis/helpers/`直下の薄いCLIラッパー(`read-vault-file.mjs`等)経由でシェルから呼び出せるようにする。加えて、要確認TODO整形・run-log frontmatter遷移・カルテ/誤答ログの差分追記・Inbox一覧フィルタといったバッチ固有の決定的処理を、契約4bに依存しない純粋関数として切り出して`node --test`で先にテストし、その後に契約4bへの薄い依存(動的import)を足す2層構成にする。`analysis/nightly.md`はこれら新ヘルパをシェル経由で呼び出すプロンプト文書として全面改訂する。

**Tech Stack:** Node.js 18+ (ESM, `node:test`, `node:assert/strict`, `node:fs`, `node:fs/promises`)。追加npmパッケージは使わない。

## Global Constraints

- 環境変数 `STUDY_AI_VAULT_DIR` が未設定の場合、vault操作は必ずthrowする(契約4bの`vaultRoot()`が担保する。本計画のヘルパは黙って別パスにフォールバックしない)。
- Node標準機能のみを使う。`analysis/`配下に追加npmパッケージをインストールしない(`npm install`しない)。
- 本計画が変更してよいのは `analysis/` 配下(`analysis/helpers/*.mjs`, `analysis/test/*.test.mjs`, `analysis/nightly.md`, `analysis/README.md`, `analysis/.env.example`)のみ。`src/`・`supabase/`・`analysis/helpers/vault/`(Foundation計画の担当)は変更しない。
- `npm install` / `npm run build` は実行しない。
- 夜間バッチのプロンプト(`analysis/nightly.md`)は特定CLI(Claude Code/Codex)のツール名に依存しない書き方を維持し、`STUDY_AI_AGENT_CLI`によるCLI切替(`analysis/run-nightly.sh`)を壊さない。
- 画像原本は削除せず`_archive/YYYY/MM/`へ移動する(非破壊)。`_inbox/`の消化(アーカイブ移動)はランが成功する前提で行い、回復不能なエラー時は`_inbox/`にエントリを残す。
- 契約4bの関数名・シグネチャ(`vaultRoot`, `parseFrontmatter`, `stringifyFrontmatter`, `readVaultFile`, `writeVaultFile`, `archivePhoto`, `readCorrections`, `clearCorrections`)は1文字も変えず、`analysis/helpers/vault/index.mjs`からのバレルimportとして消費する(Foundation計画の実装済み構成: `analysis/helpers/vault/root.mjs`, `frontmatter.mjs`, `read-write.mjs`, `archive.mjs`, `corrections.mjs` を`index.mjs`が再export)。本計画のヘルパから`analysis/helpers/vault/`配下を直接書き換えることはしない。
- 契約3aの要確認TODO行書式(`- [ ] id=... | q=... | options=... | default=... | ref=...`)、契約3bの`corrections.md`書式(バッチは読取と消化=クリアのみ、Webの追記行を書き換えない)、契約2のfrontmatterスキーマ(`type`/`updated`/`source`/`schema_version`および型別追加フィールド)を厳守する。
- 本計画のタスクはFoundation計画(`analysis/helpers/vault/`)の実装完了後に実行する依存関係を持つ。契約4bに依存しない純粋関数(フォーマット・フィルタ・マージロジック)のテストはFoundation計画と並行して先に書ける。
- 既存の `npm run test:analysis`(`node --test analysis/menubar-app/test/*.test.js analysis/test/*.test.mjs`)の枠に新テストを乗せる。テストファイルは`analysis/test/*.test.mjs`に置く。
- コミットメッセージ末尾には必ず `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` を入れる。

---

## Task 1: `analysis/.env.example` に `STUDY_AI_VAULT_DIR` を追記する

**Files:**
- Modify: `analysis/.env.example`

**Interfaces:** なし(ドキュメント/テンプレートのみの変更)。

このタスクはプロンプト/設定ドキュメントの改訂であり、TDDは馴染まない。変更後の全文を掲載し、手動確認手順を示す。

### 変更後の `analysis/.env.example` 全文

```
# analysis/.env にコピーして値を埋める。このファイル(.env)はGitにコミットしないこと。
# 取得場所や注意点は analysis/README.md を参照。

# vault(Google ドライブ同期フォルダ内の vault/)の絶対パス。
# 夜間バッチの全ヘルパ(analysis/helpers/vault/ 経由)はこのパスを唯一の正本として読み書きする。
# 未設定の場合、vault操作を行うヘルパーは即座にエラーで終了する。
STUDY_AI_VAULT_DIR=

# SupabaseプロジェクトのURL (例: https://xxxxxxxx.supabase.co)
# 夜間バッチ自体はもうSupabaseへアクセスしないが、menubar-app等の補助ツールが
# 参照する可能性があるため当面残す。
SUPABASE_URL=

# Supabase Service Role キー (Settings > API > service_role)
# 絶対にVercelの環境変数には設定しないこと。Macローカルのこのファイルのみに置く。
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] `analysis/.env.example`を上記内容に書き換える。
- [ ] 手動確認: `cat analysis/.env.example` を実行し、`STUDY_AI_VAULT_DIR=` の行が `SUPABASE_URL=` より前に追加されていることを目視確認する。
- [ ] 手動確認: `git diff analysis/.env.example` で意図しない行(既存の`SUPABASE_*`コメント削除など)が消えていないことを確認する。
- [ ] commit:
  ```bash
  git add analysis/.env.example
  git commit -m "$(cat <<'EOF'
docs(analysis): add STUDY_AI_VAULT_DIR to .env.example for vault batch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 2: Inbox一覧ヘルパ `list-inbox-items.mjs`(TDD、契約4b非依存)

**Files:**
- Create: `analysis/helpers/list-inbox-items.mjs`
- Test: `analysis/test/list-inbox-items.test.mjs`

**Interfaces:**
- Consumes: 実行時のみ契約4bの `vaultRoot`(`analysis/helpers/vault/index.mjs`からの動的import、`run()`内でのみ使用しテスト対象の純粋関数には影響しない)。
- Produces: `isProcessableInboxEntry(name: string): boolean`、`filterInboxEntries(names: string[]): string[]`、`run(): Promise<Array<{relPath, name, ext, mtime}>>`(CLI実行時のみ)。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/list-inbox-items.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { filterInboxEntries, isProcessableInboxEntry } from '../helpers/list-inbox-items.mjs';

  test('excludes corrections.md, hidden files, and Drive sync temp files', () => {
    const names = [
      'photo1.jpg',
      'corrections.md',
      '.DS_Store',
      'scan.pdf.tmp',
      'report.pdf.crdownload',
      'note.txt.icloud',
      'quiz.pdf',
    ];
    assert.deepEqual(filterInboxEntries(names), ['photo1.jpg', 'quiz.pdf']);
  });

  test('keeps ordinary image and pdf names', () => {
    assert.equal(isProcessableInboxEntry('IMG_0001.jpeg'), true);
    assert.equal(isProcessableInboxEntry('mock-exam.pdf'), true);
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/list-inbox-items.test.mjs` を実行する。
- [ ] 期待される出力: `Cannot find module '.../analysis/helpers/list-inbox-items.mjs'` というエラーでテストが失敗する。

### Step 2: 最小実装

- [ ] `analysis/helpers/list-inbox-items.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // _inbox/ のうち未処理の画像/PDFエントリだけを一覧する(corrections.md・隠しファイル・
  // Drive同期の一時ファイルは除外する)。契約4bに無い、夜間バッチ固有の一覧ヘルパー。
  // 使い方: node analysis/helpers/list-inbox-items.mjs
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';
  import { printJson } from './lib.mjs';

  const IGNORED_NAMES = new Set(['corrections.md']);
  const IGNORED_SUFFIXES = ['.tmp', '.crdownload', '.icloud', '.part'];

  export function isProcessableInboxEntry(name) {
    if (IGNORED_NAMES.has(name)) return false;
    if (name.startsWith('.')) return false;
    if (IGNORED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
    return true;
  }

  export function filterInboxEntries(names) {
    return names.filter(isProcessableInboxEntry);
  }

  export async function run() {
    const { vaultRoot } = await import('./vault/index.mjs');
    const { readdir, stat } = await import('node:fs/promises');
    const root = vaultRoot();
    const inboxDir = path.join(root, '_inbox');
    const names = await readdir(inboxDir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const targets = filterInboxEntries(names);
    const items = [];
    for (const name of targets) {
      const info = await stat(path.join(inboxDir, name));
      if (!info.isFile()) continue;
      items.push({
        relPath: `_inbox/${name}`,
        name,
        ext: path.extname(name).toLowerCase(),
        mtime: info.mtime.toISOString(),
      });
    }
    items.sort((a, b) => a.mtime.localeCompare(b.mtime));
    return items;
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run());
  }
  ```
- [ ] 成功確認: `node --test analysis/test/list-inbox-items.test.mjs` を実行し、2件のテストがすべて成功する(`# pass 2`)ことを確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/list-inbox-items.mjs analysis/test/list-inbox-items.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add list-inbox-items helper for vault _inbox scanning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 3: run-log開始ヘルパ `start-run.mjs`(TDD、契約4b非依存の純粋関数部分)

**Files:**
- Create: `analysis/helpers/start-run.mjs`
- Test: `analysis/test/start-run.test.mjs`

**Interfaces:**
- Consumes: `writeVaultFile`(`analysis/helpers/vault/index.mjs`、`run()`内でのみ動的import)。
- Produces: `buildRunStartFrontmatter(dateStr, startedAt): object`、`buildRunStartBody(dateStr): string`、`run([dateStr]): Promise<{path, started_at}>`。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/start-run.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { buildRunStartFrontmatter, buildRunStartBody } from '../helpers/start-run.mjs';

  test('run-log start frontmatter matches contract run-log schema fields available at start', () => {
    const fm = buildRunStartFrontmatter('2026-07-24', '2026-07-24T23:30:00.000Z');
    assert.equal(fm.type, 'run-log');
    assert.equal(fm.date, '2026-07-24');
    assert.equal(fm.started_at, '2026-07-24T23:30:00.000Z');
    assert.equal(fm.source, 'nightly-batch');
    assert.equal(fm.schema_version, 1);
  });

  test('run-log start body marks the run as in progress', () => {
    const body = buildRunStartBody('2026-07-24');
    assert.match(body, /^# ラン記録 2026-07-24/);
    assert.match(body, /実行中/);
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/start-run.test.mjs` を実行する。
- [ ] 期待される出力: モジュールが存在しないためテストがロードエラーで失敗する。

### Step 2: 最小実装

- [ ] `analysis/helpers/start-run.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // runs/YYYY-MM-DD.md にラン開始を記録する。夜間バッチ固有(内部で契約4bのwriteVaultFileを使う)。
  // 使い方: node analysis/helpers/start-run.mjs <dateStr(YYYY-MM-DD)>
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export function buildRunStartFrontmatter(dateStr, startedAt) {
    return {
      type: 'run-log',
      date: dateStr,
      started_at: startedAt,
      source: 'nightly-batch',
      schema_version: 1,
      updated: startedAt,
    };
  }

  export function buildRunStartBody(dateStr) {
    return `# ラン記録 ${dateStr}\n\n## 実行中\n\n- 開始しました。完了時にこのセクションを完了報告へ置き換えます。\n`;
  }

  export async function run([dateStr]) {
    if (!dateStr) throw new Error('使い方: node helpers/start-run.mjs <dateStr>');
    const startedAt = new Date().toISOString();
    const { writeVaultFile } = await import('./vault/index.mjs');
    const frontmatter = buildRunStartFrontmatter(dateStr, startedAt);
    await writeVaultFile(`runs/${dateStr}.md`, frontmatter, buildRunStartBody(dateStr));
    return { path: `runs/${dateStr}.md`, started_at: startedAt };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] 成功確認: `node --test analysis/test/start-run.test.mjs` を実行し、`# pass 2` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/start-run.mjs analysis/test/start-run.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add start-run helper to open a vault run-log entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 4: run-log完了ヘルパ `finish-run.mjs`(TDD、契約4b非依存の純粋関数部分)

**Files:**
- Create: `analysis/helpers/finish-run.mjs`
- Test: `analysis/test/finish-run.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `writeVaultFile`(`analysis/helpers/vault/index.mjs`、`run()`内でのみ動的import)。
- Produces: `buildRunFinishFrontmatter(existingFrontmatter, {finishedAt, processed, needsConfirmation, status}): object`、`buildRunFinishBody(existingBody, summaryLines): string`、`run([dateStr, status, summaryArg]): Promise<{path, finished_at, status}>`。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/finish-run.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { buildRunFinishFrontmatter, buildRunFinishBody } from '../helpers/finish-run.mjs';

  test('finish frontmatter keeps started_at and adds completion fields required by run-log schema', () => {
    const existing = { type: 'run-log', date: '2026-07-24', started_at: '2026-07-24T23:30:00.000Z', source: 'nightly-batch', schema_version: 1, updated: '2026-07-24T23:30:00.000Z' };
    const fm = buildRunFinishFrontmatter(existing, { finishedAt: '2026-07-25T00:10:00.000Z', processed: 5, needsConfirmation: 2, status: 'ok' });
    assert.equal(fm.started_at, '2026-07-24T23:30:00.000Z');
    assert.equal(fm.finished_at, '2026-07-25T00:10:00.000Z');
    assert.equal(fm.processed, 5);
    assert.equal(fm.needs_confirmation, 2);
    assert.equal(fm.status, 'ok');
    assert.equal(fm.updated, '2026-07-25T00:10:00.000Z');
  });

  test('finish body replaces the in-progress section with a completion summary', () => {
    const existingBody = '# ラン記録 2026-07-24\n\n## 実行中\n\n- 開始しました。完了時にこのセクションを完了報告へ置き換えます。\n';
    const body = buildRunFinishBody(existingBody, ['写真5件処理(analyzed 4 / failed 1)', '要確認TODO 2件']);
    assert.doesNotMatch(body, /実行中/);
    assert.match(body, /## 完了/);
    assert.match(body, /写真5件処理/);
    assert.match(body, /要確認TODO 2件/);
  });

  test('finish body falls back to a no-remarks line when summary has no entries', () => {
    const body = buildRunFinishBody('# ラン記録 2026-07-24\n\n## 実行中\n\n- 開始しました。\n', []);
    assert.match(body, /特記事項なし/);
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/finish-run.test.mjs` を実行し、モジュール未検出で失敗することを確認する。

### Step 2: 最小実装

- [ ] `analysis/helpers/finish-run.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // runs/YYYY-MM-DD.md にラン完了を追記する。start-run.mjsが書いた開始時刻をreadVaultFileで
  // 読み戻し、finished_at/processed/needs_confirmation/statusを追加する。
  // 使い方: node analysis/helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>
  //   summaryJSON例: {"processed":5,"needsConfirmation":2,"lines":["写真5件処理(analyzed 4 / failed 1)","要確認TODO 2件"]}
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export function buildRunFinishFrontmatter(existingFrontmatter, { finishedAt, processed, needsConfirmation, status }) {
    return {
      ...existingFrontmatter,
      finished_at: finishedAt,
      processed,
      needs_confirmation: needsConfirmation,
      status,
      updated: finishedAt,
    };
  }

  export function buildRunFinishBody(existingBody, summaryLines) {
    const withoutInProgress = existingBody.replace(/## 実行中[\s\S]*$/, '').replace(/\s+$/, '');
    const summary = summaryLines.length
      ? summaryLines.map((line) => `- ${line}`).join('\n')
      : '- 特記事項なし';
    return `${withoutInProgress}\n\n## 完了\n\n${summary}\n`;
  }

  export async function run([dateStr, status, summaryArg]) {
    if (!dateStr || !['ok', 'error'].includes(status) || !summaryArg) {
      throw new Error('使い方: node helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>');
    }
    const summary = JSON.parse(summaryArg);
    const finishedAt = new Date().toISOString();
    const { readVaultFile, writeVaultFile } = await import('./vault/index.mjs');
    const relPath = `runs/${dateStr}.md`;
    const existing = await readVaultFile(relPath);
    const frontmatter = buildRunFinishFrontmatter(existing.frontmatter, {
      finishedAt,
      processed: summary.processed ?? 0,
      needsConfirmation: summary.needsConfirmation ?? 0,
      status,
    });
    const body = buildRunFinishBody(existing.body, summary.lines ?? []);
    await writeVaultFile(relPath, frontmatter, body);
    return { path: relPath, finished_at: finishedAt, status };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] 成功確認: `node --test analysis/test/finish-run.test.mjs` を実行し、`# pass 3` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/finish-run.mjs analysis/test/finish-run.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add finish-run helper to close out a vault run-log entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 5: カルテ/誤答ログ差分追記ユーティリティ `append-vault-section.mjs`(TDD、契約4b非依存の純粋関数部分)

**Files:**
- Create: `analysis/helpers/append-vault-section.mjs`
- Test: `analysis/test/append-vault-section.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `writeVaultFile`(`analysis/helpers/vault/index.mjs`、`run()`内でのみ動的import)。
- Produces: `appendSection(body, heading, content): string`、`bumpFrontmatterUpdated(frontmatter, updatedAt, patch = {}): object`、`run([relPath, heading, contentPathOrDash, frontmatterPatchArg]): Promise<{path, updated}>`。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/append-vault-section.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { appendSection, bumpFrontmatterUpdated } from '../helpers/append-vault-section.mjs';

  test('appendSection keeps prior content and adds a new heading section', () => {
    const before = '# 弱点カルテ\n\n## 2026-07-20\n\n三角比の符号ミスが継続。\n';
    const after = appendSection(before, '2026-07-24', '三角比: 符号ミスは解消。第2象限の公式暗記が甘い。');
    assert.match(after, /## 2026-07-20/);
    assert.match(after, /符号ミスが継続/);
    assert.match(after, /## 2026-07-24/);
    assert.match(after, /公式暗記が甘い/);
    assert.ok(after.indexOf('## 2026-07-20') < after.indexOf('## 2026-07-24'));
  });

  test('appendSection handles an empty starting body (new karte file)', () => {
    const after = appendSection('', '2026-07-24', '初回の弱点メモ。');
    assert.equal(after, '## 2026-07-24\n\n初回の弱点メモ。\n');
  });

  test('bumpFrontmatterUpdated preserves existing fields and applies patch', () => {
    const fm = bumpFrontmatterUpdated(
      { type: 'karte', subject: '数学', schema_version: 1, updated: '2026-07-20T10:00:00+09:00' },
      '2026-07-24T23:40:00+09:00',
      { source: 'nightly-batch' }
    );
    assert.equal(fm.subject, '数学');
    assert.equal(fm.source, 'nightly-batch');
    assert.equal(fm.updated, '2026-07-24T23:40:00+09:00');
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/append-vault-section.test.mjs` を実行し、モジュール未検出で失敗することを確認する。

### Step 2: 最小実装

- [ ] `analysis/helpers/append-vault-section.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // 弱点カルテ.md / 誤答ログ.md に、既存本文を残したまま新しい日付見出しのセクションを
  // 追記するための共通ユーティリティ(全置換にしない=差分更新)。夜間バッチ固有。
  // 使い方: node analysis/helpers/append-vault-section.mjs <relPath> <heading> <contentFile|-> [frontmatterPatchJSON]
  import { fileURLToPath } from 'node:url';
  import { readFileSync } from 'node:fs';
  import { printJson } from './lib.mjs';

  export function appendSection(body, heading, content) {
    const trimmed = body.replace(/\s+$/, '');
    const section = `## ${heading}\n\n${content.trim()}\n`;
    return trimmed ? `${trimmed}\n\n${section}` : section;
  }

  export function bumpFrontmatterUpdated(frontmatter, updatedAt, patch = {}) {
    return { ...frontmatter, ...patch, updated: updatedAt };
  }

  export async function run([relPath, heading, contentPathOrDash, frontmatterPatchArg]) {
    if (!relPath || !heading || !contentPathOrDash) {
      throw new Error('使い方: node helpers/append-vault-section.mjs <relPath> <heading> <contentFile|-> [frontmatterPatchJSON]');
    }
    const content = contentPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(contentPathOrDash, 'utf8');
    const patch = frontmatterPatchArg ? JSON.parse(frontmatterPatchArg) : {};
    const { readVaultFile, writeVaultFile } = await import('./vault/index.mjs');
    let existing = { frontmatter: {}, body: '' };
    try {
      existing = await readVaultFile(relPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const updatedAt = new Date().toISOString();
    const frontmatter = bumpFrontmatterUpdated(existing.frontmatter, updatedAt, patch);
    const body = appendSection(existing.body, heading, content);
    await writeVaultFile(relPath, frontmatter, body);
    return { path: relPath, updated: updatedAt };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] 成功確認: `node --test analysis/test/append-vault-section.test.mjs` を実行し、`# pass 3` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/append-vault-section.mjs analysis/test/append-vault-section.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add append-vault-section helper for karte/mistake-log diffs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 6: 日次レポート生成ヘルパ `build-daily-report.mjs`(TDD、契約3aの行書式を厳守)

**Files:**
- Create: `analysis/helpers/build-daily-report.mjs`
- Test: `analysis/test/build-daily-report.test.mjs`

**Interfaces:**
- Consumes: `writeVaultFile`(`analysis/helpers/vault/index.mjs`、`run()`内でのみ動的import)。
- Produces: `formatConfirmTodoLine(todo): string`、`buildConfirmTodoSection(todos): string`、`buildDailyReportBody({date, confirmTodos, sections}): string`、`buildDailyReportFrontmatter(date, confirmTodos, updatedAt): object`、`run([dateStr, dataPathOrDash]): Promise<{path, confirm_todos}>`。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/build-daily-report.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { formatConfirmTodoLine, buildConfirmTodoSection, buildDailyReportBody, buildDailyReportFrontmatter } from '../helpers/build-daily-report.mjs';

  test('formatConfirmTodoLine matches the contract 3a line format exactly', () => {
    const line = formatConfirmTodoLine({
      id: 'todo-1',
      q: 'この写真の科目は？',
      options: ['日本史', '世界史', '不明'],
      default: '日本史',
      ref: '_archive/2026/07/abc.jpg',
    });
    assert.equal(
      line,
      '- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg'
    );
  });

  test('formatConfirmTodoLine omits ref when not provided', () => {
    const line = formatConfirmTodoLine({ id: 'todo-2', q: '単元は？', options: ['三角比', '不明'], default: '不明' });
    assert.equal(line, '- [ ] id=todo-2 | q=単元は？ | options=三角比 / 不明 | default=不明');
    assert.ok(!line.includes('ref='));
  });

  test('buildConfirmTodoSection lists every todo under the 要確認TODO heading', () => {
    const section = buildConfirmTodoSection([
      { id: 'todo-1', q: 'q1', options: ['a', 'b'], default: 'a' },
      { id: 'todo-2', q: 'q2', options: ['c', 'd'], default: 'c' },
    ]);
    const lines = section.split('\n');
    assert.equal(lines[0], '## 要確認TODO');
    assert.equal(lines.filter((line) => line.startsWith('- [ ] id=')).length, 2);
  });

  test('buildConfirmTodoSection reports no items clearly when there are none', () => {
    const section = buildConfirmTodoSection([]);
    assert.match(section, /## 要確認TODO/);
    assert.match(section, /要確認事項なし/);
  });

  test('buildDailyReportBody puts the 要確認TODO section first, before other sections', () => {
    const body = buildDailyReportBody({
      date: '2026-07-24',
      confirmTodos: [{ id: 'todo-1', q: 'q', options: ['a', 'b'], default: 'a' }],
      sections: [{ heading: '今日の学習時間', body: '120分' }],
    });
    assert.ok(body.indexOf('## 要確認TODO') < body.indexOf('## 今日の学習時間'));
    assert.match(body, /120分/);
  });

  test('buildDailyReportFrontmatter sets confirm_todos to the todo count', () => {
    const fm = buildDailyReportFrontmatter('2026-07-24', [{ id: 'todo-1' }, { id: 'todo-2' }], '2026-07-24T23:40:00+09:00');
    assert.equal(fm.type, 'daily-report');
    assert.equal(fm.date, '2026-07-24');
    assert.equal(fm.confirm_todos, 2);
    assert.equal(fm.schema_version, 1);
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/build-daily-report.test.mjs` を実行し、モジュール未検出で失敗することを確認する。

### Step 2: 最小実装

- [ ] `analysis/helpers/build-daily-report.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // reports/daily/YYYY-MM-DD.md の雛形(要確認TODO節を含む)を生成し書き出す。
  // 契約3aの要確認TODO行書式を厳守する(WebのparseConfirmTodosが行単位でパースする)。
  // 使い方: node analysis/helpers/build-daily-report.mjs <dateStr> <reportDataJSONFile|->
  //   reportDataJSON: {"confirmTodos":[{"id":"todo-1","q":"...","options":["日本史","世界史"],"default":"日本史","ref":"_archive/..."}],
  //                     "sections":[{"heading":"今日の学習時間","body":"..."}, ...]}
  import { fileURLToPath } from 'node:url';
  import { readFileSync } from 'node:fs';
  import { printJson } from './lib.mjs';

  export function formatConfirmTodoLine(todo) {
    const parts = [
      `id=${todo.id}`,
      `q=${todo.q}`,
      `options=${todo.options.join(' / ')}`,
      `default=${todo.default}`,
    ];
    if (todo.ref) parts.push(`ref=${todo.ref}`);
    return `- [ ] ${parts.join(' | ')}`;
  }

  export function buildConfirmTodoSection(todos) {
    if (!todos.length) {
      return ['## 要確認TODO', '', '(今回は要確認事項なし)'].join('\n');
    }
    return ['## 要確認TODO', '', ...todos.map(formatConfirmTodoLine)].join('\n');
  }

  export function buildDailyReportBody({ date, confirmTodos, sections }) {
    const parts = [buildConfirmTodoSection(confirmTodos), '', `# ${date} 日次レポート`];
    for (const section of sections) {
      parts.push('', `## ${section.heading}`, '', section.body.trim());
    }
    return `${parts.join('\n').trimEnd()}\n`;
  }

  export function buildDailyReportFrontmatter(date, confirmTodos, updatedAt) {
    return {
      type: 'daily-report',
      date,
      confirm_todos: confirmTodos.length,
      source: 'nightly-batch',
      schema_version: 1,
      updated: updatedAt,
    };
  }

  export async function run([dateStr, dataPathOrDash]) {
    if (!dateStr || !dataPathOrDash) {
      throw new Error('使い方: node helpers/build-daily-report.mjs <dateStr> <reportDataJSONFile|->');
    }
    const raw = dataPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(dataPathOrDash, 'utf8');
    const data = JSON.parse(raw);
    const confirmTodos = data.confirmTodos ?? [];
    const sections = data.sections ?? [];
    const updatedAt = new Date().toISOString();
    const frontmatter = buildDailyReportFrontmatter(dateStr, confirmTodos, updatedAt);
    const body = buildDailyReportBody({ date: dateStr, confirmTodos, sections });
    const { writeVaultFile } = await import('./vault/index.mjs');
    const relPath = `reports/daily/${dateStr}.md`;
    await writeVaultFile(relPath, frontmatter, body);
    return { path: relPath, confirm_todos: confirmTodos.length };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] 成功確認: `node --test analysis/test/build-daily-report.test.mjs` を実行し、`# pass 6` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/build-daily-report.mjs analysis/test/build-daily-report.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add build-daily-report helper matching contract 3a TODO format

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 7: 週次レポート生成ヘルパ `build-weekly-report.mjs`(TDD)

**Files:**
- Create: `analysis/helpers/build-weekly-report.mjs`
- Test: `analysis/test/build-weekly-report.test.mjs`

**Interfaces:**
- Consumes: `writeVaultFile`(`analysis/helpers/vault/index.mjs`、`run()`内でのみ動的import)。
- Produces: `buildWeeklyReportBody({week, sections}): string`、`buildWeeklyReportFrontmatter(week, updatedAt): object`、`run([weekStr, dataPathOrDash]): Promise<{path}>`。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/build-weekly-report.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { buildWeeklyReportBody, buildWeeklyReportFrontmatter } from '../helpers/build-weekly-report.mjs';

  test('buildWeeklyReportFrontmatter uses the week field per contract weekly-report schema', () => {
    const fm = buildWeeklyReportFrontmatter('2026-W30', '2026-07-26T23:50:00+09:00');
    assert.equal(fm.type, 'weekly-report');
    assert.equal(fm.week, '2026-W30');
    assert.equal(fm.schema_version, 1);
  });

  test('buildWeeklyReportBody renders each section under its own heading', () => {
    const body = buildWeeklyReportBody({
      week: '2026-W30',
      sections: [
        { heading: '学習時間推移', body: '平均105分/日' },
        { heading: '来週の重点科目', body: '数学・日本史' },
      ],
    });
    assert.match(body, /^# 2026-W30 週次レポート/);
    assert.match(body, /## 学習時間推移/);
    assert.match(body, /平均105分\/日/);
    assert.match(body, /## 来週の重点科目/);
  });
  ```
- [ ] 失敗確認: `node --test analysis/test/build-weekly-report.test.mjs` を実行し、モジュール未検出で失敗することを確認する。

### Step 2: 最小実装

- [ ] `analysis/helpers/build-weekly-report.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // reports/weekly/YYYY-Www.md を生成し書き出す(日曜のみnightly.mdから呼ばれる)。夜間バッチ固有。
  // 使い方: node analysis/helpers/build-weekly-report.mjs <weekStr(YYYY-Www)> <reportDataJSONFile|->
  //   reportDataJSON: {"sections":[{"heading":"学習時間推移","body":"..."}, ...]}
  import { fileURLToPath } from 'node:url';
  import { readFileSync } from 'node:fs';
  import { printJson } from './lib.mjs';

  export function buildWeeklyReportBody({ week, sections }) {
    const parts = [`# ${week} 週次レポート`];
    for (const section of sections) {
      parts.push('', `## ${section.heading}`, '', section.body.trim());
    }
    return `${parts.join('\n').trimEnd()}\n`;
  }

  export function buildWeeklyReportFrontmatter(week, updatedAt) {
    return {
      type: 'weekly-report',
      week,
      source: 'nightly-batch',
      schema_version: 1,
      updated: updatedAt,
    };
  }

  export async function run([weekStr, dataPathOrDash]) {
    if (!weekStr || !dataPathOrDash) {
      throw new Error('使い方: node helpers/build-weekly-report.mjs <weekStr> <reportDataJSONFile|->');
    }
    const raw = dataPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(dataPathOrDash, 'utf8');
    const data = JSON.parse(raw);
    const sections = data.sections ?? [];
    const updatedAt = new Date().toISOString();
    const frontmatter = buildWeeklyReportFrontmatter(weekStr, updatedAt);
    const body = buildWeeklyReportBody({ week: weekStr, sections });
    const { writeVaultFile } = await import('./vault/index.mjs');
    const relPath = `reports/weekly/${weekStr}.md`;
    await writeVaultFile(relPath, frontmatter, body);
    return { path: relPath };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] 成功確認: `node --test analysis/test/build-weekly-report.test.mjs` を実行し、`# pass 2` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/build-weekly-report.mjs analysis/test/build-weekly-report.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add build-weekly-report helper for Sunday vault summaries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 8: 契約4b薄いCLIラッパー5本(TDD、Foundation計画実装後に実行する統合テスト)

nightly.mdはシェル(Bash)から`node analysis/helpers/xxx.mjs`しか呼べないため、契約4bの関数(モジュールAPI)をそのまま呼ぶことはできない。契約4bの命名・シグネチャは一切変えず、CLI引数⇄戻り値の薄いラッパーを追加する。5本まとめて1つのタスクにし、1本の統合テストファイルで検証する(契約4bの実体である`analysis/helpers/vault/index.mjs`が存在することが前提。Foundation計画のタスクが完了済みであること)。

**Files:**
- Create: `analysis/helpers/read-vault-file.mjs`
- Create: `analysis/helpers/write-vault-file.mjs`
- Create: `analysis/helpers/archive-inbox-photo.mjs`
- Create: `analysis/helpers/read-corrections.mjs`
- Create: `analysis/helpers/clear-corrections.mjs`
- Test: `analysis/test/vault-cli-wrappers.test.mjs`

**Interfaces:**
- Consumes: `readVaultFile`, `writeVaultFile`, `archivePhoto`, `readCorrections`, `clearCorrections`(すべて`analysis/helpers/vault/index.mjs`から)。
- Produces: 各ファイルが `run(argv): Promise<object>` をexportする(CLI実行時は`printJson(await run(process.argv.slice(2)))`)。

### Step 1: 失敗するテストを書く

- [ ] `analysis/test/vault-cli-wrappers.test.mjs` を作成する:
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import path from 'node:path';

  function withVault(fn) {
    return async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'vault-test-'));
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

  test('write-vault-file then read-vault-file round-trips frontmatter and body', withVault(async (dir) => {
    const { run: writeRun } = await import('../helpers/write-vault-file.mjs');
    const { run: readRun } = await import('../helpers/read-vault-file.mjs');
    const bodyPath = path.join(dir, '_tmp-body.md');
    writeFileSync(bodyPath, '本文テスト\n');
    await writeRun([
      'subjects/日本史/弱点カルテ.md',
      JSON.stringify({ type: 'karte', subject: '日本史', updated: '2026-07-24T23:40:00+09:00', source: 'nightly-batch', schema_version: 1 }),
      bodyPath,
    ]);
    const result = await readRun(['subjects/日本史/弱点カルテ.md']);
    assert.equal(result.frontmatter.subject, '日本史');
    assert.equal(result.body.trim(), '本文テスト');
  }));

  test('archive-inbox-photo moves the original out of _inbox into _archive/YYYY/MM', withVault(async (dir) => {
    mkdirSync(path.join(dir, '_inbox'), { recursive: true });
    writeFileSync(path.join(dir, '_inbox', 'photo1.jpg'), 'dummy');
    const { run: archiveRun } = await import('../helpers/archive-inbox-photo.mjs');
    const result = await archiveRun(['_inbox/photo1.jpg', '2026-07-24']);
    assert.equal(result.archivedPath, '_archive/2026/07/photo1.jpg');
    assert.ok(existsSync(path.join(dir, '_archive/2026/07/photo1.jpg')));
    assert.ok(!existsSync(path.join(dir, '_inbox/photo1.jpg')));
  }));

  test('read-corrections then clear-corrections empties corrections.md', withVault(async (dir) => {
    mkdirSync(path.join(dir, '_inbox'), { recursive: true });
    writeFileSync(
      path.join(dir, '_inbox', 'corrections.md'),
      '## 2026-07-24T08:12:00+09:00\n- report: reports/daily/2026-07-24.md\n- todo: todo-1\n- choice: 世界史\n'
    );
    const { run: readRun } = await import('../helpers/read-corrections.mjs');
    const { run: clearRun } = await import('../helpers/clear-corrections.mjs');
    const entries = await readRun();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].choice, '世界史');
    await clearRun();
    const after = readFileSync(path.join(dir, '_inbox', 'corrections.md'), 'utf8');
    assert.equal(after.trim(), '');
  }));
  ```
- [ ] 失敗確認: `node --test analysis/test/vault-cli-wrappers.test.mjs` を実行する。
- [ ] 期待される出力: 5本のラッパーファイルがまだ存在しないため、`Cannot find module` でテストが失敗する(またはFoundation計画未完了の場合は`analysis/helpers/vault/index.mjs`が無く同様に失敗する。その場合はFoundation計画のTask 8〜13完了を待ってから本タスクを再開する)。

### Step 2: 最小実装

- [ ] `analysis/helpers/read-vault-file.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // vault/ 配下のMarkdownファイルを読み、frontmatterと本文をJSONで返す。
  // 契約4b `readVaultFile` のCLIラッパー(ヘッドレスCLIのシェル実行から呼べるようにする)。
  // 使い方: node analysis/helpers/read-vault-file.mjs <relPath>
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export async function run([relPath]) {
    if (!relPath) {
      throw new Error('使い方: node helpers/read-vault-file.mjs <relPath>');
    }
    const { readVaultFile } = await import('./vault/index.mjs');
    return readVaultFile(relPath);
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] `analysis/helpers/write-vault-file.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // vault/ 配下にMarkdownを書き込む(frontmatter+本文)。契約4b `writeVaultFile` のCLIラッパー。
  // 使い方: node analysis/helpers/write-vault-file.mjs <relPath> <frontmatterJSON> <bodyFilePath|->
  import { fileURLToPath } from 'node:url';
  import { readFileSync } from 'node:fs';
  import { printJson } from './lib.mjs';

  export async function run([relPath, frontmatterArg, bodyPathOrDash]) {
    if (!relPath || !frontmatterArg || !bodyPathOrDash) {
      throw new Error('使い方: node helpers/write-vault-file.mjs <relPath> <frontmatterJSON> <bodyFilePath|->');
    }
    const frontmatter = JSON.parse(frontmatterArg);
    const body = bodyPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(bodyPathOrDash, 'utf8');
    const { writeVaultFile } = await import('./vault/index.mjs');
    await writeVaultFile(relPath, frontmatter, body);
    return { written: relPath };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] `analysis/helpers/archive-inbox-photo.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // _inbox/の原本を _archive/YYYY/MM/ へ移動する。契約4b `archivePhoto` のCLIラッパー。
  // 使い方: node analysis/helpers/archive-inbox-photo.mjs <srcRelPath> <dateStr(YYYY-MM-DD)>
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export async function run([srcRelPath, dateStr]) {
    if (!srcRelPath || !dateStr) {
      throw new Error('使い方: node helpers/archive-inbox-photo.mjs <srcRelPath> <dateStr>');
    }
    const { archivePhoto } = await import('./vault/index.mjs');
    const archivedPath = await archivePhoto(srcRelPath, dateStr);
    return { archivedPath };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run(process.argv.slice(2)));
  }
  ```
- [ ] `analysis/helpers/read-corrections.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // _inbox/corrections.md を読み、CorrectionEntry[]をJSONで返す。契約4b `readCorrections` のCLIラッパー。
  // 使い方: node analysis/helpers/read-corrections.mjs
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export async function run() {
    const { readCorrections } = await import('./vault/index.mjs');
    return readCorrections();
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run());
  }
  ```
- [ ] `analysis/helpers/clear-corrections.mjs` を作成する:
  ```js
  #!/usr/bin/env node
  // 訂正消化後に corrections.md を空にする。契約4b `clearCorrections` のCLIラッパー。
  // 使い方: node analysis/helpers/clear-corrections.mjs
  import { fileURLToPath } from 'node:url';
  import { printJson } from './lib.mjs';

  export async function run() {
    const { clearCorrections } = await import('./vault/index.mjs');
    await clearCorrections();
    return { cleared: true };
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    printJson(await run());
  }
  ```
- [ ] 成功確認: Foundation計画の`analysis/helpers/vault/index.mjs`が実装済みであることを確認した上で `node --test analysis/test/vault-cli-wrappers.test.mjs` を実行し、`# pass 3` を確認する。
- [ ] commit:
  ```bash
  git add analysis/helpers/read-vault-file.mjs analysis/helpers/write-vault-file.mjs \
    analysis/helpers/archive-inbox-photo.mjs analysis/helpers/read-corrections.mjs \
    analysis/helpers/clear-corrections.mjs analysis/test/vault-cli-wrappers.test.mjs
  git commit -m "$(cat <<'EOF'
feat(analysis): add thin CLI wrappers over the contract 4b vault helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 9: `analysis/nightly.md` の全面改訂(プロンプト文書、TDD対象外)

**Files:**
- Modify: `analysis/nightly.md`

**Interfaces:**
- Consumes(シェル経由で呼び出す新ヘルパ、実行順): `read-vault-file.mjs`, `start-run.mjs`, `list-inbox-items.mjs`, `archive-inbox-photo.mjs`, `append-vault-section.mjs`, `read-corrections.mjs`, `clear-corrections.mjs`, `build-daily-report.mjs`, `build-weekly-report.mjs`, `finish-run.mjs`。

プロンプト文書の改訂であり、TDDは馴染まない。変更後の全文を掲載し、手動確認手順を示す。

### 変更後の `analysis/nightly.md` 全文

```markdown
# 夜間分析バッチ プロンプト

このファイルは、Mac上でエージェント型CLI(Claude Code の `claude -p`、または
Codex CLI の `codex exec`)をheadless実行する際に読み込ませる、夜間分析バッチの
本体プロンプトである。
docs/superpowers/specs/2026-07-24-vault-file-cli-architecture-design.md「夜間バッチの新フロー」を実装する。
**このプロンプトはどちらのCLIで実行しても同じ内容・同じ判断根拠になるよう、
特定のツール名(Claude Codeの `Bash`/`Read` など)に依存しない書き方にしている。**

実行例(手動実行、どちらか使える方でよい):
\`\`\`
cd /Users/shoug/Documents/GitHub/study-ai

# Claude Code
claude -p "$(cat analysis/nightly.md)" --allowedTools "Bash,Read"

# Codex CLI
codex exec --sandbox workspace-write \
  --config sandbox_workspace_write.network_access=true \
  "$(cat analysis/nightly.md)"
\`\`\`

`STUDY_AI_AGENT_CLI=claude` または `STUDY_AI_AGENT_CLI=codex` を指定して
`analysis/run-nightly.sh` を実行すれば、上記コマンドの違いを意識せず切り替えられる。
具体的な起動コマンドは `analysis/README.md` を参照(**自動スケジュール実行は現状セットアップしていない。
毎回手動で起動する運用**)。

---

## あなたの役割

あなたは受験生本人専用の学習管理アプリ「study-ai」の夜間分析バッチである。
`vault/_inbox/` に溜まった演習写真・模試PDFなどの原本をマルチモーダルで直接読み取り、
科目/教材/単元・正誤・確信度を判定し、正しい場所へ仕分け、各科目の`弱点カルテ.md`を
差分更新し、日次(日曜は週次も)レポートを`vault/`配下に保存する。

**`vault/`へのアクセスは `analysis/helpers/*.mjs` の Node スクリプトを、シェルコマンド実行
(Claude Codeでは `Bash` ツール、Codex CLIでは組み込みのシェル実行)で
`node analysis/helpers/xxx.mjs ...` として呼び出すことで行う。** 各スクリプトは
環境変数 `STUDY_AI_VAULT_DIR`(vaultルートの絶対パス。シェル環境または `analysis/.env`)を
内部で参照し、標準出力にJSONを返す。`STUDY_AI_VAULT_DIR`が未設定の場合、スクリプトは
即座にエラーで終了する(黙って別の場所を使わない)。スクリプトの一覧と使い方は各ファイル冒頭の
コメントを参照(不明な場合は `cat analysis/helpers/<name>.mjs` で確認してよい)。

作業ディレクトリはリポジトリルート。**`analysis/` 以外のディレクトリ(`src/` 等)は
一切変更しないこと。** `npm install` や `npm run build` も実行しないこと(このバッチは
Node標準機能のみで完結する)。**Supabaseへは一切アクセスしない**(勉強時間の手入力などは
Web側が引き続きSupabaseを使うが、夜間バッチの担当外)。

---

## 処理フロー

### 1. 準備

1. `node analysis/helpers/read-vault-file.mjs index.md` を実行し、`vault/index.md` が
   読めることを確認する。エラーになる場合(`STUDY_AI_VAULT_DIR`未設定・vault未セットアップ等)は、
   写真の仕分けやカルテ更新を一切始めず、エラー内容を表示して終了する
   (Supabase時代の「-1. スキーマの最新化」に相当する安全確認。中身が壊れた状態で
   仕分けを始めない)。
2. 今日の日付(`YYYY-MM-DD`、ローカルタイム)を`TODAY`として以後使う。
   `node analysis/helpers/start-run.mjs "$TODAY"` を実行し、`runs/$TODAY.md` に
   ラン開始を記録する。返り値の`started_at`を手順7で使う。

### 2. Inbox解析

1. `node analysis/helpers/list-inbox-items.mjs` で `_inbox/` の未処理エントリ一覧
   (`relPath`, `name`, `ext`, `mtime`)を取得する。`corrections.md`・隠しファイル・
   Google Drive同期の一時ファイル(`.tmp` `.crdownload` `.icloud` `.part`)は
   自動的に除外されている。0件ならこのステップと次の「3. 仕分け」はスキップしてよい。
2. 各エントリについて、画像を読み込むツール(Claude Codeでは `Read` ツール、
   Codex CLIでは組み込みの`view_image`/PDF読み取りツール)でファイルを直接読む
   (`STUDY_AI_VAULT_DIR`配下のローカルファイルなので、パスをそのまま渡せばよい)。
3. **読み取り規約**(親スペック「夜間バッチの新フロー」2.を具体化):
   - 撮影対象は「丸付け済み(○✕記入済み)の問題集・演習ページ」または模試/演習の結果PDF。
   - 読み取るべき情報:
     - 各設問の**○✕**(採点結果)。二重線・書き直し等で判断が割れる場合は、
       最終的に残っている記号を採用する。
     - **問題番号/設問ラベル**(例:「大問2(1)」「Q3」)。ページ内の表記をそのまま使う。
     - **科目・単元の推定**: ページの見出し・問題内容から科目名と単元を推定する。
       `vault/subjects/`配下の既存ディレクトリ名(科目名)と可能な限り一致させる。
       根拠が弱い場合は誤った科目/単元を選ばず、後述の「要確認TODO」に回す。
     - **誤答タイプの推定**(✕の設問のみ): `calc`(計算ミス)/ `knowledge`(知識不足)/
       `reading`(読み取りミス)/ `logic`(論理・解法の誤り)/ `other`(判断不能)。
     - 設問(または写真全体)ごとに判定確信度(0〜1)を自己申告する。
       **0.7未満の判定は必ず「要確認TODO」に回す**(黙って誤配置しない。契約の確信度ルール)。
   - **判読不能な場合**(画像が不鮮明、問題集ページではない等)は、無理に埋めず
     「要確認TODO」に回す(選択肢に「不明」を含める)。
4. 全エントリの読み取りが終わるまで2〜3を繰り返す。

### 3. 仕分け

1. 各エントリについて、`node analysis/helpers/archive-inbox-photo.mjs "<relPath>" "$TODAY"`
   を実行し、原本を`_inbox/`から`_archive/YYYY/MM/`へ移動する
   (**原本は削除しない。誤仕分けは翌朝のTODO修正で遡及訂正できるようにするため**)。
   返り値の`archivedPath`を、そのエントリの`ref`として要確認TODO・誤答ログに使う。
2. 確信度0.7以上で科目/単元が確定したエントリは、該当科目の`subjects/<科目名>/誤答ログ.md`に
   誤答を追記する。追記内容(例)を一時ファイルに書き出す:
   \`\`\`
   - 大問2(1) / ✕ / calc(計算ミス) / confidence=0.9 / ref=_archive/2026/07/xxxxx.jpg
   - 大問3 / ✕ / knowledge(知識不足) / confidence=0.85 / ref=_archive/2026/07/xxxxx.jpg
   \`\`\`
   一時ファイルへの書き出し先は`analysis/tmp/mistake-<科目名>.md`とし、
   `node analysis/helpers/append-vault-section.mjs "subjects/<科目名>/誤答ログ.md" "$TODAY" analysis/tmp/mistake-<科目名>.md '{"type":"karte","subject":"<科目名>","source":"nightly-batch"}'`
   で`誤答ログ.md`に「## $TODAY」セクションとして追記する(**全置換しない。既存の記述は残る**)。
   正解(○)のみのエントリは誤答ログへの追記不要。
3. 確信度0.7未満、または科目/単元が確定できなかったエントリは、仕分けを行わず
   (誤答ログへの追記も行わず)手順6の要確認TODOにのみ回す。原本のアーカイブ移動
   (手順1)は確信度に関わらず必ず行う(未処理のまま`_inbox/`に残さない。
   翌朝の訂正はTODO経由で行う設計のため)。
4. 全エントリを処理し終えるまで1〜3を繰り返す。

### 4. 訂正反映

1. `node analysis/helpers/read-corrections.mjs` を実行し、`_inbox/corrections.md`の
   訂正指示(`CorrectionEntry[]`)を取得する。0件ならこのステップはスキップし、
   手順5(クリア)も不要。
2. 各訂正指示(`report`, `todo`, `choice`, `note`)について、対象の
   `reports/daily/<report>`から`ref`(元の要確認TODO行の`ref`、つまり`_archive/...`の
   相対パス)を読み、対応する科目の`誤答ログ.md`・`弱点カルテ.md`を訂正する
   (例: 誤った科目に記載してしまった誤答ログの行を、正しい科目の`誤答ログ.md`へ
   移す。移す際は`node analysis/helpers/append-vault-section.mjs`で正しい科目側に
   「## 訂正($TODAY)」セクションとして追記し、誤って記載した側は次回のカルテ差分更新
   (手順5)で「$choiceへの訂正済み」と明記する)。
   **画像原本(`_archive/`)自体は移動しない**(監査用に元の場所を保つ。
   科目/単元の再分類は`誤答ログ.md`/`弱点カルテ.md`側の記述で表現する)。
3. 全訂正指示を反映し終えたら、`node analysis/helpers/clear-corrections.mjs` を実行し、
   `_inbox/corrections.md`を空にする(**消化済みの訂正は必ずクリアする。
   クリアするまではWebが追記した訂正が残り続け、翌晩また同じ訂正を繰り返してしまう**)。

### 5. カルテ差分更新

1. 手順3・4で誤答ログを更新した科目それぞれについて、
   `node analysis/helpers/read-vault-file.mjs "subjects/<科目名>/誤答ログ.md"` で
   直近の誤答ログを読み、`node analysis/helpers/read-vault-file.mjs "subjects/<科目名>/弱点カルテ.md"`
   で**前回までのカルテ本文**を読む(ファイルが無ければ新規扱いとして本文は空とみなす)。
2. 前回のカルテ内容と今回の誤答ログを踏まえ、**誤答パターン・教材横断の関連・根本原因**を
   地の文で分析する(例:「計算ミスが3日連続。符号の見落としが多く、検算習慣の欠如が
   根本原因と考えられる」)。この分析文を`analysis/tmp/karte-<科目名>.md`に書き出す。
3. `node analysis/helpers/append-vault-section.mjs "subjects/<科目名>/弱点カルテ.md" "$TODAY" analysis/tmp/karte-<科目名>.md '{"type":"karte","subject":"<科目名>"}'`
   を実行し、カルテに「## $TODAY」セクションとして追記する
   (**全置換しない。過去の分析は消さず、その日の差分だけ積み上げる**)。
4. 今回誤答ログの更新が無かった科目のカルテは変更しない(触らない)。

### 6. レポート生成

1. `analysis/tmp/daily-report-data.json` を作成する。形式:
   \`\`\`json
   {
     "confirmTodos": [
       {
         "id": "todo-1",
         "q": "この写真の科目は？",
         "options": ["日本史", "世界史", "不明"],
         "default": "日本史",
         "ref": "_archive/2026/07/abc.jpg"
       }
     ],
     "sections": [
       { "heading": "今日の仕分け結果", "body": "写真5件処理(仕分け4件 / 要確認1件)。..." },
       { "heading": "科目別の更新", "body": "- 日本史: 誤答ログ2件追記、カルテ差分更新\n- 数学: 更新なし" },
       { "heading": "訂正反映", "body": "corrections.mdの訂正2件を反映済み(または: 訂正指示なし)" }
     ]
   }
   \`\`\`
   `confirmTodos`は手順2〜3で確信度0.7未満・科目/単元未確定だったエントリを1件1TODOで列挙する
   (`id`は`todo-1`から連番、`options`には確信度上位の候補と`不明`を含める、
   `default`には最有力候補を入れる、`ref`には手順3で得た`archivedPath`を入れる)。
   要確認事項が無ければ`confirmTodos`は空配列でよい。
2. `node analysis/helpers/build-daily-report.mjs "$TODAY" analysis/tmp/daily-report-data.json`
   を実行し、`reports/daily/$TODAY.md`を生成する(冒頭に「## 要確認TODO」が自動で入る)。
3. **実行日が日曜日の場合**、追加で週次総括を作成する:
   - 直近7日分の`reports/daily/*.md`(`node analysis/helpers/read-vault-file.mjs`で
     日付ごとに読む)を踏まえ、学習時間推移・弱点の変化・来週の重点科目をまとめる。
   - `analysis/tmp/weekly-report-data.json`を作成する。形式:
     \`\`\`json
     {
       "sections": [
         { "heading": "学習時間推移", "body": "平均105分/日、前週比+10分。..." },
         { "heading": "弱点の変化", "body": "数学: 計算ミスが減少傾向。..." },
         { "heading": "来週の重点科目", "body": "日本史(直近の誤答が集中)、数学(検算習慣)" }
       ]
     }
     \`\`\`
   - 今日のISO週番号(`YYYY-Www`、例:`2026-W30`)を`WEEK`として、
     `node analysis/helpers/build-weekly-report.mjs "$WEEK" analysis/tmp/weekly-report-data.json`
     を実行し、`reports/weekly/$WEEK.md`を保存する。

### 7. ラン完了

1. `analysis/tmp/run-summary.json`を作成する。形式:
   \`\`\`json
   {
     "processed": 5,
     "needsConfirmation": 1,
     "lines": [
       "Inbox 5件処理(仕分け4件 / 要確認TODO 1件)",
       "誤答ログ更新: 日本史(2件)、数学(1件)",
       "カルテ差分更新: 日本史、数学",
       "訂正反映: 2件(または: 訂正指示なし)",
       "保存したレポート: daily(daily+weeklyの場合はその旨)"
     ]
   }
   \`\`\`
   `processed`は手順3で仕分け(誤答ログ追記 or 正解のみでスキップ)した総エントリ数、
   `needsConfirmation`は要確認TODOの件数を入れる。
2. `node analysis/helpers/finish-run.mjs "$TODAY" ok analysis/tmp/run-summary.json`
   を実行し、`runs/$TODAY.md`に完了報告を追記する(途中で回復不能なエラーが起きた場合は
   `ok`の代わりに`error`を指定し、`lines`にエラー内容を含める)。
3. 標準出力(実行ログ)に、以下を簡潔にまとめて出力して終了する:
   - 処理したInboxエントリの件数(仕分け完了 / 要確認 内訳)
   - 更新した科目(誤答ログ・カルテ)の一覧
   - 訂正反映の件数
   - 保存したレポートの種類(daily / daily+weekly)

---

## 注意事項

- `analysis/tmp/` は作業用の一時ディレクトリ。ダウンロード不要(画像は`vault/`上に
  直接ある)だが、レポート下書きやカルテ差分の一時ファイルを置く。実行後に残っていても
  問題ないが `.gitignore` 済みであることを前提とする(コミットしない)。
- `vault/`操作は必ず `analysis/helpers/*.mjs` 経由で行うこと。`fs`コマンドを
  シェルから直接叩いて`vault/`を書き換えないこと(frontmatterスキーマ・要確認TODO書式・
  corrections書式を壊さないため)。
- `src/` や `supabase/` など `analysis/` 以外のファイルは変更しないこと。
- **原本は非破壊**: `_archive/`に移動した画像・PDFを削除してはならない。
  誤仕分けは画像を移動し直すのではなく、`誤答ログ.md`/`弱点カルテ.md`側の記述を
  訂正することで遡及訂正する。
- **`_inbox/corrections.md`はバッチが読取と消化(クリア)のみ行う**。Webが追記した行を
  書き換えたり、消化前に消してはならない。
- 何らかのエラーで処理を中断した場合、`_inbox/`のエントリは消化(アーカイブ移動)せずに
  残す(次回再試行できるようにする)。`runs/$TODAY.md`には`status: error`で記録する。
- 1件のInboxエントリの処理は「読み取り→アーカイブ移動→誤答ログ/要確認TODO振り分け」を
  ひとかたまりとして扱い、中断時にデータの整合性が崩れないようにする。
```

### 手動確認手順

- [ ] 上記全文で`analysis/nightly.md`を書き換える。
- [ ] `grep -n "supabase\|Supabase\|SUPABASE" analysis/nightly.md` を実行し、ヒットが0件であることを確認する(Supabase依存の記述が残っていないことの確認)。
- [ ] `grep -n "STUDY_AI_AGENT_CLI\|Codex CLI\|claude -p" analysis/nightly.md` を実行し、CLI非依存の実行例・注意書きが維持されていることを確認する。
- [ ] `grep -n "analysis/helpers/" analysis/nightly.md | grep -v vault/` で本文中に登場する`analysis/helpers/*.mjs`の呼び出し名を列挙し、Task 2〜8で実装した以下のファイル名とすべて一致することを目視確認する: `read-vault-file.mjs`, `start-run.mjs`, `list-inbox-items.mjs`, `archive-inbox-photo.mjs`, `append-vault-section.mjs`, `read-corrections.mjs`, `clear-corrections.mjs`, `build-daily-report.mjs`, `build-weekly-report.mjs`, `finish-run.mjs`。
- [ ] ドライラン相当のチェック観点(`claude -p`実運用前の目視レビュー): (1) 手順1〜7が親スペックの7ステップと1対1で対応しているか、(2) 各ステップで「なぜその順番か」(訂正反映を仕分け後に置く理由、原本非破壊の理由)が本文中に説明されているか、(3) 要確認TODOの`options`/`default`/`ref`の決め方が具体的に書かれているか、(4) `analysis/tmp/`配下の一時ファイル名がすべて一意(科目名でファイル名が衝突しないか)であるか、を確認する。
- [ ] commit:
  ```bash
  git add analysis/nightly.md
  git commit -m "$(cat <<'EOF'
feat(analysis): rewrite nightly.md to drive the vault batch flow instead of Supabase

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 10: `analysis/README.md` の更新(セットアップ手順をvault前提に更新)

**Files:**
- Modify: `analysis/README.md`

**Interfaces:** なし(ドキュメントのみ)。

プロンプト/セットアップ文書の改訂であり、TDDは馴染まない。変更箇所(「前提」節と「セットアップ」節の間に新設する小節)の全文を掲載し、手動確認手順を示す。

### 追加するセクション(「## 前提」の直後、「## セットアップ」の直前に挿入)

```markdown
## vaultのセットアップ(必須)

夜間バッチはSupabaseの代わりに `vault/`(Google ドライブ同期フォルダ内)を直接読み書きする。

1. Google ドライブ デスクトップアプリでMacに同期済みの`vault/`フォルダの絶対パスを確認する
   (例: `/Users/shoug/Google Drive/マイドライブ/study-ai-vault`)。
2. `analysis/.env` に `STUDY_AI_VAULT_DIR=<上記の絶対パス>` を追記する
   (`analysis/.env.example` にテンプレートがある)。
3. 動作確認: `STUDY_AI_VAULT_DIR=<絶対パス> node analysis/helpers/list-inbox-items.mjs`
   を実行し、エラーなくJSON(空配列でもよい)が返ることを確認する。
```

### 「### 3. 動作確認」節の更新(既存のSupabase専用チェックにvaultチェックを追加)

変更前:
```markdown
### 3. 動作確認

\`\`\`bash
cd /Users/shoug/Documents/GitHub/study-ai
node analysis/helpers/list-pending-photos.mjs
\`\`\`

エラーなくJSON(空配列でもよい)が返ればSupabase接続はOK。
```

変更後:
```markdown
### 3. 動作確認

\`\`\`bash
cd /Users/shoug/Documents/GitHub/study-ai
node analysis/helpers/list-inbox-items.mjs
\`\`\`

エラーなくJSON(空配列でもよい)が返れば`STUDY_AI_VAULT_DIR`の設定はOK
(夜間バッチはこのvault接続のみで動く。Supabase接続確認は本バッチでは不要になった)。
```

- [ ] 「## 前提」節の直後、「## セットアップ」節の直前に「## vaultのセットアップ(必須)」小節を挿入する。
- [ ] 「### 3. 動作確認」節を上記の変更後の内容に置き換える。
- [ ] 手動確認: `grep -n "STUDY_AI_VAULT_DIR" analysis/README.md` を実行し、最低2箇所(セットアップ手順・動作確認)でヒットすることを確認する。
- [ ] 手動確認: `grep -n "list-pending-photos" analysis/README.md` を実行し、ヒットが0件であることを確認する(夜間バッチの動作確認コマンドが新ヘルパに置き換わっていることの確認。`list-pending-photos.mjs`ファイル自体は本計画のスコープ外なので削除しない)。
- [ ] commit:
  ```bash
  git add analysis/README.md
  git commit -m "$(cat <<'EOF'
docs(analysis): document STUDY_AI_VAULT_DIR setup and vault smoke test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 11: `npm run test:analysis` の一括実行確認

**Files:** なし(検証のみ)。

**Interfaces:** なし。

- [ ] Foundation計画(`analysis/helpers/vault/`)が実装済みであることを前提に、リポジトリルートで
      `npm run test:analysis` を実行する。
- [ ] 期待される出力: Task 2〜8で追加した7本のテストファイル(`list-inbox-items.test.mjs`,
      `start-run.test.mjs`, `finish-run.test.mjs`, `append-vault-section.test.mjs`,
      `build-daily-report.test.mjs`, `build-weekly-report.test.mjs`,
      `vault-cli-wrappers.test.mjs`)を含め、既存の`adaptive-interval.test.mjs`・
      `menubar-app/test/*.test.js`も含めて全件成功(失敗0件)する。
- [ ] 失敗する場合は該当テストのタスクに戻り、Foundation計画側の`analysis/helpers/vault/index.mjs`
      のexport名・戻り値の形が契約4bと一致しているか(特に`archivePhoto`の戻り値が
      `_archive/YYYY/MM/<name>`形式の文字列であるか、`readCorrections`の戻り値が
      契約3bの`CorrectionEntry[]`と一致しているか)を確認してから再実行する。
- [ ] このタスクはコミット不要(検証のみ)。
