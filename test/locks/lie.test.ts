import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../helpers";
import { createLieLock } from "../../src/locks/lie";
import { registry } from "../../src/webmcp/registry";

describe("THE LIE - audit_truth", () => {
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

  it("registers audit_truth and shows fake display", async () => {
    const api = createLieLock();
    api.mount(container, "7", onSolved);
    await flush();
    expect(registry.list()).toContain("audit_truth");
    expect(container.textContent).toContain("$10.00");
    expect(container.textContent).toContain("???");
    api.unmount();
  });

  it("audit_truth reveals ledger truth $999 and digit", async () => {
    const api = createLieLock();
    api.mount(container, "4", onSolved);
    await flush();
    const res = await executeTool("audit_truth", {});
    expect(res.content[0].text).toContain("Display $10.00 LIES");
    expect(res.content[0].text).toContain("Ledger $999.00 truth");
    expect(res.content[0].text).toContain("digit: 4");
    expect(res.data?.displayed).toBe("$10.00");
    expect(res.data?.real).toBe("$999.00");
    expect(res.data?.digit).toBe("4");
    expect(res.data?.ledger).toBeDefined();

    const realVal = container.querySelector<HTMLElement>("#lie-real-value");
    expect(realVal?.textContent).toBe("$999.00");
    const inline = container.querySelector<HTMLElement>("#lie-real-inline");
    expect(inline?.textContent).toBe("$999.00");
    api.unmount();
  });

  it("must audit before trusting", async () => {
    const api = createLieLock();
    api.mount(container, "9", onSolved);
    await flush();
    const trustDisplay = container.querySelector<HTMLButtonElement>("#lie-trust-display");
    const trustLedger = container.querySelector<HTMLButtonElement>("#lie-trust-ledger");
    const log = container.querySelector<HTMLElement>("#lie-log");
    trustDisplay!.click();
    expect(log?.textContent).toContain("Must audit first");
    trustLedger!.click();
    expect(log?.textContent).toContain("Must audit first");
    api.unmount();
  });

  it("trust buttons update log after audit", async () => {
    const api = createLieLock();
    api.mount(container, "5", onSolved);
    await flush();
    await executeTool("audit_truth", {});
    const trustLedger = container.querySelector<HTMLButtonElement>("#lie-trust-ledger");
    const trustDisplay = container.querySelector<HTMLButtonElement>("#lie-trust-display");
    const log = container.querySelector<HTMLElement>("#lie-log");
    trustLedger!.click();
    expect(log?.textContent).toContain("Trusted ledger");
    trustDisplay!.click();
    expect(log?.textContent).toContain("Wrong");
    api.unmount();
  });

  it("submit requires audit and checks digit", async () => {
    const api = createLieLock();
    api.mount(container, "3", onSolved);
    await flush();
    const input = container.querySelector<HTMLInputElement>("#lie-input");
    const submit = container.querySelector<HTMLButtonElement>("#lie-submit");
    const log = container.querySelector<HTMLElement>("#lie-log");

    input!.value = "3";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(log?.textContent).toContain("Must audit first");

    await executeTool("audit_truth", {});
    input!.value = "9";
    submit!.click();
    expect(onSolved).not.toHaveBeenCalled();
    expect(log?.textContent).toContain("Wrong, ledger digit is 3");

    input!.value = "3";
    submit!.click();
    expect(onSolved).toHaveBeenCalledTimes(1);
    api.unmount();
  });

  it("reveals css class after audit", async () => {
    const api = createLieLock();
    api.mount(container, "1", onSolved);
    await flush();
    const realCard = container.querySelector<HTMLElement>("#lie-real");
    expect(realCard?.classList.contains("revealed")).toBe(false);
    await executeTool("audit_truth", {});
    expect(realCard?.classList.contains("revealed")).toBe(true);
    api.unmount();
  });

  it("ledger id contains code digit", async () => {
    const api = createLieLock();
    api.mount(container, "8", onSolved);
    await flush();
    expect(container.textContent).toContain("vault_ledger_8_");
    const res = await executeTool("audit_truth", {});
    expect(String(res.data?.ledger)).toContain("8");
    api.unmount();
  });

  it("unmount unregisters", async () => {
    const api = createLieLock();
    api.mount(container, "1", onSolved);
    await flush();
    expect(registry.list()).toContain("audit_truth");
    api.unmount();
    await flush();
    expect(registry.list()).not.toContain("audit_truth");
  });
});
