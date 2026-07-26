# study-ai

受験生向け学習管理Webアプリ。設計仕様は [`docs/DESIGN.md`](./docs/DESIGN.md) を参照。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に Supabase プロジェクトの URL / anon key を設定
npm run dev
```

Supabase側のセットアップ:

1. Dockerを起動
2. `supabase start`
3. `supabase db reset --local` でマイグレーションとseedを適用
4. `supabase status -o env` のURL・キーを `.env.local` に設定

`supabase/migrations/` がスキーマの正本です。`supabase/schema.sql` は既存環境参照用の
スナップショットであり、新しい変更を直接追加しません。

`.env.local` が未設定でも `npm run build` は通るようにしてあるが、実際のログイン・データ取得にはSupabaseの接続情報が必須。

`/karte`(弱点カルテ)画面はvaultディレクトリ(Googleドライブ同期フォルダ内の`vault/`)を直接読み込むため、
`.env.local` に `STUDY_AI_VAULT_DIR`(vaultの絶対パス)を設定する必要がある。未設定のまま `/karte` を開くとエラーになる。

## 品質検査

```bash
npm run lint
npm run audit:prod
npx tsc --noEmit
npm test
npm run test:analysis
npm run build
npm run types:check       # ローカルSupabase起動中に実行
npm run test:e2e          # ローカルSupabaseの環境変数が必要
```

GitHub Actionsでも同じ検査、空DBからのマイグレーション、Playwright E2Eを実行する。
staging・本番への適用順は [`docs/stability-rollout.md`](./docs/stability-rollout.md) を参照。

## 実装状況

- Next.js 15 (App Router / TypeScript) + MUI(ライトテーマ固定・ミニマル)
- ナビゲーション: モバイルは下部固定タブ4つ(今日(`/`) / 履歴(`/records`) / 分析(`/stats`) / 予定(`/schedule`))
  + 右下メニューから レポート(`/reports`) / カルテ(`/karte`) / 設定(`/settings`)。
  デスクトップは左サイドバーに7項目すべてを表示
- 記録・予定・学習計画の入力画面は持たない(Phase 2 で `/record` を廃止)。入力は
  Claude Code / Codex CLI との対話から vault の Markdown に書き込む方式
  ([`docs/study-dialogue.md`](./docs/study-dialogue.md))。Webは表示が主で、書き込みは
  `/schedule` の完了チェック(ローカル実行時のみ)に限られる
- 今日・履歴・予定・レポート・カルテの各画面はvault(`vault/`配下のMarkdown)を読んで表示する
- 分析画面 `/stats` は Phase 2 で凍結済み。移行日以前のSupabaseデータのみを表示し、
  新規の記録は反映されない(分析の主役は夜間バッチが書く`reports/`と弱点カルテ)
- ローカルDB再構築、型生成一致、ユニットテスト、Playwright E2E、CIを整備
- Supabase Auth(メールログイン、`/login`)+ middleware による未認証リダイレクト
- `supabase/schema.sql` / `supabase/seed.sql`(科目13 + 単元マスタ)

## Vercelデプロイ(クラウド読み取りミラー)

vault(Googleドライブ同期フォルダ内の`vault/`)はMac上でのみ読み書きできるため、Vercel上のWebは
vaultを直接読まず、Supabaseの`vault_files`テーブル(夜間バッチが最後に同期する読み取り専用ミラー。
[design](./docs/superpowers/specs/2026-07-26-vault-cloud-mirror-design.md)参照)を読む。

### Vercel環境変数

1. GitHub等にリポジトリをpushし、Vercelでインポート
2. Vercelプロジェクトの Settings > Environment Variables に以下を設定する

   | 変数名 | 値 | 用途 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクトの URL | Supabase接続 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseプロジェクトの anon key | Supabase接続(クライアント/RLS越しの読み取り) |
   | `STUDY_AI_VAULT_SOURCE` | `supabase` | vaultの読み込み先をSupabaseミラーに切り替える(未設定/`fs`はローカル開発用) |

   **`SUPABASE_SERVICE_ROLE_KEY`はVercelに設定しない。** `vault_files`への書き込みは
   Mac上の夜間バッチ(`analysis/helpers/sync-vault-to-supabase.mjs`、`analysis/.env`の
   service roleキーのみ)が行い、Vercel側は`anon`キー + RLS(select限定)で読むだけにする。
3. `vercel.json`は`{}`のままでよい(cronは追加しない。追加のビルド設定は不要)。
4. デプロイ後、クラウド版の`/schedule`は閲覧専用になる(完了チェックボックスは表示されない)。
   予定・記録・カルテの変更はMac上の対話(`docs/study-dialogue.md`)から行う。
   また、`/settings`の「夜間分析バッチの起動プロンプト」はクラウド版では表示できない
   (`analysis/nightly.md`がデプロイに同梱されないためエラー表示になる)。夜間バッチはMac上でのみ実行する。

### iPhoneでの利用手順

1. Safariで本番URLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを起動(standaloneモードになる)

## デプロイ前の残確認

- stagingのSupabaseとPreview環境で、[リリース手順](./docs/stability-rollout.md) に従って確認する
- `analysis/helpers/sync-vault-to-supabase.mjs`を一度実行し、Vercel上の`/records`・`/schedule`・
  `/karte`・`/reports`がvaultの内容と一致することを確認する
