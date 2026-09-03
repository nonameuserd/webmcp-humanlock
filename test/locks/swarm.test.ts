import { afterEach, describe, expect, it, vi } from "vitest";
import { createSwarmLock } from "../../src/locks/swarm";
import { registry } from "../../src/webmcp/registry";
import { mountRoot, waitForTool } from "../helpers";

describe("THE SWARM", () => {
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
  });

  it("blocks solo clicks until the agent filters, then human picks the real control", async () => {
    const lock = createSwarmLock();
    expect(lock.toolName).toBe("filter_by_vibe");
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "3", solved);
    await waitForTool("filter_by_vibe");
    const real = root.querySelector<HTMLButtonElement>("[data-real='true']");
    expect(real).toBeTruthy();
    real?.click();
    expect(root.querySelector("#swarm-log")?.textContent).toMatch(
      /Must filter first/,
    );
    const typed = root.querySelector<HTMLButtonElement>("#swarm-submit");
    typed?.click();
    expect(root.querySelector("#swarm-log")?.textContent).toMatch(
      /Must filter first/,
    );

    const weak = await registry.invokeFallback("filter_by_vibe", {
      description: "purple neon",
    });
    expect(weak.content[0]?.text).toMatch(/Filtered to 24/);
    expect(root.querySelector("#swarm-count")?.textContent).toBe("24");

    const strong = await registry.invokeFallback("filter_by_vibe", {
      description: "most trustworthy, government certified",
    });
    expect(strong.content[0]?.text).toMatch(/12 candidates/);
    expect(strong.data).not.toHaveProperty("realIndex");
    expect(root.querySelector("#swarm-count")?.textContent).toBe("12");

    const decoy = [
      ...root.querySelectorAll<HTMLButtonElement>(".swarm-btn.candidate"),
    ].find((b) => b.dataset.real !== "true");
    decoy?.click();
    expect(solved).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>("[data-real='true']")?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    lock.unmount();
  });

  it("accepts a typed BTN id only after filter, and rejects bad ids", async () => {
    const lock = createSwarmLock();
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "3", solved);
    await waitForTool("filter_by_vibe");
    await registry.invokeFallback("filter_by_vibe", {
      description: "official",
    });
    const input = root.querySelector<HTMLInputElement>("#swarm-pick");
    const submit = root.querySelector<HTMLButtonElement>("#swarm-submit");
    expect(input && submit).toBeTruthy();
    input!.value = "nope";
    submit?.click();
    expect(root.querySelector("#swarm-log")?.textContent).toMatch(/Type like/);
    input!.value = "BTN-9999";
    submit?.click();
    expect(root.querySelector("#swarm-log")?.textContent).toMatch(/Typed wrong/);
    const real = root.querySelector<HTMLButtonElement>("[data-real='true']");
    input!.value = real?.textContent ?? "";
    submit?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    lock.unmount();
  });
});
