import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registry, WebMCPRequiredError } from "../src/webmcp/registry";
import type { JsonValue, ToolResult, WebMCPToolDef } from "../src/webmcp/types";
import { clearWebMCPMock, installWebMCPMock } from "./helpers";

function cleanRegistry(): void {
  registry.unregisterAll();
}

describe("registry without WebMCP", () => {
  beforeEach(() => {
    cleanRegistry();
    clearWebMCPMock();
  });
  afterEach(() => {
    cleanRegistry();
    vi.restoreAllMocks();
    installWebMCPMock();
  });

  it("isSupported returns false when WebMCP unavailable", () => {
    expect(registry.isSupported()).toBe(false);
    expect(registry.statusText()).toContain("required");
  });

  it("register rejects when WebMCP unavailable", async () => {
    await expect(
      registry.register({
        name: "test_tool",
        description: "test tool",
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
      }),
    ).rejects.toBeInstanceOf(WebMCPRequiredError);
    expect(registry.list()).toHaveLength(0);
  });
});

describe("registry with WebMCP available", () => {
  beforeEach(() => {
    cleanRegistry();
    installWebMCPMock();
  });
  afterEach(() => {
    cleanRegistry();
    clearWebMCPMock();
    vi.restoreAllMocks();
    installWebMCPMock();
  });

  it("registers tool and marks registered", async () => {
    const def = {
      name: "test_tool",
      description: "test tool",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: async (): Promise<ToolResult> => ({
        content: [{ type: "text", text: "ok" }],
      }),
    };
    const controller = await registry.register(def);
    expect(controller).toBeInstanceOf(AbortController);
    expect(registry.list()).toContain("test_tool");
    expect(registry.getDef("test_tool")).toBeDefined();
  });

  it("onChange fires on register and unregister", async () => {
    const spy = vi.fn();
    const off = registry.onChange(spy);
    await registry.register({
      name: "tool_a",
      description: "a",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: async () => ({ content: [{ type: "text", text: "a" }] }),
    });
    expect(spy).toHaveBeenCalledWith(expect.arrayContaining(["tool_a"]));
    const callsAfterRegister = spy.mock.calls.length;
    registry.unregister("tool_a");
    expect(spy).toHaveBeenLastCalledWith([]);
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterRegister);
    const countAfterUnregister = spy.mock.calls.length;
    off();
    await registry.register({
      name: "tool_b",
      description: "b",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: async () => ({ content: [{ type: "text", text: "b" }] }),
    });
    expect(spy.mock.calls.length).toBe(countAfterUnregister);
  });

  it("unregister removes tool and emit", async () => {
    await registry.register({
      name: "to_remove",
      description: "remove me",
      execute: async () => ({ content: [{ type: "text", text: "bye" }] }),
    });
    expect(registry.list()).toContain("to_remove");
    registry.unregister("to_remove");
    expect(registry.list()).not.toContain("to_remove");
    expect(registry.getDef("to_remove")).toBeUndefined();
  });

  it("unregisterAll clears all", async () => {
    await registry.register({
      name: "a",
      description: "a",
      execute: async () => ({ content: [{ type: "text", text: "a" }] }),
    });
    await registry.register({
      name: "b",
      description: "b",
      execute: async () => ({ content: [{ type: "text", text: "b" }] }),
    });
    expect(registry.list()).toHaveLength(2);
    registry.unregisterAll();
    expect(registry.list()).toHaveLength(0);
  });

  it("unregister on unknown name is no-op", () => {
    expect(() => registry.unregister("ghost")).not.toThrow();
  });

  it("getDef returns registered tool definition", async () => {
    await registry.register({
      name: "echo",
      description: "echo",
      inputSchema: {
        type: "object",
        properties: { msg: { type: "string" } },
        required: ["msg"],
      },
      execute: async (args) => ({
        content: [{ type: "text", text: String(args.msg) }],
        data: { echo: args.msg as JsonValue },
      }),
    });
    const def = registry.getDef("echo");
    expect(def).toBeDefined();
    const res = await def!.execute({ msg: "hello" });
    expect(res.content[0].text).toBe("hello");
    expect(res.data?.echo).toBe("hello");
  });

  it("abort signal aborts and emits", async () => {
    const spy = vi.fn();
    registry.onChange(spy);
    const controller = await registry.register({
      name: "abortable",
      description: "abort me",
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    expect(registry.list()).toContain("abortable");
    controller.abort();
    expect(registry.list()).not.toContain("abortable");
    expect(spy).toHaveBeenCalledWith([]);
  });

  it("statusText reports ready when supported", async () => {
    expect(registry.isSupported()).toBe(true);
    await registry.register({
      name: "one",
      description: "one",
      execute: async () => ({ content: [{ type: "text", text: "one" }] }),
    });
    expect(registry.statusText()).toContain("ready");
  });

  it("registers via document.modelContext.registerTool", async () => {
    const mockRegister = vi.fn(async () => {});
    document.modelContext = { registerTool: mockRegister };

    const def: WebMCPToolDef<Record<string, JsonValue>> = {
      name: "webmcp_tool",
      description: "uses webmcp",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: async () => ({ content: [{ type: "text", text: "webmcp ok" }] }),
    };
    const controller = await registry.register(def);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ name: "webmcp_tool" }),
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(registry.list()).toContain("webmcp_tool");
  });

  it("wraps execute to respect AbortSignal", async () => {
    const mockRegister = vi.fn(
      async (def: {
        execute: (
          args: Record<string, JsonValue>,
          opts?: { signal?: AbortSignal },
        ) => Promise<ToolResult>;
      }) => {
        (document as { _lastExecute?: unknown })._lastExecute = def.execute;
      },
    );
    document.modelContext = { registerTool: mockRegister };

    const inner = vi.fn(async () => ({ content: [{ type: "text", text: "inner" }] }));
    const def: WebMCPToolDef<Record<string, JsonValue>> = {
      name: "wrapped",
      description: "wrapped execute",
      execute: inner as (args: Record<string, JsonValue>, opts?: { signal?: AbortSignal }) => Promise<ToolResult>,
    };
    const controller = await registry.register(def as WebMCPToolDef<Record<string, JsonValue>>);
    const wrapped = (
      mockRegister.mock.calls[0][0] as {
        execute: (
          a: Record<string, JsonValue>,
          o?: { signal?: AbortSignal },
        ) => Promise<ToolResult>;
      }
    ).execute;
    controller.abort();
    await expect(wrapped({}, { signal: controller.signal })).rejects.toThrow();
    expect(inner).not.toHaveBeenCalled();
  });

  it("throws and removes entry if registerTool fails", async () => {
    const mockRegister = vi.fn(async () => {
      throw new Error("denied");
    });
    document.modelContext = { registerTool: mockRegister };
    await expect(
        registry.register({
        name: "fail",
      description: "fail",
      execute: async () => ({ content: [{ type: "text", text: "fail" }] }),
    } as WebMCPToolDef<Record<string, JsonValue>>)).rejects.toThrow("denied");
    expect(registry.list()).not.toContain("fail");
    expect(registry.getDef("fail")).toBeUndefined();
  });
});
