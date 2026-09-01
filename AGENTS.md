# AGENTS.md: HUMANLOCK by WebMCP Challenge

Coding-agent guide for HUMANLOCK. Context: [README.md](./README.md), [WebMCP Spec](https://github.com/webmachinelearning/webmcp).

## Product rules (non-negotiable)

- **Human and Agent symbiosis is the product.** No lock can be solved by human alone or agent alone. Every tool must require human confirmation, perception, or timing.
- **WebMCP is the only agent interface.** All agent actions go through `document.modelContext.registerTool()`. No hidden backend API for agents, no DOM scraping fallbacks. The UI and tools share the same client state.
- **Fail closed.** If WebMCP is unavailable (browser without support, permission denied, tool error), show degraded state with clear message, never fake success.
- **No code debt.** Replacing a lock mechanic deletes old path, types, and docs in same change. No compatibility shims.
- **Performance budget.** Vault interactions must stay interactive: 60fps for canvas and audio locks, tool registration in less than 50ms, no LLM on hot path.
- **Deterministic scoring.** Locks judge success with pure JS logic, no LLM judge.

## Typing rules (non-negotiable)

- **No `any`.** Every variable, parameter, return, and cast must have an explicit type. Use precise unions, interfaces, and generics. Do not use `any` even in tests or debug code.
- **No `unknown`.** Prefer explicit `JsonValue`, `ToolArgs`, and `ToolResult` types defined in `src/webmcp/types.ts`. If a value is truly opaque, type it as `JsonValue` or a specific domain type, never `unknown`.
- **No implicit any.** `tsconfig.json` has `strict: true`, `noImplicitAny: true`, `useDefineForClassFields: true`. `tsc --noEmit` must pass with zero errors.
- **No type assertions to `any` or `unknown`.** Use declaration merging or typed window augmentation in `src/webmcp/types.ts`. Cast only to a named type that is exported.
- **Verification:** `pnpm lint` is `tsc --noEmit`. CI also runs `grep -R "\bany\b" --include="*.ts" src` and `grep -R "\bunknown\b" --include="*.ts" src`, both must return no matches. Do not add `any` or `unknown` even in comments.

## Style and copy bans

- **No em dashes.** The character Unicode 2014 is forbidden in all `.ts`, `.html`, `.md`, `.css`, and `.json` files. Use commas, colons, parentheses, or the word "and". Enforced by running a search for Unicode 2014 across those extensions, which must return no matches.
- **No plus sign in prose and copy.** The plus sign (Unicode 002B) is forbidden in `AGENTS.md`, `README.md`, `index.html` visible text, and all tool `description` strings. Use the word "and" or a comma. The plus operator in TypeScript math and plus-equals is allowed only in `.ts` implementation, never in docs or descriptions. Enforced by inspecting prose files for the plus sign, tool descriptions must not contain plus.
- **Table empty cells use hyphen `-`, not em dash.**
- **Tone:** heist movie, vault, symbiosis. Playful but tense. Use commas and colons, never em dashes.
- **Visual:** dark vault, neon accents, monospace for codes, brutalist buttons for swarm.
- **Never leak internal names (`workerd`, `Durable Object`)** - not relevant here (static app).

## Stack and package map

Vite and TypeScript and vanilla DOM and Canvas and WebAudio. No framework lock-in, keeps WebMCP surface explicit.

| Path | Role |
| :-- | :-- |
| `src/webmcp/registry.ts` | WebMCP tool registration, lifecycle, `toolchange` handling |
| `src/webmcp/types.ts` | Shared tool input and output schemas (JSON Schema), JsonValue, ToolArgs |
| `src/locks/blur.ts` | Lock 1: THE BLUR (240fps and freeze_frame) |
| `src/locks/swarm.ts` | Lock 2: THE SWARM (5000 buttons and filter_by_vibe) |
| `src/locks/whisper.ts` | Lock 3: THE WHISPER (ultrasonic and spectrogram) |
| `src/locks/lie.ts` | Lock 4: THE LIE (deceptive UI and audit_truth) |
| `src/locks/handshake.ts` | Lock 5: THE HANDSHAKE (50ms co-timing) |
| `src/state.ts` | Vault state machine (locked and picking and unlocked and dead) |
| `src/main.ts` | App entry, vault orchestration, UI shell |
| `index.html` | Single-page vault shell |
| `public/` | Static assets, vault sounds, fonts |

## Commands

```bash
pnpm install
pnpm dev        # Vite dev at http://127.0.0.1:5173
pnpm build      # production build to dist/
pnpm preview    # preview built app
pnpm check      # format:check and lint and typecheck and build
pnpm lint       # tsc --noEmit
pnpm format     # prettier --write
```

Requires Node >= 24, pnpm 9.15.4. Test in Chrome Canary with `#enable-webmcp` flag or ChatGPT in-app browser.

## WebMCP tools contract

Five tools, one per lock. Each tool is registered via `document.modelContext.registerTool()` with JSON Schema and `execute` that mutates shared DOM state.

| Tool | Lock | Purpose |
| :-- | :-- | :-- |
| `freeze_frame` | BLUR | Freeze high-speed canvas at timestamp, reveal code |
| `filter_by_vibe` | SWARM | Filter 5000 buttons by semantic description, highlight candidates |
| `sonify_to_spectrogram` | WHISPER | Convert ultrasonic WebAudio buffer to visible spectrogram canvas |
| `audit_truth` | LIE | Cross-check displayed versus actual ledger value, reveal lie |
| `align_quantum_lock` | HANDSHAKE | Attempt quantum alignment, must be within 50ms of human drag |

All tools:
- Validate input against `inputSchema` before execution
- Return `{ content: [{ type: "text", text: "..." }], data?: Record<string, JsonValue> }`
- Fire `toolchange` event on registration and unregistration
- Support `AbortSignal` for cancellable execution where relevant

Dynamic lifecycle: locks register tools only when active. On lock solved, tool unregisters (via `AbortController.abort()`), next lock's tool registers. Agent discovers via `getTools()` or `toolchange` listener.

## State machine

```
VAULT: idle -> lock1_blur -> lock2_swarm -> lock3_whisper -> lock4_lie -> lock5_handshake -> unlocked
       |                                                                          |
       ---------------------------------- dead (decay timer) ----------------------
```

- Vault decays if no human and agent activity for 30s when any lock is active. Visual decay via CSS filter and canvas desaturation.
- Each lock emits `lock:solved` event, advances state, registers next tool.
- Full reset via `reset_vault` tool (always registered).

## Verification quirks

- **Browser support:** WebMCP is experimental. Feature-detect with `if ('modelContext' in document)`. In unsupported browsers, show manual fallback UI but mark as `unsupported` state, do not fake tools.
- **Types:** `webmcp-types` npm provides `ModelContext` types. Extend via declaration merging if needed, do not duplicate global types.
- **Testing:** Tools are pure functions on shared state. Unit test each lock's `execute` in isolation. Manual test in ChatGPT app browser and Chrome with flag.
- **No backend:** This is a static Pages app. No API, no KV, no DO. All state is client-side. Vault progress is localStorage only.
- **Audio:** WebAudio requires user gesture. `whisper` lock starts only after human clicks `Listen`.

## Key references

- WebMCP explainer: https://github.com/webmachinelearning/webmcp/blob/main/README.md
- WebMCP declarative API: https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md
- Implementation status: https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md
- Challenge: https://openai.com/webmcp-challenge/
- Devpost: https://webmcp.devpost.com

## Conflict resolution

When WebMCP spec and local code disagree, align code to spec and update types. Flag spec deltas in PR description.
