# vault 規約 共有インターフェース契約（3計画の seam）

- 日付: 2026-07-24
- 親スペック: [`2026-07-24-vault-file-cli-architecture-design.md`](./2026-07-24-vault-file-cli-architecture-design.md)
- 位置づけ: Foundation計画(1)が**実装**し、バッチ計画(2)とWeb計画(3)が**消費**する固定契約。
  ここに書かれた**パス・frontmatterスキーマ・テキスト書式・関数シグネチャは全計画で厳守**（勝手に改名しない）。

## 1. パス・環境変数

- vaultルート: 環境変数 **`STUDY_AI_VAULT_DIR`**（Driveミラーの絶対パス）。
  - Web: `process.env.STUDY_AI_VAULT_DIR`
  - バッチ: シェル環境または `analysis/.env` の `STUDY_AI_VAULT_DIR`
  - 未設定なら各ヘルパは即エラー（黙って別パスにフォールバックしない）。
- 相対パスはすべて vaultルート基準（例 `reports/daily/2026-07-24.md`）。
- 構造は親スペックの「`vault/` ディレクトリ構造」に従う。

## 2. frontmatter スキーマ（全 Markdown 共通 YAML）

```yaml
---
type: karte | daily-report | weekly-report | run-log | material | essay
subject: 日本史            # type=karte等で必須、無い型では省略
updated: 2026-07-24T23:40:00+09:00   # ISO8601(+09:00)
source: nightly-batch | web | manual
schema_version: 1
---
```

型別の追加フィールド:
- `daily-report`: `date: YYYY-MM-DD`, `confirm_todos: <整数>`（要確認TODO件数）
- `weekly-report`: `week: YYYY-Www`
- `run-log`: `date: YYYY-MM-DD`, `started_at`, `finished_at`, `processed: <整数>`, `needs_confirmation: <整数>`, `status: ok | error`
- `karte`: `subject` 必須

## 3. 共有テキスト書式（機械可読・人間可読の両立）

### 3a. 要確認TODO（daily-report 冒頭の `## 要確認TODO` 節）
1行1TODO。`key=value` を ` | ` 区切り。**この行書式は Web がパースしタップ選択を描画し、バッチが消化する**。

```md
## 要確認TODO
- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg
```

- `id`: レポート内で一意（`todo-N`）。`options`: ` / ` 区切りの選択肢。`default`: 既定選択。`ref`: 関連原本の相対パス（任意）。

### 3b. 訂正指示（`_inbox/corrections.md`、追記専用）
Web がユーザーのタップ選択を**追記**し、翌晩バッチが読んで消化。**Web は追記のみ・バッチは読取と消化のみ**（同一行を両者が書き換えない）。

```md
## 2026-07-24T08:12:00+09:00
- report: reports/daily/2026-07-24.md
- todo: todo-1
- choice: 世界史
- note: (任意)
```

## 4. ヘルパ関数シグネチャ（Foundation計画が実装）

### 4a. Web/TS: `src/lib/vault/` （Node fs、サーバ側のみ）
```ts
export function getVaultRoot(): string;                 // env未設定でthrow
export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string };
export function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string;
export async function readVaultFile(relPath: string): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }>;

export type ReportMeta = { path: string; date: string; frontmatter: Record<string, unknown> };
export async function listReports(kind: 'daily' | 'weekly'): Promise<ReportMeta[]>;   // 日付降順

export type ConfirmTodo = { id: string; q: string; options: string[]; default: string; ref?: string };
export function parseConfirmTodos(body: string): ConfirmTodo[];   // 3aをパース

export type CorrectionEntry = { timestamp: string; report: string; todo: string; choice: string; note?: string };
export async function appendCorrection(entry: CorrectionEntry): Promise<void>;   // 3bへ追記
```

### 4b. バッチ/Node: `analysis/helpers/vault/` （.mjs、Node標準のみ・追加npm禁止）
```js
export function vaultRoot();                              // env未設定でthrow
export function parseFrontmatter(raw);                    // { frontmatter, body }
export function stringifyFrontmatter(frontmatter, body);  // string
export async function readVaultFile(relPath);             // { frontmatter, body, raw }
export async function writeVaultFile(relPath, frontmatter, body);  // ディレクトリ自動作成
export async function archivePhoto(srcRelPath, dateStr);  // _inbox → _archive/YYYY/MM/ へ移動、移動先relPathを返す
export async function readCorrections();                  // 3bをパースし CorrectionEntry[] を返す(無ければ[])
export async function clearCorrections();                 // 消化後に corrections.md を空にする
```

**TS版とNode版で frontmatter・要確認TODO・corrections のパース結果は完全一致させる**（同じ入力→同じ構造）。両者に同一のフィクスチャでのテストを課す。

## 5. 命名の固定

- 関数名・型名は上記のまま（例: `getVaultRoot`/`vaultRoot`、`ConfirmTodo`、`CorrectionEntry`）。
- ディレクトリ名（`_inbox` `_archive` `subjects` `materials` `essays` `reports/daily` `reports/weekly` `runs`）は変更しない。
- ファイル名: カルテ=`弱点カルテ.md`、日次=`reports/daily/YYYY-MM-DD.md`、週次=`reports/weekly/YYYY-Www.md`、ラン=`runs/YYYY-MM-DD.md`。
