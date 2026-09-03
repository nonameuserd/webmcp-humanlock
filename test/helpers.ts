import { expect, vi } from "vitest";
import { registry } from "../src/webmcp/registry";

/**
 * Wait until a lock tool has finished async registration.
 */
export async function waitForTool(name: string): Promise<void> {
  await vi.waitFor(() => {
    expect(registry.list()).toContain(name);
  });
}

export function mountRoot(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}
