# 設問レベル学習記録（attempts）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学習記録を「設問1件＝1レコード」の追記専用JSONLへ蓄積し、単元ごとの定着状態をWebで根拠付きに閲覧できるようにする。既存のvault・夜間バッチ・Web画面は一切壊さない。

**Architecture:** 取り込みを「形式判定 → アダプタ → 正規化 → `vault/data/attempts.jsonl` 追記 → 派生物再生成 → ミラー同期」の一本のパイプラインにする。アダプタは形式ごとに追加でき、決定的パーサ（河合PDF）もLLM経由（写真）も同一スキーマを返す。派生物は全て JSONL から再生成でき、削除しても復元できる。

**Tech Stack:** Node.js 24（`analysis/helpers/*.mjs`、標準機能のみ・追加npm禁止）/ poppler CLI（`pdftotext` `pdftoppm` `pdfinfo`）/ Next.js 15 App Router + TypeScript + MUI（`src/`）/ テストは `node --test`（analysis側）と Vitest（Web側）。

---

## 0. このプロジェクトの前提知識（実装者向け・必読）

このセクションを読めば、リポジトリ未経験でも作業を開始できる。

### 0.1 study-ai とは

受験生本人1人だけが使う学習管理アプリ。作者本人が利用者である。

- **Web（`src/`）は完全に閲覧専用**。書き込み機能を追加してはならない。
- 記録の入力は、本人が Claude Code / Codex CLI と対話して行う。
- 夜間に分析バッチ（`analysis/nightly.md` をLLMに読ませて実行）が走り、
  写真やPDFを解析してレポートを書く。

### 0.2 vault とは

学習データの実体は Git リポジトリの外、**Google Drive 同期フォルダ内の `vault/`** にある。

- 絶対パスは環境変数 `STUDY_AI_VAULT_DIR` で与えられる（`analysis/.env` に記載）。
- **未設定ならスクリプトは即座にエラー終了すること。黙って別の場所を使ってはならない。**
- 構成:

```
vault/
  index.md
  _inbox/            未処理の写真・PDF。corrections.md（訂正指示）もここ
  _archive/YYYY/MM/  処理済みの原本。削除禁止
  subjects/<科目>/弱点カルテ.md, 誤答ログ.md
  reports/daily/YYYY-MM-DD.md, reports/weekly/YYYY-Www.md
  records/, checkins/, essays/, materials/, runs/
```

- **`vault/` への書き込みは必ず `analysis/helpers/*.mjs` 経由で行う。**
  シェルから直接 `vault/` のファイルを書き換えてはならない
  （frontmatterスキーマ・要確認TODO書式・corrections書式を壊さないため）。

### 0.3 Supabase ミラー

Web は Vercel 上でも動く。vault は Mac 上にしかないため、夜間バッチの最後に
`analysis/helpers/sync-vault-to-supabase.mjs` が `vault/` の `.md` を
Supabase の `vault_files` テーブル（`path`, `content`）へ一方向コピーする。
Web は `STUDY_AI_VAULT_SOURCE=supabase` のとき、このテーブルから読む。

`src/lib/vault/` に fs / supabase 両対応の読み取り関数がある。
`src/lib/vault/vault-source-parity.test.ts` が両者の等価性を守っている。

### 0.4 なぜこの作業をするのか（背景）

**設計仕様を必ず読むこと:**
[`../specs/2026-08-02-question-level-attempts-design.md`](../specs/2026-08-02-question-level-attempts-design.md)

要点だけ再掲する。

現状、夜間バッチのLLMは河合の解答履歴PDFを**十分に深く読めている**
（2026-08-01 は225問、2026-07-31 は431問を、単元別正答率・設問番号・所要時間まで）。
しかしその出力先が「その日の散文レポート1枚」しかないため、翌日以降は誰も参照しない。
実際 `_archive/` には29件の原本があるのに、`subjects/` 配下には英語2科目しか存在せず、
化学基礎・地理・公共・情報・古文・数学C の記録は**どこにも残っていない**。

本計画は、この失われている設問レベルの事実を、追記専用の JSONL に残す。

### 0.5 実装前に検証済みの技術的事実（再確認不要）

河合PDF（ファイル名に `tokuMo` を含む、東進のものとは**別形式**）について:

1. 正誤列は**テキストでも画像でもなくベクター描画**。`pdftotext` では取得できない。
   `pdffonts` に○✕△のグリフは無く、`pdfimages -list` にも該当画像は無い。
2. 正誤は**色で判別できる**。○ = 緑（RGB およそ `68,176,47`）、△ = 橙、✕ = 赤。
   `pdftoppm` で 150dpi の PPM を出力し、正誤列の矩形内で彩度の高い画素の平均色を見る。
3. 行の y 座標は `pdftotext -bbox-layout` の `<word>` 要素から得る。
   解答時間（`\d{2}:\d{2}:\d{2}`）の y 座標が行の基準として安定している。
4. 正誤列の x 範囲は、**ページ内で最後に出現する `正誤` という語**（テーブルヘッダ）の
   `xMin`/`xMax` から得る。科目列の位置も同様に**最後の `科目`** から得る。

   **1ページ目には絞り込みフォームがあるため `正誤` / `科目` が2回出るが、
   2ページ目以降とフォームの無い版面では1回しか出ない。**
   「2つ目」を要求すると、2ページ目と一部のファイル（例: 情報のPDF）が
   まるごと0行になる。必ず「最後の1つ」を使うこと。
5. 行間隔は約 23.7pt で規則的だが、**行間隔を仮定せず各行の実座標を使うこと**。
6. `区分` 列は `小単元 ＜ 中単元 ＜ 大単元` の順。`topic_path` へは**逆順**（大→小）に格納する。
   **重要:** `区分` セルは1つの `<word>` ではなく、単元名と `＜` が**別々の `<word>` に分割される**。
   実例（1行分、実測値）:

   ```
   <word xMin="302.690475" yMin="205.260141" xMax="359.564497" yMax="214.404219">金属結合・金属結晶</word>
   <word xMin="361.832211" yMin="207.053511" xMax="365.623813" yMax="212.539959">＜</word>
   <word xMin="367.990278" yMin="205.260141" xMax="393.267621" yMax="214.404219">化学結合</word>
   <word xMin="395.535364" yMin="207.053511" xMax="399.326966" yMax="212.539959">＜</word>
   <word xMin="401.693402" yMin="205.260141" xMax="433.290080" yMax="214.404219">物質の構成</word>
   ```

   `＜` は他の語より y 範囲が狭い（フォントサイズが異なる）。
   **文字列を `＜` で split してはならない。** x 順に並べた word 列から `＜` を除いて組み立てること。
7. **セルは1行に収まらないと折り返し、1行が複数のサブ行になる。** 数学のPDFが該当する。

   ```
   行 y=201.4〜224.2 の実例（数学C）
   サブ行1: 2026/07/31 | 範囲選 | 平面図形と様々な点の位置ベクトル ＜ 平面図形とベクトル ＜ 平面 | 数学
   サブ行2: 10:43      | 択     | ベクトル                                                  | C
   ```

   正しい結果は 単元 `… ＜ 平面ベクトル`、科目 `数学C` である。
   したがって帯の中の word を **y でサブ行にまとめ（許容 4pt）、サブ行を上から順に、
   行内は x 順に**並べてトークン列を作り、`＜` で区切って各区間を**連結**する必要がある。
   単純に x だけでソートすると `ベクトル` が先頭に来て壊れる。
8. **単元列と科目列の境界は x 座標だけでは決まらない。** 数学は単元テキストが x=463 まで伸び、
   情報は科目テキストが x=408 から始まるため、全ファイル共通の境界線が存在しない。
   **科目ヘッダ中心の左60pt以内にある語のうち、直前の空白が最も広い位置**を境界とすること
   （この方式で18ファイルすべてが正しく分離できることを実測で確認済み）。
9. 1ページ最大50行。超えると次ページに続く。
10. PPM は P6（非圧縮バイナリRGB）なので、外部ライブラリ無しでパースできる。

この方式を18ファイルに適用した結果、既存の日次レポートの数値と一致した
（地理19/27、情報9/12、公共9/16、英語3/7、2026-07-31 合計431問）。
化学基礎のみレポート側が1問ずれており（78+5+6=89 だが実際は88問）、
**決定的パーサの方が正確だった**。

---

## Global Constraints

- `analysis/helpers/**` は **Node標準機能のみ**。`package.json` に依存を追加しない。
- 外部コマンドは `pdftotext` / `pdftoppm` / `pdfinfo`（poppler）のみ許可。
  `node:child_process` の `execFileSync` を使い、シェル展開を経由しない。
- **`vault/` の既存 Markdown を書き換えない。** 本計画で新規に書くのは
  `vault/data/` 配下のみ。
- **`_archive/` の原本を削除・移動しない。**
- Web（`src/`）に mutation endpoint を追加しない。表示のみ。
- `SUPABASE_SERVICE_ROLE_KEY` を `src/` 側から参照しない（Vercel に置かない）。
- feature flag: 環境変数 `STUDY_AI_ATTEMPTS` が `1` のときだけ新経路を有効化する。
  未設定時は現行と完全に同じ挙動に戻ること。
- 日付・時刻は Asia/Tokyo。`occurred_at` が不明でも `occurred_date` は必ず持たせる。
- **推測でフィールドを埋めない。** 原本に無い情報（例: 誤答タイプ）は `null` のままにする。
- コミットメッセージ末尾に必ず次を付ける:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 各タスク完了時にコミットする。

---

## File Structure

**新規作成（analysis側）**

| パス | 責務 |
| --- | --- |
| `analysis/helpers/vault/attempts.mjs` | attempts.jsonl の読み書き。冪等な追記・訂正・active抽出 |
| `analysis/helpers/vault/skills.mjs` | attempts から単元別 state を計算する純関数 |
| `analysis/helpers/adapters/kawai-tokumo-history.mjs` | 河合形式の検出と抽出。純関数部と外部コマンド部を分離 |
| `analysis/helpers/adapters/ppm.mjs` | PPM(P6) パースと矩形サンプリング。純関数 |
| `analysis/helpers/ingest-artifact.mjs` | CLI: 原本1件を取り込む |
| `analysis/helpers/backfill-attempts.mjs` | CLI: `_archive/` を遡って取り込む |
| `analysis/helpers/build-skills.mjs` | CLI: derived/skills-*.json を再生成する |

**新規作成（Web側）**

| パス | 責務 |
| --- | --- |
| `src/lib/vault/skills.ts` | derived JSON の型定義と読み取り（fs/supabase 両対応） |
| `src/app/karte/[subject]/_components/SkillMap.tsx` | 単元マップの表示とドリルダウン |

**修正**

| パス | 内容 |
| --- | --- |
| `analysis/helpers/sync-vault-to-supabase.mjs` | 同期対象に `data/derived/*.json` を追加 |
| `src/lib/vault/index.ts` | `skills.ts` の re-export を追加 |
| `src/app/karte/[subject]/page.tsx` | 既存表示の上に `SkillMap` を差し込む |
| `analysis/nightly.md` | 手順2に取り込み分岐、手順6の前に派生物再生成を追加 |
| `analysis/README.md` | 新CLIの説明を追加 |

**テスト**

| パス | 対象 |
| --- | --- |
| `analysis/test/attempts-store.test.mjs` | Task 1 |
| `analysis/test/kawai-adapter-parse.test.mjs` | Task 2 |
| `analysis/test/fixtures/kawai-tokumo-words.json` | Task 2 のfixture（化学基礎・単一行セル） |
| `analysis/test/fixtures/kawai-tokumo-wrapped-words.json` | Task 2 のfixture（数学C・折り返しセル） |
| `analysis/test/kawai-adapter-extract.test.mjs` | Task 3 |
| `analysis/test/skills-state.test.mjs` | Task 5 |
| `analysis/test/sync-vault-to-supabase.test.mjs`（既存に追記） | Task 6 |
| `src/lib/vault/skills.test.ts` | Task 7 |
| `src/lib/vault/vault-source-parity.test.ts`（既存に追記） | Task 7 |

---

## Task 0: 運用の穴の調査（`runs/` 未記録）

新機能を足す前に、既存フローが正規経路を通っていない件を解消する。
**これは調査タスクであり、コード変更を伴わない場合がある。**

**Files:**
- Read only: `vault/runs/`, `vault/reports/daily/`, `analysis/run-nightly.sh`, `analysis/README.md`

**Interfaces:**
- Produces: 調査結果を `docs/superpowers/plans/2026-08-02-question-level-attempts.md` の
  本タスク末尾に追記する（このファイルに直接書く）。

- [ ] **Step 1: 事実を確認する**

```bash
set -a; . analysis/.env; set +a; ls -la "$STUDY_AI_VAULT_DIR/runs" "$STUDY_AI_VAULT_DIR/reports/daily"
```

期待: `runs/` の最終が `2026-07-26.md`、`reports/daily/` に `2026-07-28.md` `2026-07-31.md` `2026-08-01.md` が存在する。

- [ ] **Step 2: ロック残骸の有無を確認する**

```bash
set -a; . analysis/.env; set +a; ls -la "$STUDY_AI_VAULT_DIR/runs/.lock" 2>&1
```

`.lock` が存在する場合、クラッシュ跡である。次で解放する。

```bash
node analysis/helpers/finish-run.mjs --release-lock
```

- [ ] **Step 3: 原因を1つに絞る**

次のどれかを判定し、根拠となる出力を記録する。

1. `analysis/run-nightly.sh` を経由せず `claude -p` を直接叩いた（→ 手順1の `start-run.mjs` が実行されない）
2. ロックが取れず途中終了した（→ Step 2 で `.lock` が見つかる）
3. LLM が手順1をスキップした（→ レポートは出来ているのに `runs/` が無い、が該当）

`reports/daily/2026-07-31.md` と `2026-08-01.md` の `updated` が
どちらも `2026-08-01T14:0x` である事実から、**2日分をまとめて後追い生成した**可能性が高い。

- [ ] **Step 4: 判明した原因と対処をこのファイルに追記してコミット**

```bash
git add docs/superpowers/plans/2026-08-02-question-level-attempts.md
git commit -m "docs(plan): record findings on missing nightly run logs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**調査結果記入欄（実装者が埋めること）:**

> 原因: `analysis/tmp/nightly-20260716.log` から `nightly-20260801.log` まで、
> launchd の全実行が `/bin/bash: .../analysis/run-nightly.sh: Operation not permitted`
> で終了しており、`start-run.mjs` を含む正規バッチが起動していなかった。
> その一方で `reports/daily/2026-07-31.md` と `2026-08-01.md` はそれぞれ
> `2026-08-01T14:06:24.513Z`、`2026-08-01T14:19:41.520Z` に生成されているため、
> 2日分を正規バッチ外の手動処理で後追い生成し、レポート作成だけが行われたと判断した。
> `.lock` は存在せず、ロック競合やクラッシュ残骸は原因ではない。
>
> 対処: launchd からリポジトリ内スクリプトを実行できるよう、実行元アプリ/シェルに
> macOS の必要なファイルアクセス権を付与したうえで、必ず
> `analysis/run-nightly.sh` を入口として実行する。手動実行でも同スクリプトを使い、
> `start-run.mjs` から `finish-run.mjs` までの正規フローを通す。
>
> 再発防止: 翌朝はレポートの有無だけでなく、同日付の `runs/YYYY-MM-DD.md` と
> `analysis/tmp/nightly-YYYYMMDD.log` を対で確認する。ログが
> `Operation not permitted` の場合はレポートを手動で単独生成せず、起動権限を直して
> 正規バッチを再実行する。

---

## Task 1: attempts ストア

**Files:**
- Create: `analysis/helpers/vault/attempts.mjs`
- Test: `analysis/test/attempts-store.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces:
  - `attemptId(artifactSha256: string, page: number, rowIndex: number): string` — 16桁hex
  - `correctionId(previousId: string, correctedAt: string): string` — 16桁hex
  - `readAttempts(opts?: { includeInactive?: boolean }): Promise<Attempt[]>`
  - `appendAttempts(attempts: Attempt[]): Promise<{ added: number; unchanged: number; total: number }>`
  - `supersedeAttempt(previousId: string, patch: object, correctedAt: string): Promise<Attempt>`
  - `ATTEMPTS_REL_PATH = 'data/attempts.jsonl'`

`Attempt` は設計仕様 4章のオブジェクト。

**設計の要点（実装前に理解すること）:**

- ファイルは**追記専用**。同じ `id` の行を後から追記してよい。
  読むときは **id ごとに最後の行を採用**する。これで「追記専用」と「冪等」を両立する。
- `appendAttempts` は、既に同じ内容（`ingested_at` を除いてJSON等価）の行が
  最後の状態として存在するなら書かない。再実行してもファイルが膨らまない。
- `readAttempts()` は既定で `record_status === 'active'` のみ返す。

- [ ] **Step 1: 失敗するテストを書く**

`analysis/test/attempts-store.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'attempts-'));
  mkdirSync(path.join(dir, 'data'), { recursive: true });
  const prev = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = dir;
  return Promise.resolve(fn(dir)).finally(() => {
    if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = prev;
  });
}

function sample(overrides = {}) {
  return {
    id: 'aaaaaaaaaaaaaaaa',
    schema_version: 1,
    occurred_at: '2026-08-01T16:05:00+09:00',
    occurred_date: '2026-08-01',
    ingested_at: '2026-08-02T02:10:00+09:00',
    source_system: 'kawai',
    artifact_ref: '_archive/2026/08/x.pdf',
    artifact_sha256: 'deadbeef',
    extractor: { name: 'kawai-tokumo-history', version: '1.0.0', method: 'deterministic' },
    subject: '化学基礎',
    subject_raw: '化学基礎',
    topic_path: ['物質の構成', '化学結合', '分子とその形'],
    topic_path_raw: '分子とその形 ＜ 化学結合 ＜ 物質の構成',
    material: { name: '河合 学習履歴 / 範囲選択', question_no: '002' },
    result: 'correct',
    duration_sec: 25,
    error_type: null,
    confidence: 1,
    confirmation_status: 'unreviewed',
    record_status: 'active',
    supersedes: null,
    note: null,
    ...overrides,
  };
}

test('attemptId は同じ入力に対して安定した16桁hexを返す', async () => {
  const { attemptId } = await import('../helpers/vault/attempts.mjs');
  const a = attemptId('deadbeef', 1, 0);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, attemptId('deadbeef', 1, 0));
  assert.notEqual(a, attemptId('deadbeef', 1, 1));
  assert.notEqual(a, attemptId('deadbeee', 1, 0));
});

test('appendAttempts は追記し readAttempts で読み戻せる', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    const r = await appendAttempts([sample()]);
    assert.equal(r.added, 1);
    const rows = await readAttempts();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subject, '化学基礎');
  });
});

test('同じ内容を再追記してもファイルが増えず active 件数も変わらない（冪等）', async () => {
  await withVault(async (dir) => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample(), sample({ id: 'bbbbbbbbbbbbbbbb' })]);
    const before = readFileSync(path.join(dir, 'data', 'attempts.jsonl'), 'utf8');
    const r = await appendAttempts([sample({ ingested_at: '2026-08-03T00:00:00+09:00' }), sample({ id: 'bbbbbbbbbbbbbbbb' })]);
    assert.equal(r.added, 0);
    assert.equal(r.unchanged, 2);
    const after = readFileSync(path.join(dir, 'data', 'attempts.jsonl'), 'utf8');
    assert.equal(after, before);
    assert.equal((await readAttempts()).length, 2);
  });
});

test('同じ id で内容が変われば追記され、最後の行が採用される', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample({ result: 'incorrect' })]);
    await appendAttempts([sample({ result: 'correct' })]);
    const rows = await readAttempts();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].result, 'correct');
  });
});

test('supersedeAttempt は旧行を superseded にし、新行を active で追加する', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts, supersedeAttempt } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample()]);
    const next = await supersedeAttempt('aaaaaaaaaaaaaaaa', { subject: '化学' }, '2026-08-05T09:00:00+09:00');

    const active = await readAttempts();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, next.id);
    assert.equal(active[0].subject, '化学');
    assert.equal(active[0].supersedes, 'aaaaaaaaaaaaaaaa');
    assert.equal(active[0].confirmation_status, 'user_confirmed');
    assert.equal(active[0].extractor.method, 'user');

    const all = await readAttempts({ includeInactive: true });
    assert.equal(all.length, 2);
    const old = all.find((r) => r.id === 'aaaaaaaaaaaaaaaa');
    assert.equal(old.record_status, 'superseded');
    assert.equal(old.subject, '化学基礎', '訂正前の値は保持される');
  });
});

test('STUDY_AI_VAULT_DIR 未設定ならエラーになる', async () => {
  const prev = process.env.STUDY_AI_VAULT_DIR;
  delete process.env.STUDY_AI_VAULT_DIR;
  try {
    const { readAttempts } = await import('../helpers/vault/attempts.mjs');
    await assert.rejects(() => readAttempts(), /STUDY_AI_VAULT_DIR/);
  } finally {
    if (prev !== undefined) process.env.STUDY_AI_VAULT_DIR = prev;
  }
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
node --test analysis/test/attempts-store.test.mjs
```

Expected: FAIL（`Cannot find module '../helpers/vault/attempts.mjs'`）

- [ ] **Step 3: 実装する**

`analysis/helpers/vault/attempts.mjs`:

```js
// analysis/helpers/vault/attempts.mjs
// 設問レベル学習記録 (attempts) の追記専用ストア。
// 仕様: docs/superpowers/specs/2026-08-02-question-level-attempts-design.md 4章
//
// ファイルは追記専用。同じ id の行を後から追記してよく、読むときは id ごとに
// 「最後の行」を採用する。これにより append-only と冪等性を両立する。

import { createHash } from 'node:crypto';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export const ATTEMPTS_REL_PATH = 'data/attempts.jsonl';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) {
    throw new Error('STUDY_AI_VAULT_DIR が未設定です。analysis/.env かシェル環境に設定してください。');
  }
  return dir;
}

function attemptsPath() {
  return path.join(vaultRoot(), ATTEMPTS_REL_PATH);
}

function shortHash(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/** 原本ハッシュ + ページ + 行番号から安定IDを作る（再取り込みしても同じ） */
export function attemptId(artifactSha256, page, rowIndex) {
  return shortHash(`${artifactSha256}:${page}:${rowIndex}`);
}

/** 訂正で生まれる新レコードのID */
export function correctionId(previousId, correctedAt) {
  return shortHash(`correction:${previousId}:${correctedAt}`);
}

/** 比較用に ingested_at を除いた正規形を作る */
function canonical(attempt) {
  const { ingested_at: _ignored, ...rest } = attempt;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

async function readLines() {
  let raw;
  try {
    raw = await readFile(attemptsPath(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const rows = [];
  for (const [i, line] of raw.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      throw new Error(`${ATTEMPTS_REL_PATH} の ${i + 1} 行目が JSON として壊れています`);
    }
  }
  return rows;
}

/** id ごとに最後の行を採用した Map を返す */
async function latestById() {
  const map = new Map();
  for (const row of await readLines()) map.set(row.id, row);
  return map;
}

/**
 * @param {{ includeInactive?: boolean }} [opts]
 * @returns {Promise<object[]>} 既定では record_status === 'active' のみ
 */
export async function readAttempts(opts = {}) {
  const rows = Array.from((await latestById()).values());
  if (opts.includeInactive) return rows;
  return rows.filter((row) => row.record_status === 'active');
}

/**
 * 冪等な追記。既に同じ内容が最後の状態なら書かない。
 * @returns {Promise<{added: number, unchanged: number, total: number}>}
 */
export async function appendAttempts(attempts) {
  if (!Array.isArray(attempts)) throw new Error('appendAttempts: 配列を渡してください');
  const current = await latestById();
  const toWrite = [];
  let unchanged = 0;

  for (const attempt of attempts) {
    if (!attempt || typeof attempt.id !== 'string' || !attempt.id) {
      throw new Error('appendAttempts: id を持たないレコードがあります');
    }
    const existing = current.get(attempt.id);
    if (existing && canonical(existing) === canonical(attempt)) {
      unchanged += 1;
      continue;
    }
    toWrite.push(attempt);
    current.set(attempt.id, attempt);
  }

  if (toWrite.length > 0) {
    await mkdir(path.dirname(attemptsPath()), { recursive: true });
    await appendFile(attemptsPath(), toWrite.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  }

  return { added: toWrite.length, unchanged, total: current.size };
}

/**
 * 訂正。旧行を superseded にし、patch を当てた新行を active で追加する。
 * 原本 (_archive) は動かさない。
 */
export async function supersedeAttempt(previousId, patch, correctedAt) {
  const map = await latestById();
  const previous = map.get(previousId);
  if (!previous) throw new Error(`supersedeAttempt: id が見つかりません: ${previousId}`);
  if (previous.record_status !== 'active') {
    throw new Error(`supersedeAttempt: 既に ${previous.record_status} です: ${previousId}`);
  }

  const retired = { ...previous, record_status: 'superseded' };
  const next = {
    ...previous,
    ...patch,
    id: correctionId(previousId, correctedAt),
    supersedes: previousId,
    record_status: 'active',
    confirmation_status: 'user_confirmed',
    extractor: { name: 'user-correction', version: '1.0.0', method: 'user' },
    ingested_at: correctedAt,
  };

  await appendAttempts([retired, next]);
  return next;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
node --test analysis/test/attempts-store.test.mjs
```

Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add analysis/helpers/vault/attempts.mjs analysis/test/attempts-store.test.mjs
git commit -m "feat(analysis): add append-only attempts store with idempotent writes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 河合アダプタ — 純関数部

**Files:**
- Create: `analysis/helpers/adapters/kawai-tokumo-history.mjs`
- Create: `analysis/test/fixtures/kawai-tokumo-words.json`
- Create: `analysis/test/fixtures/kawai-tokumo-wrapped-words.json`
- Test: `analysis/test/kawai-adapter-parse.test.mjs`

**Interfaces:**
- Consumes: `attemptId` from `analysis/helpers/vault/attempts.mjs`
- Produces:
  - `ADAPTER = { name: 'kawai-tokumo-history', version: '1.0.0', method: 'deterministic' }`
  - `detectFromText(firstPageText: string): boolean`
  - `parseRows(words: Word[]): Row[]` — 純関数
  - `classifyMark(pixels: {r,number,g,b}[]): 'correct'|'partial'|'incorrect'|'unknown'` — 純関数
  - `toAttempts(input): Attempt[]` — 純関数

型:

```
Word = { x0: number, y0: number, x1: number, y1: number, t: string }
Row  = {
  index: number,             // ページ内の0始まり行番号
  at: string | null,         // 'YYYY/MM/DD HH:MM'
  durationSec: number,
  questionNo: string | null,
  topicParts: string[],      // ['金属結合・金属結晶','化学結合','物質の構成'] 小→大（PDF上の並び順）
  topicRaw: string,          // '金属結合・金属結晶 ＜ 化学結合 ＜ 物質の構成'
  subjectRaw: string,        // '化学基礎'
  markRect: { x0: number, x1: number, y0: number, y1: number }   // PDF点座標
}
```

**Fixture の作り方（重要）:**

実PDFはリポジトリに置けない（Drive上・著作権）。fixture は
`pdftotext -bbox-layout` の出力から `<word>` を抜いたJSONとする。

下記 Step 1 のfixtureは**すべて実測値をそのまま写したもの**である。2つ用意する。

- `kawai-tokumo-words.json` — 化学基礎（単一行セル、2行分）
- `kawai-tokumo-wrapped-words.json` — 数学C（セルが2サブ行に折り返す、1行分）

折り返しのfixtureが無いと、数学のPDFで単元名が壊れる不具合を検知できない。

- [ ] **Step 1: fixture を作る**

`analysis/test/fixtures/kawai-tokumo-words.json`:

```json
{
  "note": "河合 tokuMo 学習履歴PDF（化学基礎）1ページ目の word 座標。pdftotext -bbox-layout の実測値そのまま。ヘッダの 正誤/科目 が2回出るのは、1回目が絞り込みフォーム、2回目がテーブルヘッダのため。実PDFは著作権と個人情報のためリポジトリに置かない。",
  "words": [
    { "x0": 191.526118, "y0": 138.211988, "x1": 206.271234, "y1": 148.880080, "t": "正誤" },
    { "x0": 297.901603, "y0": 138.211988, "x1": 312.646720, "y1": 148.880080, "t": "科目" },
    { "x0": 200.511423, "y0": 181.920727, "x1": 215.256540, "y1": 192.588819, "t": "正誤" },
    { "x0": 229.030717, "y0": 181.920727, "x1": 258.520951, "y1": 192.588819, "t": "解答時間" },
    { "x0": 270.336792, "y0": 181.920727, "x1": 292.454467, "y1": 192.588819, "t": "問題名" },
    { "x0": 367.488354, "y0": 181.920727, "x1": 382.233471, "y1": 192.588819, "t": "区分" },
    { "x0": 469.618035, "y0": 181.920727, "x1": 484.363152, "y1": 192.588819, "t": "科目" },

    { "x0": 34.595946, "y0": 204.038402, "x1": 73.110141, "y1": 214.706494, "t": "2026/08/01" },
    { "x0": 74.761581, "y0": 204.038402, "x1": 93.178214, "y1": 214.706494, "t": "16:05" },
    { "x0": 117.422032, "y0": 204.206918, "x1": 142.699375, "y1": 213.350997, "t": "自己学習" },
    { "x0": 151.125156, "y0": 204.038402, "x1": 180.615389, "y1": 214.706494, "t": "範囲選択" },
    { "x0": 229.450363, "y0": 204.038402, "x1": 258.100094, "y1": 214.706494, "t": "00:00:18" },
    { "x0": 275.257316, "y0": 204.038402, "x1": 287.532615, "y1": 214.706494, "t": "010" },
    { "x0": 302.690475, "y0": 205.260141, "x1": 359.564497, "y1": 214.404219, "t": "金属結合・金属結晶" },
    { "x0": 361.832211, "y0": 207.053511, "x1": 365.623813, "y1": 212.539959, "t": "＜" },
    { "x0": 367.990278, "y0": 205.260141, "x1": 393.267621, "y1": 214.404219, "t": "化学結合" },
    { "x0": 395.535364, "y0": 207.053511, "x1": 399.326966, "y1": 212.539959, "t": "＜" },
    { "x0": 401.693402, "y0": 205.260141, "x1": 433.290080, "y1": 214.404219, "t": "物質の構成" },
    { "x0": 462.245477, "y0": 204.038402, "x1": 491.735711, "y1": 214.706494, "t": "化学基礎" },
    { "x0": 512.207726, "y0": 204.038402, "x1": 549.070517, "y1": 214.706494, "t": "解答を見る" },

    { "x0": 34.595946, "y0": 227.735911, "x1": 73.110141, "y1": 238.404003, "t": "2026/08/01" },
    { "x0": 74.761581, "y0": 227.735911, "x1": 93.178214, "y1": 238.404003, "t": "16:05" },
    { "x0": 117.422032, "y0": 227.904427, "x1": 142.699375, "y1": 237.048506, "t": "自己学習" },
    { "x0": 151.125156, "y0": 227.735911, "x1": 180.615389, "y1": 238.404003, "t": "範囲選択" },
    { "x0": 229.450363, "y0": 227.735911, "x1": 258.100094, "y1": 238.404003, "t": "00:00:25" },
    { "x0": 275.257316, "y0": 227.735911, "x1": 287.532615, "y1": 238.404003, "t": "002" },
    { "x0": 302.690475, "y0": 228.957650, "x1": 340.416909, "y1": 238.101729, "t": "分子とその形" },
    { "x0": 342.874204, "y0": 230.751020, "x1": 346.665806, "y1": 236.237467, "t": "＜" },
    { "x0": 348.843022, "y0": 228.957650, "x1": 374.120365, "y1": 238.101729, "t": "化学結合" },
    { "x0": 376.577328, "y0": 230.751020, "x1": 380.368930, "y1": 236.237467, "t": "＜" },
    { "x0": 382.546146, "y0": 228.957650, "x1": 414.142825, "y1": 238.101729, "t": "物質の構成" },
    { "x0": 462.245477, "y0": 227.735911, "x1": 491.735711, "y1": 238.404003, "t": "化学基礎" },
    { "x0": 512.207726, "y0": 227.735911, "x1": 549.070517, "y1": 238.404003, "t": "解答を見る" }
  ]
}
```

`analysis/test/fixtures/kawai-tokumo-wrapped-words.json`:

```json
{
  "note": "河合 tokuMo 学習履歴PDF（数学C）の、セルが2サブ行に折り返す行。pdftotext -bbox-layout の実測値そのまま。期待する解釈は 単元 '平面図形と様々な点の位置ベクトル ＜ 平面図形とベクトル ＜ 平面ベクトル'、科目 '数学C'。",
  "words": [
    { "x0": 191.526118, "y0": 138.211988, "x1": 206.271234, "y1": 148.880080, "t": "正誤" },
    { "x0": 297.901603, "y0": 138.211988, "x1": 312.646720, "y1": 148.880080, "t": "科目" },
    { "x0": 181.923692, "y0": 181.920727, "x1": 196.668809, "y1": 192.588819, "t": "正誤" },
    { "x0": 245.330986, "y0": 181.920727, "x1": 267.448661, "y1": 192.588819, "t": "問題名" },
    { "x0": 365.085690, "y0": 181.920727, "x1": 379.830806, "y1": 192.588819, "t": "区分" },
    { "x0": 483.252329, "y0": 181.920727, "x1": 497.997446, "y1": 192.588819, "t": "科目" },

    { "x0": 34.595946, "y0": 201.405346, "x1": 73.110141, "y1": 212.073438, "t": "2026/07/31" },
    { "x0": 107.951256, "y0": 201.573861, "x1": 133.228599, "y1": 210.717940, "t": "自己学習" },
    { "x0": 141.654383, "y0": 201.405346, "x1": 163.772058, "y1": 212.073438, "t": "範囲選" },
    { "x0": 276.401053, "y0": 203.680307, "x1": 377.510425, "y1": 212.824386, "t": "平面図形と様々な点の位置ベクトル" },
    { "x0": 379.736996, "y0": 205.473677, "x1": 383.528598, "y1": 210.960125, "t": "＜" },
    { "x0": 385.936206, "y0": 203.680307, "x1": 442.810228, "y1": 212.824386, "t": "平面図形とベクトル" },
    { "x0": 445.036827, "y0": 205.473677, "x1": 448.828429, "y1": 210.960125, "t": "＜" },
    { "x0": 451.236009, "y0": 203.680307, "x1": 463.874681, "y1": 212.824386, "t": "平面" },
    { "x0": 483.252329, "y0": 201.405346, "x1": 497.997446, "y1": 212.073438, "t": "数学" },

    { "x0": 207.727646, "y0": 207.724682, "x1": 236.377378, "y1": 218.392774, "t": "00:00:47" },
    { "x0": 250.251510, "y0": 207.724682, "x1": 262.526808, "y1": 218.392774, "t": "008" },
    { "x0": 518.000450, "y0": 207.724682, "x1": 554.863242, "y1": 218.392774, "t": "解答を見る" },

    { "x0": 34.595946, "y0": 213.517406, "x1": 53.012579, "y1": 224.185498, "t": "10:43" },
    { "x0": 141.654383, "y0": 213.517406, "x1": 149.026941, "y1": 224.185498, "t": "択" },
    { "x0": 276.401053, "y0": 213.685922, "x1": 301.678396, "y1": 222.830000, "t": "ベクトル" },
    { "x0": 488.271593, "y0": 213.517406, "x1": 492.975285, "y1": 224.185498, "t": "C" }
  ]
}
```

- [ ] **Step 2: 失敗するテストを書く**

`analysis/test/kawai-adapter-parse.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, 'fixtures', 'kawai-tokumo-words.json'), 'utf8'));
const wrapped = JSON.parse(readFileSync(path.join(here, 'fixtures', 'kawai-tokumo-wrapped-words.json'), 'utf8'));

test('detectFromText はヘッダ語で河合の学習履歴を判定する', async () => {
  const { detectFromText } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  assert.equal(detectFromText('教科学習結果 学習履歴 解答終了日時 配信名／学習メニュー 正誤 解答時間 問題名 区分 科目'), true);
  assert.equal(detectFromText('英検準1級 Reading 大問1'), false);
  assert.equal(detectFromText(''), false);
});

test('parseRows は行を座標から復元する', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.durationSec),
    [18, 25]
  );
  assert.deepEqual(
    rows.map((r) => r.questionNo),
    ['010', '002']
  );
  assert.equal(rows[0].at, '2026/08/01 16:05');
  assert.equal(rows[0].subjectRaw, '化学基礎');
  assert.equal(rows[0].index, 0);
});

test('parseRows は分割された 区分 セルを組み立て直す（＜ は別 word で来る）', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);

  assert.deepEqual(rows[0].topicParts, ['金属結合・金属結晶', '化学結合', '物質の構成']);
  assert.equal(rows[0].topicRaw, '金属結合・金属結晶 ＜ 化学結合 ＜ 物質の構成');
  assert.deepEqual(rows[1].topicParts, ['分子とその形', '化学結合', '物質の構成']);
});

test('parseRows は折り返したセルをサブ行順に連結する（数学のPDF）', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(wrapped.words);

  assert.equal(rows.length, 1);
  const row = rows[0];

  // 「平面」(サブ行1の末尾) + 「ベクトル」(サブ行2の先頭) が 1つの単元名に戻ること
  assert.deepEqual(row.topicParts, [
    '平面図形と様々な点の位置ベクトル',
    '平面図形とベクトル',
    '平面ベクトル',
  ]);
  // 「数学」(サブ行1) + 「C」(サブ行2) が 1つの科目名に戻ること
  assert.equal(row.subjectRaw, '数学C');
  assert.equal(row.questionNo, '008');
  assert.equal(row.durationSec, 47);
  assert.equal(row.at, '2026/07/31 10:43');
});

test('parseRows の markRect は最後の「正誤」ヘッダの x 範囲を使う', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  assert.ok(Math.abs(rows[0].markRect.x0 - 200.511423) < 0.001);
  assert.ok(Math.abs(rows[0].markRect.x1 - 215.25654) < 0.001);
  assert.ok(rows[0].markRect.y0 < 204.038402 && rows[0].markRect.y1 > 214.706494);
});

test('parseRows は「正誤」「科目」ヘッダが1回しか無くても動く（2ページ目・フォーム無し版面）', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  // 絞り込みフォームの 正誤/科目 を取り除いても、同じ結果になること
  const withoutForm = fixture.words.filter((w) => w.y0 > 160);
  const rows = parseRows(withoutForm);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].subjectRaw, '化学基礎');
});

test('parseRows は必要なヘッダが無ければ空配列を返す', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  assert.deepEqual(parseRows([{ x0: 1, y0: 1, x1: 2, y1: 2, t: '正誤' }]), [], '科目ヘッダが無い');
  assert.deepEqual(parseRows([{ x0: 1, y0: 1, x1: 2, y1: 2, t: '科目' }]), [], '正誤ヘッダが無い');
  assert.deepEqual(parseRows([]), []);
});

test('classifyMark は色で ○ △ ✕ を判定する', async () => {
  const { classifyMark } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const fill = (r, g, b) => Array.from({ length: 40 }, () => ({ r, g, b }));

  assert.equal(classifyMark(fill(68, 176, 47)), 'correct');    // 緑
  assert.equal(classifyMark(fill(240, 150, 30)), 'partial');   // 橙
  assert.equal(classifyMark(fill(220, 50, 60)), 'incorrect');  // 赤
  assert.equal(classifyMark(fill(255, 255, 255)), 'unknown');  // 無彩色のみ
  assert.equal(classifyMark([]), 'unknown');
});

test('classifyMark は無彩色の背景画素を無視する', async () => {
  const { classifyMark } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const pixels = [
    ...Array.from({ length: 200 }, () => ({ r: 255, g: 255, b: 255 })),
    ...Array.from({ length: 10 }, () => ({ r: 68, g: 176, b: 47 })),
  ];
  assert.equal(classifyMark(pixels), 'correct');
});

test('toAttempts はスキーマどおりのレコードを作る', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  const attempts = toAttempts({
    rows,
    marks: ['correct', 'incorrect'],
    page: 1,
    artifactRef: '_archive/2026/08/20260801-tokuMo-Chemics-1.pdf',
    artifactSha256: 'deadbeef',
    ingestedAt: '2026-08-02T02:10:00+09:00',
  });

  assert.equal(attempts.length, 2);
  const first = attempts[0];
  assert.equal(first.schema_version, 1);
  assert.equal(first.source_system, 'kawai');
  assert.equal(first.result, 'correct');
  assert.equal(first.duration_sec, 18);
  assert.equal(first.occurred_at, '2026-08-01T16:05:00+09:00');
  assert.equal(first.occurred_date, '2026-08-01');
  assert.deepEqual(first.topic_path, ['物質の構成', '化学結合', '金属結合・金属結晶']);
  assert.equal(first.topic_path_raw, '金属結合・金属結晶 ＜ 化学結合 ＜ 物質の構成');
  assert.equal(first.subject, '化学基礎');
  assert.equal(first.material.question_no, '010');
  assert.equal(first.confidence, 1);
  assert.equal(first.record_status, 'active');
  assert.equal(first.confirmation_status, 'unreviewed');
  assert.equal(first.supersedes, null);
  assert.match(first.id, /^[0-9a-f]{16}$/);
  assert.notEqual(attempts[1].id, first.id);
});

test('toAttempts は error_type を絶対に埋めない（原本に情報が無いため）', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  const attempts = toAttempts({
    rows,
    marks: ['incorrect', 'incorrect'],
    page: 1,
    artifactRef: '_archive/x.pdf',
    artifactSha256: 'deadbeef',
    ingestedAt: '2026-08-02T02:10:00+09:00',
  });
  for (const a of attempts) assert.equal(a.error_type, null);
});

test('toAttempts は rows と marks の件数が違えばエラーにする', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  assert.throws(
    () =>
      toAttempts({
        rows,
        marks: ['correct'],
        page: 1,
        artifactRef: '_archive/x.pdf',
        artifactSha256: 'deadbeef',
        ingestedAt: '2026-08-02T02:10:00+09:00',
      }),
    /一致しません/
  );
});

test('toAttempts は unknown マークも捨てずに result=unknown で残す', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  const attempts = toAttempts({
    rows,
    marks: ['unknown', 'correct'],
    page: 1,
    artifactRef: '_archive/x.pdf',
    artifactSha256: 'deadbeef',
    ingestedAt: '2026-08-02T02:10:00+09:00',
  });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].result, 'unknown');
});
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
node --test analysis/test/kawai-adapter-parse.test.mjs
```

Expected: FAIL（モジュール未作成）

- [ ] **Step 4: 実装する**

`analysis/helpers/adapters/kawai-tokumo-history.mjs`:

```js
// analysis/helpers/adapters/kawai-tokumo-history.mjs
// 河合「教科学習結果 > 学習履歴」PDF の決定的アダプタ（純関数部）。
// 東進のPDFは別形式であり、このアダプタでは扱えない。
//
// 検証済みの前提は
// docs/superpowers/specs/2026-08-02-question-level-attempts-design.md 9章を参照。
// 特に「正誤はベクター描画なのでテキスト抽出できず、色で判別する」点が中心。

import { attemptId } from '../vault/attempts.mjs';

export const ADAPTER = { name: 'kawai-tokumo-history', version: '1.0.0', method: 'deterministic' };
export const SOURCE_SYSTEM = 'kawai';
export const MATERIAL_NAME = '河合 学習履歴 / 範囲選択';

const HEADER_TOKENS = ['学習履歴', '解答終了日時', '解答時間', '区分'];
const DURATION_RE = /^\d{2}:\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;
const QNO_RE = /^\d{3}$/;
const TOPIC_SEP = '＜';
/** 同じサブ行とみなす y 中心のずれ（pt） */
const LINE_TOLERANCE = 4;
/** 科目列とみなす範囲。科目ヘッダ中心から左へ何ptまでを候補にするか */
const SUBJECT_ZONE_MARGIN = 60;

/** 1ページ目のテキストからこの形式かどうかを判定する */
export function detectFromText(firstPageText) {
  if (!firstPageText) return false;
  return HEADER_TOKENS.every((token) => firstPageText.includes(token));
}

function toSeconds(hhmmss) {
  return hhmmss.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

const centerX = (w) => (w.x0 + w.x1) / 2;
const centerY = (w) => (w.y0 + w.y1) / 2;

/** 同じ語の最後の出現を返す。1ページ目は絞り込みフォームの分だけ余分に出るため */
function lastWord(words, text) {
  const hits = words.filter((w) => w.t === text);
  return hits.length > 0 ? hits[hits.length - 1] : undefined;
}

/** 帯の中の word を y でサブ行にまとめ、上から順・行内は x 順にして返す */
function toSubLines(words) {
  const lines = [];
  for (const word of words.slice().sort((a, b) => centerY(a) - centerY(b))) {
    const y = centerY(word);
    const line = lines.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE);
    if (line) line.words.push(word);
    else lines.push({ y, words: [word] });
  }
  for (const line of lines) line.words.sort((a, b) => a.x0 - b.x0);
  return lines;
}

/**
 * word 座標から行を復元する。行間隔は仮定せず、解答時間セルの y 座標を行の基準にする。
 * セルが折り返して複数サブ行になる版面（数学のPDF）に対応するため、
 * 帯の中を「サブ行 → x順」で走査してトークン列を作る。
 * @param {{x0:number,y0:number,x1:number,y1:number,t:string}[]} words
 */
export function parseRows(words) {
  const seiho = lastWord(words, '正誤');
  const kamoku = lastWord(words, '科目');
  if (!seiho || !kamoku) return [];
  const subjectZone = centerX(kamoku) - SUBJECT_ZONE_MARGIN;

  const durations = words
    .filter((w) => DURATION_RE.test(w.t) && w.y0 > seiho.y1)
    .sort((a, b) => a.y0 - b.y0);

  return durations.map((duration, index) => {
    const yCenter = centerY(duration);
    const halfHeight = (duration.y1 - duration.y0) * 0.8;
    const band = words.filter((w) => {
      const c = centerY(w);
      return c > yCenter - halfHeight && c < yCenter + halfHeight;
    });

    const date = band.find((w) => DATE_RE.test(w.t));
    const hhmm = band.find((w) => HHMM_RE.test(w.t));
    const qno = band.find((w) => QNO_RE.test(w.t) && w.x0 > duration.x1);
    const contentLeft = qno ? qno.x1 : duration.x1;

    const topicTokens = [];
    const subjectTokens = [];

    for (const line of toSubLines(band)) {
      const cells = line.words.filter(
        (w) => w.t.trim() !== '' && w.t.trim() !== '解答を見る' && w.x0 > contentLeft
      );
      if (cells.length === 0) continue;

      // 区分列と科目列の境界。科目ヘッダ中心の近傍にある語のうち、
      // 直前の空白が最も広い位置で切る。x 座標の固定しきい値では
      // 数学（単元が右へ伸びる）と情報（科目が左から始まる）を同時に扱えない。
      let splitAt = cells.length;
      let widest = -1;
      for (let i = 1; i < cells.length; i += 1) {
        if (cells[i].x0 < subjectZone) continue;
        const gap = cells[i].x0 - cells[i - 1].x1;
        if (gap > widest) {
          widest = gap;
          splitAt = i;
        }
      }
      if (cells[0].x0 >= subjectZone) splitAt = 0;

      for (const [i, cell] of cells.entries()) {
        (i < splitAt ? topicTokens : subjectTokens).push(cell.t.trim());
      }
    }

    // ＜ で区切り、区間内のトークンを連結する。
    // 折り返しで分断された語（例: '平面' + 'ベクトル'）はここで元に戻る。
    const topicParts = [];
    let buffer = '';
    for (const token of topicTokens) {
      if (token === TOPIC_SEP) {
        if (buffer) topicParts.push(buffer);
        buffer = '';
      } else {
        buffer += token;
      }
    }
    if (buffer) topicParts.push(buffer);

    return {
      index,
      at: date && hhmm ? `${date.t} ${hhmm.t}` : null,
      durationSec: toSeconds(duration.t),
      questionNo: qno ? qno.t : null,
      topicParts,
      topicRaw: topicParts.join(` ${TOPIC_SEP} `),
      subjectRaw: subjectTokens.join(''),
      markRect: {
        x0: seiho.x0,
        x1: seiho.x1,
        y0: yCenter - halfHeight,
        y1: yCenter + halfHeight,
      },
    };
  });
}

/**
 * 正誤マークの色から結果を判定する。
 * ○ = 緑 / △ = 橙 / ✕ = 赤。無彩色（背景・罫線）は無視する。
 * @param {{r:number,g:number,b:number}[]} pixels
 */
export function classifyMark(pixels) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (const { r, g, b } of pixels) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 50) continue; // 彩度が低い画素は背景・罫線
    sumR += r;
    sumG += g;
    sumB += b;
    count += 1;
  }
  if (count === 0) return 'unknown';

  const r = sumR / count;
  const g = sumG / count;
  const b = sumB / count;

  if (g > r * 1.15 && g > b) return 'correct';
  if (r > g * 1.15 && g > b * 1.8) return 'partial'; // 橙は緑成分が残る。赤より先に判定する
  if (r > g * 1.6 && r > b * 1.6) return 'incorrect';
  return 'unknown';
}

/** '2026/08/01 16:05' → '2026-08-01T16:05:00+09:00' */
function toIsoJst(at) {
  if (!at) return null;
  const [date, time] = at.split(' ');
  return `${date.replace(/\//g, '-')}T${time}:00+09:00`;
}

/**
 * @param {{
 *   rows: object[], marks: string[], page: number,
 *   artifactRef: string, artifactSha256: string, ingestedAt: string
 * }} input
 */
export function toAttempts({ rows, marks, page, artifactRef, artifactSha256, ingestedAt }) {
  if (rows.length !== marks.length) {
    throw new Error(`toAttempts: rows(${rows.length}) と marks(${marks.length}) の件数が一致しません`);
  }

  return rows.map((row, i) => {
    const occurredAt = toIsoJst(row.at);
    return {
      id: attemptId(artifactSha256, page, row.index),
      schema_version: 1,

      occurred_at: occurredAt,
      occurred_date: occurredAt ? occurredAt.slice(0, 10) : null,
      ingested_at: ingestedAt,

      source_system: SOURCE_SYSTEM,
      artifact_ref: artifactRef,
      artifact_sha256: artifactSha256,
      extractor: { ...ADAPTER },

      subject: row.subjectRaw,
      subject_raw: row.subjectRaw,
      topic_path: [...row.topicParts].reverse(), // PDF上は小→大なので逆順にする
      topic_path_raw: row.topicRaw,
      material: { name: MATERIAL_NAME, question_no: row.questionNo },

      result: marks[i],
      duration_sec: row.durationSec,
      error_type: null, // 原本に問題文が無いため判定不能。推測で埋めない

      confidence: 1,
      confirmation_status: 'unreviewed',
      record_status: 'active',
      supersedes: null,
      note: null,
    };
  });
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
node --test analysis/test/kawai-adapter-parse.test.mjs
```

Expected: PASS（13件）

- [ ] **Step 6: コミット**

```bash
git add analysis/helpers/adapters/kawai-tokumo-history.mjs analysis/test/kawai-adapter-parse.test.mjs analysis/test/fixtures/
git commit -m "feat(analysis): add pure parsing core for the kawai study-history adapter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: PPM パーサと外部コマンド層

**Files:**
- Create: `analysis/helpers/adapters/ppm.mjs`
- Modify: `analysis/helpers/adapters/kawai-tokumo-history.mjs`（`extract` を追加）
- Test: `analysis/test/kawai-adapter-extract.test.mjs`

**Interfaces:**
- Consumes: `parseRows` / `classifyMark` / `toAttempts` from Task 2
- Produces:
  - `parsePpm(buffer: Buffer): { width: number, height: number, data: Buffer }`（`ppm.mjs`）
  - `sampleRect(image, rect: {x0,y0,x1,y1}): {r,g,b}[]`（`ppm.mjs`、ピクセル座標）
  - `extract({ file, artifactRef, ingestedAt }): Promise<{ attempts, unknownMarks, pages }>`（アダプタ）

**PPM(P6) の形式:**

```
P6\n<width> <height>\n255\n<RGB bytes...>
```

ヘッダのトークン区切りは空白・改行・タブのいずれでもよく、`#` 始まりはコメント行。

- [ ] **Step 1: 失敗するテストを書く**

`analysis/test/kawai-adapter-extract.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makePpm(width, height, fill) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const body = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const { r, g, b } = fill(i % width, Math.floor(i / width));
    body[i * 3] = r;
    body[i * 3 + 1] = g;
    body[i * 3 + 2] = b;
  }
  return Buffer.concat([header, body]);
}

test('parsePpm は P6 ヘッダを読み幅・高さ・画素を返す', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  const buf = makePpm(4, 3, () => ({ r: 10, g: 20, b: 30 }));
  const img = parsePpm(buf);
  assert.equal(img.width, 4);
  assert.equal(img.height, 3);
  assert.equal(img.data.length, 4 * 3 * 3);
  assert.equal(img.data[0], 10);
  assert.equal(img.data[2], 30);
});

test('parsePpm はコメント行を読み飛ばす', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  const header = Buffer.from('P6\n# created by pdftoppm\n2 1\n255\n', 'ascii');
  const body = Buffer.from([1, 2, 3, 4, 5, 6]);
  const img = parsePpm(Buffer.concat([header, body]));
  assert.equal(img.width, 2);
  assert.equal(img.height, 1);
  assert.deepEqual(Array.from(img.data), [1, 2, 3, 4, 5, 6]);
});

test('parsePpm は P6 以外を拒否する', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  assert.throws(() => parsePpm(Buffer.from('P3\n1 1\n255\n0 0 0', 'ascii')), /P6/);
});

test('sampleRect は矩形内の画素だけを返し、範囲外を切り詰める', async () => {
  const { parsePpm, sampleRect } = await import('../helpers/adapters/ppm.mjs');
  const img = parsePpm(makePpm(10, 10, (x) => (x < 5 ? { r: 255, g: 0, b: 0 } : { r: 0, g: 255, b: 0 })));

  const left = sampleRect(img, { x0: 0, y0: 0, x1: 4, y1: 1 });
  assert.equal(left.length, 10);
  assert.ok(left.every((p) => p.r === 255));

  const clipped = sampleRect(img, { x0: -5, y0: -5, x1: 1, y1: 0 });
  assert.equal(clipped.length, 2);
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
node --test analysis/test/kawai-adapter-extract.test.mjs
```

Expected: FAIL（`ppm.mjs` 未作成）

- [ ] **Step 3: `ppm.mjs` を実装する**

`analysis/helpers/adapters/ppm.mjs`:

```js
// analysis/helpers/adapters/ppm.mjs
// PPM (P6, 非圧縮バイナリRGB) の最小パーサ。pdftoppm の出力を外部ライブラリ無しで読む。

const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

/** @returns {{width:number,height:number,data:Buffer}} */
export function parsePpm(buffer) {
  let pos = 0;
  const tokens = [];

  while (tokens.length < 4) {
    while (pos < buffer.length && WHITESPACE.has(buffer[pos])) pos += 1;
    if (pos >= buffer.length) throw new Error('PPM ヘッダが不完全です');
    if (buffer[pos] === 0x23) {
      while (pos < buffer.length && buffer[pos] !== 0x0a) pos += 1;
      continue;
    }
    const start = pos;
    while (pos < buffer.length && !WHITESPACE.has(buffer[pos])) pos += 1;
    tokens.push(buffer.toString('ascii', start, pos));
  }
  pos += 1; // ヘッダ直後の単一空白文字

  if (tokens[0] !== 'P6') throw new Error(`P6 以外の PPM です: ${tokens[0]}`);
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PPM の寸法が不正です: ${tokens[1]}x${tokens[2]}`);
  }
  return { width, height, data: buffer.subarray(pos) };
}

/**
 * 矩形（ピクセル座標、両端含む）内の画素を返す。範囲外は切り詰める。
 * @returns {{r:number,g:number,b:number}[]}
 */
export function sampleRect(image, rect) {
  const x0 = Math.max(0, Math.round(rect.x0));
  const y0 = Math.max(0, Math.round(rect.y0));
  const x1 = Math.min(image.width - 1, Math.round(rect.x1));
  const y1 = Math.min(image.height - 1, Math.round(rect.y1));

  const pixels = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * image.width + x) * 3;
      pixels.push({ r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] });
    }
  }
  return pixels;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
node --test analysis/test/kawai-adapter-extract.test.mjs
```

Expected: PASS（4件）

- [ ] **Step 5: アダプタに `extract` を追加する**

`analysis/helpers/adapters/kawai-tokumo-history.mjs` の末尾に追記する。
ファイル冒頭の import 行も次の3行に差し替える。

```js
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attemptId } from '../vault/attempts.mjs';
import { parsePpm, sampleRect } from './ppm.mjs';
```

末尾に追記:

```js
const RENDER_DPI = 150;

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function pageCount(file) {
  const info = run('pdfinfo', [file]);
  const match = /Pages:\s+(\d+)/.exec(info);
  if (!match) throw new Error(`pdfinfo がページ数を返しませんでした: ${file}`);
  return Number(match[1]);
}

function wordsOf(file, page) {
  const xml = run('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), file, '-']);
  const words = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: decodeXmlEntities(m[5]) });
  }
  return words;
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function renderPage(file, page, total) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kawai-ppm-'));
  try {
    const prefix = path.join(dir, 'page');
    execFileSync('pdftoppm', ['-r', String(RENDER_DPI), '-f', String(page), '-l', String(page), file, prefix]);
    const pad = String(page).padStart(String(total).length, '0');
    return parsePpm(readFileSync(`${prefix}-${pad}.ppm`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 1ページ目のテキストからこの形式か判定する（ファイルを開く版） */
export function detect(file) {
  const text = run('pdftotext', ['-f', '1', '-l', '1', file, '-']);
  return detectFromText(text);
}

/**
 * 原本1件を attempts[] へ変換する。
 * @returns {Promise<{attempts: object[], unknownMarks: number, pages: number}>}
 */
export async function extract({ file, artifactRef, ingestedAt }) {
  const artifactSha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  const total = pageCount(file);
  const scale = RENDER_DPI / 72;

  const attempts = [];
  let unknownMarks = 0;

  for (let page = 1; page <= total; page += 1) {
    const rows = parseRows(wordsOf(file, page));
    if (rows.length === 0) continue;

    const image = renderPage(file, page, total);
    const marks = rows.map((row) =>
      classifyMark(
        sampleRect(image, {
          x0: (row.markRect.x0 - 3) * scale,
          y0: row.markRect.y0 * scale,
          x1: (row.markRect.x1 + 3) * scale,
          y1: row.markRect.y1 * scale,
        })
      )
    );
    unknownMarks += marks.filter((mark) => mark === 'unknown').length;

    attempts.push(...toAttempts({ rows, marks, page, artifactRef, artifactSha256, ingestedAt }));
  }

  if (attempts.length === 0) {
    throw new Error(
      `${artifactRef}: 河合形式と判定されたのに1行も抽出できませんでした。フォーマットが変更された可能性があります。`
    );
  }

  return { attempts, unknownMarks, pages: total };
}
```

- [ ] **Step 6: 実PDFに対してスモークテストする**

これは自動テストではなく手動確認である（実PDFはリポジトリに置けないため）。

```bash
set -a; . analysis/.env; set +a; node -e '
import("./analysis/helpers/adapters/kawai-tokumo-history.mjs").then(async (m) => {
  const f = process.env.STUDY_AI_VAULT_DIR + "/_archive/2026/08/20260801-tokuMo-Geo-1.pdf";
  console.log("detect:", m.detect(f));
  const r = await m.extract({ file: f, artifactRef: "_archive/2026/08/20260801-tokuMo-Geo-1.pdf", ingestedAt: new Date().toISOString() });
  const tally = r.attempts.reduce((a, x) => ((a[x.result] = (a[x.result] || 0) + 1), a), {});
  console.log("rows:", r.attempts.length, "unknown:", r.unknownMarks, tally);
});'
```

Expected: `detect: true` / `rows: 27 unknown: 0 { correct: 19, incorrect: 8 }`
（既存の `reports/daily/2026-08-01.md` の「地理総合：19/27正解」と一致すること）

一致しない場合は先に進まず、原因を特定すること。

- [ ] **Step 7: コミット**

```bash
git add analysis/helpers/adapters/ppm.mjs analysis/helpers/adapters/kawai-tokumo-history.mjs analysis/test/kawai-adapter-extract.test.mjs
git commit -m "feat(analysis): read kawai answer marks by sampling rendered PPM colors

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 取り込みCLIと backfill

**Files:**
- Create: `analysis/helpers/ingest-artifact.mjs`
- Create: `analysis/helpers/backfill-attempts.mjs`
- Modify: `analysis/README.md`

**Interfaces:**
- Consumes: `extract` / `detect` from Task 3、`appendAttempts` from Task 1
- Produces:
  - CLI `node analysis/helpers/ingest-artifact.mjs <vault相対パス>`
    → 標準出力に `{ "adapter", "attempts", "added", "unchanged", "unknownMarks" }`
  - CLI `node analysis/helpers/backfill-attempts.mjs [--dry-run]`
    → 標準出力に `{ "files": [...], "totals": {...} }`

**方針:** アダプタは配列で登録し、`detect` が true を返した最初のものを使う。
どれも該当しなければ `adapter: null` を返して**エラーにしない**（vision経路が担当するため）。

- [ ] **Step 1: `ingest-artifact.mjs` を実装する**

```js
#!/usr/bin/env node
// analysis/helpers/ingest-artifact.mjs
// vault 内の原本1件を attempts.jsonl へ取り込む。
//
// 使い方:
//   node analysis/helpers/ingest-artifact.mjs "_archive/2026/08/20260801-tokuMo-Geo-1.pdf"
//
// 既知形式でなければ adapter:null を返して正常終了する（LLM経路が担当する）。

import { existsSync } from 'node:fs';
import path from 'node:path';
import { appendAttempts } from './vault/attempts.mjs';
import * as kawai from './adapters/kawai-tokumo-history.mjs';

const ADAPTERS = [kawai];

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return dir;
}

export async function ingestArtifact(relPath, { ingestedAt = new Date().toISOString() } = {}) {
  const root = vaultRoot();
  const file = path.resolve(root, relPath);
  if (file !== path.resolve(root) && !file.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`relPath が vault の外を指しています: ${relPath}`);
  }
  if (!existsSync(file)) throw new Error(`ファイルが見つかりません: ${relPath}`);

  if (path.extname(file).toLowerCase() !== '.pdf') {
    return { adapter: null, reason: 'not-a-pdf', attempts: 0, added: 0, unchanged: 0, unknownMarks: 0 };
  }

  for (const adapter of ADAPTERS) {
    let matched = false;
    try {
      matched = adapter.detect(file);
    } catch {
      matched = false; // poppler 未導入等。vision 経路へ委ねる
    }
    if (!matched) continue;

    const { attempts, unknownMarks } = await adapter.extract({ file, artifactRef: relPath, ingestedAt });
    const { added, unchanged } = await appendAttempts(attempts);
    return {
      adapter: adapter.ADAPTER.name,
      attempts: attempts.length,
      added,
      unchanged,
      unknownMarks,
    };
  }

  return { adapter: null, reason: 'no-matching-adapter', attempts: 0, added: 0, unchanged: 0, unknownMarks: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error('使い方: node analysis/helpers/ingest-artifact.mjs <vault相対パス>');
    process.exit(1);
  }
  ingestArtifact(relPath)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
```

- [ ] **Step 2: `backfill-attempts.mjs` を実装する**

```js
#!/usr/bin/env node
// analysis/helpers/backfill-attempts.mjs
// _archive/ 配下の既存原本を遡って attempts.jsonl へ取り込む。
// id が原本ハッシュ由来で冪等なため、何度実行してもよい。
//
// 使い方:
//   node analysis/helpers/backfill-attempts.mjs            取り込む
//   node analysis/helpers/backfill-attempts.mjs --dry-run  判定だけ行い書き込まない

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { ingestArtifact } from './ingest-artifact.mjs';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return dir;
}

async function listPdfs(dirRel) {
  const root = vaultRoot();
  const out = [];
  async function walk(rel) {
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) await walk(childRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) out.push(childRel);
    }
  }
  await walk(dirRel);
  return out.sort();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = await listPdfs('_archive');
  const results = [];
  const totals = { files: files.length, matched: 0, attempts: 0, added: 0, unchanged: 0, unknownMarks: 0, failed: 0 };

  for (const relPath of files) {
    try {
      const result = dryRun
        ? { adapter: null, attempts: 0, added: 0, unchanged: 0, unknownMarks: 0, dryRun: true }
        : await ingestArtifact(relPath);
      results.push({ relPath, ...result });
      if (result.adapter) {
        totals.matched += 1;
        totals.attempts += result.attempts;
        totals.added += result.added;
        totals.unchanged += result.unchanged;
        totals.unknownMarks += result.unknownMarks;
      }
    } catch (error) {
      totals.failed += 1;
      results.push({ relPath, error: error.message });
    }
  }

  console.log(JSON.stringify({ totals, results }, null, 2));
  if (totals.unknownMarks > 0) {
    console.error(`警告: 色判定できなかったマークが ${totals.unknownMarks} 件あります。要確認TODOへ回してください。`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 3: backfill を実行して受け入れ条件を確認する**

```bash
set -a; . analysis/.env; set +a; node analysis/helpers/backfill-attempts.mjs | tail -40
```

Expected: `totals.matched` が 18、`totals.attempts` が 656、`totals.unknownMarks` が 0、`totals.failed` が 0。

- [ ] **Step 4: 冪等性を実データで確認する**

```bash
set -a; . analysis/.env; set +a; node analysis/helpers/backfill-attempts.mjs | python3 -c "import json,sys; t=json.load(sys.stdin)['totals']; print(t)"
wc -l "$STUDY_AI_VAULT_DIR/data/attempts.jsonl"
```

Expected: 2回目は `added: 0` / `unchanged: 656`、`attempts.jsonl` の行数が656のまま。

- [ ] **Step 5: 既存レポートとの突き合わせを確認する**

```bash
set -a; . analysis/.env; set +a; node -e '
import("./analysis/helpers/vault/attempts.mjs").then(async (m) => {
  const rows = await m.readAttempts();
  const by = {};
  for (const r of rows) {
    const k = r.subject || "(不明)";
    by[k] ||= { correct: 0, total: 0 };
    by[k].total += 1;
    if (r.result === "correct") by[k].correct += 1;
  }
  for (const [k, v] of Object.entries(by).sort()) console.log(k, `${v.correct}/${v.total}`);
  console.log("--- 合計", rows.length);
});'
```

Expected: 地理総合が `19/27`、情報が `9/12`、公共が `9/16`、合計が 656。

- [ ] **Step 6: `analysis/README.md` に追記してコミット**

`analysis/README.md` の末尾に次を追加する。

```markdown
## 設問レベル記録 (attempts)

`vault/data/attempts.jsonl` に設問1件＝1行で蓄積する。仕様は
`docs/superpowers/specs/2026-08-02-question-level-attempts-design.md`。

```bash
# 原本1件を取り込む（既知形式でなければ adapter:null を返して正常終了）
node analysis/helpers/ingest-artifact.mjs "_archive/2026/08/20260801-tokuMo-Geo-1.pdf"

# _archive/ を遡って取り込む（冪等。何度実行してもよい）
node analysis/helpers/backfill-attempts.mjs

# 派生物 (data/derived/skills-*.json) を再生成する
node analysis/helpers/build-skills.mjs
```

`unknownMarks` が1件でもあれば、色判定に失敗している。要確認TODOへ回すこと。
```

```bash
git add analysis/helpers/ingest-artifact.mjs analysis/helpers/backfill-attempts.mjs analysis/README.md
git commit -m "feat(analysis): add artifact ingestion and archive backfill CLIs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 単元別 state の計算と derived JSON

**Files:**
- Create: `analysis/helpers/vault/skills.mjs`
- Create: `analysis/helpers/build-skills.mjs`
- Test: `analysis/test/skills-state.test.mjs`

**Interfaces:**
- Consumes: `readAttempts` from Task 1
- Produces:
  - `computeState(results: string[]): 'insufficient'|'weak'|'unstable'|'stable'`
  - `buildSkills(attempts: object[], generatedAt: string): Record<string, SkillsFile>`
  - CLI `node analysis/helpers/build-skills.mjs`

型:

```
SkillsFile = {
  schema_version: 1,
  subject: string,
  generated_at: string,
  topics: Topic[]
}
Topic = {
  key: string,                  // topic_path.join(' > ')
  topic_path: string[],
  group: string,                // 中間層。topic_path が2件以上なら topic_path.at(-2)、なければ ''
  name: string,                 // topic_path.at(-1)
  attempts: number,
  correct: number,
  accuracy: number,             // partial は 0.5 として数える。小数第3位で丸める
  recent: string[],             // 直近5件の result。古い順
  last_practiced_date: string | null,
  avg_duration_sec: number | null,
  state: string,
  recent_attempts: {            // 直近20件。古い順。Webのドリルダウン用
    date: string | null,
    result: string,
    duration_sec: number | null,
    question_no: string | null,
    artifact_ref: string
  }[]
}
```

**state 判定ルール（上から順に評価し、最初に一致したものを採用）:**

| state | 条件 |
| --- | --- |
| `insufficient` | 試行数 < 3 |
| `weak` | 直近5件の正答率 < 0.6（`partial` は 0.5） |
| `unstable` | 直近5件で「正解」と「非正解」の切替が2回以上 |
| `stable` | 上記以外 |

- [ ] **Step 1: 失敗するテストを書く**

`analysis/test/skills-state.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('computeState: 試行3件未満は insufficient', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState([]), 'insufficient');
  assert.equal(computeState(['correct']), 'insufficient');
  assert.equal(computeState(['correct', 'correct']), 'insufficient');
});

test('computeState: 直近5件の正答率が0.6未満なら weak', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['incorrect', 'incorrect', 'correct']), 'weak');
  assert.equal(computeState(['incorrect', 'incorrect', 'incorrect', 'correct', 'correct']), 'weak');
});

test('computeState: partial は 0.5 として数える', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  // partial x3 = 1.5 / 3 = 0.5 < 0.6
  assert.equal(computeState(['partial', 'partial', 'partial']), 'weak');
});

test('computeState: 直近5件で切替が2回以上なら unstable', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  // ✕→○→✕→○→○ : 切替3回、正答率 3/5 = 0.6（weak ではない）
  assert.equal(computeState(['incorrect', 'correct', 'incorrect', 'correct', 'correct']), 'unstable');
});

test('computeState: 安定して正解なら stable', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['correct', 'correct', 'correct']), 'stable');
  assert.equal(computeState(['incorrect', 'correct', 'correct', 'correct', 'correct']), 'stable');
});

test('computeState: 直近5件だけを見る（それ以前は無視）', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  const results = ['incorrect', 'incorrect', 'incorrect', 'correct', 'correct', 'correct', 'correct', 'correct'];
  assert.equal(computeState(results), 'stable');
});

function attempt(overrides = {}) {
  return {
    subject: '化学基礎',
    topic_path: ['物質の構成', '化学結合', '分子とその形'],
    material: { name: 'x', question_no: '002' },
    result: 'correct',
    duration_sec: 20,
    occurred_date: '2026-08-01',
    artifact_ref: '_archive/2026/08/a.pdf',
    record_status: 'active',
    ...overrides,
  };
}

test('buildSkills は科目ごと・末端単元ごとに集約する', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const files = buildSkills(
    [
      attempt(),
      attempt({ result: 'incorrect', duration_sec: 40, occurred_date: '2026-08-02' }),
      attempt({ topic_path: ['物質の構成', '化学結合', '配位結合'] }),
      attempt({ subject: '地理総合', topic_path: ['地図', '地図の活用'] }),
    ],
    '2026-08-02T03:00:00+09:00'
  );

  assert.deepEqual(Object.keys(files).sort(), ['化学基礎', '地理総合']);

  const chem = files['化学基礎'];
  assert.equal(chem.schema_version, 1);
  assert.equal(chem.subject, '化学基礎');
  assert.equal(chem.topics.length, 2);

  const bunshi = chem.topics.find((t) => t.name === '分子とその形');
  assert.equal(bunshi.attempts, 2);
  assert.equal(bunshi.correct, 1);
  assert.equal(bunshi.accuracy, 0.5);
  assert.equal(bunshi.group, '化学結合');
  assert.equal(bunshi.key, '物質の構成 > 化学結合 > 分子とその形');
  assert.equal(bunshi.last_practiced_date, '2026-08-02');
  assert.equal(bunshi.avg_duration_sec, 30);
  assert.equal(bunshi.state, 'insufficient');
  assert.deepEqual(bunshi.recent, ['correct', 'incorrect']);
  assert.equal(bunshi.recent_attempts.length, 2);
  assert.equal(bunshi.recent_attempts[0].artifact_ref, '_archive/2026/08/a.pdf');
});

test('buildSkills は topic_path が空の試行を「(単元未判定)」へ集める', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const files = buildSkills([attempt({ topic_path: [] })], '2026-08-02T03:00:00+09:00');
  assert.equal(files['化学基礎'].topics[0].name, '(単元未判定)');
});

test('buildSkills は recent_attempts を直近20件に制限する', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const many = Array.from({ length: 25 }, (_, i) =>
    attempt({ occurred_date: `2026-07-${String(i + 1).padStart(2, '0')}` })
  );
  const files = buildSkills(many, '2026-08-02T03:00:00+09:00');
  const topic = files['化学基礎'].topics[0];
  assert.equal(topic.attempts, 25);
  assert.equal(topic.recent_attempts.length, 20);
  assert.equal(topic.recent.length, 5);
});

test('buildSkills は科目が空文字の試行を「(科目未判定)」へ集める', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const files = buildSkills([attempt({ subject: '' })], '2026-08-02T03:00:00+09:00');
  assert.ok(files['(科目未判定)']);
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
node --test analysis/test/skills-state.test.mjs
```

Expected: FAIL（モジュール未作成）

- [ ] **Step 3: `skills.mjs` を実装する**

```js
// analysis/helpers/vault/skills.mjs
// attempts から単元別の状態を計算する純関数群。
// 仕様: docs/superpowers/specs/2026-08-02-question-level-attempts-design.md 5.3

const RECENT_WINDOW = 5;
const RECENT_ATTEMPTS_LIMIT = 20;
const MIN_EVIDENCE = 3;
const WEAK_THRESHOLD = 0.6;
const UNSTABLE_SWITCHES = 2;

const UNKNOWN_SUBJECT = '(科目未判定)';
const UNKNOWN_TOPIC = '(単元未判定)';

/** partial は 0.5、correct は 1、それ以外は 0 */
function score(result) {
  if (result === 'correct') return 1;
  if (result === 'partial') return 0.5;
  return 0;
}

/**
 * 直近 RECENT_WINDOW 件から state を判定する。
 * @param {string[]} results 古い順
 */
export function computeState(results) {
  if (results.length < MIN_EVIDENCE) return 'insufficient';

  const recent = results.slice(-RECENT_WINDOW);
  const accuracy = recent.reduce((sum, r) => sum + score(r), 0) / recent.length;
  if (accuracy < WEAK_THRESHOLD) return 'weak';

  let switches = 0;
  for (let i = 1; i < recent.length; i += 1) {
    if ((recent[i] === 'correct') !== (recent[i - 1] === 'correct')) switches += 1;
  }
  if (switches >= UNSTABLE_SWITCHES) return 'unstable';

  return 'stable';
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * @param {object[]} attempts active な試行
 * @param {string} generatedAt ISO文字列
 * @returns {Record<string, object>} 科目名 → SkillsFile
 */
export function buildSkills(attempts, generatedAt) {
  const bySubject = new Map();

  for (const attempt of attempts) {
    const subject = attempt.subject || UNKNOWN_SUBJECT;
    const topicPath = Array.isArray(attempt.topic_path) && attempt.topic_path.length > 0
      ? attempt.topic_path
      : [UNKNOWN_TOPIC];
    const key = topicPath.join(' > ');

    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const topics = bySubject.get(subject);
    if (!topics.has(key)) topics.set(key, { topicPath, rows: [] });
    topics.get(key).rows.push(attempt);
  }

  const out = {};
  for (const [subject, topics] of bySubject) {
    const list = [];

    for (const [key, { topicPath, rows }] of topics) {
      // 日付昇順。日付が無いものは末尾に置く
      rows.sort((a, b) => String(a.occurred_date || '9999').localeCompare(String(b.occurred_date || '9999')));

      const results = rows.map((r) => r.result);
      const durations = rows.map((r) => r.duration_sec).filter((d) => typeof d === 'number');
      const dates = rows.map((r) => r.occurred_date).filter(Boolean);

      list.push({
        key,
        topic_path: topicPath,
        group: topicPath.length >= 2 ? topicPath[topicPath.length - 2] : '',
        name: topicPath[topicPath.length - 1],
        attempts: rows.length,
        correct: results.filter((r) => r === 'correct').length,
        accuracy: round3(results.reduce((sum, r) => sum + score(r), 0) / results.length),
        recent: results.slice(-RECENT_WINDOW),
        last_practiced_date: dates.length > 0 ? dates[dates.length - 1] : null,
        avg_duration_sec:
          durations.length > 0
            ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
            : null,
        state: computeState(results),
        recent_attempts: rows.slice(-RECENT_ATTEMPTS_LIMIT).map((r) => ({
          date: r.occurred_date ?? null,
          result: r.result,
          duration_sec: r.duration_sec ?? null,
          question_no: r.material?.question_no ?? null,
          artifact_ref: r.artifact_ref,
        })),
      });
    }

    list.sort((a, b) => a.key.localeCompare(b.key, 'ja'));
    out[subject] = { schema_version: 1, subject, generated_at: generatedAt, topics: list };
  }

  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
node --test analysis/test/skills-state.test.mjs
```

Expected: PASS（10件）

- [ ] **Step 5: `build-skills.mjs` を実装する**

```js
#!/usr/bin/env node
// analysis/helpers/build-skills.mjs
// attempts.jsonl から vault/data/derived/skills-<科目>.json を再生成する。
// 派生物なので、いつ削除しても再生成できる。

import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { readAttempts } from './vault/attempts.mjs';
import { buildSkills } from './vault/skills.mjs';

export const DERIVED_REL_DIR = 'data/derived';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return dir;
}

/** ファイル名に使えない文字を落とす（科目名は日本語のためスラッシュ等だけ除去） */
function safeName(subject) {
  return subject.replace(/[/\\:*?"<>|]/g, '_');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const attempts = await readAttempts();
  const files = buildSkills(attempts, generatedAt);

  const dir = path.join(vaultRoot(), DERIVED_REL_DIR);
  await mkdir(dir, { recursive: true });

  const written = [];
  for (const [subject, content] of Object.entries(files)) {
    const name = `skills-${safeName(subject)}.json`;
    await writeFile(path.join(dir, name), JSON.stringify(content, null, 2) + '\n', 'utf8');
    written.push(name);
  }

  // 科目が消えたときに古い派生ファイルを残さない
  const existing = await readdir(dir).catch(() => []);
  const stale = existing.filter((n) => n.startsWith('skills-') && n.endsWith('.json') && !written.includes(n));
  for (const name of stale) await rm(path.join(dir, name));

  console.log(JSON.stringify({ generatedAt, attempts: attempts.length, written, removed: stale }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 6: 実データで生成し、期待した弱点が出るか確認する**

```bash
set -a; . analysis/.env; set +a; node analysis/helpers/build-skills.mjs
node -e '
const fs=require("fs");
const dir=process.env.STUDY_AI_VAULT_DIR+"/data/derived";
for (const f of fs.readdirSync(dir)) {
  const j=JSON.parse(fs.readFileSync(dir+"/"+f,"utf8"));
  const bad=j.topics.filter(t=>t.state==="weak"||t.state==="unstable");
  if (bad.length) console.log(j.subject, bad.map(t=>`${t.name}(${t.state} ${t.correct}/${t.attempts})`).join(", "));
}'
```

Expected: 地理総合に「地図の活用」が `weak` で出る。国語に助動詞系の `unstable` が出る。

- [ ] **Step 7: コミット**

```bash
git add analysis/helpers/vault/skills.mjs analysis/helpers/build-skills.mjs analysis/test/skills-state.test.mjs
git commit -m "feat(analysis): derive per-topic mastery state from attempts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: ミラー同期の拡張

**Files:**
- Modify: `analysis/helpers/sync-vault-to-supabase.mjs`
- Test: `analysis/test/sync-vault-to-supabase.test.mjs`（既存に追記）

**Interfaces:**
- Consumes: `DERIVED_REL_DIR` from Task 5
- Produces: 同期対象の判定関数 `shouldSyncFile(relPath: string): boolean` を export する

**変更内容:** 現在は `entry.name.endsWith('.md')` で `.md` のみ同期している。
これを「`.md` すべて」または「`data/derived/` 直下の `.json`」に広げる。
**`data/attempts.jsonl` は同期しない**（サイズのためローカルのみ）。

- [ ] **Step 1: 失敗するテストを既存ファイルに追記する**

`analysis/test/sync-vault-to-supabase.test.mjs` の末尾に追加:

```js
test('shouldSyncFile は .md と data/derived/*.json だけを同期対象にする', async () => {
  const { shouldSyncFile } = await import('../helpers/sync-vault-to-supabase.mjs');

  assert.equal(shouldSyncFile('index.md'), true);
  assert.equal(shouldSyncFile('subjects/化学基礎/弱点カルテ.md'), true);
  assert.equal(shouldSyncFile('data/derived/skills-化学基礎.json'), true);

  assert.equal(shouldSyncFile('data/attempts.jsonl'), false, 'attempts本体はローカルのみ');
  assert.equal(shouldSyncFile('data/derived/nested/x.json'), false);
  assert.equal(shouldSyncFile('data/other.json'), false);
  assert.equal(shouldSyncFile('_archive/2026/08/a.pdf'), false);
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
node --test analysis/test/sync-vault-to-supabase.test.mjs
```

Expected: FAIL（`shouldSyncFile is not a function`）

- [ ] **Step 3: `sync-vault-to-supabase.mjs` を修正する**

ファイル上部（import 群の直後）に追加:

```js
export const DERIVED_REL_DIR = 'data/derived';

/**
 * ミラー同期の対象か判定する。
 * .md すべてと、data/derived/ 直下の .json のみ。
 * data/attempts.jsonl はサイズのためローカルに留める。
 */
export function shouldSyncFile(relPath) {
  const normalized = relPath.split(path.sep).join('/');
  if (normalized.endsWith('.md')) return true;
  if (!normalized.endsWith('.json')) return false;
  const dir = normalized.slice(0, normalized.lastIndexOf('/'));
  return dir === DERIVED_REL_DIR;
}
```

ディレクトリ走査部（現在 `entry.isFile() && entry.name.endsWith('.md')` となっている行）を
次のように書き換える。`relPath` はそのファイルの vault 相対パスを指す変数名に合わせること。

```js
      } else if (entry.isFile() && shouldSyncFile(path.join(dirRel, entry.name))) {
```

また、vault ルートの健全性チェック（`no .md files found under` を投げる箇所）は
`.md` の存在を見る現行のままでよい。

- [ ] **Step 4: テストが通ることを確認**

```bash
node --test analysis/test/sync-vault-to-supabase.test.mjs
```

Expected: PASS

- [ ] **Step 5: 実際に同期して確認**

```bash
set -a; . analysis/.env; set +a; node analysis/helpers/sync-vault-to-supabase.mjs
```

Expected: `added` に `data/derived/skills-*.json` の件数が含まれる。

- [ ] **Step 6: コミット**

```bash
git add analysis/helpers/sync-vault-to-supabase.mjs analysis/test/sync-vault-to-supabase.test.mjs
git commit -m "feat(analysis): mirror derived skills JSON alongside vault markdown

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Web の弱点マップ

**Files:**
- Create: `src/lib/vault/skills.ts`
- Create: `src/lib/vault/skills.test.ts`
- Create: `src/app/karte/[subject]/_components/SkillMap.tsx`
- Modify: `src/lib/vault/index.ts`
- Modify: `src/app/karte/[subject]/page.tsx`
- Modify: `src/lib/vault/vault-source-parity.test.ts`

**Interfaces:**
- Consumes: Task 5 が書く `data/derived/skills-<科目>.json`、既存の `readVaultFile`
- Produces:
  - `type SkillTopic` / `type SkillsFile`
  - `readSkills(subject: string): Promise<SkillsFile | null>` — 未生成なら `null`
  - `<SkillMap skills={skills} />`

**重要:** 既存の `readVaultFile` は frontmatter を解析するが、`---` で始まらない JSON は
`raw` にそのまま入る。したがって fs / supabase の両対応は
`(await readVaultFile(relPath)).raw` を `JSON.parse` するだけでよい。**新しい抽象を作らない。**

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/vault/skills.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const readVaultFile = vi.fn();
vi.mock("./read", () => ({ readVaultFile: (p: string) => readVaultFile(p) }));

describe("readSkills", () => {
  beforeEach(() => readVaultFile.mockReset());
  afterEach(() => vi.resetModules());

  it("科目名から derived JSON を読む", async () => {
    const file = {
      schema_version: 1,
      subject: "化学基礎",
      generated_at: "2026-08-02T03:00:00+09:00",
      topics: [
        {
          key: "物質の構成 > 化学結合 > 分子とその形",
          topic_path: ["物質の構成", "化学結合", "分子とその形"],
          group: "化学結合",
          name: "分子とその形",
          attempts: 8,
          correct: 8,
          accuracy: 1,
          recent: ["correct", "correct", "correct", "correct", "correct"],
          last_practiced_date: "2026-08-01",
          avg_duration_sec: 19,
          state: "stable",
          recent_attempts: [],
        },
      ],
    };
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: JSON.stringify(file) });

    const { readSkills } = await import("./skills");
    const result = await readSkills("化学基礎");

    expect(readVaultFile).toHaveBeenCalledWith("data/derived/skills-化学基礎.json");
    expect(result?.topics[0].name).toBe("分子とその形");
  });

  it("派生ファイルが無ければ null を返す（エラーにしない）", async () => {
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });
    readVaultFile.mockRejectedValue(error);

    const { readSkills } = await import("./skills");
    expect(await readSkills("未集計科目")).toBeNull();
  });

  it("JSON が壊れていれば null を返す", async () => {
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: "{ broken" });
    const { readSkills } = await import("./skills");
    expect(await readSkills("化学基礎")).toBeNull();
  });

  it("科目名のパス区切り文字はファイル名から除去する", async () => {
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: '{"schema_version":1,"subject":"a/b","generated_at":"x","topics":[]}' });
    const { readSkills } = await import("./skills");
    await readSkills("a/b");
    expect(readVaultFile).toHaveBeenCalledWith("data/derived/skills-a_b.json");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/lib/vault/skills.test.ts
```

Expected: FAIL（`./skills` が存在しない）

- [ ] **Step 3: `src/lib/vault/skills.ts` を実装する**

```ts
import { readVaultFile } from "./read";

export type SkillState = "insufficient" | "weak" | "unstable" | "stable";

export type SkillAttempt = {
  date: string | null;
  result: string;
  duration_sec: number | null;
  question_no: string | null;
  artifact_ref: string;
};

export type SkillTopic = {
  key: string;
  topic_path: string[];
  group: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number;
  recent: string[];
  last_practiced_date: string | null;
  avg_duration_sec: number | null;
  state: SkillState;
  recent_attempts: SkillAttempt[];
};

export type SkillsFile = {
  schema_version: number;
  subject: string;
  generated_at: string;
  topics: SkillTopic[];
};

export const DERIVED_REL_DIR = "data/derived";

/** 科目名を派生ファイル名へ変換する。analysis/helpers/build-skills.mjs の safeName と同じ規則 */
export function skillsRelPath(subject: string): string {
  const safe = subject.replace(/[/\\:*?"<>|]/g, "_");
  return `${DERIVED_REL_DIR}/skills-${safe}.json`;
}

/**
 * 派生ファイルを読む。未生成・破損時は null を返す（画面はエラーにせず「未集計」と出す）。
 */
export async function readSkills(subject: string): Promise<SkillsFile | null> {
  try {
    const { raw } = await readVaultFile(skillsRelPath(subject));
    const parsed = JSON.parse(raw) as SkillsFile;
    if (!Array.isArray(parsed.topics)) return null;
    return parsed;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: `src/lib/vault/index.ts` に re-export を追加**

末尾に追加:

```ts
export type { SkillState, SkillAttempt, SkillTopic, SkillsFile } from "./skills";
export { readSkills, skillsRelPath, DERIVED_REL_DIR } from "./skills";
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npx vitest run src/lib/vault/skills.test.ts
```

Expected: PASS（4件）

- [ ] **Step 6: `SkillMap` コンポーネントを実装する**

`src/app/karte/[subject]/_components/SkillMap.tsx`:

```tsx
"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import ButtonBase from "@mui/material/ButtonBase";
import type { SkillState, SkillTopic, SkillsFile } from "@/lib/vault";

const STATE_LABEL: Record<SkillState, string> = {
  weak: "弱い",
  unstable: "不安定",
  stable: "安定",
  insufficient: "データ不足",
};

const STATE_COLOR: Record<SkillState, "error" | "warning" | "success" | "default"> = {
  weak: "error",
  unstable: "warning",
  stable: "success",
  insufficient: "default",
};

const STATE_ORDER: SkillState[] = ["weak", "unstable", "insufficient", "stable"];

const RESULT_MARK: Record<string, string> = {
  correct: "○",
  incorrect: "✕",
  partial: "△",
  unknown: "?",
};

function TopicRow({ topic }: { topic: SkillTopic }) {
  const [open, setOpen] = useState(false);

  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        sx={{ width: "100%", display: "block", textAlign: "left" }}
        aria-expanded={open}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 120 }}>
            {topic.name}
          </Typography>
          <Typography variant="caption" component="span" sx={{ fontFamily: "monospace" }}>
            {topic.recent.map((r) => RESULT_MARK[r] ?? "?").join("")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {topic.correct}/{topic.attempts}
          </Typography>
          <Chip size="small" label={STATE_LABEL[topic.state]} color={STATE_COLOR[topic.state]} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {topic.avg_duration_sec !== null ? `平均${topic.avg_duration_sec}秒` : "所要時間なし"}
          {topic.last_practiced_date ? ` ・ 最終 ${topic.last_practiced_date}` : ""}
        </Typography>
      </ButtonBase>

      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.5} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider" }}>
          {topic.recent_attempts.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              試行の詳細がありません。
            </Typography>
          ) : (
            topic.recent_attempts
              .slice()
              .reverse()
              .map((a, i) => (
                <Typography key={`${a.artifact_ref}-${a.question_no}-${i}`} variant="caption" component="div">
                  {a.date ?? "日付不明"} ・ {RESULT_MARK[a.result] ?? "?"} ・{" "}
                  {a.duration_sec !== null ? `${a.duration_sec}秒` : "時間不明"}
                  {a.question_no ? ` ・ 問${a.question_no}` : ""}
                  <Box component="span" sx={{ display: "block", color: "text.secondary", wordBreak: "break-all" }}>
                    {a.artifact_ref}
                  </Box>
                </Typography>
              ))
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export function SkillMap({ skills }: { skills: SkillsFile }) {
  const groups = new Map<string, SkillTopic[]>();
  for (const topic of skills.topics) {
    const key = topic.group || "その他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(topic);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name, "ja"));
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        単元マップ
      </Typography>
      <Stack spacing={2}>
        {Array.from(groups.entries()).map(([group, topics]) => (
          <Box key={group}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              {group}
            </Typography>
            <Stack spacing={0.75}>
              {topics.map((topic) => (
                <TopicRow key={topic.key} topic={topic} />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 7: `page.tsx` に差し込む**

`src/app/karte/[subject]/page.tsx` を開き、既存のカルテ本文表示の**直前**に次を挿入する。
既存の表示ロジック・エラーハンドリングは変更しない。

```tsx
import { readSkills } from "@/lib/vault";
import { SkillMap } from "./_components/SkillMap";
```

コンポーネント本体で、既存のカルテ読み込みの後に追加:

```tsx
  const skills = await readSkills(subject);
```

JSX で、カルテ本文の直前に追加:

```tsx
      {skills && skills.topics.length > 0 ? (
        <SkillMap skills={skills} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          この科目の単元マップはまだ集計されていません。
        </Typography>
      )}
```

- [ ] **Step 8: parity テストに derived を追加する**

`src/lib/vault/vault-source-parity.test.ts` に、既存のテストと同じ書き方で
`data/derived/skills-*.json` が fs / supabase の両方から同じ内容で読めることを確認するケースを追加する。
既存ファイルのテストヘルパーの命名と構造に合わせること（既存のケースをそのまま複製して
パスと期待値だけ差し替えるのが最も安全）。

- [ ] **Step 9: 品質検査を全て通す**

```bash
npm run lint
npx tsc --noEmit
npm test
```

Expected: すべて PASS

- [ ] **Step 10: 実際に画面で確認する**

```bash
npm run dev
```

`http://localhost:3000/karte/化学基礎` を開き、次を確認する。

1. 単元マップが表示され、`データ不足` / `弱い` / `不安定` / `安定` が色分けされている
2. 単元をタップすると試行一覧（日時・○✕△・秒数・原本パス）が開く
3. 既存のカルテ本文がその下にそのまま表示されている

- [ ] **Step 11: コミット**

```bash
git add src/lib/vault/skills.ts src/lib/vault/skills.test.ts src/lib/vault/index.ts src/lib/vault/vault-source-parity.test.ts src/app/karte
git commit -m "feat(web): show per-topic skill map with drill-down on the karte page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 夜間バッチへの統合と feature flag

**Files:**
- Modify: `analysis/nightly.md`

**Interfaces:**
- Consumes: Task 4 の `ingest-artifact.mjs`、Task 5 の `build-skills.mjs`
- Produces: なし（プロンプト文書の更新）

**注意:** `analysis/nightly.md` は LLM に読ませる**プロンプト**である。
特定のCLI（Claude Code / Codex）のツール名に依存しない書き方を維持すること。

- [ ] **Step 1: 「2. Inbox解析」に取り込み手順を追加する**

`### 2. Inbox解析` の項目3（読み取り規約）の**前**に、新しい項目として挿入する。

```markdown
3. **決定的アダプタによる先行取り込み**（環境変数 `STUDY_AI_ATTEMPTS=1` のときのみ）:
   各エントリについて `node analysis/helpers/ingest-artifact.mjs "<relPath>"` を実行する。
   返り値の `adapter` が `null` 以外なら、そのエントリは設問レベルで
   `vault/data/attempts.jsonl` に取り込まれている。この場合、
   **次の項目4（LLMによる読み取り規約）をスキップしてよい**
   （既に正誤・単元・所要時間が機械的に確定しているため、重複して読む必要がない）。

   - `adapter` が `null` の場合は、従来どおり項目4以降のLLM読み取りを行う。
   - `unknownMarks` が1以上の場合は、色判定に失敗した行がある。
     **その原本を要確認TODOに回すこと**（黙って正解扱いにしない）。
   - このコマンドがエラーで終了した場合も、そのエントリを要確認TODOに回し、
     バッチ全体は止めない。

   `STUDY_AI_ATTEMPTS` が未設定の場合、この項目全体をスキップし、
   従来と完全に同じ処理を行う。
```

以降の項目番号（現在の3, 4）を1つずつ繰り下げる。

- [ ] **Step 2: 「5. カルテ差分更新」の後に派生物再生成を追加する**

`### 5. カルテ差分更新` の末尾に項目を追加する。

```markdown
5. **派生物の再生成**（`STUDY_AI_ATTEMPTS=1` のときのみ）:
   `node analysis/helpers/build-skills.mjs` を実行し、
   `vault/data/derived/skills-<科目>.json` を再生成する。
   このファイルはWebの単元マップが読む。失敗してもバッチ全体は止めず、
   手順7の `run-summary.json` の `lines` にエラー内容を追加する
   （派生物なので次回実行時に作り直せる）。
```

- [ ] **Step 3: 「注意事項」に追記する**

`## 注意事項` の末尾に追加する。

```markdown
- **`vault/data/attempts.jsonl` は追記専用**。既存行を書き換えたり削除したりしてはならない。
  訂正は `analysis/helpers/vault/attempts.mjs` の `supersedeAttempt` を使い、
  新しい行を追記する形で行う（原本非破壊と同じ考え方）。
- `vault/data/derived/` は派生物である。削除しても
  `node analysis/helpers/build-skills.mjs` で再生成できる。
```

- [ ] **Step 4: フラグ無しで挙動が変わらないことを確認する**

```bash
grep -n "STUDY_AI_ATTEMPTS" analysis/nightly.md
```

Expected: 3箇所すべてに「のときのみ」「未設定の場合」の条件が書かれている。

- [ ] **Step 5: コミット**

```bash
git add analysis/nightly.md
git commit -m "docs(analysis): wire attempts ingestion into the nightly batch behind a flag

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 受け入れ確認

**Files:** なし（検証のみ）

- [ ] **Step 1: 受け入れ条件を1つずつ確認する**

設計仕様11章の9項目を順に確認し、結果を記録する。
既知の限界（仕様10章）は受け入れ条件ではない。混同しないこと。

```bash
# 1. backfill で656試行
set -a; . analysis/.env; set +a; node analysis/helpers/backfill-attempts.mjs | python3 -c "import json,sys; print(json.load(sys.stdin)['totals'])"

# 2. 再実行しても active が656のまま
node analysis/helpers/backfill-attempts.mjs | python3 -c "import json,sys; print(json.load(sys.stdin)['totals'])"

# 4. 補助動詞|009 の履歴
node -e '
import("./analysis/helpers/vault/attempts.mjs").then(async (m) => {
  const rows = (await m.readAttempts())
    .filter((r) => r.topic_path.at(-1) === "補助動詞" && r.material.question_no === "009")
    .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  console.log(rows.map((r) => `${r.occurred_at} ${r.result} ${r.duration_sec}s`).join("\n"));
});'
```

Expected（項目4）: 3行が出力され、`incorrect → correct → incorrect` の順になる。

```bash
# 7. フラグ未設定で現行挙動
grep -c "STUDY_AI_ATTEMPTS" analysis/nightly.md

# 8. 派生物を消しても壊れない
set -a; . analysis/.env; set +a; rm -rf "$STUDY_AI_VAULT_DIR/data/derived"
npm run dev   # /karte/化学基礎 が「まだ集計されていません」と表示されること
node analysis/helpers/build-skills.mjs   # 再生成できること

# 9. 品質検査
npm run lint
npx tsc --noEmit
npm test
npm run test:analysis
npm run build
```

Expected: すべて成功。

- [ ] **Step 2: 結果を報告する**

各受け入れ条件について「満たした / 満たしていない（理由）」を明示して報告する。
**満たしていない項目を「概ね動作」などと曖昧にまとめない。**

---

## Self-Review 記録

本計画作成時に実施した確認。

**1. 仕様カバレッジ:** 設計仕様の各章に対応するタスクは次のとおり。
3章アーキテクチャ→Task 2〜4 / 4章データ契約→Task 1〜2 / 5章派生物とWeb→Task 5〜7 /
6章移行と非破壊性→Task 0・4・8 / 7章テスト戦略→各タスクのテストステップ /
8章依存制約→Global Constraints / 10章受け入れ条件→Task 9。

**2. プレースホルダ:** Task 0 の「調査結果記入欄」のみ意図的に空欄。
これは調査タスクの成果物であり、実装指示ではない。他に TBD・TODO は無い。

**3. 型の一貫性:** `attemptId` / `readAttempts` / `appendAttempts` / `supersedeAttempt` /
`computeState` / `buildSkills` / `shouldSyncFile` / `readSkills` / `skillsRelPath` は
定義タスクと利用タスクで名前・引数・戻り値が一致している。
`safeName`（mjs側）と `skillsRelPath`（ts側）は同じ置換規則
（`/[/\\:*?"<>|]/g` → `_`）を使う。ここがずれると Web が派生ファイルを見つけられない。
