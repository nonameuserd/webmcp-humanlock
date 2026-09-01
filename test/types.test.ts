import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { hasWebMCP, getModelContext, waitForWebMCP } from "../src/webmcp/types";

describe("hasWebMCP", () => {
  afterEach(() => {
    delete document.modelContext;
    delete navigator.modelContext;
  });

  it("returns false when document.modelContext missing", () => {
    delete document.modelContext;
    expect(hasWebMCP()).toBe(false);
  });

  it("returns false when registerTool missing", () => {
    document.modelContext = {} as typeof document.modelContext;
    expect(hasWebMCP()).toBe(false);
  });

  it("returns false when document undefined guard (simulate via falsy)", () => {
    // can't easily make document undefined in jsdom, just test with undefined registerTool
    // @ts-expect-error mock
    document.modelContext = { registerTool: undefined } as typeof document.modelContext;
    expect(hasWebMCP()).toBe(false);
  });

  it("returns true when registerTool exists on document", () => {
    document.modelContext = { registerTool: async () => {} } as typeof document.modelContext;
    expect(hasWebMCP()).toBe(true);
    expect(getModelContext()).toBe(document.modelContext);
  });

  it("falls back to navigator.modelContext", () => {
    delete document.modelContext;
    navigator.modelContext = { registerTool: async () => {} } as typeof navigator.modelContext;
    expect(hasWebMCP()).toBe(true);
    expect(getModelContext()).toBe(navigator.modelContext);
  });
});

describe("waitForWebMCP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete document.modelContext;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete document.modelContext;
  });

  it("resolves true immediately when already available", async () => {
    document.modelContext = { registerTool: async () => {} } as typeof document.modelContext;
    await expect(waitForWebMCP({ timeoutMs: 1000 })).resolves.toBe(true);
  });

  it("resolves true when modelContext appears later", async () => {
    const promise = waitForWebMCP({ timeoutMs: 2000, intervalMs: 100 });
    vi.advanceTimersByTime(250);
    document.modelContext = { registerTool: async () => {} } as typeof document.modelContext;
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false after timeout", async () => {
    const promise = waitForWebMCP({ timeoutMs: 500, intervalMs: 100 });
    vi.advanceTimersByTime(600);
    await expect(promise).resolves.toBe(false);
  });
});
