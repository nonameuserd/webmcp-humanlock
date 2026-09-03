import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlurLock } from "../../src/locks/blur";
import { registry } from "../../src/webmcp/registry";
import { mountRoot, waitForTool } from "../helpers";

describe("THE BLUR", () => {
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
  });

  it("rejects freeze without a timestamp and misses outside the glitch window", async () => {
    const lock = createBlurLock();
    expect(lock.toolName).toBe("freeze_frame");
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "7", solved);
    await waitForTool("freeze_frame");
    await new Promise((resolve) => {
      window.setTimeout(resolve, 20);
    });
    const missing = await registry.invokeFallback("freeze_frame", {});
    expect(missing.isError).toBe(true);
    const miss = await registry.invokeFallback("freeze_frame", {
      timestamp: 10,
    });
    expect(miss.isError).toBe(true);
    expect(miss.content[0]?.text).toMatch(/Miss/);
    expect(solved).not.toHaveBeenCalled();
    lock.unmount();
  });

  it("requires freeze then a human-typed digit; unfreeze resets", async () => {
    const lock = createBlurLock();
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "7", solved);
    await waitForTool("freeze_frame");
    const submit = root.querySelector<HTMLButtonElement>("#blur-submit");
    const unfreeze = root.querySelector<HTMLButtonElement>("#blur-unfreeze");
    const input = root.querySelector<HTMLInputElement>("#blur-input");
    const log = root.querySelector<HTMLElement>("#blur-log");
    expect(submit && unfreeze && input && log).toBeTruthy();
    submit?.click();
    expect(log?.textContent).toMatch(/Must freeze_frame first/);
    const hit = await registry.invokeFallback("freeze_frame", {
      timestamp: 300,
    });
    expect(hit.isError).toBeFalsy();
    expect(String(hit.data?.digit)).toBe("7");
    input!.value = "0";
    submit?.click();
    expect(log?.textContent).toMatch(/Wrong/);
    expect(solved).not.toHaveBeenCalled();
    input!.value = "7";
    submit?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    unfreeze?.click();
    expect(log?.textContent).toMatch(/Unfrozen/);
    lock.unmount();
    expect(registry.list()).not.toContain("freeze_frame");
  });
});
