# Phase 2: Today Page Rebuild & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/`(今日)ページをvault読みのServer Componentへ再構築し、push通知一式(cron/vercel設定/settings購読UI/sw.jsリスナー)を削除し、SupabaseからVaultへの過去データ移行スクリプトを新設する。

**Architecture:** `/`は`src/lib/vault`のリーダ(`readPlan`/`readSchedule`/`listReports`)を`fs`経由でサーバ側だけが呼ぶServer Componentにする(`/reports`と同じパターン)。push通知はNext.js側(cron route・vercel.json・settings UI・sw.jsのpush/notificationclickリスナー・`web-push`依存・`src/lib/push.ts`)を丸ごと削除し、オフラインキャッシュ(`install`/`activate`/`fetch`)と`ServiceWorkerRegister.tsx`だけ残す。移行は`analysis/helpers/lib.mjs`の`restClient()`でSupabaseから読み、計画1・2のNodeライタ(`appendStudySession`/`appendScheduleEvent`/`appendPlanBlock`)でvaultへ書く1回限りのCLIスクリプトとして新設する。

**Tech Stack:** Next.js 15 App Router (Server Components) / TypeScript / MUI v7 / Node.js標準ライブラリ(`node:fs/promises`, `node:test`) / Vitest / Playwright

## Global Constraints

- vaultルートは環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw する(黙って別パスに書かない)。
- Node実装(`analysis/helpers/`)は **Node標準ライブラリのみ**を使う(追加npmパッケージ禁止)。
- TS側の `fs` アクセスは**サーバ側のみ**(Server Component / Route Handler)。クライアントコンポーネントに`fs`をimportしない。
- 既存ヘルパー(`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/`stringifyFrontmatter`)と、計画1・2が実装する成果物(`readStudyRecord`/`listStudyRecordDates`/`readSchedule`/`setScheduleEventDone`/`readPlan`、Node側`appendStudySession`/`appendScheduleEvent`/`appendPlanBlock`等)は**再実装せず import して使う**。契約にない関数名・型名を1文字も変えない。
- `public/sw.js`のオフラインキャッシュ(`install`/`activate`/`fetch`)と`src/components/ServiceWorkerRegister.tsx`は変更・削除しない。
- `/stats`・`/columns`・`/reports`・`/karte`・`/login`・`middleware`は変更しない。
- 移行スクリプト(`analysis/helpers/migrate-supabase-to-vault.mjs`)は夜間バッチ(`analysis/nightly.md`等の定常フロー)には組み込まない。手動1回実行専用。
- 「締切が近い」の日数は既存`src/app/page.tsx`/`api/cron/morning`と同じ**7日以内**を踏襲する(親スペックの未決事項をここで確定)。
- `/records`・`/schedule`のパーサ/ライタ・BottomNav・`e2e/core-flows.spec.ts`・`e2e/extended-flows.spec.ts`は計画1・2の担当のため触れない。

---

## Task 1: `/`(今日)ページのvault読み再構築

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `readPlan(date: string): Promise<PlanBlock[]>` (`@/lib/vault`, 計画2実装)、`readSchedule(): Promise<ScheduleEvent[]>` (`@/lib/vault`, 計画2実装)、`listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]>` (`@/lib/vault`, 既存)、型 `PlanBlock`・`ScheduleEvent`・`ReportMeta` (`@/lib/vault`)
- Produces: `HomePage`(デフォルトexport, Server Component)

**このタスクはページ全文書き換え(TDDが馴染まない)。全文掲載 → 検証コマンド → commit の形で進める。**

### Step 1.1: 依存(計画2)の到着を確認する

```bash
grep -n "export async function readPlan\|export async function readSchedule" src/lib/vault/*.ts
```

期待する出力: `readPlan` と `readSchedule` の宣言行が1行以上ずつ表示される(計画2がまだ未実装なら空。その場合は計画2の完了を待ってから本タスクを進める。バレル`src/lib/vault/index.ts`に再エクスポートされていることも`grep -n "readPlan\|readSchedule" src/lib/vault/index.ts`で確認する)。

### Step 1.2: `src/app/page.tsx` を全文書き換える

現在の`src/app/page.tsx`は`"use client"`でSupabaseから`events`・`review_tasks`・`reports`を読むClient Componentになっている。これを`/reports/page.tsx`と同じパターンのServer Componentに全文差し替える。

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

  const upcomingEvents = scheduleEvents
    .filter((event) => !event.done)
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
                      {days}日
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
- 直近の締切は`events`単一取得ではなく`readSchedule()`の全件から「未完了かつ7日以内」を抽出して一覧表示する形に変更(既存は`.limit(1)`で1件だけだったが、vault移行後は`/schedule`が別途あるため今日ページでは複数件を軽く見せる。7日以内という判定日数は既存を踏襲)。
- 最新レポートへのリンク先は既存コードの`/stats`ではなく`/reports`にする(`reports`テーブルの`kind`ではなく`listReports("daily")`を使うため、日次レポート一覧である`/reports`へ飛ぶのが実体と合う)。

### Step 1.3: 型チェック・lint・buildで検証する

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

### Step 1.4: commit

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(home): rebuild / as a vault-reading Server Component

review_tasks依存を廃止し、readPlan/readSchedule/listReportsから当日の計画・
締切7日以内の未完了予定・最新日次レポートへの導線を表示するようにした。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: push通知cronルート・vercel.json cronsの削除

**Files:**
- Delete: `src/app/api/cron/morning/route.ts`(ディレクトリ`src/app/api/cron/morning/`ごと)
- Delete: `src/app/api/cron/evening/route.ts`(ディレクトリ`src/app/api/cron/evening/`ごと)
- Modify: `vercel.json`

**Interfaces:** なし(削除のみ)

### Step 2.1: 削除してよいことを確認する

```bash
grep -rn "cron/morning\|cron/evening" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs" src app *.json 2>/dev/null | grep -v node_modules
```

期待する出力: `vercel.json`の2行(`"path": "/api/cron/morning"`と`"path": "/api/cron/evening"`が2箇所)のみ。他のソースからの参照が無いことを確認する。

### Step 2.2: cronディレクトリを削除する

```bash
rm -rf src/app/api/cron/morning src/app/api/cron/evening
ls src/app/api/cron/ 2>/dev/null
```

期待する出力: `src/app/api/cron/`ディレクトリ自体が空になる、または存在しなくなる(直下に`morning`・`evening`以外のサブディレクトリが無い場合)。他のcronルート(例: 存在するなら`nightly`等)が残っている場合はそれだけが表示される想定だが、`git status`時点でこのリポジトリには`morning`/`evening`以外の`api/cron/*`は存在しない。

### Step 2.3: `vercel.json`の`crons`設定を削除する

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

`crons`エントリを全て削除すると設定ファイルが空オブジェクトになる。Vercelの設定ファイルとして空オブジェクトは有効な最小構成なので、ファイル自体は残し中身を`{}`にする。

`vercel.json`の全文を次に差し替える:
```json
{}
```

### Step 2.4: 検証する

```bash
python3 -c "import json; json.load(open('vercel.json'))"
```
期待する出力: 何も出力されない(パースエラーが無ければ終了コード0)。

```bash
STUDY_AI_VAULT_DIR=$(mktemp -d) npm run build
```
期待する出力: `Compiled successfully`。`/api/cron/morning`・`/api/cron/evening`のルートがビルド出力のルート一覧に含まれないこと。

### Step 2.5: commit

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

## Task 3: `src/app/settings/page.tsx`からpush購読UIを削除

**Files:**
- Modify: `src/app/settings/page.tsx`
- Delete: `src/lib/push.ts`(このタスクで不要になる。settings以外からの利用が無いことを確認してから削除する)

**Interfaces:** なし(UI削除のみ。科目/単元/教材管理・夜間バッチプロンプト表示・ログアウトは残す)

### Step 3.1: `src/lib/push.ts`の利用箇所を確認する

```bash
grep -rln "from \"@/lib/push\"\|from '@/lib/push'\|isPushSupported\|urlBase64ToUint8Array" src/ --include="*.ts" --include="*.tsx"
```

期待する出力: `src/app/settings/page.tsx`と`src/lib/push.ts`自身の2件のみ。他から使われていないことを確認してから本タスクで削除する。

### Step 3.2: `src/app/settings/page.tsx`からpush関連のimport・state・関数・UIを削除する

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

### Step 3.3: `src/lib/push.ts`を削除する

```bash
rm src/lib/push.ts
grep -rn "@/lib/push" src/ --include="*.ts" --include="*.tsx"
```

期待する出力: 2行目のgrepは何もヒットしない(終了コード1、出力なし)。

### Step 3.4: 検証する

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

### Step 3.5: commit

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

## Task 4: `public/sw.js`からpush・notificationclickリスナーを削除

**Files:**
- Modify: `public/sw.js`

**Interfaces:** なし。`install`/`activate`/`fetch`は変更しない。

### Step 4.1: 削除してよいことを確認する(参照元)

```bash
grep -rn "notificationclick\|registration.showNotification" src/ public/ --include="*.ts" --include="*.tsx" --include="*.js"
```

期待する出力: `public/sw.js`自身の行のみ。他のソースからこのリスナー実装を参照している箇所が無いことを確認する(`ServiceWorkerRegister.tsx`は`register("/sw.js")`を呼ぶだけでリスナーの中身には依存していないため無関係)。

### Step 4.2: `public/sw.js`の`push`・`notificationclick`リスナーを削除する

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

### Step 4.3: 検証する

```bash
grep -n "push\|notificationclick" public/sw.js
```
期待する出力: 何もヒットしない(終了コード1)。

```bash
node --check public/sw.js
```
期待する出力: 何も出力されない(構文エラーが無ければ終了コード0。`self`未定義参照エラーは`node --check`は構文チェックのみなので発生しない)。

### Step 4.4: commit

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

## Task 5: `package.json`から`web-push`・`@types/web-push`依存を削除

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`(npm installで再生成)

**Interfaces:** なし

**判断:** Task 2〜4で`web-push`・`webpush`をimportしていたのは`src/app/api/cron/morning/route.ts`・`src/app/api/cron/evening/route.ts`のみ(Task 2で削除済み)。他に`web-push`パッケージ自体をimportしている箇所が無ければ不要と判断し削除する。`@types/web-push`は`web-push`の型のみに使われる開発補助パッケージのため同時に削除する。

### Step 5.1: 削除してよいことを確認する

```bash
grep -rln "from \"web-push\"\|from 'web-push'\|require(\"web-push\")\|require('web-push')" src/ analysis/ --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js"
```

期待する出力: 何もヒットしない(Task 2でcronルートを削除済みのため)。もし何かヒットした場合は、その箇所を先に対応してから本タスクを進める。

### Step 5.2: `package.json`から依存を削除する

`dependencies`から`"@types/web-push": "^3.6.4",`と`"web-push": "^3.6.7"`の2行を削除する。

```bash
npm pkg delete dependencies.web-push
npm pkg delete dependencies["@types/web-push"]
```

### Step 5.3: lockfileを更新する

```bash
npm install
git diff --stat package-lock.json
```
期待する出力: `package-lock.json`に差分が出る(該当パッケージのエントリが削除される)。

### Step 5.4: 検証する

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

### Step 5.5: commit

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): remove unused web-push and @types/web-push

push通知cronルートの削除(Task 2)によりweb-pushパッケージへの
参照が無くなったため、依存から外した。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 過去データ移行スクリプトの変換ロジック(TDD)

**Files:**
- Create: `analysis/helpers/migrate-supabase-to-vault.mjs`
- Test: `analysis/test/migrate-supabase-to-vault.test.mjs`

**Interfaces:**
- Consumes: `restClient()` (`analysis/helpers/lib.mjs`, 既存)、`appendStudySession(date, session)` / `appendScheduleEvent(event)` / `appendPlanBlock(date, block)` (`analysis/helpers/vault/index.mjs`, 計画1・2実装)
- Produces: `mapStudySessionRow(row, subjectName)` / `mapEventRow(row)` / `mapPlanBlockRow(row, subjectName)`(決定的な行変換関数。ユニットテスト対象)、`run(argv)`(CLIエントリ。手動実行用・自動テスト対象外)

このタスクは決定的な変換部分(DB行→契約フォーマットの行オブジェクト)をTDDで実装する。Supabaseへの実アクセスやvaultへの実書き込みを行う`run`本体は手動1回実行・目視確認とし、自動テストの対象にしない。

### Step 6.1: 依存(計画1・2)の到着を確認する

```bash
grep -n "export async function appendStudySession\|export async function appendScheduleEvent\|export async function appendPlanBlock" analysis/helpers/vault/*.mjs
```
期待する出力: 3つの関数宣言行が表示される。計画1・2が未完了の場合は完了を待ってから本タスクを進める。

### Step 6.2: 失敗するテストを書く

`analysis/test/migrate-supabase-to-vault.test.mjs`を新規作成する:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapStudySessionRow,
  mapEventRow,
  mapPlanBlockRow,
} from '../helpers/migrate-supabase-to-vault.mjs';

test('mapStudySessionRow: material種別の行をStudySession形式に写す', () => {
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
  const result = mapStudySessionRow(row, '古文');
  assert.equal(result.memo, '');
});

test('mapEventRow: done=falseの行を未完了のScheduleEventに写す', () => {
  const row = {
    id: 'ev-uuid-1',
    kind: 'mock_exam',
    title: '第2回模試',
    due_date: '2026-08-01',
    done: false,
  };
  assert.deepEqual(mapEventRow(row), {
    kind: 'mock_exam',
    title: '第2回模試',
    due: '2026-08-01',
    done: false,
  });
});

test('mapEventRow: done=trueの行を完了のScheduleEventに写す', () => {
  const row = {
    id: 'ev-uuid-2',
    kind: 'assignment',
    title: '英語課題',
    due_date: '2026-07-20',
    done: true,
  };
  assert.equal(mapEventRow(row).done, true);
});

test('mapPlanBlockRow: plan_blocksの行をPlanBlock形式に写す', () => {
  const row = {
    id: 'plan-uuid-1',
    plan_date: '2026-07-26',
    start_time: '09:00:00',
    end_time: '10:30:00',
    subject_id: 'subj-1',
    memo: '長文演習',
    status: 'planned',
    recurrence_rule: null,
  };
  const result = mapPlanBlockRow(row, '英語R');
  assert.deepEqual(result, {
    start: '09:00',
    end: '10:30',
    subject: '英語R',
    status: 'planned',
    memo: '長文演習',
  });
});

test('mapPlanBlockRow: memoがnullなら空文字にする', () => {
  const row = {
    id: 'plan-uuid-2',
    plan_date: '2026-07-26',
    start_time: '11:00:00',
    end_time: '12:00:00',
    subject_id: 'subj-2',
    memo: null,
    status: 'done',
    recurrence_rule: null,
  };
  const result = mapPlanBlockRow(row, '数学IA');
  assert.equal(result.memo, '');
});

test('mapPlanBlockRow: recurrence_ruleを持つ行はhadRecurrence=trueを返す(展開はしない)', () => {
  const row = {
    id: 'plan-uuid-3',
    plan_date: '2026-07-26',
    start_time: '13:00:00',
    end_time: '14:00:00',
    subject_id: 'subj-1',
    memo: '',
    status: 'planned',
    recurrence_rule: 'FREQ=WEEKLY',
  };
  const result = mapPlanBlockRow(row, '英語R');
  assert.equal(result.hadRecurrence, true);
});
```

### Step 6.3: 失敗を確認する

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs
```
期待する出力: `analysis/helpers/migrate-supabase-to-vault.mjs`が存在しないため`ERR_MODULE_NOT_FOUND`エラーで全テストが失敗する。

### Step 6.4: 最小実装を書く

`analysis/helpers/migrate-supabase-to-vault.mjs`を新規作成する:

```js
#!/usr/bin/env node
// analysis/helpers/migrate-supabase-to-vault.mjs
// Supabase(study_sessions/events/plan_blocks)からVaultへの過去データ移行。
// 1回限りの手動実行専用。夜間バッチの定常フローには組み込まない。
//
// 使い方: node analysis/helpers/migrate-supabase-to-vault.mjs
//
// unit_id・material_id・recurrence_ruleは契約フォーマットに無いため失われる。
// このスクリプトは失われる情報がある行を検出すると実行時に警告を表示する。
import { fileURLToPath } from 'node:url';
import { restClient, printJson } from './lib.mjs';

/** study_sessions 1行 + 科目名 → StudySession(id抜き。ライタがidを採番する) */
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

/** events 1行 → ScheduleEvent(id抜き) */
export function mapEventRow(row) {
  return {
    kind: row.kind,
    title: row.title,
    due: row.due_date,
    done: row.done,
  };
}

/** plan_blocks 1行 + 科目名 → PlanBlock(id抜き)。recurrence_ruleがあればhadRecurrence:trueを付与する */
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

export async function run() {
  const client = restClient();
  const warnings = [];

  const subjects = await client.select('subjects', 'select=id,name');
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const { appendStudySession, appendScheduleEvent, appendPlanBlock } = await import('./vault/index.mjs');

  const sessions = await client.select(
    'study_sessions',
    'select=id,subject_id,unit_id,material_id,minutes,study_date,record_type,common_test_year,common_test_section,understanding,memo&order=study_date.asc',
  );
  let sessionCount = 0;
  for (const row of sessions) {
    warnings.push(...studySessionWarnings(row));
    const subjectName = subjectNameById.get(row.subject_id) ?? '不明';
    const mapped = mapStudySessionRow(row, subjectName);
    await appendStudySession(row.study_date, mapped);
    sessionCount += 1;
  }

  const events = await client.select('events', 'select=id,kind,title,due_date,done&order=due_date.asc');
  let eventCount = 0;
  for (const row of events) {
    await appendScheduleEvent(mapEventRow(row));
    eventCount += 1;
  }

  const planBlocks = await client.select(
    'plan_blocks',
    'select=id,plan_date,start_time,end_time,subject_id,memo,status,recurrence_rule&order=plan_date.asc',
  );
  let planCount = 0;
  for (const row of planBlocks) {
    const subjectName = row.subject_id ? (subjectNameById.get(row.subject_id) ?? '不明') : '不明';
    const mapped = mapPlanBlockRow(row, subjectName);
    if (mapped.hadRecurrence) {
      warnings.push(`plan_blocks ${row.id}: recurrence_rule(繰り返し設定)が失われます`);
      delete mapped.hadRecurrence;
    }
    await appendPlanBlock(row.plan_date, mapped);
    planCount += 1;
  }

  return {
    migrated: { studySessions: sessionCount, events: eventCount, planBlocks: planCount },
    warnings,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await run();
  printJson(result);
  if (result.warnings.length > 0) {
    console.warn(`\n警告: ${result.warnings.length}件の情報が移行時に失われました:`);
    for (const warning of result.warnings) console.warn(`  - ${warning}`);
  }
}
```

### Step 6.5: 成功を確認する

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs
```
期待する出力: 8件のテストが全てPASSする(`# pass 8`、`# fail 0`)。

```bash
npm run test:analysis
```
期待する出力: 既存スイート(`analysis/menubar-app/test/*.test.js analysis/test/*.test.mjs`)が全てPASSし、新規追加した`migrate-supabase-to-vault.test.mjs`のテスト数(8件)が合計に加算されている。

### Step 6.6: commit

```bash
git add analysis/helpers/migrate-supabase-to-vault.mjs analysis/test/migrate-supabase-to-vault.test.mjs
git commit -m "$(cat <<'EOF'
feat(migrate): add one-off Supabase-to-vault migration script

study_sessions/events/plan_blocksを契約フォーマットへ変換する決定的な
行マッパー(mapStudySessionRow/mapEventRow/mapPlanBlockRow)をTDDで実装し、
それらを使ってvaultへ書き込む手動1回実行用のrun()を追加した。
unit_id/material_id/recurrence_ruleは実行時に警告表示する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 移行スクリプトの手動実行手順を明記する(実データ実行は対象外)

**Files:** なし(コード変更なし。本タスクは実行手順の確定と目視確認チェックリストの明記のみ)

**Interfaces:** Consumes: `run()` (`analysis/helpers/migrate-supabase-to-vault.mjs`, Task 6で実装)

親スペックの未決事項「移行スクリプトの実行タイミング」をここで確定する: **実装完了後、対話運用(`docs/study-dialogue.md`)へ切り替える直前に手動で1回だけ実行する。** 夜間バッチ(`analysis/nightly.md`等)には一切組み込まない。実データに対する実行は本計画のタスクとしては実施せず、以下の手順を実行者(ユーザー)向けの確認事項として残す。

### Step 7.1: 実行前チェック

```bash
grep -n "STUDY_AI_VAULT_DIR" analysis/.env
```
期待する出力: 本番運用のvaultパスが設定されている行が1行表示される(未設定なら実行前に設定する)。

```bash
node --test analysis/test/migrate-supabase-to-vault.test.mjs analysis/test/vault-*.test.mjs
```
期待する出力: 移行スクリプトとNode側vaultライタの全テストがPASSする(実行前の最終確認)。

### Step 7.2: 手動実行(ユーザーが1回だけ行う。本計画の自動化タスクではない)

```bash
node analysis/helpers/migrate-supabase-to-vault.mjs
```
期待する出力: `migrated: { studySessions: <件数>, events: <件数>, planBlocks: <件数> }`のJSONと、`unit_id`/`material_id`/`recurrence_rule`を持つ行があった場合はその一覧を含む警告メッセージ。

### Step 7.3: 目視確認(自動テスト対象外)

- `vault/records/`配下に日付ごとのファイルが生成され、`## セッション`の行数がSupabase側の`study_sessions`件数と一致すること。
- `vault/schedule.md`の`## 予定`の行数が`events`件数と一致し、`done=true`の行が`- [x]`になっていること。
- `vault/plans/`配下に日付ごとのファイルが生成され、`## 計画`の行数が`plan_blocks`件数と一致すること。
- 警告に出た`unit_id`/`material_id`/`recurrence_rule`保持行を一つずつSupabase側の元データと突き合わせ、情報欠落が許容範囲であることを確認する。

このタスクにコミットは発生しない(実行結果はvault側の変更であり、リポジトリのコミット対象ではない)。

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
