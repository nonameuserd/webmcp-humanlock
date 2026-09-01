import { registry } from "../src/webmcp/registry";
import type { JsonValue, ToolResult } from "../src/webmcp/types";

/** Execute a registered tool handler directly (tests only). */
export async function executeTool(
  name: string,
  args: Record<string, JsonValue>,
): Promise<ToolResult> {
  const def = registry.getDef(name);
  if (!def) throw new Error(`Tool ${name} not found`);
  return def.execute(args);
}

/** Minimal WebMCP mock so locks can register tools in jsdom. */
export function installWebMCPMock(): void {
  document.modelContext = {
    registerTool: async () => {},
    getTools: async () => [],
  };
}

export function clearWebMCPMock(): void {
  // @ts-expect-error test cleanup
  delete document.modelContext;
  // @ts-expect-error test cleanup
  delete navigator.modelContext;
}
