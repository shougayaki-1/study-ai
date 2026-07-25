# Phase 2: Today Page Rebuild & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** push通知一式(cron/vercel設定/settings購読UI/sw.jsリスナー)を削除し、`/`(今日)ページをvault読みのServer Componentへ再構築し、SupabaseからVaultへの過去データ移行スクリプトを新設する。

**Architecture:** push通知はNext.js側(cron route・vercel.json・settings UI・sw.jsのpush/notificationclickリスナー・`web-push`依存・`src/lib/push.ts`)を丸ごと削除し、オフラインキャッシュ(`install`/`activate`/`fetch`)と`ServiceWorkerRegister.tsx`だけ残す。`/`は`src/lib/vault`のリーダ(`readPlan`/`readSchedule`/`listReports`)を`fs`経由でサーバ側だけが呼ぶServer Componentにする(`/reports`と同じパターン)。移行は`analysis/helpers/lib.mjs`の`restClient()`でSupabaseから読み、計画1・2のNodeライタ(`appendStudySession`/`appendScheduleEvent`/`appendPlanBlock`)でvaultへ書く1回限りのCLIスクリプトとして新設する。

**Task順序について:** push通知削除(Task 1〜4)は計画1にも計画2にも依存しないため最初に実施する(以後の`npm run build`が軽くなる)。この計画で真に依存があるのは今日ページ再構築(Task 5。`readPlan`/`readSchedule`が必要)と移行スクリプト(Task 7。計画1・2のNodeライタが必要)だけなので、この2つは依存の到着を待って進める。

**Tech Stack:** Next.js 15 App Router (Server Components) / TypeScript / MUI v7 / Node.js標準ライブラリ(`node:fs/promises`, `node:test`) / Vitest / Playwright

## Global Constraints

- vaultルートは環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw する(黙って別パスに書かない)。
- Node実装(`analysis/helpers/`)は **Node標準ライブラリのみ**を使う(追加npmパッケージ禁止)。
- TS側の `fs` アクセスは**サーバ側のみ**(Server Component / Route Handler)。クライアントコンポーネントに`fs`をimportしない。
- 既存ヘルパー(`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/`stringifyFrontmatter`)と、計画1・2が実装する成果物(`readStudyRecord`/`listStudyRecordDates`/`readSchedule`/`setScheduleEventDone`/`readPlan`、Node側`appendStudySession`/`appendScheduleEvent`/`appendPlanBlock`/`parseStudySessions`/`nextSessionId`/`nextEventId`/`nextPlanId`等)は**再実装せず import して使う**。契約にない関数名・型名を1文字も変えない。
- `public/sw.js`のオフラインキャッシュ(`install`/`activate`/`fetch`)と`src/components/ServiceWorkerRegister.tsx`は変更・削除しない。
- `/columns`・`/reports`・`/karte`・`/login`・`middleware`は変更しない。`/stats`はTask 6で**Alertを1行追加する以外は変更しない**(理由はTask 6参照)。
- 移行スクリプト(`analysis/helpers/migrate-supabase-to-vault.mjs`)は夜間バッチ(`analysis/nightly.md`等の定常フロー)には組み込まない。手動1回実行専用。
- 「締切が近い」の日数は既存`src/app/page.tsx`/`api/cron/morning`と同じ**7日以内**を踏襲する(親スペックの未決事項をここで確定)。ただし**期限超過(due超過かつ未完了)は日数の枠に関わらず常に表示する**(Task 5参照)。
- `/records`・`/schedule`のパーサ/ライタ・BottomNav・`e2e/core-flows.spec.ts`・`e2e/extended-flows.spec.ts`は計画1・2の担当のため触れない。

---

## Task 1: push通知cronルート・vercel.json cronsの削除

**Files:**
- Delete: `src/app/api/cron/morning/route.ts`(ディレクトリ`src/app/api/cron/morning/`ごと)
- Delete: `src/app/api/cron/evening/route.ts`(ディレクトリ`src/app/api/cron/evening/`ごと)
- Modify: `vercel.json`

**Interfaces:** なし(削除のみ)

### Step 1.1: 削除してよいことを確認する

```bash
grep -rn "cron/morning\|cron/evening" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs" src app *.json 2>/dev/null | grep -v node_modules
```

期待する出力: `vercel.json`の2行(`"path": "/api/cron/morning"`と`"path": "/api/cron/evening"`が2箇所)のみ。他のソースからの参照が無いことを確認する。

### Step 1.2: cronディレクトリを削除する

```bash
rm -rf src/app/api/cron/morning src/app/api/cron/evening
ls src/app/api/cron/ 2>/dev/null
```

期待する出力: `src/app/api/cron/`ディレクトリ自体が空になる、または存在しなくなる(直下に`morning`・`evening`以外のサブディレクトリが無い場合)。他のcronルート(例: 存在するなら`nightly`等)が残っている場合はそれだけが表示される想定だが、`git status`時点でこのリポジトリには`morning`/`evening`以外の`api/cron/*`は存在しない。

### Step 1.3: `vercel.json`の`crons`設定を削除する

現状の`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/morning",
      "schedule": "30 21 * * *"
    },
    {
      "path": "/api/cron/evening",
      "schedule": "30 11 * * *"
    },
    {
      "path": "/api/cron/evening",
      "schedule": "30 12 * * *"
    }
  ]
}
```

`crons`エントリを全て削除すると設定ファイルが空オブジェクトになる。Vercelの設定ファイルとして空オブジェクトは有効な最小構成なので、ファイル自体は残し中身を`{}`にする。**ファイルごと削除せずこの形で残す理由:** デプロイ先自体はVercelのまま継続する運用であり、Vercelプロジェクトの設定ファイルとしての紐付け(将来`crons`以外の設定を追加する余地)を保つため。

`vercel.json`の全文を次に差し替える:
```json
{}
```

### Step 1.4: 検証する

```bash
python3 -c "import json; json.load(open('vercel.json'))"
```
期待する出力: 何も出力されない(パースエラーが無ければ終了コード0)。

```bash
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: `Compiled successfully`。`/api/cron/morning`・`/api/cron/evening`のルートがビルド出力のルート一覧に含まれないこと。

### Step 1.5: commit

```bash
git add -A -- src/app/api/cron vercel.json
git commit -m "$(cat <<'EOF'
chore(push): remove morning/evening cron routes and vercel crons config

push通知機能を廃止するため、朝夕のVercel Cronルートと
vercel.jsonのcrons設定を削除した。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `src/app/settings/page.tsx`からpush購読UIを削除

**Files:**
- Modify: `src/app/settings/page.tsx`
- Delete: `src/lib/push.ts`(このタスクで不要になる。settings以外からの利用が無いことを確認してから削除する)

**Interfaces:** なし(UI削除のみ。科目/単元/教材管理・夜間バッチプロンプト表示・ログアウトは残す)

### Step 2.1: `src/lib/push.ts`の利用箇所を確認する

```bash
grep -rln "from \"@/lib/push\"\|from '@/lib/push'\|isPushSupported\|urlBase64ToUint8Array" src/ --include="*.ts" --include="*.tsx"
```

期待する出力: `src/app/settings/page.tsx`と`src/lib/push.ts`自身の2件のみ。他から使われていないことを確認してから本タスクで削除する。

### Step 2.2: `src/app/settings/page.tsx`からpush関連のimport・state・関数・UIを削除する

削除する要素(現在のファイル中の該当箇所):
1. import: `import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push";`
2. state: `pushEnabled` / `pushSupported` / `pushBusy` / `pushError` の4つの`useState`
3. `useEffect(() => { if (!isPushSupported()) return; ... }, [])` の購読状態初期化ブロック全体
4. `togglePush` 関数全体
5. JSX: `<Paper variant="outlined" sx={{ p: 2 }}>` から始まる「通知(Push)」セクション(`<Switch checked={pushEnabled} .../>` を含むブロック)全体

以下は該当箇所を`old_string`→`new_string`で除去する形の差分。ファイル冒頭のimport群:

```tsx
import { useSupabase } from "@/lib/supabase/use-client";
import { MATERIAL_KINDS } from "@/lib/constants";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push";
import { throwIfSupabaseError } from "@/lib/supabase/error";
```
を
```tsx
import { useSupabase } from "@/lib/supabase/use-client";
import { MATERIAL_KINDS } from "@/lib/constants";
import { throwIfSupabaseError } from "@/lib/supabase/error";
```
に置き換える。

state宣言部:
```tsx
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [dialogKind, setDialogKind] = useState<"subject" | "unit" | "material" | null>(null);
```
を
```tsx
  const [dialogKind, setDialogKind] = useState<"subject" | "unit" | "material" | null>(null);
```
に置き換える。

購読状態初期化`useEffect`とtogglePush関数(`useEffect(() => {\n    if (!isPushSupported()) return;` から `togglePush`関数末尾の閉じ`};`まで)を丸ごと削除する:
```tsx
  useEffect(() => {
    if (!isPushSupported()) return;
    setPushSupported(true);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => {
        setPushEnabled(!!sub);
      })
      .catch(() => {
        // 取得失敗時は未購読扱いのままにする
      });
  }, []);

  const togglePush = async (checked: boolean) => {
    setPushError(null);
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;

      if (checked) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          throw new Error("VAPID公開鍵が設定されていません(.env.local を確認してください)");
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("通知が許可されませんでした");
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys) throw new Error("通知購読情報を取得できませんでした");
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint: json.endpoint,
            keys_json: json.keys,
          },
          { onConflict: "endpoint" },
        );
        if (error) throw error;
        setPushEnabled(true);
      } else {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
          throwIfSupabaseError(error);
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
      }
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "通知の設定に失敗しました");
    } finally {
      setPushBusy(false);
    }
  };

  const unitsForSubject = useMemo(
```
を
```tsx
  const unitsForSubject = useMemo(
```
に置き換える(直後の`unitsForSubject`定義行はそのまま残す)。

JSXの「通知(Push)」セクション:
```tsx
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">通知(Push)</Typography>
              <Typography variant="caption" color="text.secondary">
                毎朝の復習提案と夜の記録リマインド（配信時刻は前後することがあります）
              </Typography>
            </Box>
            <Switch
              checked={pushEnabled}
              onChange={(e) => togglePush(e.target.checked)}
              disabled={!pushSupported || pushBusy}
            />
          </Stack>
          {!pushSupported && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              このブラウザはPush通知に対応していません。iPhoneはホーム画面に追加してから利用してください。
            </Typography>
          )}
          {pushError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {pushError}
            </Alert>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2">夜間分析バッチの起動プロンプト</Typography>
```
を
```tsx
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2">夜間分析バッチの起動プロンプト</Typography>
```
に置き換える(=「通知(Push)」の`Paper`ブロックを丸ごと除去し、「夜間分析バッチの起動プロンプト」の`Paper`だけ残す)。

`Switch`importは他のスイッチ(受験対象・知識タグ入力・知識コラム生成)で引き続き使われているため残す。`Alert`importも他のエラー表示で使われているため残す。

### Step 2.3: `src/lib/push.ts`を削除する

```bash
rm src/lib/push.ts
grep -rn "@/lib/push" src/ --include="*.ts" --include="*.tsx"
```

期待する出力: 2行目のgrepは何もヒットしない(終了コード1、出力なし)。

### Step 2.4: 検証する

```bash
npx tsc --noEmit
```
期待する出力: エラー0件。

```bash
npm run lint
```
期待する出力: `src/app/settings/page.tsx`に関するエラー0件(未使用importが残っていれば`no-unused-vars`系のエラーになるため、ここで検知する)。

```bash
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: `Compiled successfully`。

### Step 2.5: commit

```bash
git add src/app/settings/page.tsx src/lib/push.ts
git commit -m "$(cat <<'EOF'
chore(push): remove push subscription UI from settings page

push通知機能の廃止に伴い、設定画面の購読/解除トグルと
未使用になったsrc/lib/push.tsを削除した。科目・単元・教材の
管理機能と夜間バッチプロンプト表示は変更していない。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `public/sw.js`からpush・notificationclickリスナーを削除

**Files:**
- Modify: `public/sw.js`

**Interfaces:** なし。`install`/`activate`/`fetch`は変更しない。

### Step 3.1: 削除してよいことを確認する(参照元)

```bash
grep -rn "notificationclick\|registration.showNotification" src/ public/ --include="*.ts" --include="*.tsx" --include="*.js"
```

期待する出力: `public/sw.js`自身の行のみ。他のソースからこのリスナー実装を参照している箇所が無いことを確認する(`ServiceWorkerRegister.tsx`は`register("/sw.js")`を呼ぶだけでリスナーの中身には依存していないため無関係)。

### Step 3.2: `public/sw.js`の`push`・`notificationclick`リスナーを削除する

現在のファイル末尾(41行目以降)の`push`イベントリスナーと`notificationclick`イベントリスナーを削除する。ファイルヘッダーコメントの「Web Push受信 + 通知クリックのハンドリング」の記述も実態に合わせて削る。

```js
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "study-ai", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "study-ai";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
```
を削除し、ファイル末尾は`fetch`リスナーの閉じ`});`で終わるようにする。

変更後の`public/sw.js`全文:
```js
// study-ai Service Worker
// 最小限のオフラインキャッシュ

const CACHE_NAME = "study-ai-v1";
const OFFLINE_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .catch(() => {
        // 初回キャッシュに失敗しても install 自体は継続する
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// ネットワーク優先、失敗時のみキャッシュにフォールバック(最小限のオフライン対応)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match("/")),
    ),
  );
});
```

### Step 3.3: 検証する

```bash
grep -n "push\|notificationclick" public/sw.js
```
期待する出力: 何もヒットしない(終了コード1)。

```bash
node --check public/sw.js
```
期待する出力: 何も出力されない(構文エラーが無ければ終了コード0。`self`未定義参照エラーは`node --check`は構文チェックのみなので発生しない)。

### Step 3.4: commit

```bash
git add public/sw.js
git commit -m "$(cat <<'EOF'
chore(push): remove push and notificationclick listeners from sw.js

push通知機能の廃止に伴いService Workerのpush受信・通知クリックの
ハンドリングを削除した。オフラインキャッシュ(install/activate/fetch)は
変更していない。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `package.json`から`web-push`・`@types/web-push`依存を削除

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`(npm installで再生成)

**Interfaces:** なし

**判断:** Task 1〜3で`web-push`・`webpush`をimportしていたのは`src/app/api/cron/morning/route.ts`・`src/app/api/cron/evening/route.ts`のみ(Task 1で削除済み)。他に`web-push`パッケージ自体をimportしている箇所が無ければ不要と判断し削除する。`@types/web-push`は`web-push`の型のみに使われる開発補助パッケージのため同時に削除する。

### Step 4.1: 削除してよいことを確認する

```bash
grep -rln "from \"web-push\"\|from 'web-push'\|require(\"web-push\")\|require('web-push')" src/ analysis/ --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js"
```

期待する出力: 何もヒットしない(Task 1でcronルートを削除済みのため)。もし何かヒットした場合は、その箇所を先に対応してから本タスクを進める。

### Step 4.2: `package.json`から依存を削除する

`dependencies`から`"@types/web-push": "^3.6.4",`と`"web-push": "^3.6.7"`の2行を削除する。

```bash
npm pkg delete dependencies.web-push
npm pkg delete 'dependencies["@types/web-push"]'
```

**注意(zsh):** `dependencies["@types/web-push"]`をクオート無しで渡すとzshがグロブとして展開して失敗する。上記のように必ずシングルクオートで囲む。

### Step 4.3: lockfileを更新する

```bash
npm install
git diff --stat package-lock.json
```
期待する出力: `package-lock.json`に差分が出る(該当パッケージのエントリが削除される)。

### Step 4.4: 検証する

```bash
grep -n "web-push" package.json
```
期待する出力: 何もヒットしない。

```bash
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: `Compiled successfully`。

```bash
npm run test:analysis
```
期待する出力: 既存の`node --test`スイートが全てPASSする(このタスクではNode側コードを変更していないため、既存件数のままPASS)。

### Step 4.5: commit

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): remove unused web-push and @types/web-push

push通知cronルートの削除(Task 1)によりweb-pushパッケージへの
参照が無くなったため、依存から外した。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/`(今日)ページのvault読み再構築

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `readPlan(date: string): Promise<PlanBlock[]>` (`@/lib/vault`, 計画2実装)、`readSchedule(): Promise<ScheduleEvent[]>` (`@/lib/vault`, 計画2実装)、`listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]>` (`@/lib/vault`, 既存)、型 `PlanBlock`・`ScheduleEvent`・`ReportMeta` (`@/lib/vault`)
- Produces: `HomePage`(デフォルトexport, Server Component)

**このタスクはページ全文書き換え(TDDが馴染まない)。全文掲載 → 検証コマンド → commit の形で進める。**

### Step 5.1: 依存(計画2)の到着を確認する

```bash
grep -n "export async function readPlan\|export async function readSchedule" src/lib/vault/*.ts
```

期待する出力: `readPlan` と `readSchedule` の宣言行が1行以上ずつ表示される(計画2がまだ未実装なら空。その場合は計画2の完了を待ってから本タスクを進める。バレル`src/lib/vault/index.ts`に再エクスポートされていることも`grep -n "readPlan\|readSchedule" src/lib/vault/index.ts`で確認する)。

### Step 5.2: `src/app/page.tsx` を全文書き換える

現在の`src/app/page.tsx`は`"use client"`でSupabaseから`events`・`review_tasks`・`reports`を読むClient Componentになっている。これを`/reports/page.tsx`と同じパターンのServer Componentに全文差し替える。

**「今日」ページの締切表示は期限超過を隠さない:** 元の実装は`daysUntil(event.due)`が`0〜7`の範囲だけを表示しており、締切を過ぎた未完了の予定(出願・課題等)がトップページから消えていた。プッシュ通知も本計画で廃止するため、期限超過に気づく手段がアプリ内に無くなる。そこで、未完了の予定を「期限超過」と「7日以内」の2グループに分け、**期限超過を最上位に赤系で目立つ形**で表示する。文言は`/schedule`(計画2 Task 13)の`{d >= 0 ? \`あと${d}日\` : "期限超過"}`に揃える。

```tsx
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "next/link";
import { readPlan, readSchedule, listReports } from "@/lib/vault";
import { COMMON_TEST_DATE, daysUntil, EVENT_KIND_LABELS } from "@/lib/constants";
import { formatLocalDate } from "@/lib/date";

export const dynamic = "force-dynamic";

const UPCOMING_DUE_WITHIN_DAYS = 7;

export default async function HomePage() {
  const today = formatLocalDate(new Date());
  const daysToExam = daysUntil(COMMON_TEST_DATE);

  const [planBlocks, scheduleEvents, dailyReports] = await Promise.all([
    readPlan(today),
    readSchedule(),
    listReports("daily"),
  ]);

  const incompleteEvents = scheduleEvents.filter((event) => !event.done);
  const overdueEvents = incompleteEvents
    .filter((event) => daysUntil(event.due) < 0)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const upcomingEvents = incompleteEvents
    .filter((event) => {
      const days = daysUntil(event.due);
      return days >= 0 && days <= UPCOMING_DUE_WITHIN_DAYS;
    })
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

  const latestDailyReport = dailyReports[0] ?? null;

  return (
    <Box sx={{ p: 2, pb: 4, maxWidth: 560, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        今日
      </Typography>

      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            共通テストまで
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {daysToExam >= 0 ? `${daysToExam}日` : "終了"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {COMMON_TEST_DATE} 予定
          </Typography>
        </Paper>

        {overdueEvents.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, borderColor: "error.main", bgcolor: "error.50" }}>
            <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>
              期限超過
            </Typography>
            <Stack spacing={1}>
              {overdueEvents.map((event) => (
                <Stack key={event.id} direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Chip
                      size="small"
                      label={EVENT_KIND_LABELS[event.kind] ?? event.kind}
                      color="error"
                      sx={{ mb: 0.5 }}
                    />
                    <Typography variant="body1">{event.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {event.due}
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={700} color="error.main">
                    期限超過
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            今日の計画
          </Typography>
          {planBlocks.length === 0 ? (
            <Typography variant="body2">今日の計画はまだありません</Typography>
          ) : (
            <Stack spacing={1}>
              {planBlocks.map((block) => (
                <Stack key={block.id} direction="row" alignItems="flex-start" spacing={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 88 }}
                  >
                    {block.start}〜{block.end}
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        textDecoration: block.status === "done" ? "line-through" : "none",
                        color: block.status === "done" ? "text.disabled" : "text.primary",
                      }}
                    >
                      {block.subject}
                      {block.status === "skipped" ? "(見送り)" : ""}
                    </Typography>
                    {block.memo && (
                      <Typography variant="caption" color="text.secondary">
                        {block.memo}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            締切が近い予定({UPCOMING_DUE_WITHIN_DAYS}日以内)
          </Typography>
          {upcomingEvents.length === 0 ? (
            <Typography variant="body2">締切が近い予定はありません</Typography>
          ) : (
            <Stack spacing={1}>
              {upcomingEvents.map((event) => {
                const days = daysUntil(event.due);
                const isUrgent = days <= 3;
                return (
                  <Stack
                    key={event.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Box>
                      <Chip
                        size="small"
                        label={EVENT_KIND_LABELS[event.kind] ?? event.kind}
                        color={isUrgent ? "error" : "default"}
                        sx={{ mb: 0.5 }}
                      />
                      <Typography variant="body1">{event.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {event.due}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h5"
                      fontWeight={700}
                      color={isUrgent ? "error.main" : "text.primary"}
                    >
                      あと{days}日
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          )}
          {upcomingEvents.some((event) => daysUntil(event.due) <= 3) && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              締切まで3日以内の予定があります
            </Alert>
          )}
        </Paper>

        {latestDailyReport && (
          <Button component={Link} href="/reports" variant="outlined" fullWidth>
            最新のレポートを見る(日次 {latestDailyReport.date})
          </Button>
        )}
      </Stack>
    </Box>
  );
}
```

**変更点の要旨:**
- `"use client"` / `useSupabase` / `review_tasks` / `/record` への導線を削除。
- 直近の締切は`events`単一取得ではなく`readSchedule()`の全件から「未完了」を抽出し、**期限超過(赤・最上位)** と **7日以内**の2グループに分けて表示する(既存は`.limit(1)`で1件だけだったが、vault移行後は`/schedule`が別途あるため今日ページでは複数件を軽く見せる。7日以内という判定日数は既存を踏襲。期限超過を隠していた既存のバグ(`days >= 0`のみ許可)はここで修正する)。
- 最新レポートへのリンク先は既存コードの`/stats`ではなく`/reports`にする(`reports`テーブルの`kind`ではなく`listReports("daily")`を使うため、日次レポート一覧である`/reports`へ飛ぶのが実体と合う)。

### Step 5.3: 型チェック・lint・buildで検証する

`STUDY_AI_VAULT_DIR`が未設定の環境でも`next build`の型チェック自体は通る(実行時に初めてthrowされる)ため、ここでは型・lint・buildのみ確認する。

```bash
npx tsc --noEmit
```
期待する出力: エラー0件(終了コード0)。

```bash
npm run lint
```
期待する出力: `src/app/page.tsx`に関するエラー0件。

```bash
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: `Compiled successfully` を含み、`/`のビルドが成功する(`STUDY_AI_VAULT_DIR`はビルド時の型チェック用に空の一時ディレクトリを与える。実行時にvaultファイルが無くても`readPlan`/`readSchedule`/`listReports`は空配列を返す契約なのでビルド自体は失敗しない)。

### Step 5.4: commit

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(home): rebuild / as a vault-reading Server Component

review_tasks依存を廃止し、readPlan/readSchedule/listReportsから当日の計画・
締切(期限超過を最上位、7日以内の未完了予定)・最新日次レポートへの導線を
表示するようにした。期限超過の予定を隠していた既存のフィルタ条件は修正した。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/stats`凍結の告知と`/settings`科目管理の注記

**Files:**
- Modify: `src/app/stats/page.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:** なし(Alert・Typographyの追加のみ)

**このタスクを追加する理由(スコープ「変更しない」の明示的な例外):**
- `/stats`はTask 5以降、移行日以降のデータが増えなくなる(グラフが伸びなくなる)。`/records`には記録があるのに`/stats`には反映されない状態を毎日見ることになり、「壊れた」と誤解される確率が高い。ロジックを変えない判断は妥当だが、**画面にその旨を出さないのは不親切**なのでAlertを1行足す。
- `/settings`の科目・単元・教材の管理UIはSupabaseを触り続ける(このTaskで消すのはpushのみ)。一方vaultの記録は13科目のハードコード文字列(`docs/study-dialogue.md`)を使う。設定画面で科目を追加しても対話には反映されず、対話で使う科目名は設定画面に現れない。`/stats`が凍結されると、この科目管理UIが何に効くのか分からなくなるため注記を出す。

### Step 6.1: `/stats`にAlertを追加する

`src/app/stats/page.tsx`の`return`直下、既存の`{configError && (...)}`ブロックの直前に固定Alertを追加する。

```tsx
      <Button component={Link} href="/reports" variant="outlined" size="small" sx={{ mb: 2 }}>
        vaultレポート・弱点カルテを見る
      </Button>

      <Alert severity="info" sx={{ mb: 2 }}>
        この画面は 2026-07-26 以前のデータのみを表示します(以降の記録は「履歴」・「レポート」を参照してください)。
      </Alert>

      {configError && (
```

**移行日の決め方:** `2026-07-26`は本計画のTask 5(今日ページ)実装完了・移行スクリプト実行日を想定した仮の値。実際の移行実行日(Task 8で確定する日付)に合わせて実装時に書き換える。日付はハードコード文字列でよい(`/stats`はこのTaskでロジックを変更しないため、既存の`Alert` importをそのまま使う。追加のimportは不要)。

### Step 6.2: `/settings`の科目管理セクションに注記を追加する

`src/app/settings/page.tsx`の「科目・単元・教材の管理」見出し(397行目付近)の直後に注記を追加する。

```tsx
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            科目・単元・教材の管理
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            この設定は分析画面(`/stats`、現在は過去データのみ表示)にのみ影響します。対話で使う科目は
            docs/study-dialogue.md の一覧が正です。
          </Typography>
```

既存のJSX構造に合わせて挿入位置・インデントを調整する(見出しの直後、科目セレクトの直前)。

### Step 6.3: 検証する

```bash
npx tsc --noEmit
npm run lint
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: いずれも成功する(型エラー0件・lintエラー0件・`Compiled successfully`)。

### Step 6.4: commit

```bash
git add src/app/stats/page.tsx src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(ui): note /stats freeze and /settings subject-management scope

/statsはvault移行後にデータが増えなくなるため凍結を告知するAlertを
追加した(ロジックは変更していない)。/settingsの科目・単元・教材管理は
対話側の科目一覧(docs/study-dialogue.md)と二重管理になるため、
影響範囲を明記する注記を追加した。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 過去データ移行スクリプト(TDD)

**Files:**
- Create: `analysis/helpers/migrate-supabase-to-vault.mjs`
- Test: `analysis/test/migrate-supabase-to-vault.test.mjs`

**Interfaces:**
- Consumes: `restClient()` / `loadEnv()` / `printJson()` (`analysis/helpers/lib.mjs`, 既存)、`appendStudySession(date, session)` / `appendScheduleEvent(event)` / `appendPlanBlock(date, block)` / `parseStudySessions(body)` / `nextSessionId(sessions)` / `parseScheduleEvents(body)` / `nextEventId(events)` / `parsePlanBlocks(body)` / `nextPlanId(blocks)` (`analysis/helpers/vault/index.mjs`, 計画1・2実装)、`getVaultRoot()` / `readVaultFile(relPath)` → `{ frontmatter, body, raw }` / `writeVaultFile(relPath, frontmatter, body)`(内部で `stringifyFrontmatter` する) (`analysis/helpers/vault/index.mjs`, 既存)
- Produces: `mapStudySessionRow(row, subjectName)` / `mapEventRow(row)` / `mapPlanBlockRow(row, subjectName)`(決定的な行変換関数。ユニットテスト対象)、`createSupabaseMigrationClient()`(Supabaseアクセスの注入ポイント)、`run(argv, deps?)`(CLIエントリ。統合テスト対象)

このタスクは決定的な変換部分(DB行→契約フォーマットの行オブジェクト)に加えて、**id採番・バックアップ前提・dry-run・冪等化・中断復帰・ページングの6要件(契約§7)をすべて満たす`run()`本体**をTDDで実装する。`run()`はSupabaseクライアントを注入可能にすることでテスト対象にする(実データへの実行は行わない。テストは常にフェイクの注入クライアント+一時vaultディレクトリに対して行う)。

### Step 7.1: 依存(計画1・2)の到着を確認する

```bash
grep -n "export async function appendStudySession\|export async function appendScheduleEvent\|export async function appendPlanBlock\|export function nextSessionId\|export function nextEventId\|export function nextPlanId\|export function parseStudySessions\|export function parseScheduleEvents\|export function parsePlanBlocks" analysis/helpers/vault/*.mjs
```
期待する出力: 9つの関数宣言行が表示される。計画1・2が未完了の場合は完了を待ってから本タスクを進める。

```bash
grep -n "export function getVaultRoot\|export async function readVaultFile\|export async function writeVaultFile\|export function parseFrontmatter\|export function stringifyFrontmatter" analysis/helpers/vault/*.mjs
```
期待する出力: 5つの関数宣言行が表示される(Phase 1で実装済みのはず)。

### Step 7.2: 失敗するテストを書く

`analysis/test/migrate-supabase-to-vault.test.mjs`を新規作成する。前半はマッパー単体テスト(決定的な変換ロジックの確認)、後半は`run()`を実際に走らせてvaultファイルを生成し、**生成された`records/*.md`をパースし直してidが一意であること**・冪等性・dry-run・ページング件数不一致時の中断を検証する統合テストにする。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  mapStudySessionRow,
  mapEventRow,
  mapPlanBlockRow,
  run,
} from '../helpers/migrate-supabase-to-vault.mjs';
import { readVaultFile, parseStudySessions } from '../helpers/vault/index.mjs';

// --- マッパー単体テスト(決定的な変換ロジック) ---

test('mapStudySessionRow: material種別の行をStudySession形式に写す(idは含まない)', () => {
  const row = {
    id: '11111111-1111-1111-1111-111111111111',
    subject_id: 'subj-1',
    minutes: 60,
    record_type: 'material',
    common_test_year: null,
    common_test_section: null,
    understanding: 'understood',
    memo: '長文2題',
  };
  const result = mapStudySessionRow(row, '英語R');
  assert.deepEqual(result, {
    subject: '英語R',
    minutes: 60,
    kind: 'material',
    understanding: 'understood',
    memo: '長文2題',
  });
  assert.equal('id' in result, false);
});

test('mapStudySessionRow: common_test種別はyear/sectionを含む', () => {
  const row = {
    id: '22222222-2222-2222-2222-222222222222',
    subject_id: 'subj-2',
    minutes: 90,
    record_type: 'common_test',
    common_test_year: 2025,
    common_test_section: '第3問',
    understanding: 'uncertain',
    memo: '',
  };
  const result = mapStudySessionRow(row, '数学IA');
  assert.deepEqual(result, {
    subject: '数学IA',
    minutes: 90,
    kind: 'common_test',
    year: 2025,
    section: '第3問',
    understanding: 'uncertain',
    memo: '',
  });
});

test('mapStudySessionRow: memoがnullなら空文字にする', () => {
  const row = {
    id: '33333333-3333-3333-3333-333333333333',
    subject_id: 'subj-1',
    minutes: 30,
    record_type: 'secondary',
    common_test_year: null,
    common_test_section: null,
    understanding: 'not_understood',
    memo: null,
  };
  assert.equal(mapStudySessionRow(row, '古文').memo, '');
});

test('mapEventRow: done=falseの行を未完了のScheduleEventに写す(idは含まない)', () => {
  const row = { id: 'ev-uuid-1', kind: 'mock_exam', title: '第2回模試', due_date: '2026-08-01', done: false };
  assert.deepEqual(mapEventRow(row), { kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
});

test('mapEventRow: done=trueの行を完了のScheduleEventに写す', () => {
  const row = { id: 'ev-uuid-2', kind: 'assignment', title: '英語課題', due_date: '2026-07-20', done: true };
  assert.equal(mapEventRow(row).done, true);
});

test('mapPlanBlockRow: plan_blocksの行をPlanBlock形式に写す(idは含まない)', () => {
  const row = {
    id: 'plan-uuid-1', plan_date: '2026-07-26', start_time: '09:00:00', end_time: '10:30:00',
    subject_id: 'subj-1', memo: '長文演習', status: 'planned', recurrence_rule: null,
  };
  const result = mapPlanBlockRow(row, '英語R');
  assert.deepEqual(result, { start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文演習' });
});

test('mapPlanBlockRow: memoがnullなら空文字にする', () => {
  const row = {
    id: 'plan-uuid-2', plan_date: '2026-07-26', start_time: '11:00:00', end_time: '12:00:00',
    subject_id: 'subj-2', memo: null, status: 'done', recurrence_rule: null,
  };
  assert.equal(mapPlanBlockRow(row, '数学IA').memo, '');
});

test('mapPlanBlockRow: recurrence_ruleを持つ行はhadRecurrence=trueを返す(展開はしない)', () => {
  const row = {
    id: 'plan-uuid-3', plan_date: '2026-07-26', start_time: '13:00:00', end_time: '14:00:00',
    subject_id: 'subj-1', memo: '', status: 'planned', recurrence_rule: 'FREQ=WEEKLY',
  };
  assert.equal(mapPlanBlockRow(row, '英語R').hadRecurrence, true);
});

// --- フェイクSupabaseクライアント ---
// createClient() の注入ポイントを使い、実ネットワークアクセスを行わない。

function makeFakeClient({ sessions = [], events = [], planBlocks = [], subjects = [], countOverride = {} } = {}) {
  const tables = { study_sessions: sessions, events, plan_blocks: planBlocks, subjects };
  return {
    selectAll: async (table, _query) => tables[table] ?? [],
    count: async (table, _filterQuery) => countOverride[table] ?? (tables[table] ?? []).length,
  };
}

function makeTmpVault() {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-migrate-'));
  process.env.STUDY_AI_VAULT_DIR = dir;
  return dir;
}

// --- run() 統合テスト ---

test('run: study_sessionsを移行するとidが一意に採番される(id=undefinedにならない)', async (t) => {
  const dir = makeTmpVault();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [
      { id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-01', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'understood', memo: 'A' },
      { id: 'row-2', subject_id: 'subj-1', minutes: 40, study_date: '2026-07-01', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'uncertain', memo: 'B' },
    ],
  });

  const result = await run([], { createClient: () => client });
  assert.equal(result.migrated.studySessions, 2);

  const { body } = await readVaultFile('records/2026-07-01.md');
  const parsed = parseStudySessions(body);
  assert.equal(parsed.length, 2);
  const ids = parsed.map((s) => s.id);
  assert.equal(new Set(ids).size, 2, 'idが重複していないこと');
  assert.ok(ids.every((id) => /^s-\d+$/.test(id)), `全idがs-<連番>形式であること: ${ids}`);
});

test('run: --dry-run は件数のみ返しvaultに書き込まない', async (t) => {
  const dir = makeTmpVault();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [
      { id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-02', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'understood', memo: '' },
    ],
  });

  const result = await run(['--dry-run'], { createClient: () => client });
  assert.equal(result.migrated.studySessions, 1);
  assert.equal(result.dryRun, true);
  await assert.rejects(() => readVaultFile('records/2026-07-02.md'));
});

test('run: 2回実行しても重複しない(冪等)', async (t) => {
  const dir = makeTmpVault();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [
      { id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-03', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'understood', memo: '' },
    ],
  });

  const first = await run([], { createClient: () => client });
  assert.equal(first.migrated.studySessions, 1);

  const second = await run([], { createClient: () => client });
  assert.equal(second.migrated.studySessions, 0);
  assert.equal(second.skipped.studySessions, 1);

  const { body } = await readVaultFile('records/2026-07-03.md');
  assert.equal(parseStudySessions(body).length, 1, '再実行で行が二重に増えていないこと');
});

test('run: 移行先ファイルが既存(dialogue由来)なら--forceなしで中断する', async (t) => {
  const dir = makeTmpVault();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [
      { id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-04', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'understood', memo: '' },
    ],
  });

  // 対話由来のファイルを事前に作っておく(nextSessionId等はvault/index.mjs側のappend系で作成される想定だが、
  // ここではsource: dialogueのfrontmatterを持つ既存ファイルを直接用意して衝突を再現する)
  // writeVaultFile は (relPath, frontmatter, body) の3引数。内部で stringifyFrontmatter する。
  const { writeVaultFile } = await import('../helpers/vault/index.mjs');
  await writeVaultFile(
    'records/2026-07-04.md',
    { type: 'study-record', date: '2026-07-04', source: 'dialogue', schema_version: 1, updated: '2026-07-25T00:00:00+09:00' },
    '## セッション\n- id=s-1 | subject=英語R | minutes=20 | kind=material | understanding=understood | memo=既存分\n',
  );

  await assert.rejects(() => run([], { createClient: () => client }), /--force/);
});

test('run: Supabase側の件数とページング取得件数が一致しなければ中断する', async (t) => {
  const dir = makeTmpVault();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const client = makeFakeClient({
    subjects: [{ id: 'subj-1', name: '英語R' }],
    sessions: [
      { id: 'row-1', subject_id: 'subj-1', minutes: 30, study_date: '2026-07-05', record_type: 'material', common_test_year: null, common_test_section: null, understanding: 'understood', memo: '' },
    ],
    countOverride: { study_sessions: 2 },
  });

  await assert.rejects(() => run([], { createClient: () => client }), /件数が一致しません|count mismatch/);
});
```

### Step 7.3: 失敗を確認する

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs
```
期待する出力: `analysis/helpers/migrate-supabase-to-vault.mjs`が存在しないため`ERR_MODULE_NOT_FOUND`エラーで全テストが失敗する。

### Step 7.4: 最小実装を書く

`analysis/helpers/migrate-supabase-to-vault.mjs`を新規作成する:

```js
#!/usr/bin/env node
// analysis/helpers/migrate-supabase-to-vault.mjs
// Supabase(study_sessions/events/plan_blocks)からVaultへの過去データ移行。
// 1回限りの手動実行専用。夜間バッチの定常フローには組み込まない。
//
// 使い方:
//   node analysis/helpers/migrate-supabase-to-vault.mjs [--dry-run] [--force] [--from-table <table>]
//
// --dry-run       : vaultに書き込まず件数と警告だけ出す(目視確認用)
// --force         : 移行先ファイルが既に存在していても上書き対象として続行する
// --from-table <table> : study_sessions|events|plan_blocks のいずれかを指定し、
//                        そのテーブルからテーブル単位で再開する(それより前のテーブルはスキップ)
//
// unit_id・material_id・recurrence_ruleは契約フォーマットに無いため失われる。
// このスクリプトは失われる情報がある行を検出すると実行時に警告を表示する。
//
// 冪等性: 移行で新規作成したファイルのfrontmatterに source: migration を付与する。
// 再実行時、対象ファイルのfrontmatterが source: migration ならそのテーブル(ファイル)は
// スキップする。source: migration 以外の既存ファイル(対話由来)がある場合は --force なしでは中断する。
import { fileURLToPath } from 'node:url';
import { restClient, loadEnv, printJson } from './lib.mjs';
import {
  appendStudySession,
  appendScheduleEvent,
  appendPlanBlock,
  parseStudySessions,
  nextSessionId,
  parseScheduleEvents,
  nextEventId,
  parsePlanBlocks,
  nextPlanId,
  getVaultRoot,
  readVaultFile,
  writeVaultFile,
  parseFrontmatter,
  stringifyFrontmatter,
} from './vault/index.mjs';

const TABLE_ORDER = ['study_sessions', 'events', 'plan_blocks'];
const PAGE_SIZE = 500;

/** study_sessions 1行 + 科目名 → StudySession(idは含まない。採番は呼び出し側=本スクリプトの責務) */
export function mapStudySessionRow(row, subjectName) {
  const session = {
    subject: subjectName,
    minutes: row.minutes,
    kind: row.record_type,
    understanding: row.understanding,
    memo: row.memo ?? '',
  };
  if (row.record_type === 'common_test') {
    session.year = row.common_test_year;
    session.section = row.common_test_section;
  }
  return session;
}

/** events 1行 → ScheduleEvent(idは含まない) */
export function mapEventRow(row) {
  return { kind: row.kind, title: row.title, due: row.due_date, done: row.done };
}

/** plan_blocks 1行 + 科目名 → PlanBlock(idは含まない)。recurrence_ruleがあればhadRecurrence:trueを付与する */
export function mapPlanBlockRow(row, subjectName) {
  const block = {
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    subject: subjectName,
    status: row.status,
    memo: row.memo ?? '',
  };
  if (row.recurrence_rule) block.hadRecurrence = true;
  return block;
}

/** unit_id/material_idを持つ行を検出して警告文を作る(study_sessions用) */
function studySessionWarnings(row) {
  const warnings = [];
  if (row.unit_id) warnings.push(`study_sessions ${row.id}: unit_id が失われます`);
  if (row.material_id) warnings.push(`study_sessions ${row.id}: material_id が失われます`);
  return warnings;
}

function parseArgv(argv) {
  const options = { dryRun: false, force: false, fromTable: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--force') options.force = true;
    else if (argv[i] === '--from-table') {
      options.fromTable = argv[i + 1];
      i += 1;
    }
  }
  if (options.fromTable && !TABLE_ORDER.includes(options.fromTable)) {
    throw new Error(`--from-table は ${TABLE_ORDER.join('|')} のいずれかを指定してください`);
  }
  return options;
}

/** PostgREST の limit/offset でページングして全件取得する */
async function fetchAllPages(client, table, query) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await client.select(table, `${query}&limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** Prefer: count=exact でSupabase側の正確な件数を取得する(restClientのselectはprefer未対応のため直接fetchする) */
async function fetchExactCount(table, filterQuery = '') {
  const { url, key } = loadEnv();
  const qs = filterQuery ? `?select=id&${filterQuery}&limit=1` : '?select=id&limit=1';
  const res = await fetch(`${url}/rest/v1/${table}${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase REST GET ${table} (count) failed: ${res.status} ${text}`);
  }
  const range = res.headers.get('content-range'); // 例: "0-0/1234"
  const total = range && range.includes('/') ? Number(range.split('/')[1]) : NaN;
  if (Number.isNaN(total)) {
    throw new Error(`${table} の件数(Content-Range)を取得できませんでした`);
  }
  return total;
}

/** run() から注入されるSupabaseアクセス層。テストではフェイクに差し替える。 */
export function createSupabaseMigrationClient() {
  const client = restClient();
  return {
    selectAll: (table, query) => fetchAllPages(client, table, query),
    count: (table, filterQuery) => fetchExactCount(table, filterQuery),
  };
}

/** 移行先ファイルの状態を見て「新規作成」「再開(未完了)」「スキップ(移行済み)」「中断(対話由来と衝突)」を判定する */
async function checkDestination(relPath, { force }) {
  // readVaultFile は { frontmatter, body, raw } を返す(生文字列ではないので再パース不要)。
  let file;
  try {
    file = await readVaultFile(relPath);
  } catch {
    return { exists: false };
  }
  const { frontmatter } = file;
  if (frontmatter.source === 'migration') {
    return { exists: true, alreadyMigrated: true };
  }
  if (!force) {
    throw new Error(
      `${relPath} は対話由来のデータで既に存在します。移行を続けるには --force を指定してください。`,
    );
  }
  return { exists: true, alreadyMigrated: false };
}

/** 追記が終わったファイルのfrontmatterに source: migration を付与する(本文は読み取り時点のまま変更しない) */
async function markAsMigrated(relPath) {
  // readVaultFile は { frontmatter, body, raw } を返す(生文字列ではない)。
  // writeVaultFile は (relPath, frontmatter, body) の3引数で、内部で stringifyFrontmatter する。
  const { frontmatter, body } = await readVaultFile(relPath);
  await writeVaultFile(relPath, { ...frontmatter, source: 'migration' }, body);
}

async function migrateStudySessions(client, subjectNameById, { dryRun, force }, warnings) {
  const expected = await client.count('study_sessions');
  const rows = await client.selectAll(
    'study_sessions',
    'select=id,subject_id,unit_id,material_id,minutes,study_date,record_type,common_test_year,common_test_section,understanding,memo&order=study_date.asc',
  );
  if (rows.length !== expected) {
    throw new Error(`study_sessions の取得件数(${rows.length})とSupabase側の件数(${expected})が一致しません(ページングの取りこぼしの可能性)`);
  }

  const rowsByDate = new Map();
  for (const row of rows) {
    if (!rowsByDate.has(row.study_date)) rowsByDate.set(row.study_date, []);
    rowsByDate.get(row.study_date).push(row);
  }

  let migrated = 0;
  let skipped = 0;
  const touchedFiles = [];

  for (const [date, dateRows] of rowsByDate) {
    const relPath = `records/${date}.md`;
    const destination = await checkDestination(relPath, { force });
    if (destination.alreadyMigrated) {
      skipped += dateRows.length;
      continue;
    }

    let existingSessions = [];
    if (destination.exists) {
      const { body } = await readVaultFile(relPath);
      existingSessions = parseStudySessions(body);
    }

    for (const row of dateRows) {
      warnings.push(...studySessionWarnings(row));
      const subjectName = subjectNameById.get(row.subject_id) ?? '不明';
      const mapped = mapStudySessionRow(row, subjectName);
      if (dryRun) {
        migrated += 1;
        continue;
      }
      const id = nextSessionId(existingSessions);
      const withId = { id, ...mapped };
      existingSessions = [...existingSessions, withId];
      await appendStudySession(date, withId);
      migrated += 1;
    }
    if (!dryRun) touchedFiles.push(relPath);
  }

  if (!dryRun) {
    for (const relPath of touchedFiles) await markAsMigrated(relPath);
  }

  return { migrated, skipped };
}

async function migrateEvents(client, { dryRun, force }) {
  const expected = await client.count('events');
  const rows = await client.selectAll('events', 'select=id,kind,title,due_date,done&order=due_date.asc');
  if (rows.length !== expected) {
    throw new Error(`events の取得件数(${rows.length})とSupabase側の件数(${expected})が一致しません(ページングの取りこぼしの可能性)`);
  }

  const relPath = 'schedule.md';
  const destination = await checkDestination(relPath, { force });
  if (destination.alreadyMigrated) {
    return { migrated: 0, skipped: rows.length };
  }

  let existingEvents = [];
  if (destination.exists) {
    const { body } = await readVaultFile(relPath);
    existingEvents = parseScheduleEvents(body);
  }

  let migrated = 0;
  for (const row of rows) {
    const mapped = mapEventRow(row);
    if (dryRun) {
      migrated += 1;
      continue;
    }
    const id = nextEventId(existingEvents);
    const withId = { id, ...mapped };
    existingEvents = [...existingEvents, withId];
    await appendScheduleEvent(withId);
    migrated += 1;
  }
  if (!dryRun && rows.length > 0) await markAsMigrated(relPath);

  return { migrated, skipped: 0 };
}

async function migratePlanBlocks(client, subjectNameById, { dryRun, force }, warnings) {
  const expected = await client.count('plan_blocks');
  const rows = await client.selectAll(
    'plan_blocks',
    'select=id,plan_date,start_time,end_time,subject_id,memo,status,recurrence_rule&order=plan_date.asc',
  );
  if (rows.length !== expected) {
    throw new Error(`plan_blocks の取得件数(${rows.length})とSupabase側の件数(${expected})が一致しません(ページングの取りこぼしの可能性)`);
  }

  const rowsByDate = new Map();
  for (const row of rows) {
    if (!rowsByDate.has(row.plan_date)) rowsByDate.set(row.plan_date, []);
    rowsByDate.get(row.plan_date).push(row);
  }

  let migrated = 0;
  let skipped = 0;
  const touchedFiles = [];

  for (const [date, dateRows] of rowsByDate) {
    const relPath = `plans/${date}.md`;
    const destination = await checkDestination(relPath, { force });
    if (destination.alreadyMigrated) {
      skipped += dateRows.length;
      continue;
    }

    let existingBlocks = [];
    if (destination.exists) {
      const { body } = await readVaultFile(relPath);
      existingBlocks = parsePlanBlocks(body);
    }

    for (const row of dateRows) {
      const subjectName = row.subject_id ? (subjectNameById.get(row.subject_id) ?? '不明') : '不明';
      const mapped = mapPlanBlockRow(row, subjectName);
      if (mapped.hadRecurrence) {
        warnings.push(`plan_blocks ${row.id}: recurrence_rule(繰り返し設定)が失われます`);
        delete mapped.hadRecurrence;
      }
      if (dryRun) {
        migrated += 1;
        continue;
      }
      const id = nextPlanId(existingBlocks);
      const withId = { id, ...mapped };
      existingBlocks = [...existingBlocks, withId];
      await appendPlanBlock(date, withId);
      migrated += 1;
    }
    if (!dryRun) touchedFiles.push(relPath);
  }

  if (!dryRun) {
    for (const relPath of touchedFiles) await markAsMigrated(relPath);
  }

  return { migrated, skipped };
}

export async function run(argv = [], { createClient = createSupabaseMigrationClient } = {}) {
  const options = parseArgv(argv);
  const client = createClient();
  const warnings = [];

  const startIndex = options.fromTable ? TABLE_ORDER.indexOf(options.fromTable) : 0;

  const subjects = await client.selectAll('subjects', 'select=id,name');
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const migrated = { studySessions: 0, events: 0, planBlocks: 0 };
  const skipped = { studySessions: 0, events: 0, planBlocks: 0 };

  if (startIndex <= TABLE_ORDER.indexOf('study_sessions')) {
    const r = await migrateStudySessions(client, subjectNameById, options, warnings);
    migrated.studySessions = r.migrated;
    skipped.studySessions = r.skipped;
    process.stdout.write(`progress: table=study_sessions migrated=${r.migrated} skipped=${r.skipped}\n`);
  }

  if (startIndex <= TABLE_ORDER.indexOf('events')) {
    const r = await migrateEvents(client, options);
    migrated.events = r.migrated;
    skipped.events = r.skipped;
    process.stdout.write(`progress: table=events migrated=${r.migrated} skipped=${r.skipped}\n`);
  }

  if (startIndex <= TABLE_ORDER.indexOf('plan_blocks')) {
    const r = await migratePlanBlocks(client, subjectNameById, options, warnings);
    migrated.planBlocks = r.migrated;
    skipped.planBlocks = r.skipped;
    process.stdout.write(`progress: table=plan_blocks migrated=${r.migrated} skipped=${r.skipped}\n`);
  }

  return { migrated, skipped, warnings, dryRun: options.dryRun };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await run(process.argv.slice(2));
  printJson(result);
  if (result.warnings.length > 0) {
    console.warn(`\n警告: ${result.warnings.length}件の情報が移行時に失われました:`);
    for (const warning of result.warnings) console.warn(`  - ${warning}`);
  }
}
```

**契約§7の6要件との対応:**
1. **id採番**: `nextSessionId`/`nextEventId`/`nextPlanId`を各行の書き込み直前に、その時点までの既存行(ディスク上+今回の実行で既に追記した分)を反映したメモリ上の配列に対して呼び、`{ id, ...mapped }`をライタに渡す。
2. **バックアップ前提**: Task 8の実行手順の先頭に`cp -a`退避コマンドを置く(スクリプト自体はバックアップを取らない。理由はTask 8参照)。
3. **`--dry-run`**: 各テーブルの移行関数が`dryRun`時はマッピング・警告収集のみ行い、ライタ呼び出し・frontmatter書き換えをスキップする。
4. **冪等化**: 移行で書き込んだファイルのfrontmatterに`source: migration`を付与し(`markAsMigrated`)、次回実行時`checkDestination`がこれを検出してスキップする。対話由来の既存ファイル(`source`が`migration`以外)がある場合は`--force`なしで`throw`する。
5. **中断復帰**: `--from-table <table>`で指定テーブルより前をスキップして再開できる。各テーブル終了時に`progress: table=... migrated=... skipped=...`を標準出力に出す。
6. **ページング**: `fetchAllPages`が`limit`/`offset`で全件取得し、`fetchExactCount`(`Prefer: count=exact`)で取得したSupabase側件数と突き合わせ、不一致なら`throw`して中断する。

### Step 7.5: 成功を確認する

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs
```
期待する出力: 全テストがPASSする(`# fail 0`)。

```bash
npm run test:analysis
```
期待する出力: 既存スイート(`analysis/menubar-app/test/*.test.js analysis/test/*.test.mjs`)が全てPASSし、新規追加したテストの分が合計に加算されている。

### Step 7.6: commit

```bash
git add analysis/helpers/migrate-supabase-to-vault.mjs analysis/test/migrate-supabase-to-vault.test.mjs
git commit -m "$(cat <<'EOF'
feat(migrate): add one-off Supabase-to-vault migration script

study_sessions/events/plan_blocksを契約フォーマットへ変換する決定的な
行マッパー(mapStudySessionRow/mapEventRow/mapPlanBlockRow)と、
id採番・dry-run・source:migrationによる冪等化・--from-tableでの中断復帰・
limit/offsetページング+件数突き合わせを備えたrun()をTDDで実装した。
Supabaseアクセスはcreateクライアントとして注入可能にし、run()自体を
一時vault+フェイククライアントで統合テストできるようにした。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 移行スクリプトの手動実行手順を明記する(実データ実行は対象外)

**Files:** なし(コード変更なし。本タスクは実行手順の確定と目視確認チェックリストの明記のみ)

**Interfaces:** Consumes: `run(argv, deps?)` (`analysis/helpers/migrate-supabase-to-vault.mjs`, Task 7で実装)

親スペックの未決事項「移行スクリプトの実行タイミング」をここで確定する: **実装完了後、対話運用(`docs/study-dialogue.md`)へ切り替える直前に手動で1回だけ実行する。** 夜間バッチ(`analysis/nightly.md`等)には一切組み込まない。実データに対する実行は本計画のタスクとしては実施せず、以下の手順を実行者(ユーザー)向けの確認事項として残す。

### Step 8.1: 実行前チェック

```bash
grep -n "STUDY_AI_VAULT_DIR" analysis/.env
```
期待する出力: 本番運用のvaultパスが設定されている行が1行表示される(未設定なら実行前に設定する)。

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs analysis/test/vault-*.test.mjs
```
期待する出力: 移行スクリプトとNode側vaultライタの全テストがPASSする(実行前の最終確認)。

**vaultのバックアップを取る(必須。移行先はGoogleドライブ同期の正本であり、手で戻すのは非現実的なため実行前に必ず退避する):**

```bash
VAULT_DIR=$(grep "^STUDY_AI_VAULT_DIR=" analysis/.env | cut -d= -f2-)
BACKUP_DIR="${VAULT_DIR%/}-backup-$(date +%Y%m%dT%H%M%S)"
cp -a "$VAULT_DIR" "$BACKUP_DIR"
ls "$BACKUP_DIR"
```
期待する出力: `$BACKUP_DIR`にvault全体のコピーが作成される(`records`/`schedule.md`/`plans`等が一覧に表示される)。

### Step 8.2: dry-runで目視確認する(書き込みは発生しない)

```bash
node analysis/helpers/migrate-supabase-to-vault.mjs --dry-run
```
期待する出力: `dryRun: true`を含むJSONと、`migrated`に各テーブルの想定件数が入る。件数がSupabase管理画面で確認した実件数と一致することを目視で確認する。一致しない場合、スクリプトは件数不一致時に自動で例外を投げて中断するため、そもそもここまで到達しない(Task 7のページング自動チェックを参照)。

### Step 8.3: 本実行(ユーザーが1回だけ行う。本計画の自動化タスクではない)

```bash
node analysis/helpers/migrate-supabase-to-vault.mjs
```
期待する出力: `migrated: { studySessions: <件数>, events: <件数>, planBlocks: <件数> }`・`skipped: {...}`のJSONと、`unit_id`/`material_id`/`recurrence_rule`を持つ行があった場合はその一覧を含む警告メッセージ。標準出力に`progress: table=study_sessions migrated=... skipped=...`のようなテーブル単位の進捗行が出る。

途中でエラーが出て中断した場合は、直前に成功した`progress:`行のテーブル名を確認し、次のテーブルから再開する:
```bash
node analysis/helpers/migrate-supabase-to-vault.mjs --from-table events
```

同じテーブルを再実行しても、Task 7の冪等化(`source: migration`マーカー)により既に移行済みのファイルは`skipped`に計上されるだけで重複書き込みは起きない。

### Step 8.4: 目視確認(自動テスト対象外)

- `vault/records/`配下に日付ごとのファイルが生成され、`## セッション`の行数がSupabase側の`study_sessions`件数と一致すること(Task 7の自動チェックで既に保証されるが、念のため確認する)。
- `vault/schedule.md`の`## 予定`の行数が`events`件数と一致し、`done=true`の行が`- [x]`になっていること。
- `vault/plans/`配下に日付ごとのファイルが生成され、`## 計画`の行数が`plan_blocks`件数と一致すること。
- 生成された各ファイルの`id`が一意であること(`grep -o "id=[a-z0-9-]*" vault/records/2026-07-01.md | sort | uniq -d`が空であること、等)。
- 警告に出た`unit_id`/`material_id`/`recurrence_rule`保持行を一つずつSupabase側の元データと突き合わせ、情報欠落が許容範囲であることを確認する。

このタスクにコミットは発生しない(実行結果はvault側の変更であり、リポジトリのコミット対象ではない)。実行日が確定したら、Task 6で追加した`/stats`のAlert文言中の日付を実際の実行日に合わせて更新すること。

---

## 完了確認(全タスク共通)

全タスク終了後、次のコマンドで一括検証する:

```bash
npx tsc --noEmit
npm run lint
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
npm run test:analysis
npm test
```

期待する出力: 全コマンドが終了コード0で完了し、既存テスト(`npm test`のvitestスイート、`npm run test:analysis`のnode --testスイート)が壊れていないこと。
