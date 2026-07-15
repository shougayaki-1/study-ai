# 夜間バッチ管理用メニューバーアプリ 設計

## 背景・目的

study-ai の夜間分析バッチ(`analysis/run-nightly.sh`)は、Macのlaunchdから毎晩23:30に
Claude Code CLI(または `STUDY_AI_AGENT_CLI=codex` でCodex CLI)をヘッドレス実行し、
Supabaseを読み書きしている(詳細は `analysis/README.md`、`analysis/run-nightly.sh` を参照)。

現状これらの設定変更・手動実行・実行結果の確認はすべてターミナル操作(`launchctl`、
plist直接編集、ログファイルの`cat`等)を要する。日常的に使う操作をGUIから行えるようにする
ため、Mac上に常駐するメニューバーアプリを新規に作る。

## スコープ

含む:
- claude/codexエンジンの切替(GUIから`STUDY_AI_AGENT_CLI`をplistに反映)
- 手動実行(「今すぐ実行」ボタン)
- スケジュール管理(実行時刻の変更、自動実行のON/OFF)
- 実行ログ・履歴の一覧表示
- 実行中・完了(成功/失敗)のmacOS通知
- ログイン時の自動起動

含まない(既知の制約として明示的に見送る):
- 手動実行とスケジュール実行の完全な排他制御(launchd起動側は止められない)
- `run-nightly.sh`の終了コードを正確に記録する仕組み(ログのヒューリスティック判定で代替)
- コード署名・公証(ローカル専用アプリのため未署名で配布)
- Webアプリ本体(`src/`配下のNext.jsアプリ)への変更は一切行わない

## 全体アーキテクチャ

- **技術**: Electron + Vanilla JS/HTML/CSS(状態が小さいためReact等は使わない)
- **配置場所**: `analysis/menubar-app/`(既存の夜間バッチツール群と同じ`analysis/`配下の
  独立したNode.jsプロジェクトとする。study-ai本体のNext.jsアプリとは依存関係を分離する)
- **UI形態**: Tray(メニューバーアイコン)+ クリックで開くフレームレスの小さなポップオーバー
  ウィンドウ(フォーカスを失ったら自動クローズ)。Dockアイコンは非表示(`app.dock.hide()`)。

### mainプロセスの責務

1. **plist管理**: `/usr/libexec/PlistBuddy` でplist(
   `~/Library/LaunchAgents/com.studyai.nightly.plist`)の読み書きを行う。
   - `StartCalendarInterval > Hour/Minute` の読み書き(スケジュール時刻)
   - `EnvironmentVariables > STUDY_AI_AGENT_CLI` の読み書き(未定義なら新規追加。エンジン切替)
   - 変更後は `launchctl bootout gui/$UID` → `launchctl bootstrap gui/$UID <plist>` で
     即座にリロードして反映する
   - 自動実行のON/OFFは、OFF時に `launchctl bootout` してロード解除、ON時に
     `launchctl bootstrap` で再ロードすることで制御する(plist自体は残したまま)
2. **手動実行**: `child_process.spawn` で `analysis/run-nightly.sh` を起動する。
   - 現在GUIで選択中のエンジンを `STUDY_AI_AGENT_CLI` 環境変数として渡す
   - 標準出力/標準エラーを `analysis/tmp/manual-YYYYMMDD-HHMMSS.log` に書き出しつつ、
     IPC経由でレンダラーにストリーミングし末尾N行をリアルタイム表示する
   - 実行中は二重起動防止のため「今すぐ実行」ボタンを無効化する
3. **ログ・履歴取得**: `analysis/tmp/nightly-*.log` と `manual-*.log` を新しい順に読み、
   直近20件をファイル一覧として返す。クリックで全文を返す。
   - 成功/失敗判定は、対応する標準エラーログ(`~/Library/Logs/study-ai-nightly.err.log`など)
     の中身の有無や、ログ末尾のエラーキーワード検出によるヒューリスティックとする
4. **実行中検知・通知**: `pgrep -f "analysis/run-nightly.sh"` を30秒間隔でポーリングし、
   非実行→実行中、実行中→非実行 の状態遷移を検知して Electron `Notification` で
   開始・完了(成功/失敗)を通知する。手動実行時は上記のspawn完了イベントで直接通知する。

### レンダラー(ポップオーバーUI)の構成

上から順に:

1. **ステータス表示**: 「待機中」「実行中(手動)」「実行中(スケジュール)」バッジ + 経過時間
2. **エンジン切替**: `claude` / `codex` のトグルまたはドロップダウン。選択即時にplist反映
3. **手動実行ボタン**: 「今すぐ実行」。実行中は無効化
4. **スケジュール管理**: 時刻ピッカー(時・分)+ ON/OFFトグル。変更確定で即plist反映
5. **ログ・履歴一覧**: 直近20件を日時・トリガー種別(定期/手動)・成功/失敗バッジ付きで一覧表示。
   クリックで全文表示
6. **通知**: UI要素はなし(バックグラウンドで発火するのみ)

## パッケージング・自動起動

- `electron-builder` で `.app` としてビルドする(署名・公証は行わない)
- 開発時は `npm start`(`electron .`)で起動確認
- 配布・自動起動確認時は `npm run build` で `.app` を生成し、それに対して
  `app.setLoginItemSettings({ openAtLogin: true })` を設定する
  (`electron .` の開発実行では自動起動が正しく機能しないため、自動起動の動作確認には
  ビルド済み `.app` が必要)
- 未署名アプリのため初回起動時にGatekeeper警告が出る想定。右クリック→「開く」で回避する

## セキュリティ・機密情報の扱い

- `analysis/.env` に格納されている `SUPABASE_SERVICE_ROLE_KEY` 等の機密情報は、
  本アプリからは一切読み書きしない。既存どおり `run-nightly.sh` がそのまま `.env` を読む
  構成を変更しない
- 本アプリ自体はSupabase等の外部サービスに直接通信しない(plist操作とローカルプロセス
  起動、ログファイル読み取りのみ)

## 既知の制約

- 手動実行中にlaunchdのスケジュール実行時刻が来た場合、重複実行を防ぐ仕組みはない
  (GUIのボタン無効化はGUI起因の重複のみ防止する)
- 成功/失敗判定はログのヒューリスティックであり100%正確ではない。将来的に
  `run-nightly.sh` 側で終了コードをファイルに書き出す改修を行えば精度を上げられるが、
  今回のスコープには含めない
- ログイン時自動起動の動作確認にはビルド済み `.app` が必要で、開発中の `electron .` では
  検証できない
