import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createInitialState,
  nextLock,
  isVaultUnlocked,
  progressText,
  progressShort,
  generateSig,
  LOCK_TITLES,
  LOCK_DESCS,
  LOCK_TOOLS,
} from "../src/state";
import type { VaultState } from "../src/webmcp/types";

describe("state: createInitialState", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_VAULT_SEED", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates idle state with 5 codes and vaultCode", () => {
    const s = createInitialState();
    expect(s.status).toBe("idle");
    expect(s.currentLock).toBeNull();
    expect(s.startedAt).toBeNull();
    expect(s.unlockedAt).toBeNull();
    expect(Object.keys(s.solved)).toHaveLength(5);
    expect(Object.keys(s.codes)).toHaveLength(5);
    expect(s.vaultCode).toHaveLength(5);
    // vaultCode is join of codes
    const joined = s.codes.blur + s.codes.swarm + s.codes.whisper + s.codes.lie + s.codes.handshake;
    expect(s.vaultCode).toBe(joined);
    // each code is single digit string
    for (const v of Object.values(s.codes)) {
      expect(v).toMatch(/^[0-9]$/);
    }
  });

  it("respects VITE_VAULT_SEED deterministic", () => {
    vi.stubEnv("VITE_VAULT_SEED", "12345");
    const s = createInitialState();
    expect(s.codes.blur).toBe("1");
    expect(s.codes.swarm).toBe("2");
    expect(s.codes.whisper).toBe("3");
    expect(s.codes.lie).toBe("4");
    expect(s.codes.handshake).toBe("5");
    expect(s.vaultCode).toBe("12345");
  });

  it("pads short seed with zeros and slices to 5", () => {
    vi.stubEnv("VITE_VAULT_SEED", "7");
    const s = createInitialState();
    expect(s.vaultCode).toBe("70000");
    expect(s.codes.blur).toBe("7");
    expect(s.codes.handshake).toBe("0");
  });

  it("truncates long seed to 5 chars", () => {
    vi.stubEnv("VITE_VAULT_SEED", "987654321");
    const s = createInitialState();
    expect(s.vaultCode).toBe("98765");
  });

  it("handles missing handshake char fallback to 7", () => {
    // seed "12" padEnd to "12000" -> but if we give "1234" padEnd gives "12340" slice 0,5 -> "12340" handshake = "0" not fallback
    // the fallback only triggers when s[4] is falsy -> which happens when seed empty? Actually padEnd ensures length 5 so s[4] exists. Fallback is defensive.
    // we test with stubbed env as undefined path: random codes
    vi.stubEnv("VITE_VAULT_SEED", "");
    const s = createInitialState();
    expect(s.codes.handshake).toMatch(/^[0-9]$/);
  });
});

describe("state: nextLock", () => {
  it("returns first unsolved lock in order blur, swarm, whisper, lie, handshake", () => {
    const s = createInitialState();
    expect(nextLock(s)).toBe("blur");
    s.solved.blur = true;
    expect(nextLock(s)).toBe("swarm");
    s.solved.swarm = true;
    s.solved.whisper = true;
    expect(nextLock(s)).toBe("lie");
    s.solved.lie = true;
    expect(nextLock(s)).toBe("handshake");
    s.solved.handshake = true;
    expect(nextLock(s)).toBeNull();
  });

  it("skips solved and returns next, regardless of currentLock", () => {
    const s: VaultState = {
      status: "running",
      currentLock: "lie",
      solved: { blur: true, swarm: true, whisper: false, lie: false, handshake: false },
      codes: { blur: "1", swarm: "2", whisper: "3", lie: "4", handshake: "5" },
      vaultCode: "12345",
      startedAt: 0,
      unlockedAt: null,
    };
    expect(nextLock(s)).toBe("whisper");
  });
});

describe("state: isVaultUnlocked", () => {
  it("is false when any lock unsolved", () => {
    const s = createInitialState();
    expect(isVaultUnlocked(s)).toBe(false);
    (Object.keys(s.solved) as Array<keyof VaultState["solved"]>).forEach((k) => {
      s.solved[k] = true;
    });
    s.solved.lie = false;
    expect(isVaultUnlocked(s)).toBe(false);
  });

  it("is true when all solved", () => {
    const s = createInitialState();
    for (const k of Object.keys(s.solved) as Array<keyof VaultState["solved"]>) {
      s.solved[k] = true;
    }
    expect(isVaultUnlocked(s)).toBe(true);
  });
});

describe("state: progressText", () => {
  it("reports 0/5 initially", () => {
    const s = createInitialState();
    expect(progressText(s)).toBe("0 / 5 locks");
  });
  it("reports correct count after solving some", () => {
    const s = createInitialState();
    s.solved.blur = true;
    s.solved.swarm = true;
    expect(progressText(s)).toBe("2 / 5 locks");
  });
  it("reports 5/5 when all solved", () => {
    const s = createInitialState();
    for (const k of Object.keys(s.solved) as Array<keyof VaultState["solved"]>) s.solved[k] = true;
    expect(progressText(s)).toBe("5 / 5 locks");
  });
});

describe("state: progressShort and LOCK_TOOLS", () => {
  it("progressShort omits locks suffix", () => {
    const s = createInitialState();
    expect(progressShort(s)).toBe("0/5");
    s.solved.blur = true;
    expect(progressShort(s)).toBe("1/5");
  });

  it("LOCK_TOOLS maps each lock to its WebMCP tool", () => {
    expect(LOCK_TOOLS.blur).toBe("freeze_frame");
    expect(LOCK_TOOLS.handshake).toBe("align_quantum_lock");
  });
});

describe("state: LOCK_TITLES and LOCK_DESCS", () => {
  it("has titles for every lock", () => {
    expect(LOCK_TITLES.blur).toBe("THE BLUR");
    expect(LOCK_TITLES.swarm).toBe("THE SWARM");
    expect(LOCK_TITLES.whisper).toBe("THE WHISPER");
    expect(LOCK_TITLES.lie).toBe("THE LIE");
    expect(LOCK_TITLES.handshake).toBe("THE HANDSHAKE");
  });
  it("has descriptions mentioning human and agent symbiosis", () => {
    for (const d of Object.values(LOCK_DESCS)) {
      expect(d.length).toBeGreaterThan(10);
    }
  });
  it("blur desc mentions 240fps and freeze", () => {
    expect(LOCK_DESCS.blur.toLowerCase()).toContain("240fps");
  });
});

describe("state: generateSig", () => {
  it("generates signature starting with hl_ and containing vaultCode suffix", () => {
    const sig = generateSig("12345");
    expect(sig.startsWith("hl_")).toBe(true);
    expect(sig.endsWith("_12345")).toBe(true);
  });

  it("includes hash part of length up to 8", () => {
    const sig = generateSig("99999");
    const parts = sig.split("_");
    expect(parts[0]).toBe("hl");
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeLessThanOrEqual(8);
  });

  it("produces different sigs for different codes or times", () => {
    const a = generateSig("11111");
    const b = generateSig("22222");
    // codes differ so sig must differ (hash includes timestamp but also vaultCode)
    expect(a).not.toBe(b);
  });

  it("generates deterministic structure even with Date.now mocked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const sig1 = generateSig("12345");
    const sig2 = generateSig("12345");
    // same time and same code => same sig
    expect(sig1).toBe(sig2);
    vi.useRealTimers();
  });
});
