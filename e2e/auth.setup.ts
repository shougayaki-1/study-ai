import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";
const email = process.env.E2E_USER_EMAIL ?? "e2e@example.com";
const password = process.env.E2E_USER_PASSWORD ?? "E2e-test-password-2026";

setup("authenticate", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase E2E environment variables are missing");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data: users, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  if (!users.users.some((user) => user.email === email)) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
  }

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: authFile });
});
