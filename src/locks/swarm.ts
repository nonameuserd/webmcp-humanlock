import { registry } from "../webmcp/registry";
import type { FilterByVibeArgs, JsonValue } from "../webmcp/types";

const ADJECTIVES = [
  "trustworthy",
  "official",
  "government",
  "secure",
  "certified",
  "verified",
  "authentic",
  "genuine",
] as const;

type SwarmApi = {
  mount: (container: HTMLElement, code: string, onSolved: () => void) => void;
  unmount: () => void;
  toolName: string;
};

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSwarmLock(): SwarmApi {
  const toolName = "filter_by_vibe";
  let abort: AbortController | null = null;
  let realIndex = 0;
  let codeDigit = "0";
  let onSolved: (() => void) | null = null;
  let filtered = false;
  let candidates: number[] = [];

  function generateButtons(
    root: HTMLElement,
    highlight: Set<number> | null,
  ): void {
    root.innerHTML = "";
    const toShow = highlight
      ? candidates
      : Array.from({ length: 300 }, (_, i) => i);
    const frag = document.createDocumentFragment();
    for (const i of toShow.slice(0, 300)) {
      const btn = document.createElement("button");
      btn.className = "swarm-btn";
      btn.textContent = `BTN-${String(i).padStart(4, "0")}`;
      btn.dataset.index = String(i);
      if (highlight && !highlight.has(i)) btn.classList.add("hidden");
      if (i === realIndex) btn.dataset.real = "true";
      if (highlight?.has(i)) btn.classList.add("candidate");
      btn.addEventListener("click", () => {
        if (!filtered) {
          log(
            "Must filter first. Ask the agent to call filter_by_vibe with a trustworthy description.",
          );
          return;
        }
        if (Number(btn.dataset.index) === realIndex) {
          log(
            `Correct: BTN-${String(i).padStart(4, "0")} is real. Digit ${codeDigit} accepted.`,
          );
          if (onSolved) onSolved();
        } else {
          btn.classList.add("wrong");
          log(
            `Wrong. BTN-${String(i).padStart(4, "0")} is decoy. Look for subtle serif and double border.`,
          );
          setTimeout(() => btn.classList.remove("wrong"), 500);
        }
      });
      frag.appendChild(btn);
    }
    root.appendChild(frag);
  }

  let logEl: HTMLElement | null = null;
  function log(msg: string): void {
    if (logEl) logEl.textContent = msg;
  }

  function isFilterArgs(v: Record<string, JsonValue>): v is FilterByVibeArgs {
    return typeof v.description === "string";
  }

  return {
    toolName,
    mount(container, code, solved) {
      codeDigit = code;
      onSolved = solved;
      filtered = false;
      const rnd = mulberry32(Number(code) * 999 + 42);
      realIndex = Math.floor(rnd() * 300);
      candidates = [];

      const set = new Set<number>([realIndex]);
      while (set.size < 12) set.add(Math.floor(Math.random() * 300));
      candidates = [...set];

      container.innerHTML = `
        <div class="swarm-wrap">
          <div class="swarm-stats">
            <span>Showing <strong id="swarm-count">5000</strong> buttons</span>
            <span id="swarm-state" class="badge">Unfiltered</span>
            <span>Real button hides digit <code>${codeDigit}</code> in its data attribute</span>
          </div>
          <div id="swarm-grid" class="swarm-grid"></div>
          <div class="swarm-controls">
            <input id="swarm-pick" placeholder="Type BTN-XXXX of real button" class="input" />
            <button id="swarm-submit" class="btn btn--ghost">Submit typed ID</button>
          </div>
          <p class="hint">Agent: <code>filter_by_vibe({ description: "most trustworthy, official, government certified" })</code> narrows to 12 candidates. Human: pick the one with serif font and double border.</p>
          <div id="swarm-log" class="lock-log"></div>
        </div>
      `;
      const grid = container.querySelector<HTMLElement>("#swarm-grid");
      logEl = container.querySelector<HTMLElement>("#swarm-log");
      if (!grid || !logEl) return;
      generateButtons(grid, null);

      const pickInput =
        container.querySelector<HTMLInputElement>("#swarm-pick");
      const submitBtn =
        container.querySelector<HTMLButtonElement>("#swarm-submit");
      if (!pickInput || !submitBtn) return;
      submitBtn.addEventListener("click", () => {
        const v = pickInput.value.trim().toUpperCase();
        const m = v.match(/BTN-(\d{4})/);
        if (!m) {
          log("Type like BTN-0042");
          return;
        }
        const idx = Number(m[1]);
        if (idx === realIndex) {
          log(`Typed correct: ${v}`);
          if (onSolved) onSolved();
        } else log(`Typed wrong: ${v} not real`);
      });

      void registry
        .register({
          name: toolName,
          description:
            "Filter 5000 swarm buttons by vibe or semantic description. Returns 12 candidates that look most trustworthy and official and government. Human must pick the real one by visual inspection (serif and double border).",
          inputSchema: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description:
                  "Vibe to filter by, e.g. 'most trustworthy, government issued, official'",
              },
            },
            required: ["description"],
          },
          execute: async (args) => {
            const description = isFilterArgs(args) ? args.description : "";
            const desc = String(description || "").toLowerCase();
            const hasTrust = ADJECTIVES.some((a) => desc.includes(a));
            filtered = true;
            if (!hasTrust) {
              log(
                `filter_by_vibe("${description}") -> weak vibe, still narrowing to 24 random`,
              );
              const extra = new Set<number>(candidates);
              while (extra.size < 24)
                extra.add(Math.floor(Math.random() * 300));
              const h = new Set<number>([...extra]);
              const countEl =
                container.querySelector<HTMLElement>("#swarm-count");
              const stateEl =
                container.querySelector<HTMLElement>("#swarm-state");
              if (countEl) countEl.textContent = "24";
              if (stateEl) stateEl.textContent = "Filtered (weak vibe)";
              generateButtons(grid, h);
              const dataWeak: Record<string, JsonValue> = {
                candidates: [...h] as JsonValue,
                realHint: "look for serif and double border" as JsonValue,
              };
              return {
                content: [
                  {
                    type: "text",
                    text: `Filtered to 24 buttons. Try more specific vibe like "trustworthy government certified". Candidates: ${[...h].map((n) => `BTN-${String(n).padStart(4, "0")}`).join(", ")}`,
                  },
                ],
                data: dataWeak,
              };
            }
            const h = new Set<number>(candidates);
            const countEl =
              container.querySelector<HTMLElement>("#swarm-count");
            const stateEl =
              container.querySelector<HTMLElement>("#swarm-state");
            if (countEl) countEl.textContent = "12";
            if (stateEl) stateEl.textContent = "Filtered: trustworthy";
            generateButtons(grid, h);
            log(
              `Agent filtered to 12. Human, find the serif and double border button.`,
            );
            const dataStrong: Record<string, JsonValue> = {
              candidates: candidates as JsonValue,
              realIndex: realIndex as JsonValue,
            };
            return {
              content: [
                {
                  type: "text",
                  text: `Filtered 5000 -> 12 candidates. Tell human to visually inspect for serif font and double border. Real hides digit ${codeDigit}. Candidates: ${candidates.map((n) => `BTN-${String(n).padStart(4, "0")}`).join(", ")}`,
                },
              ],
              data: dataStrong,
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
