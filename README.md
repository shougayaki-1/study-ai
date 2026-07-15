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

## 次フェーズへの申し送り

- `/`, `/stats`, `/schedule`, `/settings` は仮置き。実データ表示・CRUD UIが未実装
- PWA(manifest.jsonは仮/アイコン未設定)+ Web Push + Vercel Cronは未着手
- `analysis/`(夜間バッチのClaude Codeプロンプト・実行スクリプト)は未着手
- Supabase実環境が未接続(ダミーURL/キーでフォールバックしてビルドのみ通す実装)。実運用前に `.env.local` の設定と動作確認が必要
