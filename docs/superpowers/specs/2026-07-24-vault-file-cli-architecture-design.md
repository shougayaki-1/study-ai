# Vault構想: ファイル＋CLI中心アーキテクチャ 設計仕様

- 日付: 2026-07-24
- ステータス: 設計承認済み（実装計画未）
- 関連: [`docs/DESIGN.md`](../../DESIGN.md), [`analysis/README.md`](../../../analysis/README.md), [`analysis/nightly.md`](../../../analysis/nightly.md)

## 背景と目的

study-ai は受験生本人専用の学習管理アプリ。現状は Next.js + Supabase の Web アプリを中心に、
Mac 上で Claude Code / Codex をヘッドレス実行する夜間分析バッチ（`analysis/`）が Supabase を
直接読み書きする構成。課金は**サブスクのみ**（API 従量課金を使わない）という制約から、
分析は CLI エージェントで回している。

本設計では、**AI が読む情報の重心を Supabase（構造化 DB）から、Google ドライブ同期の
ローカルファイル群（資料＋AI メモ）へ移す**。Codex が得意な「大量テキストを横断で読んで
構造を見抜く」力を最大化し、Web は表示・確認に寄せる。Supabase は段階的に縮小する（C 方針）。

## 方針の要点（確定事項）

1. **正本はファイル**: Google ドライブ同期フォルダ内の `vault/`（Markdown＋画像）を単一の正本にする。
2. **スマホ入力はゼロ手間 Inbox**: スマホから `vault/_inbox/` に放り込むだけ。科目・ファイル名は気にしない。
   夜間 Codex が OCR → 科目/教材/単元推定 → 正しい場所へ移動 → カルテ更新まで全自動。
3. **Drive 連携は API 不使用**: Google ドライブ デスクトップアプリで Mac にローカル同期し、
   夜間 Codex は同期フォルダを**普通のローカルファイル**として読む。OAuth も従量課金も不要。
4. **Web はローカル起動のビューア＋確認 UI**: Vercel 運用をやめ、Mac 上で `npm run dev` し、
   Next.js サーバ側から `vault/` を `fs` で直接読み書きする（自分専用ローカルなので安全）。
5. **Supabase は段階的縮小**: 新規分析成果は全部 `vault/` へ。既存記録は当面残し、後で撤去。

## アーキテクチャ

### コンポーネント境界

| コンポーネント | 役割 | 依存 |
| --- | --- | --- |
| `vault/`（Drive 同期） | 全データの正本（Markdown＋画像） | ファイルシステム |
| 夜間バッチ（Codex/Claude Code） | Inbox 解析・カルテ差分更新・レポート生成 | `vault/` のローカルパスのみ |
| Web（ローカル Next.js） | `vault/` の閲覧・要確認 TODO の修正・手入力 | `vault/` を `fs` で読み書き |
| Supabase（縮小中） | 既存の構造化記録の入れ物（Phase 1 のみ） | 段階的に撤去 |

各コンポーネントは `vault/` を介してのみ結合する（well-defined interface = ファイル規約）。

### `vault/` ディレクトリ構造

```
vault/                          ← Google ドライブ同期フォルダ
  index.md                      ← Codex が最初に読む"地図"（全体の入口・規約リンク）
  _inbox/                       ← スマホから放り込むだけ（未処理）
    corrections.md              ← Web の「要確認 TODO 修正」が書き込む訂正指示（翌晩反映）
  _archive/YYYY/MM/             ← 処理済み原本画像（監査用に保存）
  subjects/
    <科目名>/
      弱点カルテ.md              ← Codex が毎晩"差分更新"する生きたカルテ
      誤答ログ.md                ← 誤答の時系列ログ
      教材メモ/                  ← 教材ごとのメモ
  materials/                    ← 教材マスタ（Markdown）
  essays/                       ← 小論文の答案＋添削履歴
  reports/
    daily/YYYY-MM-DD.md         ← 当日レポート（冒頭に「要確認 TODO」）
    weekly/YYYY-Www.md          ← 週次レポート（日曜生成）
  runs/YYYY-MM-DD.md            ← 分析ラン記録（いつ何を処理したか・監査用）
```

**ファイル規約の要点**:
- 各 Markdown の先頭に軽量な frontmatter（`subject`, `updated`, `source` 等）を置き、機械可読にする。
- `弱点カルテ.md` は**全置換せず追記・差分更新**する。過去の記述を Codex が読んで更新する前提。
- 画像原本は削除せず `_archive/` に保存（誤仕分けの遡及訂正のため）。

## 夜間バッチの新フロー

Supabase helper 呼び出しを**ファイル操作に置換**する。`analysis/nightly.md` を全面改訂。

1. **準備**: `vault/index.md` を読み、`runs/` に当日ランを開始記録。
2. **Inbox 解析**: `_inbox/` の各画像をマルチモーダルで直接読む
   （OCR＋○✕採点＋科目/教材/単元を推定。確信度も自己申告させる）。
3. **仕分け**: 原本を `_archive/YYYY/MM/` へ移動し、抽出データを該当 `subjects/` へ反映。
4. **訂正反映**: `_inbox/corrections.md` があれば先に読み、前日の誤仕分けを訂正してから 3 を行う。
5. **カルテ差分更新**: 各科目の `弱点カルテ.md` を、昨日の内容を読んで差分更新
   （誤答パターン・教材横断の関連・根本原因を地の文で分析）。
6. **レポート生成**: `reports/daily/YYYY-MM-DD.md` を生成。冒頭に**確信度が低い仕分けを
   「要確認 TODO」として列挙**。日曜は `reports/weekly/YYYY-Www.md` も生成。
7. **ラン完了**: `runs/YYYY-MM-DD.md` に処理件数・確認要否・エラーを記録。

**制約**: `vault/` 外（`src/` 等）は変更しない。`npm install`/`build` はしない。Node 標準機能のみ。
CLI 非依存の書き方を維持（`STUDY_AI_AGENT_CLI` で Claude Code / Codex を切替可能なまま）。

## Web の新しい役割（ローカル Next.js）

- **閲覧**: `vault/` の Markdown（カルテ・日次/週次レポート）をレンダリング表示。
- **要確認 TODO の修正**: 当日レポートの「要確認 TODO」をワンタップで訂正 →
  訂正内容を `vault/_inbox/corrections.md` に追記（翌晩の夜間バッチが反映）。
- **手入力**: 既存の勉強時間などの手入力 UI は残す（記録は当面 Supabase、後述の Phase で移行）。
- **重い分析ロジックは持たせない**（分析は夜間バッチに集約）。
- サーバ側（Server Action / Route Handler）から `fs` で `vault/` を読み書き。
  `vault/` のルートパスは環境変数（例 `STUDY_AI_VAULT_DIR`）で指定。

## Supabase の段階的縮小（C 方針）

- **Phase 1（本設計の主対象）**: 新規の分析成果は全部 `vault/` へ。夜間バッチの Supabase
  読み書きを停止。Supabase は既存の構造化記録の閲覧＋勉強時間手入力の入れ物として当面残す。
- **Phase 2（別スペックで実施）**: 過去記録を `vault/` へエクスポート → Supabase・関連コード撤去。
  Vercel 運用も正式終了。

Phase 分割の理由: 一度に DB を捨てるとロールバックが難しく、既存記録の消失リスクがある。
まず「新規はファイル、既存は据え置き」で安全に移行し、実運用で問題がないと確認してから撤去する。

## エラーハンドリング／運用上の注意

- **Drive 同期の遅延・競合**: 夜間バッチ実行前に Drive 同期が完了している前提。同期途中の
  一時ファイル（`.tmp` 等）は無視する。書き込み中の競合を避けるため、Web とバッチの
  `_inbox/corrections.md` への書き込みは追記のみ（Web が追記、バッチが読んで消化）。
- **原本は非破壊**: 画像は削除せず `_archive/` に保存。誤仕分けは翌朝の TODO 修正で遡及訂正。
- **確信度の明示**: 科目/単元推定は確信度を持たせ、低いものは必ず「要確認 TODO」に出す
  （黙って誤配置しない）。
- **バッチ失敗時**: `runs/` にエラーを記録し、Inbox は消化せず残す（次回再試行できる）。

## テスト方針

- **ファイル規約のユニットテスト**: frontmatter パーサ、`vault/` 読み書きヘルパ（Web 側）を
  `vitest` でテスト。
- **夜間バッチのヘルパ**: ファイル移動・アーカイブ・レポート雛形生成など決定的な処理は
  `node --test`（既存の `test:analysis` 枠）でテスト。画像解析そのもの（LLM 判断）は
  テスト対象外だが、入出力のファイル規約は固定してテストする。
- **Web E2E**: 「要確認 TODO をワンタップ修正 → `corrections.md` に追記される」フローを
  Playwright で確認（ローカル `vault/` フィクスチャを使用）。

## スコープ外（YAGNI）

- Google Drive API / OAuth 連携（デスクトップ同期で代替）。
- Supabase の完全撤去・過去データ移行（Phase 2 / 別スペック）。
- マルチユーザー・共有・権限管理（自分専用）。
- スマホ側の専用アプリ（Drive アプリへのアップロードで足りる）。

## 未決事項（実装計画で詰める）

- `弱点カルテ.md` の具体フォーマット（frontmatter スキーマ・見出し構成）。
- Web のどのページを残し、どれをビューア化するか（`/stats` 等の既存画面の扱い）。
- 夜間バッチのローカルパス設定（`STUDY_AI_VAULT_DIR` の受け渡し）。
