# analysis/ — 夜間分析バッチ

study-ai の「Mac上のClaude Codeが毎晩ヘッドレス実行(`claude -p`)し、Supabaseを直接読み書きする」
夜間分析バッチ一式。DESIGN.md セクション2・6を参照。

## 構成

- `nightly.md` — Claude Codeに渡す夜間分析プロンプト本体
- `helpers/` — プロンプトから呼び出すNode製ヘルパースクリプト(Supabase REST APIを
  Node標準の `fetch` で叩く。追加npmパッケージ不要)
- `.env.example` — 環境変数のテンプレート
- `.env` — 実際の認証情報(**Gitにコミットしない**。各自で作成する)
- `tmp/` — 実行時に画像やレポート下書きを一時保存する作業ディレクトリ(**Gitにコミットしない**)

## 前提

- Node.js 18以上(グローバル `fetch` を使用)
- Claude Code CLI がインストール済み・ログイン済みであること
- Supabaseプロジェクトに `supabase/schema.sql` が投入済みであること

## セットアップ

### 1. Supabase Service Role キーの取得

1. https://supabase.com/dashboard で対象プロジェクトを開く
2. 左メニュー **Settings → API**
3. **Project URL** をコピー → `SUPABASE_URL`
4. **Project API keys** の **service_role** キー(`anon` ではない方)をコピー → `SUPABASE_SERVICE_ROLE_KEY`
   - `service_role` キーはRLSを無視して全テーブルにフルアクセスできる強力な鍵。

**重要: このキーは絶対にVercelの環境変数(Vercel Dashboard / `.env.production` など)には
設定しないこと。** Vercel側は `anon` キー + RLSのみで運用する設計(DESIGN.md 2章・6章)。
`service_role` キーを置いてよいのは **Macローカルの `analysis/.env` のみ**である。

### 2. `.env` の作成

```bash
cd /Users/shoug/Documents/GitHub/study-ai/analysis
cp .env.example .env
```

`.env` を編集し、`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入力する。

`.gitignore` に `analysis/.env` と `analysis/tmp/` が含まれていることを確認する
(含まれていなければ追加する)。

### 3. 動作確認

```bash
cd /Users/shoug/Documents/GitHub/study-ai
node analysis/helpers/list-pending-photos.mjs
```

エラーなくJSON(空配列でもよい)が返ればSupabase接続はOK。

## 手動実行

```bash
cd /Users/shoug/Documents/GitHub/study-ai
claude -p "$(cat analysis/nightly.md)" --allowedTools "Bash,Read"
```

- `--allowedTools "Bash,Read"` はバッチが `Bash`(helperスクリプト実行)と `Read`(画像読み取り)
  のみを使う想定であることを明示するオプション。ヘッドレス実行時の確認プロンプトを避けるために
  `--dangerously-skip-permissions` 等が必要になる場合はClaude Codeのバージョンに応じて調整する。
- 実行ログは標準出力に流れる。ファイルに残したい場合は:
  ```bash
  claude -p "$(cat analysis/nightly.md)" --allowedTools "Bash,Read" \
    >> analysis/tmp/nightly-$(date +%Y%m%d).log 2>&1
  ```

## スケジュール実行(launchd)

macOSでは `cron` より `launchd` が推奨される。以下は毎晩23:30に実行する例。

1. plistファイルを作成する: `~/Library/LaunchAgents/com.studyai.nightly.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.studyai.nightly</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-l</string>
    <string>-c</string>
    <string>cd /Users/shoug/Documents/GitHub/study-ai &amp;&amp; /usr/bin/caffeinate -i claude -p "$(cat analysis/nightly.md)" --allowedTools "Bash,Read" >> analysis/tmp/nightly-$(date +%Y%m%d).log 2>&amp;1</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/shoug/Library/Logs/study-ai-nightly.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/shoug/Library/Logs/study-ai-nightly.err.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

`/Users/shoug/...` の部分は実際のユーザー名・パスに合わせて書き換える。
`claude` コマンドがフルパスで解決できない場合は `which claude` の結果
(例: `/opt/homebrew/bin/claude`)に置き換える。

2. 読み込み・確認:

```bash
launchctl load ~/Library/LaunchAgents/com.studyai.nightly.plist
launchctl list | grep studyai
```

3. 手動でテスト起動(スケジュールを待たずに1回動かす):

```bash
launchctl start com.studyai.nightly
```

4. 停止・再読込したい場合:

```bash
launchctl unload ~/Library/LaunchAgents/com.studyai.nightly.plist
# plistを編集後
launchctl load ~/Library/LaunchAgents/com.studyai.nightly.plist
```

## Mac側の前提(スリープ対策)

夜間バッチが実行されるためには、指定時刻にMacが起き続けている必要がある。

- **電源接続**: MacBookの場合、バッテリー駆動だと `pmset` の設定によってはスケジュール実行が
  スキップされることがある。夜間は電源アダプタに接続しておく。
- **スリープ解除設定**(`pmset` でスケジュールタスク実行のためにウェイクさせる):
  ```bash
  # 毎日23:25にスリープから復帰させる(実行の少し前に設定しておく)
  sudo pmset repeat wakeorpoweron MTWRFSU 23:25:00
  ```
  現在の設定確認: `pmset -g sched`
- **`caffeinate`**: 上記plistの `ProgramArguments` で `caffeinate -i claude -p ...` として
  実行中はアイドルスリープを防止している。手動実行時も同様に
  `caffeinate -i claude -p "$(cat analysis/nightly.md)" ...` とするとバッチ実行中の
  スリープを防げる。
- **ふたを閉じたまま(クラムシェル)運用する場合**は電源アダプタ+外部ディスプレイ or
  `caffeinate -s`(システムスリープ全体を防止、AC電源時のみ有効)の利用も検討する。
- 上記を設定していても、Macがシャットダウンしている・Wi-Fiに繋がっていない等の場合は
  実行されない/失敗する。翌朝 `analysis/tmp/nightly-YYYYMMDD.log` の有無・内容で
  確認する運用を推奨する。

## トラブルシュート

- `analysis/.env が見つかりません` → セットアップ手順2を実施する。
- `SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が...設定されていません` →
  `.env` の中身を確認する。
- `Supabase REST ... failed: 401` → キーが `anon` キーになっていないか、
  コピーミスがないか確認する。
- `Supabase REST ... failed: 42501` (RLS違反) 等が出る場合、`service_role` キーではなく
  `anon` キーを使っている可能性が高い。`service_role` キーはRLSをバイパスする。
