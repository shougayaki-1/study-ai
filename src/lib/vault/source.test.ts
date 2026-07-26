import { afterEach, describe, expect, it } from "vitest";
import { getVaultSource } from "./source";

describe("getVaultSource", () => {
  const originalEnv = process.env.STUDY_AI_VAULT_SOURCE;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalEnv;
  });

  it("defaults to fs when unset", () => {
    delete process.env.STUDY_AI_VAULT_SOURCE;
    expect(getVaultSource()).toBe("fs");
  });

  it("defaults to fs for an unrecognized value", () => {
    process.env.STUDY_AI_VAULT_SOURCE = "something-else";
    expect(getVaultSource()).toBe("fs");
  });

  it("returns supabase when explicitly set", () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    expect(getVaultSource()).toBe("supabase");
  });
});
