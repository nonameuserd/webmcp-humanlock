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

/** Compact progress for unified status line (e.g. `2/5`). */
export function progressShort(state: VaultState): string {
  const solved = ORDER.filter((id) => state.solved[id]).length;
  return `${solved}/${ORDER.length}`;
}

export const LOCK_ORDER: VaultLockId[] = ORDER;

export const LOCK_TOOLS: Record<VaultLockId, string> = {
  blur: "freeze_frame",
  swarm: "filter_by_vibe",
  whisper: "sonify_to_spectrogram",
  lie: "audit_truth",
  handshake: "align_quantum_lock",
};

export const LOCK_TITLES: Record<VaultLockId, string> = {
  blur: "THE BLUR",
  swarm: "THE SWARM",
  whisper: "THE WHISPER",
  lie: "THE LIE",
  handshake: "THE HANDSHAKE",
};

export const LOCK_DESCS: Record<VaultLockId, string> = {
  blur: "240fps flash hides a digit. Human spots glitch, agent freezes frame.",
  swarm: "5000 buttons, only one is real. Agent filters by vibe, human picks.",
  whisper: "Ultrasonic tone hides code. Agent converts to spectrogram, human reads.",
  lie: "Display lies about vault balance. Agent audits truth, human decides trust.",
  handshake: "Human drag and agent align must land within 50ms. Prove symbiosis.",
};

export function generateSig(vaultCode: string): string {
  const raw = `${vaultCode}-${Date.now().toString(36)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return `hl_${hash.toString(36).slice(0, 8)}_${vaultCode}`;
}
