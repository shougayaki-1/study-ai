# Study AI Nightly メニューバーアプリ

`analysis/run-nightly.sh` の設定・手動実行・ログ確認を行う macOS 専用 Electron アプリです。
Web アプリ本体とは依存関係を分離しています。

## 開発起動

```bash
cd analysis/menubar-app
npm install
npm start
```

メニューバーのベル型アイコンをクリックするとポップオーバーが開きます。右クリックメニューから
アプリを終了できます。

## ビルド

```bash
npm run build
```

Apple Silicon では `dist/mac-arm64/Study AI Nightly.app` が生成されます。ローカル専用の未署名
アプリなので、初回起動時に macOS に拒否された場合は Finder で右クリックして「開く」を選びます。
ビルド済みアプリを起動するとログイン項目へ自動登録されます。

通常は launchd plist の `ProgramArguments` から study-ai の場所を検出します。リポジトリを
特殊な場所へ移動して検出できない場合は、`STUDY_AI_PROJECT_ROOT` にリポジトリの絶対パスを
設定して起動してください。

## テスト

```bash
npm test
```
