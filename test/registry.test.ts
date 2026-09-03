import { afterEach, describe, expect, it, vi } from "vitest";
import { registry } from "../src/webmcp/registry";
import type { JsonValue, ModelContext, ToolResult } from "../src/webmcp/types";

const sampleDef = {
  name: "probe_tool",
  description: "probe",
  inputSchema: { type: "object", properties: {}, required: [] as string[] },
  execute: async (
    args: Record<string, JsonValue>,
  ): Promise<ToolResult> => ({
    content: [{ type: "text", text: `ok ${String(args.n ?? "")}` }],
  }),
};

describe("ToolRegistry", () => {
  afterEach(() => {
    registry.unregisterAll();
    delete document.modelContext;
  });

  it("registers in fallback mode and invokeFallback executes", async () => {
    delete document.modelContext;
    expect(registry.isSupported()).toBe(false);
    expect(registry.statusText()).toMatch(/unavailable/);
    await registry.register(sampleDef);
    expect(registry.list()).toEqual(["probe_tool"]);
    expect(registry.getDef("probe_tool")?.name).toBe("probe_tool");
    const res = await registry.invokeFallback("probe_tool", { n: 1 });
    expect(res.content[0]?.text).toBe("ok 1");
  });

  it("notifies listeners and unsubscribe stops updates", async () => {
    const seen: string[][] = [];
    const off = registry.onChange((tools) => {
      seen.push(tools);
    });
    await registry.register(sampleDef);
    expect(seen.at(-1)).toEqual(["probe_tool"]);
    off();
    registry.unregister("probe_tool");
    expect(seen.filter((row) => row.length === 0)).toHaveLength(0);
  });

  it("unregister missing name is a no-op; unknown invoke throws", async () => {
    registry.unregister("nope");
    await expect(registry.invokeFallback("nope", {})).rejects.toThrow(
      "Tool nope not found",
    );
  });

  it("registers through document.modelContext when present", async () => {
    const registerTool = vi.fn(async () => {});
    const ctx: ModelContext = { registerTool };
    document.modelContext = ctx;
    expect(registry.isSupported()).toBe(true);
    expect(registry.statusText()).toMatch(/WebMCP ready/);
    await registry.register(sampleDef);
    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registry.list()).toContain("probe_tool");
  });

  it("deletes the entry when modelContext.registerTool throws", async () => {
    const ctx: ModelContext = {
      registerTool: async () => {
        throw new Error("denied");
      },
    };
    document.modelContext = ctx;
    await expect(registry.register(sampleDef)).rejects.toThrow("denied");
    expect(registry.list()).toEqual([]);
  });

  it("aborts execute when the registration signal is aborted", async () => {
    let capturedExecute: (
      args: Record<string, JsonValue>,
      opts?: { signal?: AbortSignal },
    ) => Promise<ToolResult> = async () => ({
      content: [{ type: "text", text: "unset" }],
    });
    const ctx: ModelContext = {
      registerTool: async (def) => {
        capturedExecute = def.execute;
      },
    };
    document.modelContext = ctx;
    const controller = await registry.register(sampleDef);
    controller.abort();
    await expect(
      capturedExecute({}, { signal: controller.signal }),
    ).rejects.toThrow(/Aborted/);
  });
});
