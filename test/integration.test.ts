import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "./helpers";
import { createInitialState, nextLock, isVaultUnlocked, generateSig } from "../src/state";
import { DecayTimer } from "../src/utils/decay";
import { registry } from "../src/webmcp/registry";
import { createBlurLock } from "../src/locks/blur";
import { createSwarmLock } from "../src/locks/swarm";
import { createWhisperLock } from "../src/locks/whisper";
import { createLieLock } from "../src/locks/lie";
import { createHandshakeLock } from "../src/locks/handshake";
import type { VaultState } from "../src/webmcp/types";

describe("vault integration - sequential locks", () => {
  beforeEach(() => {
    registry.unregisterAll();
  });
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }

  it("full vault code is 5 digits and each lock contributes one", () => {
    vi.stubEnv("VITE_VAULT_SEED", "13579");
    const state = createInitialState();
    expect(state.vaultCode).toBe("13579");
    expect(state.codes.blur).toBe("1");
    expect(state.codes.handshake).toBe("9");
    vi.unstubAllEnvs();
  });

  it("solving locks sequentially advances nextLock", () => {
    const state: VaultState = {
      status: "running",
      currentLock: null,
      solved: { blur: false, swarm: false, whisper: false, lie: false, handshake: false },
      codes: { blur: "1", swarm: "2", whisper: "3", lie: "4", handshake: "5" },
      vaultCode: "12345",
      startedAt: Date.now(),
      unlockedAt: null,
    };
    expect(nextLock(state)).toBe("blur");
    state.solved.blur = true;
    expect(nextLock(state)).toBe("swarm");
    state.solved.swarm = true;
    state.solved.whisper = true;
    state.solved.lie = true;
    expect(nextLock(state)).toBe("handshake");
    state.solved.handshake = true;
    expect(isVaultUnlocked(state)).toBe(true);
    expect(nextLock(state)).toBeNull();
  });

  it("all five tools can be registered and invoked in order (happy path)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const solvedOrder: string[] = [];

    // blur
    const blur = createBlurLock();
    blur.mount(container, "1", () => solvedOrder.push("blur"));
    await flush();
    let res = await executeTool("freeze_frame", { timestamp: 300 });
    expect(res.data?.digit).toBe("1");
    const blurInput = container.querySelector<HTMLInputElement>("#blur-input")!;
    const blurSubmit = container.querySelector<HTMLButtonElement>("#blur-submit")!;
    blurInput.value = "1";
    blurSubmit.click();
    expect(solvedOrder).toContain("blur");
    blur.unmount();
    await flush();

    // swarm
    const swarm = createSwarmLock();
    swarm.mount(container, "2", () => solvedOrder.push("swarm"));
    await flush();
    res = await executeTool("filter_by_vibe", { description: "trustworthy government official" });
    expect(res.data?.candidates).toBeDefined();
    const grid = container.querySelector<HTMLElement>("#swarm-grid")!;
    const realBtn = grid.querySelector<HTMLButtonElement>('button[data-real="true"]')!;
    realBtn.click();
    expect(solvedOrder).toContain("swarm");
    swarm.unmount();
    await flush();

    // whisper
    const whisper = createWhisperLock();
    whisper.mount(container, "3", () => solvedOrder.push("whisper"));
    await flush();
    res = await executeTool("sonify_to_spectrogram", {});
    expect(res.data?.digit).toBe("3");
    const whisperInput = container.querySelector<HTMLInputElement>("#whisper-input")!;
    const whisperSubmit = container.querySelector<HTMLButtonElement>("#whisper-submit")!;
    whisperInput.value = "3";
    whisperSubmit.click();
    expect(solvedOrder).toContain("whisper");
    whisper.unmount();
    await flush();

    // lie
    const lie = createLieLock();
    lie.mount(container, "4", () => solvedOrder.push("lie"));
    await flush();
    res = await executeTool("audit_truth", {});
    expect(res.data?.digit).toBe("4");
    const lieInput = container.querySelector<HTMLInputElement>("#lie-input")!;
    const lieSubmit = container.querySelector<HTMLButtonElement>("#lie-submit")!;
    lieInput.value = "4";
    lieSubmit.click();
    expect(solvedOrder).toContain("lie");
    lie.unmount();
    await flush();

    // handshake: need perf sync
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const handshake = createHandshakeLock();
    handshake.mount(container, "5", () => solvedOrder.push("handshake"));
    await flush();
    const arm = container.querySelector<HTMLButtonElement>("#handshake-arm")!;
    const range = container.querySelector<HTMLInputElement>("#handshake-range")!;
    arm.click();
    range.dispatchEvent(new Event("pointerdown"));
    range.dispatchEvent(new Event("pointerup"));
    now += 20;
    res = await executeTool("align_quantum_lock", {});
    expect(res.data?.digit).toBe("5");
    const handInput = container.querySelector<HTMLInputElement>("#handshake-input")!;
    const handSubmit = container.querySelector<HTMLButtonElement>("#handshake-submit")!;
    handInput.value = "5";
    handSubmit.click();
    expect(solvedOrder).toContain("handshake");
    handshake.unmount();
    await flush();

    expect(solvedOrder).toEqual(["blur", "swarm", "whisper", "lie", "handshake"]);
    expect(solvedOrder).toHaveLength(5);
  });

  it("decay timer does not break vault if poked", () => {
    vi.useFakeTimers();
    const decay = new DecayTimer();
    const cb = vi.fn(() => {});
    decay.start(cb);
    vi.advanceTimersByTime(10_000);
    decay.poke();
    vi.advanceTimersByTime(10_000);
    decay.poke();
    vi.advanceTimersByTime(10_000);
    decay.poke();
    vi.advanceTimersByTime(20_000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(cb).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("generateSig produces shareable URL component", () => {
    const vaultCode = "54321";
    const sig = generateSig(vaultCode);
    const url = new URL("https://example.com");
    url.searchParams.set("code", vaultCode);
    url.searchParams.set("sig", sig);
    expect(url.searchParams.get("code")).toBe(vaultCode);
    expect(url.searchParams.get("sig")).toBe(sig);
    expect(url.toString()).toContain(`sig=${sig}`);
  });

  it("no plus or em dash in any tool descriptions", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const tools = [
      createBlurLock(),
      createSwarmLock(),
      createWhisperLock(),
      createLieLock(),
      createHandshakeLock(),
    ];
    for (const lock of tools) {
      lock.mount(container, "1", () => {});
      await flush();
      const def = registry.getDef(lock.toolName);
      expect(def, `missing ${lock.toolName}`).toBeDefined();
      expect(def!.description).not.toContain("+");
      expect(def!.description).not.toContain("—");
      lock.unmount();
      await flush();
    }
  });
});
