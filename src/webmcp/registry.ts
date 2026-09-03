import type { WebMCPToolDef, JsonValue, ToolResult } from "./types";
import { hasWebMCP } from "./types";

type RegistryEntry = {
  def: WebMCPToolDef<Record<string, JsonValue>>;
  controller: AbortController;
  registered: boolean;
};

/** Live panel events for human-visible agent activity. */
export type RegistryActivity = {
  kind: "register" | "unregister" | "invoke" | "result" | "error";
  tool: string;
  detail?: string;
};

class ToolRegistry {
  private entries = new Map<string, RegistryEntry>();
  private listeners = new Set<(tools: string[]) => void>();
  private activityListeners = new Set<(event: RegistryActivity) => void>();

  isSupported(): boolean {
    return hasWebMCP();
  }

  statusText(): string {
    if (!this.isSupported()) return "WebMCP unavailable - using fallback";
    return `WebMCP ready - ${this.entries.size} tools registered`;
  }

  onChange(fn: (tools: string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const names = [...this.entries.keys()].filter(
      (k) => this.entries.get(k)?.registered,
    );
    for (const fn of this.listeners) fn(names);
  }

  /**
   * Subscribe to tool lifecycle and invoke events for the live agent panel.
   * Tenant isolation: activity stays in-page; nothing is sent off-origin.
   */
  onActivity(fn: (event: RegistryActivity) => void): () => void {
    this.activityListeners.add(fn);
    return () => this.activityListeners.delete(fn);
  }

  private emitActivity(event: RegistryActivity): void {
    for (const fn of this.activityListeners) fn(event);
  }

  async register(
    def: WebMCPToolDef<Record<string, JsonValue>>,
  ): Promise<AbortController> {
    const controller = new AbortController();
    const entry: RegistryEntry = { def, controller, registered: false };
    this.entries.set(def.name, entry);

    if (!this.isSupported()) {
      console.info(
        `[registry] WebMCP unavailable, faking registration for ${def.name}`,
      );
      entry.registered = true;
      this.emit();
      this.emitActivity({
        kind: "register",
        tool: def.name,
        detail: "fallback registration",
      });
      controller.signal.addEventListener("abort", () => {
        entry.registered = false;
        this.emit();
      });
      return controller;
    }

    try {
      const modelContext = document.modelContext;
      if (!modelContext) throw new Error("modelContext missing");
      await modelContext.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
          execute: async (
            args: Record<string, JsonValue>,
            opts?: { signal?: AbortSignal },
          ): Promise<ToolResult> => {
            const signal = opts?.signal ?? controller.signal;
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            this.emitActivity({
              kind: "invoke",
              tool: def.name,
              detail: "agent called tool",
            });
            try {
              const result = await def.execute(args, { signal });
              this.emitActivity({
                kind: result.isError ? "error" : "result",
                tool: def.name,
                detail: result.content[0]?.text?.slice(0, 120),
              });
              return result;
            } catch (err) {
              const error = err as Error;
              this.emitActivity({
                kind: "error",
                tool: def.name,
                detail: error.message,
              });
              throw err;
            }
          },
        },
        { signal: controller.signal },
      );
      entry.registered = true;
      console.info(`[registry] registered tool ${def.name}`);
      this.emit();
      this.emitActivity({
        kind: "register",
        tool: def.name,
        detail: "discovered via WebMCP",
      });
    } catch (err) {
      console.error(`[registry] failed to register ${def.name}`, err);
      this.entries.delete(def.name);
      throw err;
    }

    controller.signal.addEventListener("abort", () => {
      entry.registered = false;
      this.emit();
    });

    return controller;
  }

  unregister(name: string): void {
    const entry = this.entries.get(name);
    if (!entry) return;
    entry.controller.abort();
    entry.registered = false;
    this.entries.delete(name);
    this.emit();
    this.emitActivity({ kind: "unregister", tool: name });
    console.info(`[registry] unregistered ${name}`);
  }

  unregisterAll(): void {
    for (const name of [...this.entries.keys()]) this.unregister(name);
  }

  list(): string[] {
    return [...this.entries.entries()]
      .filter(([, e]) => e.registered)
      .map(([n]) => n);
  }

  async invokeFallback(
    name: string,
    args: Record<string, JsonValue>,
  ): Promise<ToolResult> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Tool ${name} not found`);
    this.emitActivity({
      kind: "invoke",
      tool: name,
      detail: "debug invoke",
    });
    try {
      const result = await entry.def.execute(args, {
        signal: entry.controller.signal,
      });
      this.emitActivity({
        kind: result.isError ? "error" : "result",
        tool: name,
        detail: result.content[0]?.text?.slice(0, 120),
      });
      return result;
    } catch (err) {
      const error = err as Error;
      this.emitActivity({ kind: "error", tool: name, detail: error.message });
      throw err;
    }
  }

  getDef(name: string): WebMCPToolDef<Record<string, JsonValue>> | undefined {
    return this.entries.get(name)?.def;
  }
}

export const registry = new ToolRegistry();

if (typeof window !== "undefined") {
  window.HUMANLOCK_registry = registry;
}
