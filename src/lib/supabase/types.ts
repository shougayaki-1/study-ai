// Supabaseの型は `supabase gen types typescript` で生成して置き換える想定のプレースホルダー。
// フェーズ1では any ベースの緩い型で妥協し、ビルドを壊さないようにする。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
