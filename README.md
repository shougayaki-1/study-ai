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
- 下部固定タブ5つ: 今日(`/`) / 記録(`/record`) / 分析(`/stats`) / 予定(`/schedule`) / 設定(`/settings`)
- 今日・記録・履歴・分析・予定・設定の主要画面を実装
- 学習記録・予定・教材単元対応はDB関数で原子的に保存
- ローカルDB再構築、型生成一致、ユニットテスト、Playwright E2E、CIを整備
- Supabase Auth(メールログイン、`/login`)+ middleware による未認証リダイレクト
- `supabase/schema.sql` / `supabase/seed.sql`(科目13 + 単元マスタ)

## PWA / Web Push / Vercel Cron

### VAPID鍵の生成

```bash
npx web-push generate-vapid-keys --json
```

出力される `publicKey` / `privateKey` を以下に設定する。

- `.env.local`(ローカル開発用):
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` に `publicKey`
  - `VAPID_PRIVATE_KEY` に `privateKey`
- Vercel環境変数(本番用): 同じ2つに加えて `CRON_SECRET`(任意の文字列。Cronリクエストの認証に使用)と `SUPABASE_SERVICE_ROLE_KEY`(Supabaseダッシュボード > Settings > API から取得)も設定する

### Vercelデプロイ手順

1. GitHub等にリポジトリをpushし、Vercelでインポート
2. Vercelプロジェクトの Settings > Environment Variables に以下をすべて設定する

   | 変数名 | 用途 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase接続 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase接続(クライアント) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Cron APIがRLSを越えてPush購読・予定・復習提案を読み書きするため |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push購読(クライアント) |
   | `VAPID_PRIVATE_KEY` | Web Push送信(サーバー) |
   | `CRON_SECRET` | Cron APIの認証用。16文字以上のランダム値を設定する |

3. デプロイ後、`vercel.json` の3つのCron（朝の提案、夜2回の記録リマインド）が毎日実行される。Vercel Hobbyでは各Cronは1日1回までで、実行時刻は指定した時間帯の中で前後する。
4. Vercel Cronは `Authorization: Bearer $CRON_SECRET` を自動付与する。Vercelダッシュボードの Cron Jobs 画面で実行ログを確認する。

### iPhoneでの利用手順

1. Safariで本番URLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを起動(standaloneモードになる)
4. 「設定」タブの通知トグルをONにし、通知を許可する
5. 以降、朝の締切・復習提案と、夜の記録リマインドが届く

注意: iOSではホーム画面に追加したPWAでのみWeb Pushが利用可能(Safariのタブ上では通知を受け取れない)。

## デプロイ前の残確認

- stagingのSupabaseとPreview環境で、[リリース手順](./docs/stability-rollout.md) に従って書き込みE2Eを実行する
- 本番でのPush通知実機検証（ホーム画面への追加、購読、Cron経由の受信）を行う
