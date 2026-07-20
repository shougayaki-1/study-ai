# 安定化変更のリリース手順

## ローカル検証

```bash
supabase start
supabase db reset --local
npm run types:check
npm run lint
npm run audit:prod
npx tsc --noEmit
npm test
npm run test:analysis
npm run build
```

`supabase status -o env` の `API_URL`、`ANON_KEY`、`SERVICE_ROLE_KEY` をそれぞれ
`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、
`SUPABASE_SERVICE_ROLE_KEY` に割り当てて `npm run test:e2e` を実行する。

## staging

staging専用projectであることをproject名とrefの両方で確認してから実行する。本番projectを
リンクした状態では、`db reset --linked` を絶対に実行しない。

```bash
supabase link --project-ref <staging-project-ref>
supabase migration list --linked
supabase db push --linked
supabase migration list --linked
```

Vercel Previewをstaging Supabaseへ接続し、`PLAYWRIGHT_BASE_URL` をPreview URL、
`PLAYWRIGHT_SKIP_WEBSERVER=1` を設定してE2Eを実行する。10件のブラウザケースすべての成功を
本番昇格条件とする。

## 本番

本番には既に `20260719000100` が適用済みで、ベースライン以前の履歴だけが存在しない。
次の順序を変えない。

```bash
node analysis/helpers/backup-learning-data.mjs
node analysis/helpers/check-schema.mjs
supabase migration list --linked
supabase migration repair 20260715000000 --status applied --linked
supabase db push --linked
supabase migration list --linked
node analysis/helpers/check-schema.mjs
```

`migration repair` はベースラインSQLを本番へ再実行せず、履歴だけ登録する操作である。
本番では書き込みE2Eを実行せず、ログインと主要画面の読み取りスモーク確認だけを行う。

クライアント側の切り戻しが必要な場合は直前デプロイへ戻す。追加RPCと権限マイグレーションは
後方互換なので、その場で削除しない。データ異常がある場合だけバックアップから個別復元する。
