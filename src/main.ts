import "./style.css";
import { registry } from "./webmcp/registry";
import { hasWebMCP, waitForWebMCP } from "./webmcp/types";
import {
  createInitialState,
  nextLock,
  isVaultUnlocked,
  LOCK_TITLES,
  LOCK_DESCS,
  progressText,
  progressShort,
  generateSig,
  LOCK_ORDER,
  LOCK_TOOLS,
} from "./state";
import { createBlurLock } from "./locks/blur";
import { createSwarmLock } from "./locks/swarm";
import { createWhisperLock } from "./locks/whisper";
import { createLieLock } from "./locks/lie";
import { createHandshakeLock } from "./locks/handshake";
import { DecayTimer } from "./utils/decay";
import type { VaultLockId, VaultState, HumanLockDebug } from "./webmcp/types";

type LockHandle = {
  toolName: string;
  mount: (container: HTMLElement, code: string, onSolved: () => void) => void;
  unmount: () => void;
};

let state: VaultState = createInitialState();
const decay = new DecayTimer();
let currentApi: LockHandle | null = null;
let tickInterval: number | null = null;
let globalToolsRegistered = false;

const locks: Record<VaultLockId, LockHandle> = {
  blur: createBlurLock(),
  swarm: createSwarmLock(),
  whisper: createWhisperLock(),
  lie: createLieLock(),
  handshake: createHandshakeLock(),
};

const badge = document.getElementById("webmcp-badge") as HTMLElement;
const decayBadge = document.getElementById("decay-badge") as HTMLElement | null;
const webmcpRequired = document.getElementById("webmcp-required") as HTMLElement | null;
const ring = document.getElementById("vault-ring") as HTMLElement;
const statusText = document.getElementById("vault-status-text") as HTMLElement;
const timerEl = document.getElementById("vault-timer") as HTMLElement;
const progressEl = document.getElementById("vault-progress") as HTMLElement;
const progressHero = document.getElementById("vault-progress-hero") as HTMLElement | null;
const progressHeader = document.getElementById(
  "vault-progress-header",
) as HTMLElement | null;
const codeEl = document.getElementById("vault-code-value") as HTMLElement;
const codeWrap = document.getElementById("vault-code") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const stageTitle = document.getElementById("stage-title") as HTMLElement;
const stageDesc = document.getElementById("stage-desc") as HTMLElement;
const stageBody = document.getElementById("stage-body") as HTMLElement;
const toolStatus = document.getElementById("tool-status") as HTMLElement;
const cert = document.getElementById("certificate") as HTMLElement;
const liveStatus = document.getElementById("live-status") as HTMLElement | null;
const inspector = document.getElementById("tool-inspector") as HTMLElement | null;
const inspectorName = document.getElementById("inspector-name") as HTMLElement | null;
const inspectorDesc = document.getElementById("inspector-desc") as HTMLElement | null;
const inspectorSchema = document.getElementById("inspector-schema") as HTMLElement | null;
const stageHuman = document.getElementById("stage-human") as HTMLElement | null;
const stageAgent = document.getElementById("stage-agent") as HTMLElement | null;
const btnEnter = document.getElementById("btn-enter") as HTMLButtonElement | null;
const btnHowWebmcp = document.getElementById(
  "btn-how-webmcp",
) as HTMLButtonElement | null;
const webmcpCompact = document.getElementById("webmcp-compact") as HTMLElement | null;
const webmcpCompactIcon = document.getElementById(
  "webmcp-compact-icon",
) as HTMLElement | null;
const webmcpCompactText = document.getElementById(
  "webmcp-compact-text",
) as HTMLElement | null;
const webmcpDetails = document.getElementById("webmcp-details") as HTMLElement | null;
const vaultStatusLine = document.getElementById(
  "vault-status-line",
) as HTMLElement | null;
const vaultStatusLineHero = document.getElementById(
  "vault-status-line-hero",
) as HTMLElement | null;
const lockStepper = document.getElementById("lock-stepper") as HTMLElement | null;

const LOCK_HUMAN: Record<VaultLockId, string> = {
  blur: "Watch flash, spot glitch",
  swarm: "Pick serif, double border",
  whisper: "Interpret spectrogram",
  lie: "Judge what to trust",
  handshake: "Arm and drag",
};

const LOCK_AGENT: Record<VaultLockId, string> = {
  blur: "Call freeze_frame",
  swarm: "Call filter_by_vibe",
  whisper: "Call sonify_to_spectrogram",
  lie: "Call audit_truth",
  handshake: "Call align_quantum_lock",
};

const CHATGPT_PROMPT =
  "List my WebMCP tools and help me open this vault. Start with THE BLUR, call freeze_frame at the glitch. Then filter_by_vibe, sonify_to_spectrogram, audit_truth, and align_quantum_lock together with me. Vault: https://webmcp-humanlock.pages.dev/";

const copyResetTimers = new WeakMap<HTMLButtonElement, number>();

/**
 * Copy text and show temporary success or failure feedback on the button.
 */
async function copyWithFeedback(
  btn: HTMLButtonElement,
  text: string,
  labels?: { success?: string; fail?: string },
): Promise<boolean> {
  if (!btn.dataset.copyLabel) {
    btn.dataset.copyLabel = btn.textContent?.trim() ?? "";
  }
  const original = btn.dataset.copyLabel;
  const prev = copyResetTimers.get(btn);
  if (prev !== undefined) window.clearTimeout(prev);

  const restore = (): void => {
    btn.textContent = original;
    btn.classList.remove("btn--copied", "btn--copy-fail");
    copyResetTimers.delete(btn);
  };

  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = labels?.success ?? "Copied!";
    btn.classList.add("btn--copied");
    btn.classList.remove("btn--copy-fail");
    const id = window.setTimeout(restore, 2000);
    copyResetTimers.set(btn, id);
    return true;
  } catch {
    btn.textContent = labels?.fail ?? "Copy failed";
    btn.classList.add("btn--copy-fail");
    btn.classList.remove("btn--copied");
    const id = window.setTimeout(restore, 2000);
    copyResetTimers.set(btn, id);
    return false;
  }
}

function formatUnifiedStatus(tools: string[]): string {
  if (state.status !== "running" && state.status !== "decaying") return "";
  const parts: string[] = [progressShort(state)];
  if (state.currentLock) {
    parts.push(LOCK_TITLES[state.currentLock]);
    const tool = tools[0] ?? LOCK_TOOLS[state.currentLock];
    parts.push(tool);
  }
  if (state.status === "running" || state.status === "decaying") {
    const rem = Math.ceil(decay.remaining() / 1000);
    parts.push(`decay ${rem}s`);
  }
  return parts.join(" · ");
}

function setUnifiedStatusText(text: string): void {
  const visible = text.length > 0;
  for (const el of [vaultStatusLine, vaultStatusLineHero]) {
    if (!el) continue;
    el.textContent = text;
    el.classList.toggle("hidden", !visible);
  }
}

function updateUnifiedStatus(tools: string[] = registry.list()): void {
  setUnifiedStatusText(formatUnifiedStatus(tools));
}

function updateLockStepper(): void {
  if (!lockStepper) return;
  const running = state.status === "running" || state.status === "decaying";
  lockStepper.classList.toggle("hidden", !running);
  for (const id of LOCK_ORDER) {
    const btn = lockStepper.querySelector(
      `[data-lock="${id}"]`,
    ) as HTMLButtonElement | null;
    if (!btn) continue;
    btn.classList.remove("lock-step--locked", "lock-step--active", "lock-step--solved");
    if (state.solved[id]) {
      btn.classList.add("lock-step--solved");
      btn.textContent = state.codes[id];
      btn.title = `${LOCK_TITLES[id]} solved`;
    } else if (state.currentLock === id) {
      btn.classList.add("lock-step--active");
      btn.textContent = String(LOCK_ORDER.indexOf(id) + 1).padStart(2, "0");
      btn.title = `${LOCK_TITLES[id]} active`;
    } else {
      btn.classList.add("lock-step--locked");
      btn.textContent = String(LOCK_ORDER.indexOf(id) + 1).padStart(2, "0");
      btn.title = LOCK_TITLES[id];
    }
  }
}

function scrollStageIntoView(): void {
  requestAnimationFrame(() => {
    stage.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setWebMcpDetailsOpen(open: boolean): void {
  if (!webmcpDetails) return;
  webmcpDetails.classList.toggle("hidden", !open);
  if (btnHowWebmcp) {
    btnHowWebmcp.textContent = open ? "Hide ▸" : "How to enable ▸";
  }
}

function openWebMcpDetails(): void {
  setWebMcpDetailsOpen(true);
  webmcpDetails?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateEnterVaultButton(ready: boolean): void {
  if (!btnEnter) return;
  btnEnter.classList.toggle("btn--blocked", !ready);
  btnEnter.setAttribute("aria-disabled", ready ? "false" : "true");
  if (ready) {
    btnEnter.removeAttribute("title");
  } else {
    btnEnter.title = "WebMCP required. Click for setup steps.";
  }
}

function updateBadges(): void {
  const ready = hasWebMCP();
  if (ready) {
    badge.textContent = "WebMCP ready";
    badge.className = "badge badge--ok";
    if (webmcpCompactIcon) webmcpCompactIcon.textContent = "●";
    if (webmcpCompactText) webmcpCompactText.textContent = "WebMCP detected";
    if (webmcpCompact) webmcpCompact.style.display = "flex";
    if (webmcpRequired) webmcpRequired.classList.add("hidden");
  } else {
    badge.textContent = "WebMCP required";
    badge.className = "badge badge--fail";
    if (webmcpCompactIcon) webmcpCompactIcon.textContent = "⚠";
    if (webmcpCompactText) webmcpCompactText.textContent = "WebMCP unavailable";
    if (webmcpRequired) webmcpRequired.classList.remove("hidden");
  }
  updateEnterVaultButton(ready);
  toolStatus.textContent = `Tools: ${registry.list().join(", ") || "none"}`;
  updateLiveStatus(registry.list());
  updateToolInspector(registry.list());
  updateToolBus();
  updateUnifiedStatus(registry.list());
  updateLockStepper();
}

function updateLiveStatus(tools: string[]): void {
  if (!liveStatus) return;
  if (!hasWebMCP()) {
    liveStatus.textContent =
      "Open in ChatGPT desktop browser (GPT-5.6 Sol or Terra, site tools on) or Chrome Canary with enable-webmcp.";
    return;
  }
  if (state.status === "unlocked") {
    liveStatus.textContent = `Vault unlocked, code ${state.vaultCode}`;
  } else if (state.currentLock) {
    const t = tools[0] ?? "no tool yet";
    liveStatus.textContent = `${progressText(state)}, current ${state.currentLock}, tool ${t}`;
  } else {
    liveStatus.textContent = `${progressText(state)}, idle. Click Enter vault or call enter_vault.`;
  }
}

function updateToolInspector(tools: string[]): void {
  if (!inspector || !inspectorName || !inspectorDesc || !inspectorSchema) return;
  if (tools.length === 0) {
    inspector.classList.add("hidden");
    inspectorName.textContent = "none";
    inspectorDesc.textContent =
      "No tool registered. Enter vault to start. Each lock registers one tool and unregisters on solve.";
    inspectorSchema.textContent = "-";
    return;
  }
  inspector.classList.remove("hidden");
  const name = tools[0];
  inspectorName.textContent = name;
  const def = registry.getDef(name);
  if (def) {
    inspectorDesc.textContent = def.description;
    inspectorSchema.textContent = JSON.stringify(def.inputSchema ?? {}, null, 2);
  } else {
    inspectorDesc.textContent = "Tool registered";
    inspectorSchema.textContent = "-";
  }
}

function updateToolBus(): void {
  (Object.keys(LOCK_TOOLS) as VaultLockId[]).forEach((id) => {
    const tool = LOCK_TOOLS[id];
    const el = document.getElementById(`bus-${tool}`) as HTMLElement | null;
    const card = document.querySelector(
      `.bus-tool[data-tool="${tool}"]`,
    ) as HTMLElement | null;
    if (!el || !card) return;
    if (state.solved[id]) {
      el.textContent = "CONSUMED";
      el.className = "bus-status status--consumed";
      card.className = "bus-tool bus--consumed";
    } else if (state.currentLock === id) {
      const isAvailable = registry.list().includes(tool);
      el.textContent = isAvailable ? "AVAILABLE" : "WAITING";
      el.className = isAvailable
        ? "bus-status status--available"
        : "bus-status status--waiting";
      card.className = isAvailable ? "bus-tool bus--available" : "bus-tool bus--waiting";
    } else {
      el.textContent = "WAITING";
      el.className = "bus-status status--waiting";
      card.className = "bus-tool bus--waiting";
    }
  });
}

function updateStageRoles(id: VaultLockId): void {
  if (stageHuman) stageHuman.textContent = LOCK_HUMAN[id];
  if (stageAgent) stageAgent.textContent = LOCK_AGENT[id];
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
  if (progressHero) progressHero.textContent = progressText(state).replace(" locks", "");
  if (progressHeader)
    progressHeader.textContent = progressText(state).replace(" locks", "");
  statusText.textContent =
    state.status === "unlocked"
      ? "UNLOCKED"
      : state.status === "dead"
        ? "DECAYED"
        : "LOCKED";
  if (state.status === "unlocked") ring.classList.add("unlocked");
  else ring.classList.remove("unlocked");

  const running = state.status === "running" || state.status === "decaying";
  document.body.classList.toggle("vault-running", running);
  if (progressHeader) {
    progressHeader.classList.toggle("hidden", running);
  }

  if (state.currentLock && running) {
    document.body.classList.add("lock-active");
  } else {
    document.body.classList.remove("lock-active");
  }
  updateLiveStatus(registry.list());
  updateToolBus();
  updateUnifiedStatus(registry.list());
  updateLockStepper();
}

function addLog(msg: string): void {
  const el = document.getElementById("stage-log");
  if (el) el.textContent = msg;
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
  stageBody.innerHTML = "";
  updateStageRoles(id);
  renderLockCards();

  const api: LockHandle = locks[id];
  api.mount(stageBody, state.codes[id], () => onLockSolved(id));
  currentApi = api;

  decay.start(() => {
    state.status = "dead";
    ring.classList.add("decaying");
    if (decayBadge) {
      decayBadge.textContent = "Vault decayed";
      decayBadge.className = "badge badge--fail";
    }
    addLog("Vault decayed after 30s inactivity. Reset to try again.");
    updateUnifiedStatus(registry.list());
    updateLockStepper();
  });
  if (decayBadge) {
    decayBadge.textContent = "Vault active - 30s decay";
    decayBadge.className = "badge badge--armed";
  }
  startTimer();
  stageBody.addEventListener("pointerdown", () => decay.poke(), {
    once: false,
  });
  stageBody.addEventListener("keydown", () => decay.poke());
  updateUnifiedStatus(registry.list());
  scrollStageIntoView();
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
  document.body.classList.remove("lock-active", "vault-running");
  ring.classList.add("unlocked");
  if (decayBadge) {
    decayBadge.textContent = "Vault unlocked";
    decayBadge.className = "badge badge--ok";
  }
  timerEl.textContent = "";
  setUnifiedStatusText("");
  updateLockStepper();
  if (progressHeader) progressHeader.classList.remove("hidden");
  if (tickInterval) window.clearInterval(tickInterval);

  const sig = generateSig(state.vaultCode);
  const elapsedSec = Math.round(
    ((state.unlockedAt || 0) - (state.startedAt || 0)) / 1000,
  );
  const elapsedStr = `${String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:${String(elapsedSec % 60).padStart(2, "0")}`;
  (document.getElementById("cert-code") as HTMLElement).textContent = state.vaultCode;
  (document.getElementById("cert-time") as HTMLElement).textContent = `${elapsedSec}s`;
  const bigTime = document.getElementById("cert-time-big") as HTMLElement | null;
  if (bigTime) bigTime.textContent = elapsedStr;
  (document.getElementById("cert-sig") as HTMLElement).textContent = sig;
  cert.classList.remove("hidden");
  codeWrap.classList.remove("hidden");
  codeEl.textContent = state.vaultCode;
  cert.scrollIntoView({ behavior: "smooth", block: "start" });

  void registry.register({
    name: "reset_vault",
    description: "Reset the HUMANLOCK vault to play again",
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      resetVault();
      return {
        content: [{ type: "text", text: "Vault reset. Call enter_vault to start." }],
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
    updateUnifiedStatus(registry.list());
  }, 200);
}

function resetVault(): void {
  if (currentApi) {
    currentApi.unmount();
    currentApi = null;
  }
  registry.unregisterAll();
  globalToolsRegistered = false;
  state = createInitialState();
  decay.stop();
  cert.classList.add("hidden");
  stage.classList.add("hidden");
  ring.classList.remove("decaying", "unlocked");
  document.body.classList.remove("lock-active", "vault-running");
  if (decayBadge) {
    decayBadge.textContent = "Vault idle";
    decayBadge.className = "badge badge--idle";
  }
  timerEl.textContent = "--";
  timerEl.style.color = "";
  setUnifiedStatusText("");
  if (progressHeader) progressHeader.classList.remove("hidden");
  if (tickInterval) window.clearInterval(tickInterval);
  renderLockCards();
  void registerGlobalTools();
  codeWrap.classList.add("hidden");
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("sig");
  history.replaceState(null, "", url.toString());
}

async function enterVault(): Promise<void> {
  if (state.status === "running" && state.currentLock) return;
  const ready = hasWebMCP() || (await waitForWebMCP({ timeoutMs: 10_000 }));
  if (!ready) {
    addLog(
      "WebMCP required. Use ChatGPT desktop browser with site tools, or Chrome Canary with enable-webmcp.",
    );
    updateBadges();
    return;
  }
  await registerGlobalTools();
  state.status = "running";
  state.startedAt = Date.now();
  codeWrap.classList.remove("hidden");
  codeEl.textContent = "-----";
  const first = nextLock(state);
  if (first) mountLock(first);
  updateBadges();
}

async function registerGlobalTools(): Promise<void> {
  if (globalToolsRegistered || !hasWebMCP()) return;
  await registry.register({
    name: "enter_vault",
    description: "Enter the HUMANLOCK vault and start the 5 locks. Call this to begin.",
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      await enterVault();
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
  await registry.register({
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
  globalToolsRegistered = true;
}

function setupCopyPrompt(): void {
  const btnCopyPrompt = document.getElementById(
    "btn-copy-prompt",
  ) as HTMLButtonElement | null;
  btnCopyPrompt?.addEventListener("click", () => {
    void copyWithFeedback(btnCopyPrompt, CHATGPT_PROMPT, {
      success: "Prompt copied!",
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.copy !== "chatgpt") return;
      void copyWithFeedback(btn, CHATGPT_PROMPT, { success: "Copied!" });
    });
  });
  const btnHow = btnHowWebmcp;
  if (btnHow && webmcpDetails) {
    btnHow.addEventListener("click", () => {
      setWebMcpDetailsOpen(webmcpDetails.classList.contains("hidden"));
    });
  }
}

function setupReviewerMode(): void {
  const btn = document.getElementById("btn-reviewer-mode") as HTMLButtonElement | null;
  if (!btn) return;
  const apply = (on: boolean): void => {
    document.body.classList.toggle("reviewer-mode", on);
    btn.textContent = on ? "Reviewer mode: on" : "Reviewer mode";
    btn.classList.toggle("active", on);
    localStorage.setItem("humanlock_reviewer_mode", on ? "1" : "0");
  };
  const saved = localStorage.getItem("humanlock_reviewer_mode");
  const urlOn = new URLSearchParams(window.location.search).has("review");
  const initial = urlOn ? true : saved === "1" ? true : false;
  apply(initial);
  btn.addEventListener("click", () => {
    const on = !document.body.classList.contains("reviewer-mode");
    apply(on);
  });
}

registry.onChange((tools) => {
  toolStatus.textContent = `Tools: ${tools.join(", ") || "none"}`;
  updateLiveStatus(tools);
  updateToolInspector(tools);
  updateToolBus();
  updateUnifiedStatus(tools);
});

document.getElementById("btn-enter")?.addEventListener("click", () => {
  if (!hasWebMCP()) {
    openWebMcpDetails();
    return;
  }
  void enterVault();
});
document.getElementById("btn-reset")?.addEventListener("click", resetVault);
document.getElementById("btn-play-again")?.addEventListener("click", () => {
  resetVault();
  void enterVault();
});
document.getElementById("btn-share")?.addEventListener("click", () => {
  const btn = document.getElementById("btn-share") as HTMLButtonElement | null;
  if (!btn) return;
  void copyWithFeedback(btn, window.location.href, { success: "URL copied!" });
});

updateBadges();
renderLockCards();
setupCopyPrompt();
setupReviewerMode();

void waitForWebMCP({ timeoutMs: 30_000 }).then(async (ready) => {
  updateBadges();
  if (ready) await registerGlobalTools();
  updateBadges();
});

const debugHandle: HumanLockDebug = {
  state: () => state,
  registry,
  enter: () => {
    void enterVault();
  },
  reset: resetVault,
  locks,
};
window.HUMANLOCK = debugHandle;

const params = new URLSearchParams(window.location.search);
if (params.get("code")) {
  codeWrap.classList.remove("hidden");
  codeEl.textContent = params.get("code") || "-----";
}
