import { afterEach, describe, expect, it, vi } from "vitest";
import { createLieLock } from "../../src/locks/lie";
import { registry } from "../../src/webmcp/registry";
import { mountRoot, waitForTool } from "../helpers";

describe("THE LIE", () => {
  afterEach(() => {
    registry.unregisterAll();
    document.body.innerHTML = "";
  });

  it("requires audit then a human trust decision before unlock", async () => {
    const lock = createLieLock();
    expect(lock.toolName).toBe("audit_truth");
    const root = mountRoot();
    const solved = vi.fn();
    lock.mount(root, "9", solved);
    await waitForTool("audit_truth");
    root.querySelector<HTMLButtonElement>("#lie-trust-ledger")?.click();
    expect(root.querySelector("#lie-log")?.textContent).toMatch(/Must audit first/);
    root.querySelector<HTMLButtonElement>("#lie-submit")?.click();
    expect(root.querySelector("#lie-log")?.textContent).toMatch(/Must audit first/);

    const audit = await registry.invokeFallback("audit_truth", {});
    expect(audit.data).not.toHaveProperty("digit");
    expect(audit.content[0]?.text).toMatch(/You cannot decide for the human/);

    const input = root.querySelector<HTMLInputElement>("#lie-input");
    input!.value = "9";
    root.querySelector<HTMLButtonElement>("#lie-submit")?.click();
    expect(root.querySelector("#lie-log")?.textContent).toMatch(/have to decide/);
    expect(solved).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>("#lie-trust-display")?.click();
    expect(root.querySelector("#lie-log")?.textContent).toMatch(/display/);
    root.querySelector<HTMLButtonElement>("#lie-submit")?.click();
    expect(solved).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>("#lie-trust-ledger")?.click();
    input!.value = "0";
    root.querySelector<HTMLButtonElement>("#lie-submit")?.click();
    expect(root.querySelector("#lie-log")?.textContent).toMatch(/Wrong/);
    input!.value = "9";
    root.querySelector<HTMLButtonElement>("#lie-submit")?.click();
    expect(solved).toHaveBeenCalledTimes(1);
    lock.unmount();
  });
});
