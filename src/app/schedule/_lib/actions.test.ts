import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSchedule } from "@/lib/vault";
import { toggleScheduleEventDone } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("toggleScheduleEventDone", () => {
  let vaultDir: string;
  const originalVaultDir = process.env.STUDY_AI_VAULT_DIR;
  const originalSource = process.env.STUDY_AI_VAULT_SOURCE;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-schedule-actions-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
    delete process.env.STUDY_AI_VAULT_SOURCE;
    const raw = [
      "---",
      "type: schedule",
      "schema_version: 1",
      "---",
      "",
      "## 予定",
      "- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01",
    ].join("\n");
    await writeFile(path.join(vaultDir, "schedule.md"), raw, "utf8");
  });

  afterEach(async () => {
    if (originalVaultDir === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalVaultDir;
    if (originalSource === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalSource;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("toggles the event when the source is fs (local, default)", async () => {
    await toggleScheduleEventDone({ id: "ev-1", done: true });
    const events = await readSchedule();
    expect(events[0].done).toBe(true);
  });

  it("throws and leaves the file untouched when STUDY_AI_VAULT_SOURCE=supabase", async () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    await expect(toggleScheduleEventDone({ id: "ev-1", done: true })).rejects.toThrow(/read-only/);
    delete process.env.STUDY_AI_VAULT_SOURCE;
    const events = await readSchedule();
    expect(events[0].done).toBe(false);
  });
});
