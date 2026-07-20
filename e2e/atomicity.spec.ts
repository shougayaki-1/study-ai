import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/lib/supabase/types";

async function authenticatedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase E2E environment variables are missing");
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: process.env.E2E_USER_EMAIL ?? "e2e@example.com",
    password: process.env.E2E_USER_PASSWORD ?? "E2e-test-password-2026",
  });
  if (error) throw error;
  return client;
}

test("event and link insert roll back together", async () => {
  const db = await authenticatedClient();
  const title = `rollback-${crypto.randomUUID()}`;
  const { error } = await db.rpc("save_event_with_links", {
    p_event_id: "",
    p_kind: "assignment",
    p_title: title,
    p_due_date: "2026-07-19",
    p_subject_id: "",
    p_unit_id: crypto.randomUUID(),
  });
  expect(error).not.toBeNull();
  const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("title", title);
  expect(count).toBe(0);
});

test("study-session batch rolls back when one row is invalid", async () => {
  const db = await authenticatedClient();
  const { data: subject, error: subjectError } = await db.from("subjects").select("id").limit(1).single();
  if (subjectError) throw subjectError;
  const memo = `rollback-${crypto.randomUUID()}`;
  const base = {
    subject_id: subject.id,
    unit_id: null,
    material_id: null,
    study_date: "2026-07-19",
    record_type: "material",
    common_test_year: null,
    common_test_section: null,
    understanding: "uncertain",
    memo,
    range_text: null,
    topic_tag: null,
  };
  const { error } = await db.rpc("create_study_session_batch", {
    p_sessions: [{ ...base, minutes: 30 }, { ...base, minutes: 0 }],
    p_topic_tags: [],
    p_plan_block_id: "",
  });
  expect(error).not.toBeNull();
  const { count } = await db.from("study_sessions").select("id", { count: "exact", head: true }).eq("memo", memo);
  expect(count).toBe(0);
});

test("material-unit replacement retains its previous mapping when a new mapping is invalid", async () => {
  const db = await authenticatedClient();
  const { data: subject, error: subjectError } = await db.from("subjects").select("id").limit(1).single();
  if (subjectError) throw subjectError;
  const { data: unit, error: unitError } = await db.from("units").select("id").eq("subject_id", subject.id).limit(1).single();
  if (unitError) throw unitError;
  const { data: material, error: materialError } = await db.from("materials")
    .insert({ subject_id: subject.id, name: `rollback-${crypto.randomUUID()}`, kind: "問題集" })
    .select("id")
    .single();
  if (materialError) throw materialError;

  try {
    const { error: initialError } = await db.rpc("replace_material_units", { p_material_id: material.id, p_unit_ids: [unit.id] });
    if (initialError) throw initialError;
    const { error } = await db.rpc("replace_material_units", { p_material_id: material.id, p_unit_ids: [crypto.randomUUID()] });
    expect(error).not.toBeNull();
    const { data: mappings, error: readError } = await db.from("material_units").select("unit_id").eq("material_id", material.id);
    if (readError) throw readError;
    expect(mappings).toEqual([{ unit_id: unit.id }]);
  } finally {
    await db.from("materials").delete().eq("id", material.id);
  }
});

test("recurring plan validation leaves no template behind", async () => {
  const db = await authenticatedClient();
  const memo = `rollback-${crypto.randomUUID()}`;
  const { error } = await db.rpc("create_recurring_plan", {
    p_plan_date: "2026-07-19",
    p_start_time: "20:00",
    p_end_time: "19:00",
    p_subject_id: "",
    p_unit_id: "",
    p_memo: memo,
    p_weekdays: ["sun"],
    p_weeks: 6,
  });
  expect(error).not.toBeNull();
  const { count } = await db.from("plan_blocks").select("id", { count: "exact", head: true }).eq("memo", memo);
  expect(count).toBe(0);
});
