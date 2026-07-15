# study-ai

受験生向け学習管理Webアプリ。設計仕様は [`docs/DESIGN.md`](./docs/DESIGN.md) を参照。

## セットアップ(フェーズ1)

```bash
npm install
cp .env.local.example .env.local
# .env.local に Supabase プロジェクトの URL / anon key を設定
npm run dev
```

Supabase側のセットアップ:

1. Supabaseプロジェクトを作成
2. SQL Editor で `supabase/schema.sql` → `supabase/seed.sql` の順に実行
3. Authでユーザーを1件作成(サインアップ画面は無し。本人専用)
4. Storageに `photos` バケットが `schema.sql` 実行時に自動作成される(private)

`.env.local` が未設定でも `npm run build` は通るようにしてあるが、実際のログイン・データ取得にはSupabaseの接続情報が必須。

## 現在の実装状況(フェーズ1: 基盤)

- Next.js 15 (App Router / TypeScript) + MUI(ライトテーマ固定・ミニマル)
- 下部固定タブ5つ: 今日(`/`) / 記録(`/record`) / 分析(`/stats`) / 予定(`/schedule`) / 設定(`/settings`)
- `/record` のみ完全実装(科目→単元→教材→時間 or タイマーで2〜3タップ保存、写真複数枚アップロード)
- Supabase Auth(メールログイン、`/login`)+ middleware による未認証リダイレクト
- `supabase/schema.sql` / `supabase/seed.sql`(科目13 + 単元マスタ)

## PWA / Web Push / Vercel Cron(フェーズ4)

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
   | `SUPABASE_SERVICE_ROLE_KEY` | Cron API(`/api/cron/morning`)がRLSを越えて全購読者へPushするため |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push購読(クライアント) |
   | `VAPID_PRIVATE_KEY` | Web Push送信(サーバー) |
   | `CRON_SECRET` | `/api/cron/morning` の認証用(`vercel.json` のCronは自動でこのヘッダを付与しないため、下記の通り確認すること) |

3. デプロイ後、`vercel.json` の `crons` 設定により毎朝 6:30 JST(UTC 21:30)に `/api/cron/morning` が自動実行される(Vercel無料枠は1日1回までのため1本のみ設定)
4. Vercel CronはデフォルトでVercel自身が `Authorization: Bearer $CRON_SECRET` を付与して呼び出す(Vercelの仕様に準拠。Vercelダッシュボードの Cron Jobs 画面で実行ログを確認できる)

### iPhoneでの利用手順

1. Safariで本番URLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを起動(standaloneモードになる)
4. 「設定」タブの通知トグルをONにし、通知を許可する
5. 以降、毎朝6:30頃に締切リマインドと復習提案のPush通知が届く

注意: iOSではホーム画面に追加したPWAでのみWeb Pushが利用可能(Safariのタブ上では通知を受け取れない)。

## 次フェーズへの申し送り

- `analysis/`(夜間バッチのClaude Codeプロンプト・実行スクリプト)は未着手
- Supabase実環境が未接続(ダミーURL/キーでフォールバックしてビルドのみ通す実装)。実運用前に `.env.local` の設定と動作確認が必要
- Push通知の実機検証(iPhoneでのホーム画面追加→購読→Cron経由の受信)は未実施。デプロイ後に確認すること
