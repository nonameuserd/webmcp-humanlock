import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandshakeLock } from "../../src/locks/handshake";
import { registry } from "../../src/webmcp/registry";
import { mountRoot, waitForTool } from "../helpers";

function drag(range: HTMLInputElement): void {
  range.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  range.dispatchEvent(new Event("pointerup", { bubbles: true }));
}

describe("THE HANDSHAKE", () => {
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
  });

  it("refuses a drag before arm and an agent call before the human drags", async () => {
    const lock = createHandshakeLock();
    expect(lock.toolName).toBe("align_quantum_lock");
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "7", solved);
    await waitForTool("align_quantum_lock");
    const range = root.querySelector<HTMLInputElement>("#handshake-range");
    expect(range).toBeTruthy();
    range!.value = "80";
    range!.dispatchEvent(new Event("input", { bubbles: true }));
    drag(range!);
    expect(root.querySelector("#handshake-log")?.textContent).toMatch(
      /Must Arm first/,
    );
    const early = await registry.invokeFallback("align_quantum_lock", {});
    expect(early.content[0]?.text).toMatch(/has not dragged/);
    expect(solved).not.toHaveBeenCalled();
    lock.unmount();
  });

  it("records a tight sync and unlocks when the human submits the digit", async () => {
    const lock = createHandshakeLock();
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "7", solved);
    await waitForTool("align_quantum_lock");
    root.querySelector<HTMLButtonElement>("#handshake-arm")?.click();
    const range = root.querySelector<HTMLInputElement>("#handshake-range");
    drag(range!);
    const sync = await registry.invokeFallback("align_quantum_lock", {});
    expect(sync.content[0]?.text).toMatch(/aligned within/);
    expect(solved).not.toHaveBeenCalled();
    const input = root.querySelector<HTMLInputElement>("#handshake-input");
    input!.value = "7";
    root.querySelector<HTMLButtonElement>("#handshake-submit")?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    lock.unmount();
  });

  it("resets instantly on a miss and still allows a typed unlock after a tight sync", async () => {
    const lock = createHandshakeLock();
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "5", solved);
    await waitForTool("align_quantum_lock");
    const arm = root.querySelector<HTMLButtonElement>("#handshake-arm");
    const range = root.querySelector<HTMLInputElement>("#handshake-range");
    const submit = root.querySelector<HTMLButtonElement>("#handshake-submit");
    const input = root.querySelector<HTMLInputElement>("#handshake-input");
    submit?.click();
    expect(root.querySelector("#handshake-log")?.textContent).toMatch(
      /Must sync first/,
    );
    arm?.click();
    drag(range!);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 80);
    });
    const miss = await registry.invokeFallback("align_quantum_lock", {});
    expect(miss.isError).toBe(true);
    expect(root.querySelector("#handshake-sync")?.textContent).toMatch(/MISS/);

    arm?.click();
    drag(range!);
    await registry.invokeFallback("align_quantum_lock", {});
    input!.value = "0";
    submit?.click();
    expect(root.querySelector("#handshake-log")?.textContent).toMatch(
      /wrong digit|Synced but wrong/,
    );
    input!.value = "5";
    submit?.click();
    expect(solved).toHaveBeenCalled();
    lock.unmount();
  });

  it("solves on the human drag when the agent already aligned", async () => {
    const lock = createHandshakeLock();
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "7", solved);
    await waitForTool("align_quantum_lock");
    await registry.invokeFallback("align_quantum_lock", {});
    root.querySelector<HTMLButtonElement>("#handshake-arm")?.click();
    const range = root.querySelector<HTMLInputElement>("#handshake-range");
    drag(range!);
    expect(solved).toHaveBeenCalled();
    lock.unmount();
  });
});
