import { registry } from "../webmcp/registry";
import type { JsonValue } from "../webmcp/types";

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

  function checkSync(log: HTMLElement, status: HTMLElement): void {
    const diff = Math.abs(lastHumanDrag - lastAgentAlign);
    if (lastHumanDrag === 0 || lastAgentAlign === 0) return;
    if (diff <= 50) {
      log.textContent = `SYNC ${diff}ms within 50ms -> UNLOCKED. Digit ${codeDigit}`;
      status.textContent = `SYNC ${diff}ms`;
      status.className = "badge badge--ok";
      if (onSolved) onSolved();
    } else {
      log.textContent = `Miss ${diff}ms > 50ms. Try again: human drag and agent align together.`;
      status.textContent = `MISS ${diff}ms`;
      status.className = "badge badge--fail";
    }
  }

  return {
    toolName,
    mount(container: HTMLElement, code: string, solved: () => void) {
      codeDigit = code;
      onSolved = solved;
      lastHumanDrag = 0;
      lastAgentAlign = 0;
      humanArmed = false;

      container.innerHTML = `
        <div class="handshake-wrap">
          <div class="handshake-stage">
            <div class="handshake-track">
              <div id="handshake-thumb" class="handshake-thumb"></div>
            </div>
            <input id="handshake-range" type="range" min="0" max="100" value="50" class="handshake-range" />
            <div class="handshake-meta">
              <span id="handshake-human" class="badge">Human: idle</span>
              <span id="handshake-agent" class="badge">Agent: idle</span>
              <span id="handshake-sync" class="badge">Sync: --</span>
            </div>
          </div>
          <div class="handshake-controls">
            <button id="handshake-arm" class="btn btn--ghost">Arm human</button>
            <input id="handshake-input" placeholder="Digit after sync" maxlength="1" class="input" />
            <button id="handshake-submit" class="btn btn--primary">Unlock</button>
          </div>
          <p class="hint">Countdown: Human drags slider, agent calls <code>align_quantum_lock({})</code> within 50ms. Both must act together. No solo solve.</p>
          <div id="handshake-log" class="lock-log">Arm, then drag and tell agent to align on 3..2..1..</div>
        </div>
      `;

      const rangeEl =
        container.querySelector<HTMLInputElement>("#handshake-range");
      const thumbEl =
        container.querySelector<HTMLDivElement>("#handshake-thumb");
      const humanBadge =
        container.querySelector<HTMLElement>("#handshake-human");
      const agentBadge =
        container.querySelector<HTMLElement>("#handshake-agent");
      const syncBadge = container.querySelector<HTMLElement>("#handshake-sync");
      const logEl = container.querySelector<HTMLDivElement>("#handshake-log");
      const armBtn =
        container.querySelector<HTMLButtonElement>("#handshake-arm");
      if (
        !rangeEl ||
        !thumbEl ||
        !humanBadge ||
        !agentBadge ||
        !syncBadge ||
        !logEl ||
        !armBtn
      )
        return;
      const range: HTMLInputElement = rangeEl;
      const thumb: HTMLDivElement = thumbEl;
      const log: HTMLElement = logEl;

      function updateThumb(): void {
        thumb.style.left = `${range.value}%`;
      }
      range.addEventListener("input", updateThumb);
      updateThumb();

      armBtn.addEventListener("click", () => {
        humanArmed = true;
        humanBadge.textContent = "Human: armed";
        humanBadge.className = "badge badge--armed";
        log.textContent =
          "Human armed. Now drag slider and tell agent to align at same time.";
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
        humanBadge.textContent = `Human: ${Math.round(lastHumanDrag)}ms`;
        humanBadge.className = "badge badge--ok";
        log.textContent = `Human drag at ${Math.round(lastHumanDrag)}ms. Agent must align within 50ms.`;
        checkSync(log, syncBadge);
      });
      range.addEventListener("change", () => {
        if (!humanArmed) return;
        lastHumanDrag = performance.now();
        humanBadge.textContent = `Human: ${Math.round(lastHumanDrag)}ms`;
        humanBadge.className = "badge badge--ok";
        checkSync(log, syncBadge);
      });

      const submitBtn =
        container.querySelector<HTMLButtonElement>("#handshake-submit");
      const input =
        container.querySelector<HTMLInputElement>("#handshake-input");
      if (!submitBtn || !input) return;
      submitBtn.addEventListener("click", () => {
        const v = (input.value || "").trim();
        const diff = Math.abs(lastHumanDrag - lastAgentAlign);
        if (lastHumanDrag === 0 || lastAgentAlign === 0) {
          log.textContent =
            "Must sync first: human drag and agent align_quantum_lock within 50ms.";
          return;
        }
        if (diff > 50) {
          log.textContent = `Not synced: ${Math.round(diff)}ms > 50ms. Retry.`;
          return;
        }
        if (v === codeDigit) {
          log.textContent = `Correct digit ${codeDigit} and synced ${Math.round(diff)}ms`;
          if (onSolved) onSolved();
        } else
          log.textContent = `Synced but wrong digit. Expected ${codeDigit}`;
      });

      void registry
        .register({
          name: toolName,
          description:
            "Align quantum lock. Must be called within 50ms of human dragging the slider. Human must Arm and drag, agent must time call precisely. Proves simultaneity.",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: async () => {
            lastAgentAlign = performance.now();
            agentBadge.textContent = `Agent: ${Math.round(lastAgentAlign)}ms`;
            agentBadge.className = "badge badge--ok";
            const diff = lastHumanDrag
              ? Math.abs(lastHumanDrag - lastAgentAlign)
              : Infinity;
            if (lastHumanDrag === 0) {
              log.textContent = `Agent aligned at ${Math.round(lastAgentAlign)}ms but human has not dragged. Tell human to Arm and drag.`;
              const dataFirst: Record<string, JsonValue> = {
                agentAt: lastAgentAlign as JsonValue,
                diff: null,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `Agent aligned at ${Math.round(lastAgentAlign)}ms, human has not dragged yet. Tell human to Arm and drag slider now.`,
                  },
                ],
                data: dataFirst,
              };
            }
            if (diff <= 50) {
              log.textContent = `Agent sync ${Math.round(diff)}ms WIN. Tell human to type digit ${codeDigit}`;
              syncBadge.textContent = `SYNC ${Math.round(diff)}ms`;
              syncBadge.className = "badge badge--ok";
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
                    text: `SYNC SUCCESS ${Math.round(diff)}ms within 50ms. Hidden digit is ${codeDigit}. Tell human to type ${codeDigit} and submit.`,
                  },
                ],
                data: dataOk,
              };
            } else {
              log.textContent = `Agent miss ${Math.round(diff)}ms >50. Retry together.`;
              syncBadge.textContent = `MISS ${Math.round(diff)}ms`;
              syncBadge.className = "badge badge--fail";
              const dataFail: Record<string, JsonValue> = {
                diff: diff as JsonValue,
                humanAt: lastHumanDrag as JsonValue,
                agentAt: lastAgentAlign as JsonValue,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `MISS ${Math.round(diff)}ms > 50ms. Need to retry: count 3,2,1 and human drags as agent calls this.`,
                  },
                ],
                data: dataFail,
                isError: true,
              };
            }
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
