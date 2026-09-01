import { registry } from "../webmcp/registry";
import type { FreezeFrameArgs, JsonValue } from "../webmcp/types";

export type BlurApi = {
  mount: (container: HTMLElement, code: string, onSolved: () => void) => void;
  unmount: () => void;
  toolName: string;
};

export function createBlurLock(): BlurApi {
  const toolName = "freeze_frame";
  let onSolved: (() => void) | null = null;
  let codeDigit = "7";
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let revealed = false;
  let frozenAt: number | null = null;
  let abort: AbortController | null = null;
  let startTime = 0;

  const glitchWindow = { start: 280, end: 340 };

  function frame(t: number): void {
    if (!canvas || !ctx) return;
    const elapsed = (t - startTime) % 600;
    const interval = 1000 / 240;
    const jitter = Math.sin(t * 0.05) * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (frozenAt !== null) {
      ctx.fillStyle = "#00ff88";
      ctx.font = "bold 96px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(codeDigit, canvas.width / 2, canvas.height / 2);
      ctx.fillStyle = "rgba(0,255,136,0.3)";
      ctx.font = "14px JetBrains Mono, monospace";
      ctx.fillText(
        `FROZEN at ${frozenAt}ms`,
        canvas.width / 2,
        canvas.height / 2 + 60,
      );
      return;
    }

    const cycle = Math.floor(elapsed / interval) % 10;
    const isGlitch =
      elapsed >= glitchWindow.start && elapsed <= glitchWindow.end;
    const display = isGlitch ? codeDigit : String(cycle);

    ctx.save();
    ctx.filter = isGlitch ? "none" : "blur(6px)";
    ctx.globalAlpha = isGlitch ? 1 : 0.6 + Math.random() * 0.4;
    ctx.fillStyle = isGlitch ? "#ff3366" : `hsl(${(cycle * 36) % 360} 80% 60%)`;
    ctx.font = "bold 96px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = canvas.width / 2 + jitter;
    const y = canvas.height / 2 + Math.sin(t * 0.02) * 6;
    ctx.fillText(display, x, y);

    if (isGlitch) {
      ctx.strokeStyle = "#ff3366";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
      ctx.fillStyle = "#ff3366";
      ctx.font = "12px JetBrains Mono, monospace";
      ctx.fillText("GLITCH", canvas.width / 2, 30);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px JetBrains Mono, monospace";
      ctx.fillText("240 FPS", canvas.width / 2, canvas.height - 24);
    }
    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  function revealDigitAt(timestamp: number): {
    ok: boolean;
    digit?: string;
    reason?: string;
  } {
    const loopT = ((timestamp % 600) + 600) % 600;
    if (loopT >= glitchWindow.start && loopT <= glitchWindow.end) {
      frozenAt = timestamp;
      revealed = true;
      return { ok: true, digit: codeDigit };
    }
    return {
      ok: false,
      reason: `No glitch at ${timestamp}ms. Glitch only near ${glitchWindow.start}-${glitchWindow.end}ms in each 600ms loop.`,
    };
  }

  function isFreezeFrameArgs(
    v: Record<string, JsonValue>,
  ): v is FreezeFrameArgs {
    return typeof v.timestamp === "number";
  }

  return {
    toolName,
    mount(container, code, solved) {
      codeDigit = code;
      onSolved = solved;
      revealed = false;
      frozenAt = null;
      container.innerHTML = `
        <div class="blur-wrap">
          <canvas id="blur-canvas" width="640" height="320" class="blur-canvas"></canvas>
          <div class="blur-controls">
            <input id="blur-input" placeholder="Enter revealed digit" maxlength="1" inputmode="numeric" class="input" />
            <button id="blur-submit" class="btn btn--primary">Unlock</button>
            <button id="blur-unfreeze" class="btn btn--ghost">Unfreeze</button>
          </div>
          <p class="hint">Human: watch for red GLITCH border. Tell agent: call <code>freeze_frame({ timestamp: 300 })</code> near 280-340ms.</p>
          <div id="blur-log" class="lock-log"></div>
        </div>
      `;
      canvas = container.querySelector<HTMLCanvasElement>("#blur-canvas");
      if (!canvas) return;
      ctx = canvas.getContext("2d");
      if (!ctx) return;
      startTime = performance.now();
      raf = requestAnimationFrame(frame);

      void registry
        .register({
          name: toolName,
          description:
            "Freeze the 240fps blur canvas at a timestamp to reveal the hidden digit. Glitch appears only 280-340ms in each 600ms loop. Human must spot the glitch, agent must freeze precisely.",
          inputSchema: {
            type: "object",
            properties: {
              timestamp: {
                type: "number",
                description:
                  "Timestamp in ms to freeze at. Loop every 600ms, glitch window 280-340ms.",
              },
            },
            required: ["timestamp"],
          },
          execute: async (args) => {
            if (!isFreezeFrameArgs(args)) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Missing timestamp number. Provide { timestamp: 300 }",
                  },
                ],
                isError: true,
              };
            }
            const timestamp = args.timestamp;
            const r = revealDigitAt(Number(timestamp));
            if (r.ok) {
              updateLog(
                `Tool freeze_frame(${timestamp}) -> revealed ${r.digit}. Human, type it to unlock.`,
              );
              const dataOk: Record<string, JsonValue> = {
                digit: r.digit as JsonValue,
                frozenAt: timestamp as JsonValue,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `FROZEN at ${timestamp}ms. Revealed digit: ${r.digit}. Tell human to type ${r.digit}.`,
                  },
                ],
                data: dataOk,
              };
            } else {
              updateLog(`Tool freeze_frame(${timestamp}) -> miss. ${r.reason}`);
              const dataMiss: Record<string, JsonValue> = {
                frozenAt: timestamp as JsonValue,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `Miss: ${r.reason} Try timestamp near 300, 900, 1500.`,
                  },
                ],
                data: dataMiss,
                isError: true,
              };
            }
          },
        })
        .then((c) => {
          abort = c;
        });

      const input = container.querySelector<HTMLInputElement>("#blur-input");
      const submit = container.querySelector<HTMLButtonElement>("#blur-submit");
      const unfreeze =
        container.querySelector<HTMLButtonElement>("#blur-unfreeze");
      const logEl = container.querySelector<HTMLDivElement>("#blur-log");
      if (!input || !submit || !unfreeze || !logEl) return;
      const logElement: HTMLElement = logEl;

      function updateLog(msg: string): void {
        logElement.textContent = msg;
      }

      submit.addEventListener("click", () => {
        if (!revealed) {
          updateLog(
            "Must freeze_frame first. Ask the agent to call freeze_frame({ timestamp: 300 }) near the glitch.",
          );
          return;
        }
        if (input.value.trim() === codeDigit) {
          updateLog(`Correct. Digit ${codeDigit} accepted.`);
          if (onSolved) onSolved();
        } else {
          updateLog(`Wrong. Expected ${codeDigit} if you saw it.`);
        }
      });
      unfreeze.addEventListener("click", () => {
        frozenAt = null;
        revealed = false;
        updateLog("Unfrozen. Watch again.");
        raf = requestAnimationFrame(frame);
      });
    },
    unmount() {
      cancelAnimationFrame(raf);
      if (abort) registry.unregister(toolName);
      abort = null;
      canvas = null;
      ctx = null;
    },
  };
}
