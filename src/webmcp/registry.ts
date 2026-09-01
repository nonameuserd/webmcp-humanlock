import type { WebMCPToolDef, JsonValue, ToolResult } from "./types";
import { getModelContext, hasWebMCP } from "./types";

export class WebMCPRequiredError extends Error {
  constructor() {
    super(
      "WebMCP required: document.modelContext.registerTool is not available",
    );
    this.name = "WebMCPRequiredError";
  }
}

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
    if (!this.isSupported()) return "WebMCP required";
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

  private async bindToWebMCP(entry: RegistryEntry): Promise<void> {
    const modelContext = getModelContext();
    if (!modelContext) throw new WebMCPRequiredError();
    const { def, controller } = entry;
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
    console.info(`[registry] registered tool ${def.name}`);
  }

  async register(
    def: WebMCPToolDef<Record<string, JsonValue>>,
  ): Promise<AbortController> {
    if (!this.isSupported()) {
      throw new WebMCPRequiredError();
    }

    const controller = new AbortController();
    const entry: RegistryEntry = { def, controller, registered: false };
    this.entries.set(def.name, entry);
    controller.signal.addEventListener("abort", () => {
      entry.registered = false;
      this.emit();
    });

    try {
      await this.bindToWebMCP(entry);
      entry.registered = true;
      this.emit();
    } catch (err) {
      console.error(`[registry] failed to register ${def.name}`, err);
      this.entries.delete(def.name);
      throw err;
    }

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

  getDef(name: string): WebMCPToolDef<Record<string, JsonValue>> | undefined {
    return this.entries.get(name)?.def;
  }
}

export const registry = new ToolRegistry();

if (typeof window !== "undefined") {
  window.HUMANLOCK_registry = registry;
}
