import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  generateSig,
  isVaultUnlocked,
  LOCK_AGENT_PROMPTS,
  LOCK_DESCS,
  LOCK_TITLES,
  nextLock,
  progressText,
} from "../src/state";
import type { VaultLockId } from "../src/webmcp/types";

const ALL: VaultLockId[] = ["blur", "swarm", "whisper", "lie", "handshake"];

describe("vault state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts idle with five unsolved locks and a five-digit code", () => {
    const state = createInitialState();
    expect(state.status).toBe("idle");
    expect(state.currentLock).toBeNull();
    expect(state.vaultCode).toHaveLength(5);
    expect(ALL.every((id) => state.solved[id] === false)).toBe(true);
    expect(nextLock(state)).toBe("blur");
    expect(progressText(state)).toBe("0 / 5 locks");
    expect(isVaultUnlocked(state)).toBe(false);
  });

  it("advances nextLock in order and unlocks when all are solved", () => {
    const state = createInitialState();
    for (const id of ALL) {
      expect(nextLock(state)).toBe(id);
      state.solved[id] = true;
    }
    expect(nextLock(state)).toBeNull();
    expect(isVaultUnlocked(state)).toBe(true);
    expect(progressText(state)).toBe("5 / 5 locks");
  });

  it("applies VITE_VAULT_SEED when set", async () => {
    vi.stubEnv("VITE_VAULT_SEED", "97531");
    vi.resetModules();
    const mod = await import("../src/state");
    const state = mod.createInitialState();
    expect(state.codes.blur).toBe("9");
    expect(state.codes.swarm).toBe("7");
    expect(state.codes.whisper).toBe("5");
    expect(state.codes.lie).toBe("3");
    expect(state.codes.handshake).toBe("1");
    expect(state.vaultCode).toBe("97531");
  });

  it("pads a short seed and defaults handshake when the fifth char is missing", async () => {
    vi.stubEnv("VITE_VAULT_SEED", "12");
    vi.resetModules();
    const mod = await import("../src/state");
    const state = mod.createInitialState();
    expect(state.vaultCode).toHaveLength(5);
    expect(state.codes.blur).toBe("1");
    expect(state.codes.swarm).toBe("2");
  });

  it("mints a shareable signature that embeds the vault code", () => {
    const sig = generateSig("12345");
    expect(sig.startsWith("hl_")).toBe(true);
    expect(sig.endsWith("_12345")).toBe(true);
  });

  it("exposes copy-paste agent prompts for every lock", () => {
    for (const id of ALL) {
      expect(LOCK_TITLES[id].startsWith("THE ")).toBe(true);
      expect(LOCK_DESCS[id].length).toBeGreaterThan(10);
      expect(LOCK_AGENT_PROMPTS[id]).toMatch(/Tell your agent:/);
    }
  });
});
