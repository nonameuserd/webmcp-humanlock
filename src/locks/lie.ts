import { registry } from "../webmcp/registry";
import type { JsonValue } from "../webmcp/types";

export function createLieLock(): {
  toolName: string;
  mount: (container: HTMLElement, code: string, solved: () => void) => void;
  unmount: () => void;
} {
  const toolName = "audit_truth";
  let abort: AbortController | null = null;
  let codeDigit = "9";
  let onSolved: (() => void) | null = null;
  let audited = false;
  let trusted: "display" | "ledger" | null = null;
  const displayedBalance = "$10.00";
  const realBalance = "$999.00";

  return {
    toolName,
    mount(container: HTMLElement, code: string, solved: () => void) {
      codeDigit = code;
      onSolved = solved;
      audited = false;
      trusted = null;
      const ledger = `vault_ledger_${codeDigit}_${Math.random().toString(36).slice(2, 6)}`;
      container.innerHTML = `
        <div class="lie-wrap">
          <div class="lie-display">
            <div class="lie-card lie-card--fake">
              <span>Vault display</span>
              <strong>${displayedBalance}</strong>
              <small>What the UI claims</small>
            </div>
            <div class="lie-card lie-card--real" id="lie-real">
              <span>Ledger truth</span>
              <strong id="lie-real-value">???</strong>
              <small id="lie-real-hint">Call audit_truth to reveal</small>
            </div>
          </div>
          <div class="lie-ledger">
            <code>ledger id: ${ledger}</code>
            <span>displayed: ${displayedBalance} | real: <span id="lie-real-inline">?</span></span>
          </div>
          <div class="lie-controls">
            <button id="lie-trust-display" class="btn btn--ghost">Trust display ($10)</button>
            <button id="lie-trust-ledger" class="btn btn--primary">Trust ledger</button>
            <input id="lie-input" placeholder="Enter digit from ledger" maxlength="1" class="input" />
            <button id="lie-submit" class="btn btn--primary">Unlock</button>
          </div>
          <p class="hint">Agent: <code>audit_truth()</code> reveals the ledger. You weigh the evidence and choose Trust display or Trust ledger. Wrong trust does not open the lock.</p>
          <div id="lie-log" class="lock-log">Ask agent to audit.</div>
        </div>
      `;
      const logEl = container.querySelector<HTMLDivElement>("#lie-log");
      const realVal = container.querySelector<HTMLElement>("#lie-real-value");
      const realHint = container.querySelector<HTMLElement>("#lie-real-hint");
      const inline = container.querySelector<HTMLElement>("#lie-real-inline");
      if (!logEl || !realVal || !realHint || !inline) return;
      const log: HTMLElement = logEl;

      function trust(which: "display" | "ledger"): void {
        if (!audited) {
          log.textContent = "Must audit first. Agent has not revealed truth.";
          return;
        }
        trusted = which;
        if (which === "ledger")
          log.textContent = `You trusted the ledger (${realBalance}). Type the digit from that record.`;
        else
          log.textContent = `You trusted the display (${displayedBalance}). That record does not open this lock. Reconsider.`;
      }

      const trustDisplayBtn =
        container.querySelector<HTMLButtonElement>("#lie-trust-display");
      const trustLedgerBtn =
        container.querySelector<HTMLButtonElement>("#lie-trust-ledger");
      const submitBtn =
        container.querySelector<HTMLButtonElement>("#lie-submit");
      const input = container.querySelector<HTMLInputElement>("#lie-input");
      if (!trustDisplayBtn || !trustLedgerBtn || !submitBtn || !input) return;

      trustDisplayBtn.addEventListener("click", () => trust("display"));
      trustLedgerBtn.addEventListener("click", () => trust("ledger"));
      submitBtn.addEventListener("click", () => {
        const v = (input.value || "").trim();
        if (!audited) {
          log.textContent = "Must audit first.";
          return;
        }
        if (trusted !== "ledger") {
          log.textContent =
            "You have to decide. Trust the ledger to proceed, or reject it.";
          return;
        }
        if (v === codeDigit) {
          log.textContent = `Correct ledger digit ${codeDigit}.`;
          if (onSolved) onSolved();
        } else log.textContent = `Wrong, ledger digit is ${codeDigit}`;
      });

      void registry
        .register({
          name: toolName,
          description:
            "Audit vault display versus ledger truth. Reveals the conflicting records. Human must decide which to trust. Agent cannot complete the lock.",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: async () => {
            audited = true;
            realVal.textContent = realBalance;
            realHint.textContent = `Ledger digit: ${codeDigit}`;
            inline.textContent = realBalance;
            const realCard = container.querySelector<HTMLElement>("#lie-real");
            if (realCard) realCard.classList.add("revealed");
            log.textContent = `Audit complete. Display ${displayedBalance} vs ledger ${realBalance}. Human must decide which to trust.`;
            return {
              content: [
                {
                  type: "text",
                  text: `AUDIT: Display claims ${displayedBalance}. Ledger records ${realBalance} and a hidden digit. You cannot decide for the human. Tell them to weigh the evidence, choose Trust display or Trust ledger, then enter the digit from the record they trust.`,
                },
              ],
              data: {
                displayed: displayedBalance as JsonValue,
                real: realBalance as JsonValue,
                ledger: ledger as JsonValue,
              },
            };
          },
        })
        .then((c) => {
          abort = c;
        });
    },
    unmount() {
      if (abort) registry.unregister(toolName);
      abort = null;
    },
  };
}
