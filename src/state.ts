import type { VaultLockId, VaultState } from "./webmcp/types";

const ORDER: VaultLockId[] = ["blur", "swarm", "whisper", "lie", "handshake"];

export function createInitialState(): VaultState {
  const codes: Record<VaultLockId, string> = {
    blur: String(Math.floor(1000 + Math.random() * 9000)).slice(0, 1),
    swarm: String(Math.floor(1000 + Math.random() * 9000)).slice(1, 2),
    whisper: String(Math.floor(1000 + Math.random() * 9000)).slice(2, 3),
    lie: String(Math.floor(1000 + Math.random() * 9000)).slice(3, 4),
    handshake: String(Math.floor(1 + Math.random() * 9)),
  };
  const seed = import.meta.env.VITE_VAULT_SEED;
  if (seed) {
    const s = String(seed).padEnd(5, "0").slice(0, 5);
    codes.blur = s[0];
    codes.swarm = s[1];
    codes.whisper = s[2];
    codes.lie = s[3];
    codes.handshake = s[4] || "7";
  }
  const vaultCode = Object.values(codes).join("");
  return {
    status: "idle",
    currentLock: null,
    solved: {
      blur: false,
      swarm: false,
      whisper: false,
      lie: false,
      handshake: false,
    },
    codes,
    vaultCode,
    startedAt: null,
    unlockedAt: null,
  };
}

export function nextLock(state: VaultState): VaultLockId | null {
  for (const id of ORDER) if (!state.solved[id]) return id;
  return null;
}

export function isVaultUnlocked(state: VaultState): boolean {
  return ORDER.every((id) => state.solved[id]);
}

export function progressText(state: VaultState): string {
  const solved = ORDER.filter((id) => state.solved[id]).length;
  return `${solved} / ${ORDER.length} locks`;
}

export const LOCK_TITLES: Record<VaultLockId, string> = {
  blur: "THE BLUR",
  swarm: "THE SWARM",
  whisper: "THE WHISPER",
  lie: "THE LIE",
  handshake: "THE HANDSHAKE",
};

export const LOCK_DESCS: Record<VaultLockId, string> = {
  blur: "High-frame-rate canvas hides a digit. Human spots the glitch, agent freezes the frame.",
  swarm:
    "Lookalikes flood the grid. Agent narrows the swarm, human picks the real control by judgment.",
  whisper:
    "Ultrasonic tone hides a digit. Agent renders the spectrogram, human reads it and submits.",
  lie: "The display and the ledger disagree. Agent audits, human weighs the evidence and decides.",
  handshake:
    "Human drag and agent align must land within 50ms. Retries are instant.",
};

/** Exact tool calls to paste to an agent. No spoiler results. */
export const LOCK_TOOL_CALLS: Record<VaultLockId, string> = {
  blur: "freeze_frame({ timestamp: 300 })",
  swarm: 'filter_by_vibe({ description: "most trustworthy" })',
  whisper: "sonify_to_spectrogram()",
  lie: "audit_truth()",
  handshake: "align_quantum_lock()",
};

/** Copy-paste lines shown in each lock UI. Judges will not reread Devpost. */
export const LOCK_AGENT_PROMPTS: Record<VaultLockId, string> = {
  blur: "Tell your agent: freeze_frame({ timestamp: 300 }) at the glitch you see.",
  swarm:
    'Tell your agent: filter_by_vibe({ description: "most trustworthy" }). Then pick the real control from the candidates.',
  whisper:
    "Tell your agent: sonify_to_spectrogram(). Then read the spectrogram yourself and type the digit.",
  lie: "Tell your agent: audit_truth(). Then decide whether to trust the display or the ledger.",
  handshake:
    "Tell your agent: align_quantum_lock() as you drag the slider. Retry immediately if you miss the 50ms window.",
};

export function generateSig(vaultCode: string): string {
  const raw = `${vaultCode}-${Date.now().toString(36)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++)
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return `hl_${hash.toString(36).slice(0, 8)}_${vaultCode}`;
}
