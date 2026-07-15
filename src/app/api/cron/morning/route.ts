import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  keys_json: { p256dh: string; auth: string };
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Vercel Cron(毎朝6:30 JST)から呼ばれる。
// 7日以内の未完了 events と当日の review_tasks を全購読者にPush通知する。
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }

  webpush.setVapidDetails("mailto:example@example.com", vapidPublicKey, vapidPrivateKey);

  const supabase = createAdminClient();
  const today = todayStr();
  const upcoming = addDays(today, 7);

  const [eventsRes, reviewTasksRes, subsRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, due_date, kind")
      .eq("done", false)
      .gte("due_date", today)
      .lte("due_date", upcoming)
      .order("due_date", { ascending: true }),
    supabase
      .from("review_tasks")
      .select("id, unit_id, material_id, range_text, reason, due_date, done")
      .eq("due_date", today)
      .eq("done", false)
      .order("created_at", { ascending: true }),
    supabase.from("push_subscriptions").select("id, endpoint, keys_json"),
  ]);

  if (eventsRes.error || reviewTasksRes.error || subsRes.error) {
    return NextResponse.json(
      {
        error: "supabase query failed",
        details: eventsRes.error?.message ?? reviewTasksRes.error?.message ?? subsRes.error?.message,
      },
      { status: 500 },
    );
  }

  const events = eventsRes.data ?? [];
  const reviewTasks = reviewTasksRes.data ?? [];
  const subscriptions = (subsRes.data ?? []) as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, events: events.length, reviewTasks: reviewTasks.length });
  }

  const bodyLines: string[] = [];
  if (events.length > 0) {
    bodyLines.push(`締切7日以内: ${events.length}件(${events[0].title} 他)`);
  }
  if (reviewTasks.length > 0) {
    bodyLines.push(`今日の復習提案: ${reviewTasks.length}件(${reviewTasks[0].reason ?? reviewTasks[0].range_text ?? ""})`);
  }
  if (bodyLines.length === 0) {
    bodyLines.push("今日の予定・復習提案はありません");
  }

  const payload = JSON.stringify({
    title: "study-ai 朝の通知",
    body: bodyLines.join(" / "),
    url: "/",
  });

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys_json,
          },
          payload,
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({
    sent,
    removed: staleIds.length,
    events: events.length,
    reviewTasks: reviewTasks.length,
  });
}
