import { afterEach, describe, expect, it } from "vitest";
import { getVaultRoot } from "./root";

describe("getVaultRoot", () => {
  const original = process.env.STUDY_AI_VAULT_DIR;

  afterEach(() => {
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  });

  it("returns the configured vault root", () => {
    process.env.STUDY_AI_VAULT_DIR = "/tmp/vault";
    expect(getVaultRoot()).toBe("/tmp/vault");
  });

  it("throws when STUDY_AI_VAULT_DIR is not set", () => {
    delete process.env.STUDY_AI_VAULT_DIR;
    expect(() => getVaultRoot()).toThrow("STUDY_AI_VAULT_DIR is not set");
  });
});
