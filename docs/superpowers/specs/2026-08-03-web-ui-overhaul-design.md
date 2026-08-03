# study-ai Web UI テコ入れ 設計

- 日付: 2026-08-03
- ステータス: Draft(ユーザー承認済み、実装計画は未作成)
- 親構想: [`2026-07-29-integrated-learning-agent/07-web-product.md`](./2026-07-29-integrated-learning-agent/07-web-product.md)
- 実装ロードマップとの関係: 親構想のPhase10(Web/PWA V2)を前倒しする一部作業。
  Phase0〜9(正本データモデル・ingestion・状態エンジン・推薦エンジン)には**依存しない**。

## 背景

Web UIについて次の課題が挙がった。

- 使っていないページ、使いづらい点が多数ある
- レポートはMarkdownのベタ張りで読みにくい
- 弱点カルテ(`/karte`)を誰も使っていない
- 現状を一元的に見れるページ、今日やることを見れるページが欲しい

調査の結果、次が判明した。

- `BottomNav.tsx`は実装済みだが`layout.tsx`から一度も呼ばれておらず、
  アプリ上でナビゲーションが機能していない(URL直打ちでしか画面遷移できない)。
- `/columns`(知識コラム)は`knowledge_columns`というSupabaseテーブルを直接読むが、
  2026-07-24のvault移行以降、このテーブルを更新する経路が存在しない。
- `/stats`(分析、902行)も同様に`subjects`/`units`/`weakness_scores`という
  Supabaseテーブルを直接読むが、`analysis/nightly.md`は現在vaultのみを読み書きし、
  これらのテーブルを更新しない。`/settings`内にも
  「この設定は分析画面(現在は過去データのみ表示)にのみ影響します」という
  自己申告コメントがあり、開発時点で凍結データだと認識されていた形跡がある。
- `/settings`の「科目・単元・教材の管理」セクションは、上記2画面のためだけの設定であり、
  2画面を廃止すると道連れで不要になる。
- `/karte`は`subjects/<科目>/`(2科目のみ: 英語R・英語L)と
  `data/derived/skills-<教材名>.json`(9教材、`data/attempts.jsonl`由来)の
  2種類のデータソースを名寄せせずそのまま一覧しており、
  科目名と教材名が混在した分かりにくいリストになっている。

親構想`07-web-product.md`は、現行の「履歴/分析/予定/レポート/カルテ」構成を
「今日/計画/学習状態/記録/その他」の5構成へ段階的に組み替える方針を既に定めている。
本設計は、Phase8-9(状態エンジン・推薦エンジン)が未着手のため作れない部分を除き、
**今あるvaultデータの範囲でこの5構成へ前倒しする**。

## Goals

1. ナビゲーションを実際に機能させ、5構成(今日/計画/学習状態/記録/その他)に再編する。
2. vault移行後に凍結した旧Supabase直読みページ(`/columns`, `/stats`)と、
   その専用設定(`/settings`の該当セクション)を削除する。
3. 「今日」ページで、今日の予定・計画・締切に加えて弱点のハイライトを一元的に見られるようにする。
4. 「学習状態」ページで、科目と教材名を極力名寄せした横断サマリと、
   既存`SkillMap`によるドリルダウンを提供する。
5. 日次・週次レポートをセクションカード化し、実データに基づく最初のグラフ
   (週次学習時間の科目別推移)を追加する。そのためにレポート生成の入力契約を拡張する。
6. Web上の書き込み経路(予定の完了チェック、日次レポートの要確認TODO訂正)を廃止し、
   親構想が定める「Web完全read-only」方針に今回で合わせる。

## Non-goals(今回やらないこと)

- Phase8(状態エンジン)・Phase9(推薦エンジン)の実装。根拠付き提案カード、確信度、
  短縮案、KUGS必達タスク行は作らない。
- 教材/模試・試験/志望・総合型/Inbox要確認/AI記憶画面の新設。
- 東進等の外部ソース自動連携。
- `knowledge_columns`・`subjects`・`units`・`weakness_scores`テーブル自体の削除
  (Webから見えなくするだけで、データの破壊は行わない)。
- 対話/CLI経由のvault書き込みフロー(`docs/study-dialogue.md`)の変更。

## 1. ナビゲーション

- `src/app/layout.tsx`に`BottomNav`を組み込み、実際に表示させる。
- `BottomNav.tsx`の`NAV_ITEMS`を5項目に再編する。

  ```
  今日  /
  計画  /schedule
  学習状態 /karte
  記録  /records
  その他 /more
  ```

- 5項目ちょうどなので、モバイルは5タブすべてをボトムナビに表示し、
  現行のハンバーガーメニュー(`EXTRA_ITEMS`/`Drawer`)は廃止する。
- 「その他」は新設のハブページ(`/more`)とし、レポート・設定へのリンクを置く。
  親構想が挙げる教材・模試・志望・Inbox・AI記憶は未実装なので載せない。

## 2. 削除するページ・設定

- `src/app/columns/` を削除。
- `src/app/stats/` を削除。
- `src/app/settings/page.tsx` から「科目・単元・教材の管理」セクション
  (`MATERIAL_KINDS`関連のCRUD、科目/単元/教材のSupabase操作一式)を削除する。
  夜間分析バッチ起動プロンプトのセクションとログアウト等の認証系は残す。
- 上記3ページ・セクションが依存していたSupabaseテーブル(`knowledge_columns`,
  `subjects`, `units`, `weakness_scores`)自体は削除しない。将来Phase1で
  正本データモデルへ統合する際に判断する。

## 3. 「今日」ページ(`/`)

現行の実装(共通テストまでの日数、期限超過、締切7日以内、今日の計画ブロック、
最新レポートへの導線)は維持する。追加するのは以下。

### 弱点ハイライト帯

- `data/derived/skills-*.json`を全件読み、`state === "weak"`の`SkillTopic`を
  横断的に集めて上位数件(例: 5件)をカードで表示する。
- 各カードは「科目/教材名・単元名・正答数/試行数」を表示し、タップで
  `/karte/<subject>`(該当ファイルの`subject`)へ遷移する。
- 該当データが1件もない場合は「学習状態データがまだありません」の空状態を表示し、
  「データなし」を「弱点なし」と誤読させない(親構想の原則に従う)。

## 4. 「計画」ページ(`/schedule`)

大きな構造変更はなし。現行の予定リスト+7日分の学習計画ブロック表示を維持する。
ナビ上のラベルを「予定」から「計画」に変更する。

## 5. 「学習状態」ページ(`/karte` を拡張、`/stats` を統合)

### 5.1 科目マッピング

`src/lib/vault`(または新設の`src/lib/subject-mapping.ts`)に、
13科目の正式名(`SUBJECTS`定数と同じ集合)と、既知の教材名・旧カルテフォルダ名の
対応表を持たせる。例:

```
英語R      <- subjects/英語R
英語L      <- subjects/英語L
古文       <- data/derived/skills-古文単語.json, skills-古文文法.json
漢文       <- data/derived/skills-漢文.json
化学基礎    <- data/derived/skills-化学基礎.json
地理       <- data/derived/skills-地理総合.json
情報       <- data/derived/skills-ベストフィット情報Ⅰ（実教出版）.json
政治経済    <- data/derived/skills-公共.json  (要目視確認、公共と政治経済は別科目の可能性)
数学2BC    <- data/derived/skills-数学C.json  (要目視確認、数学Cと数学2BCの範囲差に注意)
```

対応表に載らない教材名は「未分類」グループにそのまま表示し、
黙って隠したり誤った科目に紐付けたりしない。政治経済/公共、数学2BC/数学Cのような
名称が近いが範囲が異なる可能性のある組は、対応表にコメントで注意書きを残す。

### 5.2 科目横断サマリ(新設、`/karte`トップ)

13科目+未分類グループを一覧し、科目ごとに:

- 弱い/不安定/安定/データ不足の単元数(`SkillTopic.state`の集計)
- 直近の学習日(`last_practiced_date`の最大値)
- データが一切ない科目は「未計測」と明示する

### 5.3 科目別ドリルダウン(`/karte/[subject]`)

既存の`SkillMap`コンポーネントをそのまま再利用する。対応表で複数の教材ファイルが
1科目に紐づく場合は、そのページ内でファイルごとにセクションを分けて表示する
(無理に1つのリストへマージしない)。

### 5.4 週次学習時間の引き継ぎ

`/stats`が持っていた週次学習時間推移(Supabaseの凍結データ由来)は再現しない。
代わりに、vaultの`records/*.md`(実データ)から算出する週次学習時間グラフを
「6. レポート」の週次レポートへ新設する。

## 6. 「記録」ページ(`/records`)

大きな構造変更はなし。表示の整え程度に留める。

## 7. レポート(日次・週次)

### 7.1 表示側

- `reports/daily/[date]/page.tsx`・`reports/weekly/[week]/page.tsx`で、
  Markdown本文を`##`見出し単位に分割し、セクションごとにカード(`Paper`)化する。
- 日次レポートに前日・翌日への遷移リンクを追加する。
- 見出し・表・リストのタイポグラフィと余白を整理する(既存の`react-markdown`+
  `remark-gfm`はそのまま使う)。

### 7.2 データ側(レポート生成契約の拡張)

`analysis/helpers/build-daily-report.mjs`・`build-weekly-report.mjs`の
入力JSON契約(`sections[]`)に、任意の`chart`フィールドを追加できるようにする。

```jsonc
{
  "sections": [
    {
      "heading": "週次学習時間",
      "body": "...(既存のprose)...",
      "chart": {
        "type": "bar",            // 初回は bar のみサポート
        "unit": "分",
        "series": [
          { "label": "英語R", "value": 360 },
          { "label": "数学2BC", "value": 120 }
        ]
      }
    }
  ]
}
```

- `chart`はvault側のMarkdown本文に埋め込まず、`data/derived/skills-*.json`と同じ
  「Markdownとは別のJSONサイドカーファイル」という既存パターンに揃える。
  保存先は`reports/daily/<date>.chart.json`・`reports/weekly/<week>.chart.json`とし、
  Markdown本文とは`readVaultFile`とは別の読み取り関数(例: `readReportChart`)で
  個別に読む。ファイルが存在しない場合はchart無しのレポートとして扱う。
- `analysis/nightly.md`の週次レポート生成手順に、`records/*.md`から
  科目別学習時間を集計して`chart`へ渡す手順を追記する。
- Web側は`chart.type === "bar"`のときだけ簡易バーグラフを描画する
  (新規の重量級チャートライブラリは導入しない。実装時は`dataviz`スキルの
  配色・アクセシビリティ指針に従う)。
- 集計不能・データ欠損時は`chart`を省略し、prose本文のみへフォールバックする。

## 8. 完全read-only化

親構想`07-web-product.md`セクション16・受け入れシナリオ9に合わせ、以下を撤去する。

- `src/app/schedule/schedule-event-toggle.tsx`: チェックボックスでの完了切替をやめ、
  完了状態を読み取り専用のChip表示に変える。裏の`toggleScheduleEventDone`
  Server Actionを削除する。
- `src/app/reports/daily/[date]/confirm-todo-list.tsx`(および関連の
  `performCorrection`/`submitCorrection`): フォーム入力をやめ、要確認TODOを
  読み取り専用リストとして表示する。「対話で伝えてください」という短い案内を添える。
- 上記2箇所の変更後、Server Actionsファイルからmutation関数自体を削除し、
  Webから到達可能なwrite経路がゼロになっていることをコードレベルで確認する。

## テスト方針

- 削除するページ・コンポーネントに対応する既存テスト(あれば)を一緒に削除する。
- 新設する科目マッピング関数、弱点ハイライト抽出ロジック、レポートのセクション分割
  パーサ、chart集計ロジックにはユニットテストを追加する(既存の`*.test.ts`の
  配置パターンに従う)。
- read-only化は「mutation用Server ActionへWebから到達できないこと」を
  何らかの形で機械的に確認できると望ましい(実装計画作成時に具体化する)。

## 実装フェーズの目安(実装計画作成時に再検討)

1. ナビ有効化+5構成再編、`/columns`・`/stats`・設定セクション削除
   (機械的な削除・配線作業、リスク小)
2. 「今日」の弱点ハイライト帯、「学習状態」の科目マッピング+横断サマリ
   (新規ロジック、データ品質の目視確認が要る)
3. read-only化(2箇所のmutation撤去)
4. レポートのカード化+chart契約拡張+週次学習時間グラフ
   (nightly batch側の変更を伴うため最後に、既存契約への影響を再確認しながら)
