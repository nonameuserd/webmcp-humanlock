import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../helpers";
import { createSwarmLock } from "../../src/locks/swarm";
import { registry } from "../../src/webmcp/registry";

describe("THE SWARM - filter_by_vibe", () => {
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

  it("registers filter_by_vibe and shows 300 initial buttons", async () => {
    const api = createSwarmLock();
    api.mount(container, "4", onSolved);
    await flush();
    expect(registry.list()).toContain("filter_by_vibe");
    const grid = container.querySelector<HTMLElement>("#swarm-grid");
    expect(grid).not.toBeNull();
    const buttons = grid!.querySelectorAll("button.swarm-btn");
    expect(buttons.length).toBe(300);
    api.unmount();
    await flush();
  });

  it("strong vibe (trustworthy etc) filters to 12 candidates", async () => {
    const api = createSwarmLock();
    api.mount(container, "5", onSolved);
    await flush();
    const res = await executeTool("filter_by_vibe", {
      description: "most trustworthy, government certified, official",
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("12 candidates");
    const candidates = res.data?.candidates as number[];
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBe(12);

    const countEl = container.querySelector<HTMLElement>("#swarm-count");
    expect(countEl?.textContent).toBe("12");

    const stateEl = container.querySelector<HTMLElement>("#swarm-state");
    expect(stateEl?.textContent).toContain("trustworthy");

    const grid = container.querySelector<HTMLElement>("#swarm-grid");
    const candidateBtns = grid!.querySelectorAll("button.candidate");
    expect(candidateBtns.length).toBe(12);
    api.unmount();
  });

  it("weak vibe filters to 24 random", async () => {
    const api = createSwarmLock();
    api.mount(container, "2", onSolved);
    await flush();
    const res = await executeTool("filter_by_vibe", {
      description: "cool blue buttons",
    });
    expect(res.content[0].text).toContain("24 buttons");
    expect(res.data?.candidates).toBeDefined();
    const candidates = res.data?.candidates as number[];
    expect(candidates.length).toBe(24);
    const countEl = container.querySelector<HTMLElement>("#swarm-count");
    expect(countEl?.textContent).toBe("24");
    const stateEl = container.querySelector<HTMLElement>("#swarm-state");
    expect(stateEl?.textContent).toContain("weak vibe");
    api.unmount();
  });

  it("returns error-like weak vibe but not isError, strong vibe not error", async () => {
    const api = createSwarmLock();
    api.mount(container, "8", onSolved);
    await flush();
    const weak = await executeTool("filter_by_vibe", { description: "xyz" });
    expect(weak.isError).toBeUndefined();
    const strong = await executeTool("filter_by_vibe", { description: "verified and authentic secure" });
    expect(strong.isError).toBeUndefined();
    const verified = await executeTool("filter_by_vibe", { description: "this is verified" });
    expect(verified.content[0].text).toContain("12 candidates");
    api.unmount();
  });

  it("requires filter before clicking real button", async () => {
    const api = createSwarmLock();
    api.mount(container, "3", onSolved);
    await flush();
    const grid = container.querySelector<HTMLElement>("#swarm-grid");
    const realBtn = grid!.querySelector<HTMLButtonElement>('button[data-real="true"]');
    expect(realBtn).not.toBeNull();
    const log = container.querySelector<HTMLElement>("#swarm-log");
    realBtn!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(log?.textContent).toContain("Must filter first");

    await executeTool("filter_by_vibe", { description: "trustworthy government official certified" });
    const grid2 = container.querySelector<HTMLElement>("#swarm-grid");
    const real2 = grid2!.querySelector<HTMLButtonElement>('button[data-real="true"]');
    expect(real2).not.toBeNull();
    real2!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("wrong button click does not solve and shows wrong", async () => {
    const api = createSwarmLock();
    api.mount(container, "7", onSolved);
    await flush();
    await executeTool("filter_by_vibe", { description: "trustworthy" });
    const grid = container.querySelector<HTMLElement>("#swarm-grid");
    const wrongBtn = grid!.querySelector<HTMLButtonElement>('button:not([data-real="true"]).candidate');
    expect(wrongBtn).not.toBeNull();
    wrongBtn!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(wrongBtn!.classList.contains("wrong")).toBe(true);
    api.unmount();
  });

  it("typed input submit validates correctly", async () => {
    const api = createSwarmLock();
    api.mount(container, "9", onSolved);
    await flush();
    await executeTool("filter_by_vibe", { description: "trustworthy official" });
    const input = container.querySelector<HTMLInputElement>("#swarm-pick");
    const submit = container.querySelector<HTMLButtonElement>("#swarm-submit");
    const grid = container.querySelector<HTMLElement>("#swarm-grid");
    const realBtn = grid!.querySelector<HTMLButtonElement>('button[data-real="true"]');
    const idx = Number(realBtn!.dataset.index);
    const code = `BTN-${String(idx).padStart(4, "0")}`;

    input!.value = "BTN-9999";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();

    input!.value = "not a button";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();

    input!.value = code.toLowerCase();
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("description check is case-insensitive", async () => {
    const api = createSwarmLock();
    api.mount(container, "1", onSolved);
    await flush();
    const res = await executeTool("filter_by_vibe", { description: "TRUSTWORTHY" });
    expect(res.content[0].text).toContain("12 candidates");
    api.unmount();
  });

  it("tool description has no plus", async () => {
    const api = createSwarmLock();
    api.mount(container, "1", onSolved);
    await flush();
    const def = registry.getDef("filter_by_vibe");
    expect(def).toBeDefined();
    expect(def?.description).not.toContain("+");
    api.unmount();
  });

  it("unmount unregisters", async () => {
    const api = createSwarmLock();
    api.mount(container, "1", onSolved);
    await flush();
    expect(registry.list()).toContain("filter_by_vibe");
    api.unmount();
    await flush();
    expect(registry.list()).not.toContain("filter_by_vibe");
  });
});
