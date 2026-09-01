import { registry } from "../webmcp/registry";
import type { JsonValue } from "../webmcp/types";

export function createWhisperLock(): {
  toolName: string;
  mount: (container: HTMLElement, code: string, solved: () => void) => void;
  unmount: () => void;
} {
  const toolName = "sonify_to_spectrogram";
  let abort: AbortController | null = null;
  let codeDigit = "4";
  let onSolved: (() => void) | null = null;
  let audioCtx: AudioContext | null = null;
  let revealed = false;

  function drawSpectrogram(canvas: HTMLCanvasElement, digit: string): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ff3366");
    grad.addColorStop(0.5, "#00ff88");
    grad.addColorStop(1, "#3366ff");
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.9;

    for (let x = 0; x < w; x += 4) {
      const f = Math.sin(x * 0.02 + Number(digit) * 0.7) * 0.5 + 0.5;
      const bh = f * h * 0.8 + 10;
      ctx.fillRect(x, h - bh, 3, bh);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(digit, w / 2, h / 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 40, h / 2 - 40, 80, 80);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillText("19.5 kHz carrier decoded", w / 2, h - 12);
    revealed = true;
  }

  function playUltrasonic(): void {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 19500;
    osc.type = "sine";
    gain.gain.value = 0.02;
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 2 + Number(codeDigit) * 0.8;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    lfo.start();
    setTimeout(() => {
      osc.stop();
      lfo.stop();
    }, 1200);
  }

  return {
    toolName,
    mount(container: HTMLElement, code: string, solved: () => void) {
      codeDigit = code;
      onSolved = solved;
      revealed = false;
      container.innerHTML = `
        <div class="whisper-wrap">
          <canvas id="whisper-canvas" width="640" height="240" class="whisper-canvas"></canvas>
          <div class="whisper-controls">
            <button id="whisper-play" class="btn btn--primary">Play silent tone</button>
            <button id="whisper-reveal" class="btn btn--ghost">I see the digit</button>
            <input id="whisper-input" placeholder="Digit from spectrogram" maxlength="1" class="input" />
            <button id="whisper-submit" class="btn btn--primary">Unlock</button>
          </div>
          <p class="hint">Human: you will hear nothing or a faint click. Tell agent: <code>sonify_to_spectrogram()</code> to see the sound.</p>
          <div id="whisper-log" class="lock-log">Click Play, then ask agent to visualize.</div>
        </div>
      `;
      const canvas =
        container.querySelector<HTMLCanvasElement>("#whisper-canvas");
      const log = container.querySelector<HTMLDivElement>("#whisper-log");
      if (!canvas || !log) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "14px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        "Spectrogram empty - agent must render",
        canvas.width / 2,
        canvas.height / 2,
      );

      const playBtn =
        container.querySelector<HTMLButtonElement>("#whisper-play");
      const revealBtn =
        container.querySelector<HTMLButtonElement>("#whisper-reveal");
      const submitBtn =
        container.querySelector<HTMLButtonElement>("#whisper-submit");
      const input = container.querySelector<HTMLInputElement>("#whisper-input");
      if (!playBtn || !revealBtn || !submitBtn || !input) return;

      playBtn.addEventListener("click", () => {
        playUltrasonic();
        log.textContent =
          "Played 19.5kHz tone for 1.2s. Human heard click or nothing. Agent must visualize.";
      });
      revealBtn.addEventListener("click", () => {
        if (!revealed)
          log.textContent =
            "Spectrogram not yet rendered. Ask the agent to call sonify_to_spectrogram().";
        else log.textContent = "Human sees digit in spectrogram. Type it.";
      });
      submitBtn.addEventListener("click", () => {
        const v = (input.value || "").trim();
        if (!revealed) {
          log.textContent =
            "Must spectrogram first. Ask the agent to call sonify_to_spectrogram().";
          return;
        }
        if (v === codeDigit) {
          log.textContent = `Correct ${codeDigit}`;
          if (onSolved) onSolved();
        } else log.textContent = `Wrong, expected ${codeDigit}`;
      });

      void registry
        .register({
          name: toolName,
          description:
            "Convert the ultrasonic WebAudio buffer to a visible spectrogram canvas. Renders hidden digit that human can read. Human hears nothing, agent sees nothing until this is called.",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: async () => {
            drawSpectrogram(canvas, codeDigit);
            log.textContent = `Spectrogram rendered. Digit ${codeDigit} visible in center. Tell human to read it.`;
            return {
              content: [
                {
                  type: "text",
                  text: `Spectrogram rendered. Hidden digit is ${codeDigit}. Tell human to type ${codeDigit}.`,
                },
              ],
              data: { digit: codeDigit as JsonValue },
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
      if (audioCtx) {
        try {
          void audioCtx.close();
        } catch {
          // ignore close error
        }
        audioCtx = null;
      }
    },
  };
}
