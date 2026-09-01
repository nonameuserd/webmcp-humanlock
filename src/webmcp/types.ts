export type VaultLockId = "blur" | "swarm" | "whisper" | "lie" | "handshake";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: readonly string[] | string[];
  default?: JsonPrimitive;
  items?: JsonSchema;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  data?: Record<string, JsonValue>;
  isError?: boolean;
};

export type FreezeFrameArgs = { timestamp: number };
export type FilterByVibeArgs = { description: string };
export type EmptyArgs = Record<string, never>;

export type VaultToolArgs = FreezeFrameArgs | FilterByVibeArgs | EmptyArgs;

export type WebMCPToolDef<
  TArgs extends Record<string, JsonValue> = Record<string, JsonValue>,
> = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  execute: (
    args: TArgs,
    opts?: { signal?: AbortSignal },
  ) => Promise<ToolResult> | ToolResult;
};

export type LockStatus = "locked" | "active" | "solved" | "failed";

export type VaultState = {
  status: "idle" | "running" | "decaying" | "unlocked" | "dead";
  currentLock: VaultLockId | null;
  solved: Record<VaultLockId, boolean>;
  codes: Record<VaultLockId, string>;
  vaultCode: string;
  startedAt: number | null;
  unlockedAt: number | null;
};

export type RegisteredTool = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  origin?: string;
};

export type ModelContext = {
  registerTool: (
    def: {
      name: string;
      description: string;
      inputSchema?: JsonSchema;
      execute: (
        args: Record<string, JsonValue>,
        opts?: { signal?: AbortSignal },
      ) => Promise<ToolResult>;
    },
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void>;
  getTools?: (opts?: { fromOrigins?: string[] }) => Promise<RegisteredTool[]>;
  executeTool?: (
    tool: RegisteredTool,
    args: Record<string, JsonValue>,
    opts?: { signal?: AbortSignal },
  ) => Promise<ToolResult>;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
};

export type HumanLockDebug = {
  state: () => VaultState;
  registry: {
    list: () => string[];
    getDef: (name: string) => WebMCPToolDef<Record<string, JsonValue>> | undefined;
  };
  enter: () => void;
  reset: () => void;
  locks: Record<VaultLockId, { toolName: string }>;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    /** Deprecated in Chrome 150; kept for transitional browsers. */
    modelContext?: ModelContext;
  }
  interface Window {
    HUMANLOCK: HumanLockDebug;
    HUMANLOCK_registry: {
      list: () => string[];
      getDef: (
        name: string,
      ) => WebMCPToolDef<Record<string, JsonValue>> | undefined;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

/** Prefer document.modelContext; fall back to navigator.modelContext during transition. */
export function getModelContext(): ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  const docCtx = document.modelContext;
  if (typeof docCtx?.registerTool === "function") return docCtx;
  const navCtx = navigator.modelContext;
  if (typeof navCtx?.registerTool === "function") return navCtx;
  return undefined;
}

export function hasWebMCP(): boolean {
  return typeof getModelContext()?.registerTool === "function";
}

/** Poll until WebMCP appears (ChatGPT may inject modelContext after first paint). */
export function waitForWebMCP(opts?: {
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const intervalMs = opts?.intervalMs ?? 250;
  if (hasWebMCP()) return Promise.resolve(true);
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (hasWebMCP()) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, intervalMs);
  });
}
