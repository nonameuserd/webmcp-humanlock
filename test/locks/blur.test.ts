import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../helpers";
import { createBlurLock } from "../../src/locks/blur";
import { registry } from "../../src/webmcp/registry";

describe("THE BLUR - freeze_frame", () => {
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
    // allow void registry.register().then to settle
    await new Promise((r) => setTimeout(r, 0));
  }

  it("registers freeze_frame on mount and unregisters on unmount", async () => {
    const api = createBlurLock();
    expect(api.toolName).toBe("freeze_frame");
    api.mount(container, "7", onSolved);
    await flush();
    expect(registry.list()).toContain("freeze_frame");
    const def = registry.getDef("freeze_frame");
    expect(def?.description.toLowerCase()).toContain("freeze");
    api.unmount();
    // unmount deletes immediately, but also need tick for abort emit
    await flush();
    expect(registry.list()).not.toContain("freeze_frame");
  });

  it("freeze_frame succeeds inside glitch window 280-340ms", async () => {
    const api = createBlurLock();
    api.mount(container, "5", onSolved);
    await flush();
    // timestamps inside window: 300, 900 (300+600), 1500, etc.
    // 300 in loop => loopT = 300 => inside 280-340
    let res = await executeTool("freeze_frame", { timestamp: 300 });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("FROZEN");
    expect(res.data?.digit).toBe("5");

    // also test edge 280 and 340 inclusive
    res = await executeTool("freeze_frame", { timestamp: 280 });
    expect(res.isError).toBeUndefined();
    res = await executeTool("freeze_frame", { timestamp: 340 });
    expect(res.isError).toBeUndefined();

    // 600 loop: 300+600=900 -> loopT 300 => ok
    res = await executeTool("freeze_frame", { timestamp: 900 });
    expect(res.isError).toBeUndefined();

    // negative timestamp with mod: -300 mod 600 -> 300 => should succeed because ((timestamp %600)+600)%600
    res = await executeTool("freeze_frame", { timestamp: -300 });
    expect(res.isError).toBeUndefined();
    api.unmount();
  });

  it("freeze_frame fails outside glitch window", async () => {
    const api = createBlurLock();
    api.mount(container, "9", onSolved);
    await flush();
    let res = await executeTool("freeze_frame", { timestamp: 0 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Miss");

    res = await executeTool("freeze_frame", { timestamp: 200 });
    expect(res.isError).toBe(true);

    res = await executeTool("freeze_frame", { timestamp: 350 });
    expect(res.isError).toBe(true);

    res = await executeTool("freeze_frame", { timestamp: 599 });
    expect(res.isError).toBe(true);
    api.unmount();
  });

  it("returns error when timestamp missing or not number", async () => {
    const api = createBlurLock();
    api.mount(container, "1", onSolved);
    await flush();
    let res = await executeTool("freeze_frame", {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Missing timestamp");

    res = await executeTool("freeze_frame", { timestamp: "300" as unknown as number });
    expect(res.isError).toBe(true);
    api.unmount();
  });

  it("requires revealed digit before human can solve, input check", async () => {
    const api = createBlurLock();
    api.mount(container, "7", onSolved);
    await flush();
    const input = container.querySelector<HTMLInputElement>("#blur-input");
    const submit = container.querySelector<HTMLButtonElement>("#blur-submit");
    const log = container.querySelector<HTMLElement>("#blur-log");
    expect(input).not.toBeNull();
    expect(submit).not.toBeNull();

    // try submit before freeze -> should not call onSolved
    input!.value = "7";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(log!.textContent).toContain("Must freeze_frame first");

    // freeze correctly
    await executeTool("freeze_frame", { timestamp: 300 });
    // wrong digit
    input!.value = "9";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();

    // correct digit
    input!.value = "7";
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("unfreeze resets revealed state", async () => {
    const api = createBlurLock();
    api.mount(container, "3", onSolved);
    await flush();
    await executeTool("freeze_frame", { timestamp: 300 });
    const unfreeze = container.querySelector<HTMLButtonElement>("#blur-unfreeze");
    const input = container.querySelector<HTMLInputElement>("#blur-input");
    const submit = container.querySelector<HTMLButtonElement>("#blur-submit");
    unfreeze!.click();
    input!.value = "3";
    submit!.click();
    // after unfreeze, revealed false so submit should fail
    expect(onSolved).not.toHaveBeenCalled();
    // freeze again then solve
    await executeTool("freeze_frame", { timestamp: 300 });
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("tool description forbids plus sign and em dash", async () => {
    const api = createBlurLock();
    api.mount(container, "7", onSolved);
    await flush();
    const def = registry.getDef("freeze_frame");
    expect(def).toBeDefined();
    expect(def?.description).not.toContain("+");
    expect(def?.description).not.toContain("—");
    api.unmount();
  });
});
