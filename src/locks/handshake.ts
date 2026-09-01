import { registry } from "../webmcp/registry";
import type { JsonValue } from "../webmcp/types";

type SyncOutcome = "idle" | "waiting" | "ok" | "miss";

/** Human drag and agent align_quantum_lock must land within this window (ms). */
export const HANDSHAKE_SYNC_MS = 50;

/**
 * Lock 5: human drag and agent align_quantum_lock must land within 50ms.
 */
export function createHandshakeLock(): {
  toolName: string;
  mount: (container: HTMLElement, code: string, solved: () => void) => void;
  unmount: () => void;
} {
  const toolName = "align_quantum_lock";
  let abort: AbortController | null = null;
  let codeDigit = "7";
  let onSolved: (() => void) | null = null;
  let lastHumanDrag = 0;
  let lastAgentAlign = 0;
  let humanArmed = false;
  let synced = false;
  let countdownTimer: number | null = null;

  return {
    toolName,
    mount(container: HTMLElement, code: string, solved: () => void) {
      codeDigit = code;
      onSolved = solved;
      lastHumanDrag = 0;
      lastAgentAlign = 0;
      humanArmed = false;
      synced = false;
      if (countdownTimer !== null) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }

      container.innerHTML = `
        <div class="handshake-wrap">
          <ol class="handshake-steps" aria-label="Handshake steps">
            <li id="hs-step-1" class="handshake-step handshake-step--active">
              <span class="handshake-step-num">1</span>
              <span class="handshake-step-text"><strong>Arm</strong> then get ready with your agent</span>
            </li>
            <li id="hs-step-2" class="handshake-step">
              <span class="handshake-step-num">2</span>
              <span class="handshake-step-text"><strong>On GO:</strong> you drag, agent calls <code>align_quantum_lock</code></span>
            </li>
            <li id="hs-step-3" class="handshake-step">
              <span class="handshake-step-num">3</span>
              <span class="handshake-step-text"><strong>Type the digit</strong> the agent reveals, then Unlock</span>
            </li>
          </ol>

          <div class="handshake-stage">
            <div class="handshake-track" aria-hidden="true">
              <div id="handshake-thumb" class="handshake-thumb"></div>
            </div>
            <label class="handshake-slider-label" for="handshake-range">Your slider (drag on GO)</label>
            <input id="handshake-range" type="range" min="0" max="100" value="50" class="handshake-range" />
            <div class="handshake-meta">
              <span id="handshake-human" class="badge">You: waiting</span>
              <span id="handshake-agent" class="badge">Agent: waiting</span>
              <span id="handshake-sync" class="badge">Sync: not yet</span>
            </div>
            <div id="handshake-countdown" class="handshake-countdown" aria-live="polite"></div>
          </div>

          <div class="handshake-controls">
            <button id="handshake-arm" type="button" class="btn btn--ghost">1. Arm</button>
            <button id="handshake-count" type="button" class="btn btn--ghost" disabled>2. Count 3-2-1</button>
            <input
              id="handshake-input"
              type="text"
              inputmode="numeric"
              placeholder="Digit from agent"
              maxlength="1"
              class="input"
              disabled
            />
            <button id="handshake-submit" type="button" class="btn btn--primary" disabled>3. Unlock</button>
          </div>

          <p class="hint">
            Both must act on the same GO. Window is ${HANDSHAKE_SYNC_MS}ms. You cannot unlock from the digit alone.
          </p>
          <div id="handshake-log" class="lock-log">
            Step 1: click Arm. Then tell your agent: on GO call align_quantum_lock.
          </div>
        </div>
      `;

      const range = container.querySelector("#handshake-range");
      const thumb = container.querySelector("#handshake-thumb");
      const humanEl = container.querySelector("#handshake-human");
      const agentEl = container.querySelector("#handshake-agent");
      const syncEl = container.querySelector("#handshake-sync");
      const log = container.querySelector("#handshake-log");
      const arm = container.querySelector("#handshake-arm");
      const count = container.querySelector("#handshake-count");
      const countdown = container.querySelector("#handshake-countdown");
      const submit = container.querySelector("#handshake-submit");
      const digitInput = container.querySelector("#handshake-input");
      const s1 = container.querySelector("#hs-step-1");
      const s2 = container.querySelector("#hs-step-2");
      const s3 = container.querySelector("#hs-step-3");

      if (
        !(range instanceof HTMLInputElement) ||
        !(thumb instanceof HTMLDivElement) ||
        !(humanEl instanceof HTMLElement) ||
        !(agentEl instanceof HTMLElement) ||
        !(syncEl instanceof HTMLElement) ||
        !(log instanceof HTMLElement) ||
        !(arm instanceof HTMLButtonElement) ||
        !(count instanceof HTMLButtonElement) ||
        !(countdown instanceof HTMLElement) ||
        !(submit instanceof HTMLButtonElement) ||
        !(digitInput instanceof HTMLInputElement) ||
        !(s1 instanceof HTMLElement) ||
        !(s2 instanceof HTMLElement) ||
        !(s3 instanceof HTMLElement)
      ) {
        return;
      }

      function setStep(active: 1 | 2 | 3): void {
        const steps = [s1, s2, s3];
        steps.forEach((el, i) => {
          if (!(el instanceof HTMLElement)) return;
          el.classList.toggle("handshake-step--active", i + 1 === active);
          el.classList.toggle("handshake-step--done", i + 1 < active);
        });
      }

      function setSyncBadge(outcome: SyncOutcome, diffMs?: number): void {
        if (!(syncEl instanceof HTMLElement)) return;
        if (outcome === "ok" && diffMs !== undefined) {
          syncEl.textContent = `Sync: ${Math.round(diffMs)}ms OK`;
          syncEl.className = "badge badge--ok";
          return;
        }
        if (outcome === "miss" && diffMs !== undefined) {
          syncEl.textContent = `Sync: missed by ${Math.round(diffMs)}ms`;
          syncEl.className = "badge badge--fail";
          return;
        }
        if (outcome === "waiting") {
          syncEl.textContent = "Sync: waiting for both";
          syncEl.className = "badge badge--armed";
          return;
        }
        syncEl.textContent = "Sync: not yet";
        syncEl.className = "badge";
      }

      function enableDigitEntry(): void {
        if (!(digitInput instanceof HTMLInputElement)) return;
        if (!(submit instanceof HTMLButtonElement)) return;
        digitInput.disabled = false;
        submit.disabled = false;
        digitInput.placeholder = "Digit from agent";
        setStep(3);
      }

      function resetPairing(): void {
        if (
          !(humanEl instanceof HTMLElement) ||
          !(agentEl instanceof HTMLElement) ||
          !(digitInput instanceof HTMLInputElement) ||
          !(submit instanceof HTMLButtonElement)
        ) {
          return;
        }
        lastHumanDrag = 0;
        lastAgentAlign = 0;
        synced = false;
        humanEl.textContent = humanArmed ? "You: armed" : "You: waiting";
        humanEl.className = humanArmed ? "badge badge--armed" : "badge";
        agentEl.textContent = "Agent: waiting";
        agentEl.className = "badge";
        setSyncBadge("idle");
        digitInput.disabled = true;
        submit.disabled = true;
        digitInput.value = "";
        if (humanArmed) setStep(2);
      }

      function evaluateSync(): void {
        if (
          !(log instanceof HTMLElement) ||
          !(humanEl instanceof HTMLElement) ||
          !(agentEl instanceof HTMLElement) ||
          !(digitInput instanceof HTMLInputElement) ||
          !(submit instanceof HTMLButtonElement)
        ) {
          return;
        }
        if (lastHumanDrag === 0 || lastAgentAlign === 0) {
          setSyncBadge("waiting");
          return;
        }
        const diff = Math.abs(lastHumanDrag - lastAgentAlign);
        if (diff <= HANDSHAKE_SYNC_MS) {
          synced = true;
          setSyncBadge("ok", diff);
          log.textContent = `Synced in ${Math.round(diff)}ms. Agent should tell you the digit. Type it and Unlock.`;
          enableDigitEntry();
          return;
        }
        synced = false;
        setSyncBadge("miss", diff);
        log.textContent = `Missed by ${Math.round(diff)}ms (need under ${HANDSHAKE_SYNC_MS}ms). Click Count 3-2-1 and try again together.`;
        lastHumanDrag = 0;
        lastAgentAlign = 0;
        humanEl.textContent = "You: armed";
        humanEl.className = "badge badge--armed";
        agentEl.textContent = "Agent: waiting";
        agentEl.className = "badge";
        digitInput.disabled = true;
        submit.disabled = true;
        setStep(2);
      }

      function updateThumb(): void {
        if (!(thumb instanceof HTMLDivElement)) return;
        if (!(range instanceof HTMLInputElement)) return;
        thumb.style.left = `${range.value}%`;
      }
      range.addEventListener("input", updateThumb);
      updateThumb();

      arm.addEventListener("click", () => {
        humanArmed = true;
        humanEl.textContent = "You: armed";
        humanEl.className = "badge badge--armed";
        count.disabled = false;
        setStep(2);
        setSyncBadge("waiting");
        log.textContent =
          "Armed. Tell agent: call align_quantum_lock on GO. Then click Count 3-2-1.";
      });

      count.addEventListener("click", () => {
        if (!humanArmed) {
          log.textContent = "Arm first.";
          return;
        }
        if (countdownTimer !== null) window.clearInterval(countdownTimer);
        resetPairing();
        let n = 3;
        countdown.textContent = String(n);
        countdown.className = "handshake-countdown handshake-countdown--on";
        log.textContent = "Counting. Drag the slider the instant you see GO.";
        countdownTimer = window.setInterval(() => {
          n -= 1;
          if (n > 0) {
            countdown.textContent = String(n);
            return;
          }
          if (countdownTimer !== null) window.clearInterval(countdownTimer);
          countdownTimer = null;
          countdown.textContent = "GO";
          countdown.className =
            "handshake-countdown handshake-countdown--on handshake-countdown--go";
          log.textContent =
            "GO: drag now. Agent should call align_quantum_lock now.";
          window.setTimeout(() => {
            countdown.textContent = "";
            countdown.className = "handshake-countdown";
          }, 800);
        }, 700);
      });

      let dragging = false;
      range.addEventListener("pointerdown", () => {
        dragging = true;
      });
      range.addEventListener("pointerup", () => {
        if (!humanArmed) {
          log.textContent = "Must Arm first.";
          return;
        }
        if (!dragging) return;
        dragging = false;
        lastHumanDrag = performance.now();
        humanEl.textContent = "You: dragged";
        humanEl.className = "badge badge--ok";
        log.textContent =
          `You dragged. Agent must call align_quantum_lock within ${HANDSHAKE_SYNC_MS}ms of this moment.`;
        evaluateSync();
      });
      range.addEventListener("change", () => {
        if (!humanArmed) return;
        lastHumanDrag = performance.now();
        humanEl.textContent = "You: dragged";
        humanEl.className = "badge badge--ok";
        evaluateSync();
      });

      submit.addEventListener("click", () => {
        const v = (digitInput.value || "").trim();
        if (!synced || lastHumanDrag === 0 || lastAgentAlign === 0) {
          log.textContent =
            "Sync first: Arm, Count 3-2-1, drag on GO while agent calls the tool.";
          return;
        }
        const diff = Math.abs(lastHumanDrag - lastAgentAlign);
        if (diff > HANDSHAKE_SYNC_MS) {
          log.textContent = `Not synced: ${Math.round(diff)}ms > ${HANDSHAKE_SYNC_MS}ms. Retry.`;
          return;
        }
        if (v === codeDigit) {
          log.textContent = `Correct. Synced ${Math.round(diff)}ms. Digit ${codeDigit}.`;
          if (onSolved) onSolved();
        } else {
          log.textContent =
            "Synced, but wrong digit. Ask the agent again for the digit.";
        }
      });

      void registry
        .register({
          name: toolName,
          description:
            `Align quantum lock with the human. Call this at the same instant the human drags the slider (on GO after their 3-2-1 countdown). Must land within ${HANDSHAKE_SYNC_MS}ms of the human drag. On success, tell the human the revealed digit so they can Unlock.`,
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: async () => {
            lastAgentAlign = performance.now();
            agentEl.textContent = "Agent: aligned";
            agentEl.className = "badge badge--ok";

            if (lastHumanDrag === 0) {
              setSyncBadge("waiting");
              log.textContent =
                "Agent aligned, but you have not dragged yet. Arm, Count 3-2-1, drag on GO.";
              const dataFirst: Record<string, JsonValue> = {
                agentAt: lastAgentAlign as JsonValue,
                diff: null,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: "Agent aligned, but human has not dragged yet. Tell human: Arm, click Count 3-2-1, drag the slider on GO while you call this again.",
                  },
                ],
                data: dataFirst,
              };
            }

            const diff = Math.abs(lastHumanDrag - lastAgentAlign);
            if (diff <= HANDSHAKE_SYNC_MS) {
              synced = true;
              setSyncBadge("ok", diff);
              enableDigitEntry();
              log.textContent = `Synced in ${Math.round(diff)}ms. Type digit ${codeDigit} and Unlock.`;
              const dataOk: Record<string, JsonValue> = {
                diff: diff as JsonValue,
                digit: codeDigit as JsonValue,
                humanAt: lastHumanDrag as JsonValue,
                agentAt: lastAgentAlign as JsonValue,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `SYNC SUCCESS ${Math.round(diff)}ms within ${HANDSHAKE_SYNC_MS}ms. Hidden digit is ${codeDigit}. Tell human to type ${codeDigit} and click Unlock.`,
                  },
                ],
                data: dataOk,
              };
            }

            synced = false;
            setSyncBadge("miss", diff);
            log.textContent = `Missed by ${Math.round(diff)}ms. Count 3-2-1 and try again on GO.`;
            const dataFail: Record<string, JsonValue> = {
              diff: diff as JsonValue,
              humanAt: lastHumanDrag as JsonValue,
              agentAt: lastAgentAlign as JsonValue,
            };
            lastHumanDrag = 0;
            lastAgentAlign = 0;
            humanEl.textContent = "You: armed";
            humanEl.className = "badge badge--armed";
            agentEl.textContent = "Agent: waiting";
            agentEl.className = "badge";
            return {
              content: [
                {
                  type: "text",
                  text: `MISS ${Math.round(diff)}ms > ${HANDSHAKE_SYNC_MS}ms. Tell human to click Count 3-2-1. On GO, human drags and you call align_quantum_lock again.`,
                },
              ],
              data: dataFail,
              isError: true,
            };
          },
        })
        .then((c) => {
          abort = c;
        });
    },
    unmount() {
      if (countdownTimer !== null) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
      if (abort) registry.unregister(toolName);
      abort = null;
    },
  };
}
