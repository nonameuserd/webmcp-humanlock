import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhisperLock } from "../../src/locks/whisper";
import { registry } from "../../src/webmcp/registry";
import { mountRoot, waitForTool } from "../helpers";

class FakeOscillator {
  frequency = { value: 0 };
  type = "sine";
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = { value: 0 };
  connect = vi.fn();
}

class FakeAudioContext {
  state = "suspended";
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {});
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
}

describe("THE WHISPER", () => {
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("does not leak the digit to the agent; human must read and submit", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const lock = createWhisperLock();
    expect(lock.toolName).toBe("sonify_to_spectrogram");
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "4", solved);
    await waitForTool("sonify_to_spectrogram");
    root.querySelector<HTMLButtonElement>("#whisper-play")?.click();
    root.querySelector<HTMLButtonElement>("#whisper-reveal")?.click();
    expect(root.querySelector("#whisper-log")?.textContent).toMatch(
      /not yet rendered/,
    );
    root.querySelector<HTMLButtonElement>("#whisper-submit")?.click();
    expect(root.querySelector("#whisper-log")?.textContent).toMatch(
      /Must spectrogram first/,
    );

    const result = await registry.invokeFallback("sonify_to_spectrogram", {});
    expect(result.data).toEqual({ rendered: true });
    expect(result.content[0]?.text).not.toMatch(/4/);
    root.querySelector<HTMLButtonElement>("#whisper-reveal")?.click();
    expect(root.querySelector("#whisper-log")?.textContent).toMatch(/Type it/);

    const input = root.querySelector<HTMLInputElement>("#whisper-input");
    input!.value = "0";
    root.querySelector<HTMLButtonElement>("#whisper-submit")?.click();
    expect(solved).not.toHaveBeenCalled();
    input!.value = "4";
    root.querySelector<HTMLButtonElement>("#whisper-submit")?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    lock.unmount();
  });
});
