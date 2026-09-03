import { describe, expect, it } from "vitest";
import { hasWebMCP } from "../src/webmcp/types";
import type { ModelContext } from "../src/webmcp/types";

describe("hasWebMCP", () => {
  it("is false without modelContext", () => {
    delete document.modelContext;
    expect(hasWebMCP()).toBe(false);
  });

  it("is true when registerTool exists", () => {
    const ctx: ModelContext = {
      registerTool: async () => {},
    };
    document.modelContext = ctx;
    expect(hasWebMCP()).toBe(true);
    delete document.modelContext;
  });
});
