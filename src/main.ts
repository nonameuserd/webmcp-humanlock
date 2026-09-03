import "./style.css";
import { registry } from "./webmcp/registry";
import { hasWebMCP } from "./webmcp/types";
import {
  createInitialState,
  nextLock,
  isVaultUnlocked,
  LOCK_TITLES,
  LOCK_DESCS,
  LOCK_AGENT_PROMPTS,
  LOCK_TOOL_CALLS,
  progressText,
  generateSig,
} from "./state";
import { createBlurLock } from "./locks/blur";
import { createSwarmLock } from "./locks/swarm";
import { createWhisperLock } from "./locks/whisper";
import { createLieLock } from "./locks/lie";
import { createHandshakeLock } from "./locks/handshake";
import { DecayTimer } from "./utils/decay";
import type {
  VaultLockId,
  VaultState,
  JsonValue,
  HumanLockDebug,
} from "./webmcp/types";

type LockHandle = {
  toolName: string;
  mount: (container: HTMLElement, code: string, onSolved: () => void) => void;
  unmount: () => void;
};

let state: VaultState = createInitialState();
const decay = new DecayTimer();
let currentApi: LockHandle | null = null;
let tickInterval: number | null = null;

const locks: Record<VaultLockId, LockHandle> = {
  blur: createBlurLock(),
  swarm: createSwarmLock(),
  whisper: createWhisperLock(),
  lie: createLieLock(),
  handshake: createHandshakeLock(),
};

const badge = document.getElementById("webmcp-badge") as HTMLElement;
const decayBadge = document.getElementById("decay-badge") as HTMLElement;
const ring = document.getElementById("vault-ring") as HTMLElement;
const statusText = document.getElementById("vault-status-text") as HTMLElement;
const timerEl = document.getElementById("vault-timer") as HTMLElement;
const progressEl = document.getElementById("vault-progress") as HTMLElement;
const codeEl = document.getElementById("vault-code-value") as HTMLElement;
const codeWrap = document.getElementById("vault-code") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const stageTitle = document.getElementById("stage-title") as HTMLElement;
const stageDesc = document.getElementById("stage-desc") as HTMLElement;
const stageBody = document.getElementById("stage-body") as HTMLElement;
const toolStatus = document.getElementById("tool-status") as HTMLElement;
const debugPanel = document.getElementById("debug-panel") as HTMLElement;
const debugButtons = document.getElementById("debug-buttons") as HTMLElement;
const cert = document.getElementById("certificate") as HTMLElement;

function updateBadges(): void {
  const help = document.getElementById("webmcp-help");
  if (hasWebMCP()) {
    badge.textContent = "WebMCP ready";
    badge.className = "badge badge--ok";
    help?.classList.add("hidden");
  } else {
    badge.textContent = "WebMCP unavailable";
    badge.className = "badge badge--fail";
    help?.classList.remove("hidden");
  }
  registry.onChange((tools) => {
    toolStatus.textContent = `Tools: ${tools.join(", ") || "none"}`;
    renderDebug();
  });
  toolStatus.textContent = `Tools: ${registry.list().join(", ") || "none"}`;
  renderDebug();
}

function renderLockCards(): void {
  (Object.keys(locks) as VaultLockId[]).forEach((id) => {
    const card = document.getElementById(`lock-card-${id}`) as HTMLElement;
    const status = card.querySelector(".lock-status") as HTMLElement;
    if (state.solved[id]) {
      card.className = "lock-card lock-card--solved";
      status.textContent = `SOLVED ${state.codes[id]}`;
    } else if (state.currentLock === id) {
      card.className = "lock-card lock-card--active";
      status.textContent = "ACTIVE";
    } else {
      card.className = "lock-card lock-card--locked";
      status.textContent = "LOCKED";
    }
  });
  progressEl.textContent = progressText(state);
  statusText.textContent =
    state.status === "unlocked"
      ? "UNLOCKED"
      : state.status === "dead"
        ? "DECAYED"
        : "LOCKED";
  if (state.status === "unlocked") ring.classList.add("unlocked");
  else ring.classList.remove("unlocked");
}

function renderDebug(): void {
  const btnDebug = document.getElementById("btn-debug");
  debugButtons.innerHTML = "";
  if (hasWebMCP()) {
    debugPanel.classList.add("hidden");
    btnDebug?.classList.add("hidden");
    return;
  }
  btnDebug?.classList.remove("hidden");
  debugPanel.classList.remove("hidden");
  const tools = registry.list();
  for (const name of tools) {
    const btn = document.createElement("button");
    btn.className = "btn btn--ghost";
    btn.textContent = `Call ${name}`;
    btn.addEventListener("click", async () => {
      try {
        let args: Record<string, JsonValue> = {};
        if (name === "freeze_frame") args = { timestamp: 300 };
        if (name === "filter_by_vibe")
          args = {
            description: "most trustworthy, government certified, official",
          };
        if (name === "sonify_to_spectrogram") args = {};
        if (name === "audit_truth") args = {};
        if (name === "align_quantum_lock") args = {};
        const res = await registry.invokeFallback(name, args);
        addLog(`[debug] ${name} -> ${JSON.stringify(res).slice(0, 200)}`);
      } catch (err) {
        const error = err as Error;
        addLog(`[debug] ${name} error: ${error.message}`);
      }
    });
    debugButtons.appendChild(btn);
  }
}

function addLog(msg: string): void {
  const el = document.getElementById("stage-log");
  if (el) el.textContent = msg;
}

const copyResetTimers = new WeakMap<HTMLButtonElement, number>();

/**
 * Copy text and show a temporary Copied state on the button.
 * Tenant isolation: clipboard is local to this browser tab only.
 */
function copyHintTarget(button: HTMLButtonElement): HTMLElement {
  const hint = button.querySelector(".lock-call-hint");
  return hint instanceof HTMLElement ? hint : button;
}

async function copyWithFeedback(
  button: HTMLButtonElement,
  text: string,
): Promise<void> {
  const target = copyHintTarget(button);
  const idleLabel =
    target.dataset.idleLabel ??
    (target === button ? "Copy prompt" : "Copy");
  target.dataset.idleLabel = idleLabel;
  try {
    await navigator.clipboard.writeText(text);
    target.textContent = "Copied";
    button.classList.add("btn--copied");
    button.setAttribute("aria-live", "polite");
    const prev = copyResetTimers.get(button);
    if (prev) window.clearTimeout(prev);
    const id = window.setTimeout(() => {
      target.textContent = idleLabel;
      button.classList.remove("btn--copied");
    }, 2000);
    copyResetTimers.set(button, id);
  } catch {
    target.textContent = "Copy failed";
    button.classList.remove("btn--copied");
  }
}

function mountLock(id: VaultLockId): void {
  if (currentApi) {
    currentApi.unmount();
    currentApi = null;
  }
  state.currentLock = id;
  stage.classList.remove("hidden");
  stageTitle.textContent = LOCK_TITLES[id];
  stageDesc.textContent = LOCK_DESCS[id];
  const hint = document.getElementById("stage-hint");
  if (hint) {
    const call = LOCK_TOOL_CALLS[id];
    const prompt = LOCK_AGENT_PROMPTS[id];
    hint.innerHTML = "";
    const pre = document.createElement("code");
    pre.textContent = `${prompt} Paste: ${call}`;
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn--ghost";
    copyBtn.dataset.idleLabel = "Copy call";
    copyBtn.textContent = "Copy call";
    copyBtn.addEventListener("click", () => {
      void copyWithFeedback(copyBtn, call);
    });
    hint.append(pre, copyBtn);
  }
  stageBody.innerHTML = "";
  renderLockCards();

  const api: LockHandle = locks[id];
  api.mount(stageBody, state.codes[id], () => onLockSolved(id));
  currentApi = api;

  decay.start(() => {
    state.status = "dead";
    ring.classList.add("decaying");
    decayBadge.textContent = "Vault decayed";
    decayBadge.className = "badge badge--fail";
    addLog("Vault decayed after 30s inactivity. Reset to try again.");
  });
  decayBadge.textContent = "Vault active - 30s decay";
  decayBadge.className = "badge badge--armed";
  startTimer();
  stageBody.addEventListener("pointerdown", () => decay.poke(), {
    once: false,
  });
  stageBody.addEventListener("keydown", () => decay.poke());
}

function onLockSolved(id: VaultLockId): void {
  state.solved[id] = true;
  if (currentApi) {
    currentApi.unmount();
    currentApi = null;
  }
  decay.poke();
  renderLockCards();
  addLog(`${LOCK_TITLES[id]} solved. Code digit ${state.codes[id]} collected.`);

  if (isVaultUnlocked(state)) {
    onVaultUnlocked();
    return;
  }
  const nxt = nextLock(state);
  if (nxt) {
    setTimeout(() => mountLock(nxt), 600);
  }
}

function onVaultUnlocked(): void {
  state.status = "unlocked";
  state.unlockedAt = Date.now();
  decay.stop();
  stage.classList.add("hidden");
  ring.classList.add("unlocked");
  decayBadge.textContent = "Vault unlocked";
  decayBadge.className = "badge badge--ok";
  timerEl.textContent = "";
  if (tickInterval) window.clearInterval(tickInterval);

  const sig = generateSig(state.vaultCode);
  (document.getElementById("cert-code") as HTMLElement).textContent =
    state.vaultCode;
  (document.getElementById("cert-time") as HTMLElement).textContent =
    `${Math.round(((state.unlockedAt || 0) - (state.startedAt || 0)) / 1000)}s`;
  (document.getElementById("cert-sig") as HTMLElement).textContent = sig;
  const certLead = document.getElementById("cert-lead");
  if (certLead) {
    certLead.textContent = "You and your agent opened HUMANLOCK together.";
  }
  cert.classList.remove("hidden");
  codeWrap.classList.remove("hidden");
  codeEl.textContent = state.vaultCode;

  void registry.register({
    name: "reset_vault",
    description: "Reset the HUMANLOCK vault to play again",
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      resetVault();
      return {
        content: [
          { type: "text", text: "Vault reset. Call enter_vault to start." },
        ],
      };
    },
  });

  const url = new URL(window.location.href);
  url.searchParams.set("code", state.vaultCode);
  url.searchParams.set("sig", sig);
  history.replaceState(null, "", url.toString());
}

function startTimer(): void {
  if (tickInterval) window.clearInterval(tickInterval);
  tickInterval = window.setInterval(() => {
    if (state.status !== "running" && state.status !== "decaying") return;
    const rem = Math.ceil(decay.remaining() / 1000);
    timerEl.textContent = `Decay in ${rem}s`;
    if (rem <= 10) timerEl.style.color = "#ff3366";
    else timerEl.style.color = "";
  }, 200);
}

function resetVault(): void {
  if (currentApi) {
    currentApi.unmount();
    currentApi = null;
  }
  registry.unregisterAll();
  state = createInitialState();
  decay.stop();
  cert.classList.add("hidden");
  stage.classList.add("hidden");
  ring.classList.remove("decaying", "unlocked");
  decayBadge.textContent = "Vault idle";
  decayBadge.className = "badge badge--idle";
  timerEl.textContent = "--";
  timerEl.style.color = "";
  if (tickInterval) window.clearInterval(tickInterval);
  renderLockCards();
  updateBadges();
  codeWrap.classList.add("hidden");
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("sig");
  history.replaceState(null, "", url.toString());
}

function enterVault(): void {
  if (state.status === "running" && state.currentLock) return;
  state.status = "running";
  state.startedAt = Date.now();
  codeWrap.classList.remove("hidden");
  codeEl.textContent = "-----";
  const first = nextLock(state);
  if (first) mountLock(first);
  updateBadges();
}

document.getElementById("btn-enter")?.addEventListener("click", enterVault);
document.getElementById("btn-reset")?.addEventListener("click", resetVault);
document.getElementById("btn-copy-prompt")?.addEventListener("click", () => {
  const btn = document.getElementById("btn-copy-prompt");
  const el = document.getElementById("hero-prompt");
  if (!(btn instanceof HTMLButtonElement)) return;
  const text = el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  void copyWithFeedback(btn, text);
});

document.querySelectorAll("[data-copy-call]").forEach((el) => {
  if (!(el instanceof HTMLButtonElement)) return;
  if (!el.querySelector(".lock-call-hint")) {
    const hint = document.createElement("span");
    hint.className = "lock-call-hint";
    hint.textContent = "Copy";
    el.append(hint);
  }
  el.title = "Copy for your agent";
  el.addEventListener("click", () => {
    const call = el.dataset.copyCall ?? "";
    void copyWithFeedback(el, call);
  });
});
document.getElementById("btn-debug")?.addEventListener("click", () => {
  if (hasWebMCP()) return;
  debugPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document
  .getElementById("btn-play-again")
  ?.addEventListener("click", resetVault);
document.getElementById("btn-share")?.addEventListener("click", async () => {
  const url = window.location.href;
  await navigator.clipboard.writeText(url).catch(() => {});
  addLog("Share URL copied.");
});
document
  .getElementById("btn-play-again")
  ?.addEventListener("click", enterVault);

updateBadges();
renderLockCards();
renderDebug();

const debugHandle: HumanLockDebug = {
  state: () => state,
  registry,
  enter: enterVault,
  reset: resetVault,
  locks,
};
window.HUMANLOCK = debugHandle;

void registry.register({
  name: "enter_vault",
  description:
    "Enter the HUMANLOCK vault and start the 5 locks. Call this to begin.",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: async () => {
    enterVault();
    return {
      content: [
        {
          type: "text",
          text: `Vault entered. Current lock: ${state.currentLock}. Use its tool.`,
        },
      ],
    };
  },
});
void registry.register({
  name: "get_vault_status",
  description: "Get vault progress, solved locks, and current lock",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: async () => {
    return {
      content: [
        {
          type: "text",
          text: `Progress ${progressText(state)}, current ${state.currentLock}, code ${state.vaultCode}`,
        },
      ],
      data: {
        vaultCode: state.vaultCode,
        currentLock: state.currentLock ?? "",
      },
    };
  },
});

const params = new URLSearchParams(window.location.search);
const sharedCode = params.get("code");
const sharedSig = params.get("sig");
if (sharedCode) {
  codeWrap.classList.remove("hidden");
  codeEl.textContent = sharedCode;
}
if (sharedCode && sharedSig) {
  (document.getElementById("cert-code") as HTMLElement).textContent =
    sharedCode;
  (document.getElementById("cert-sig") as HTMLElement).textContent = sharedSig;
  (document.getElementById("cert-time") as HTMLElement).textContent =
    "shared";
  const certLead = document.getElementById("cert-lead");
  if (certLead) {
    certLead.textContent =
      "Shared HUMANLOCK certificate. No WebMCP required to view this page.";
  }
  cert.classList.remove("hidden");
}
