import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../helpers";
import { createWhisperLock } from "../../src/locks/whisper";
import { registry } from "../../src/webmcp/registry";

describe("THE WHISPER - sonify_to_spectrogram", () => {
  let container: HTMLElement;
  let onSolved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry.unregisterAll();
    // @ts-expect-error delete
    container = document.createElement("div");
    document.body.appendChild(container);
    onSolved = vi.fn();
  });

  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
  });

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }

  it("registers tool and shows empty spectrogram", async () => {
    const api = createWhisperLock();
    api.mount(container, "6", onSolved);
    await flush();
    expect(registry.list()).toContain("sonify_to_spectrogram");
    const canvas = container.querySelector<HTMLCanvasElement>("#whisper-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(640);
    expect(canvas!.height).toBe(240);
    api.unmount();
  });

  it("sonify_to_spectrogram renders digit and marks revealed", async () => {
    const api = createWhisperLock();
    api.mount(container, "4", onSolved);
    await flush();
    const log = container.querySelector<HTMLElement>("#whisper-log");
    expect(log?.textContent).toContain("Click Play");

    const res = await executeTool("sonify_to_spectrogram", {});
    expect(res.content[0].text).toContain("Hidden digit is 4");
    expect(res.data?.digit).toBe("4");
    expect(log?.textContent).toContain("Spectrogram rendered");

    const input = container.querySelector<HTMLInputElement>("#whisper-input");
    const submit = container.querySelector<HTMLButtonElement>("#whisper-submit");
    input!.value = "4";
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("cannot submit before spectrogram", async () => {
    const api = createWhisperLock();
    api.mount(container, "8", onSolved);
    await flush();
    const input = container.querySelector<HTMLInputElement>("#whisper-input");
    const submit = container.querySelector<HTMLButtonElement>("#whisper-submit");
    const log = container.querySelector<HTMLElement>("#whisper-log");
    input!.value = "8";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(log?.textContent).toContain("Must spectrogram first");
    api.unmount();
  });

  it("wrong digit after reveal does not solve", async () => {
    const api = createWhisperLock();
    api.mount(container, "2", onSolved);
    await flush();
    await executeTool("sonify_to_spectrogram", {});
    const input = container.querySelector<HTMLInputElement>("#whisper-input");
    const submit = container.querySelector<HTMLButtonElement>("#whisper-submit");
    input!.value = "9";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    api.unmount();
  });

  it("play button triggers ultrasonic mock", async () => {
    const api = createWhisperLock();
    api.mount(container, "5", onSolved);
    await flush();
    const playBtn = container.querySelector<HTMLButtonElement>("#whisper-play");
    const log = container.querySelector<HTMLElement>("#whisper-log");
    expect(playBtn).not.toBeNull();
    playBtn!.click();
    expect(log?.textContent).toContain("Played 19.5kHz");
    api.unmount();
  });

  it("reveal button hints if not yet rendered", async () => {
    const api = createWhisperLock();
    api.mount(container, "3", onSolved);
    await flush();
    const revealBtn = container.querySelector<HTMLButtonElement>("#whisper-reveal");
    const log = container.querySelector<HTMLElement>("#whisper-log");
    revealBtn!.click();
    expect(log?.textContent).toContain("Spectrogram not yet rendered");
    await executeTool("sonify_to_spectrogram", {});
    revealBtn!.click();
    expect(log?.textContent).toContain("Human sees digit");
    api.unmount();
  });

  it("unmount cleans up and unregisters", async () => {
    const api = createWhisperLock();
    api.mount(container, "1", onSolved);
    await flush();
    expect(registry.list()).toContain("sonify_to_spectrogram");
    api.unmount();
    await flush();
    expect(registry.list()).not.toContain("sonify_to_spectrogram");
  });

  it("tool description no plus", async () => {
    const api = createWhisperLock();
    api.mount(container, "1", onSolved);
    await flush();
    const def = registry.getDef("sonify_to_spectrogram");
    expect(def).toBeDefined();
    expect(def?.description).not.toContain("+");
    api.unmount();
  });
});
