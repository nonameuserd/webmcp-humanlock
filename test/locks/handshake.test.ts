import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../helpers";
import { createHandshakeLock } from "../../src/locks/handshake";
import { registry } from "../../src/webmcp/registry";

describe("THE HANDSHAKE - align_quantum_lock", () => {
  let container: HTMLElement;
  let onSolved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry.unregisterAll();
    container = document.createElement("div");
    document.body.appendChild(container);
    onSolved = vi.fn();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    (globalThis as unknown as { __advancePerf: (n: number) => void }).__advancePerf = (n: number) => {
      now += n;
    };
  });

  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function advancePerf(n: number): void {
    const fn = (globalThis as unknown as { __advancePerf: (n: number) => void }).__advancePerf;
    if (fn) fn(n);
  }

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }

  it("registers align_quantum_lock and mounts UI", async () => {
    const api = createHandshakeLock();
    api.mount(container, "7", onSolved);
    await flush();
    expect(registry.list()).toContain("align_quantum_lock");
    expect(container.querySelector("#handshake-range")).not.toBeNull();
    expect(container.querySelector("#handshake-thumb")).not.toBeNull();
    api.unmount();
  });

  it("agent align before human drag reports need human", async () => {
    const api = createHandshakeLock();
    api.mount(container, "5", onSolved);
    await flush();
    const res = await executeTool("align_quantum_lock", {});
    expect(res.content[0].text).toContain("human has not dragged");
    expect(res.data?.diff).toBeNull();
    expect(res.data?.agentAt).toBeDefined();
    api.unmount();
  });

  it("sync within 50ms succeeds", async () => {
    const api = createHandshakeLock();
    api.mount(container, "9", onSolved);
    await flush();
    const armBtn = container.querySelector<HTMLButtonElement>("#handshake-arm");
    const range = container.querySelector<HTMLInputElement>("#handshake-range");
    armBtn!.click();
    range!.dispatchEvent(new Event("pointerdown"));
    advancePerf(0);
    range!.dispatchEvent(new Event("pointerup"));

    advancePerf(20);
    const res = await executeTool("align_quantum_lock", {});
    expect(res.content[0].text).toContain("SYNC SUCCESS");
    expect(res.content[0].text).toContain("9");
    expect(res.data?.digit).toBe("9");
    expect(res.data?.diff).toBeDefined();
    expect(Number(res.data?.diff)).toBeLessThanOrEqual(50);
    expect(onSolved).not.toHaveBeenCalled();
    const input = container.querySelector<HTMLInputElement>("#handshake-input");
    const submit = container.querySelector<HTMLButtonElement>("#handshake-submit");
    input!.value = "9";
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("miss over 50ms returns isError", async () => {
    const api = createHandshakeLock();
    api.mount(container, "3", onSolved);
    await flush();
    const armBtn = container.querySelector<HTMLButtonElement>("#handshake-arm");
    const range = container.querySelector<HTMLInputElement>("#handshake-range");
    armBtn!.click();
    range!.dispatchEvent(new Event("pointerdown"));
    range!.dispatchEvent(new Event("pointerup"));
    advancePerf(100);
    const res = await executeTool("align_quantum_lock", {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("MISS");
    expect(Number(res.data?.diff)).toBeGreaterThan(50);
    const input = container.querySelector<HTMLInputElement>("#handshake-input");
    const submit = container.querySelector<HTMLButtonElement>("#handshake-submit");
    input!.value = "3";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    api.unmount();
  });

  it("requires arm before drag counts", async () => {
    const api = createHandshakeLock();
    api.mount(container, "1", onSolved);
    await flush();
    const range = container.querySelector<HTMLInputElement>("#handshake-range");
    const log = container.querySelector<HTMLElement>("#handshake-log");
    range!.dispatchEvent(new Event("pointerdown"));
    range!.dispatchEvent(new Event("pointerup"));
    expect(log?.textContent).toContain("Must Arm first");
    api.unmount();
  });

  it("change event also triggers human drag when armed", async () => {
    const api = createHandshakeLock();
    api.mount(container, "2", onSolved);
    await flush();
    const armBtn = container.querySelector<HTMLButtonElement>("#handshake-arm");
    armBtn!.click();
    const range = container.querySelector<HTMLInputElement>("#handshake-range");
    advancePerf(10);
    range!.dispatchEvent(new Event("change"));
    expect(range).toBeDefined();
    advancePerf(10);
    const res = await executeTool("align_quantum_lock", {});
    expect(res.content[0].text).toContain("SYNC SUCCESS");
    api.unmount();
  });

  it("submit stays locked until sync", async () => {
    const api = createHandshakeLock();
    api.mount(container, "4", onSolved);
    await flush();
    const input = container.querySelector<HTMLInputElement>("#handshake-input");
    const submit = container.querySelector<HTMLButtonElement>("#handshake-submit");
    expect(input?.disabled).toBe(true);
    expect(submit?.disabled).toBe(true);
    input!.disabled = false;
    submit!.disabled = false;
    input!.value = "4";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    const log = container.querySelector<HTMLElement>("#handshake-log");
    expect(log?.textContent).toContain("Sync first");
    api.unmount();
  });

  it("submit after sync but wrong digit does not solve", async () => {
    const api = createHandshakeLock();
    api.mount(container, "6", onSolved);
    await flush();
    const armBtn = container.querySelector<HTMLButtonElement>("#handshake-arm");
    const range = container.querySelector<HTMLInputElement>("#handshake-range");
    armBtn!.click();
    range!.dispatchEvent(new Event("pointerdown"));
    range!.dispatchEvent(new Event("pointerup"));
    advancePerf(10);
    await executeTool("align_quantum_lock", {});
    const input = container.querySelector<HTMLInputElement>("#handshake-input");
    const submit = container.querySelector<HTMLButtonElement>("#handshake-submit");
    input!.value = "9";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    const log = container.querySelector<HTMLElement>("#handshake-log");
    expect(log?.textContent).toContain("wrong digit");
    api.unmount();
  });

  it("thumb updates on input", async () => {
    const api = createHandshakeLock();
    api.mount(container, "7", onSolved);
    await flush();
    const range = container.querySelector<HTMLInputElement>("#handshake-range") as HTMLInputElement;
    const thumb = container.querySelector<HTMLElement>("#handshake-thumb") as HTMLElement;
    range.value = "75";
    range.dispatchEvent(new Event("input"));
    expect(thumb.style.left).toBe("75%");
    api.unmount();
  });

  it("unmount unregisters", async () => {
    const api = createHandshakeLock();
    api.mount(container, "7", onSolved);
    await flush();
    expect(registry.list()).toContain("align_quantum_lock");
    api.unmount();
    await flush();
    expect(registry.list()).not.toContain("align_quantum_lock");
  });
});
