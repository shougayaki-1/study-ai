import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateInTimeZone } from "@/lib/date";

export const dynamic = "force-dynamic";

type Subscription = { id: string; endpoint: string; keys_json: { p256dh: string; auth: string } };

function jstDate() {
  return formatDateInTimeZone(new Date());
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const today = jstDate();
  const [sessionsResult, subscriptionsResult] = await Promise.all([
    supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("study_date", today),
    supabase.from("push_subscriptions").select("id,endpoint,keys_json"),
  ]);
  if (sessionsResult.error || subscriptionsResult.error) {
    return NextResponse.json({ error: sessionsResult.error?.message ?? subscriptionsResult.error?.message }, { status: 500 });
  }
  if ((sessionsResult.count ?? 0) > 0) return NextResponse.json({ sent: 0, reason: "already-recorded" });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return NextResponse.json({ sent: 0, warning: "VAPID keys not configured" });
  webpush.setVapidDetails("mailto:example@example.com", publicKey, privateKey);
  const payload = JSON.stringify({ title: "今日の勉強を記録しよう", body: "おおよその時間で大丈夫です。今日の学習をまとめて残しましょう。", url: "/record?mode=daily" });
  const staleIds: string[] = [];
  let sent = 0;
  await Promise.all(((subscriptionsResult.data ?? []) as Subscription[]).map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys_json }, payload);
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) staleIds.push(subscription.id);
    }
  }));
  if (staleIds.length) await supabase.from("push_subscriptions").delete().in("id", staleIds);
  return NextResponse.json({ sent, removed: staleIds.length, today });
}
