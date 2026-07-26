import { describe, expect, it } from "vitest";
import * as vault from "./index";

describe("vault barrel export", () => {
  it("re-exports every Foundation helper by its contract name", () => {
    expect(typeof vault.getVaultRoot).toBe("function");
    expect(typeof vault.parseFrontmatter).toBe("function");
    expect(typeof vault.stringifyFrontmatter).toBe("function");
    expect(typeof vault.readVaultFile).toBe("function");
    expect(typeof vault.listReports).toBe("function");
    expect(typeof vault.parseConfirmTodos).toBe("function");
    expect(typeof vault.appendCorrection).toBe("function");
    expect(typeof vault.parseStudySessions).toBe("function");
    expect(typeof vault.formatStudySessionLine).toBe("function");
    expect(typeof vault.readStudyRecord).toBe("function");
    expect(typeof vault.listStudyRecordDates).toBe("function");
  });
});
