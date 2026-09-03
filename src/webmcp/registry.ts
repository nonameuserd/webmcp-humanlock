import type { WebMCPToolDef, JsonValue, ToolResult } from "./types";
import { hasWebMCP } from "./types";

type RegistryEntry = {
  def: WebMCPToolDef<Record<string, JsonValue>>;
  controller: AbortController;
  registered: boolean;
};

class ToolRegistry {
  private entries = new Map<string, RegistryEntry>();
  private listeners = new Set<(tools: string[]) => void>();

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
            return def.execute(args, { signal });
          },
        },
        { signal: controller.signal },
      );
      entry.registered = true;
      console.info(`[registry] registered tool ${def.name}`);
      this.emit();
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
    return entry.def.execute(args, { signal: entry.controller.signal });
  }

  getDef(name: string): WebMCPToolDef<Record<string, JsonValue>> | undefined {
    return this.entries.get(name)?.def;
  }
}

export const registry = new ToolRegistry();

if (typeof window !== "undefined") {
  window.HUMANLOCK_registry = registry;
}
