# HUMANLOCK - The Vault You Cannot Open Alone

A WebMCP Challenge submission. The first website that is impossible without human and agent together.

HUMANLOCK is a vault with 5 locks. Each lock exploits a gap between human perception and agent perception. Human alone fails. Agent alone fails. Together, you open it.

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/) (Aug 25 - Sep 3, 2026). WebMCP is an experimental standard that lets websites expose `document.modelContext.registerTool()` tools for agents to call directly in the page, sharing UI state.

## What Humanlock is

5 locks, each breaks a different sense. Only human and agent together can open it.

| Lock | Name | Human sees | Agent tool | Why symbiosis matters |
| :-- | :-- | :-- | :-- | :-- |
| 1 | **THE BLUR** | Code flashing at 240fps, unreadable | `freeze_frame({ timestamp })` freezes canvas, reveals digit | Human must spot timing glitch, agent must freeze precisely |
| 2 | **THE SWARM** | 5000 identical buttons, one is real | `filter_by_vibe({ description })` filters to 12 candidates | Agent narrows swarm, human uses intuition to pick |
| 3 | **THE WHISPER** | Ultrasonic audio, silent to human ear | `sonify_to_spectrogram()` renders as image you can see | Human hears nothing, agent sees nothing, translation needs both |
| 4 | **THE LIE** | Vault display says $10, ledger says ??? | `audit_truth()` cross-checks and reveals lie | Agent detects lie, human decides to trust |
| 5 | **THE HANDSHAKE** | Slider must be dragged | `align_quantum_lock()` must fire within 50ms of drag | Proves simultaneity, neither can fake |

Fail to open in 30 seconds of inactivity and the vault decays. Succeed and you mint a co-signed HUMANLOCK certificate (shareable URL with both signatures).

## Project layout

```
index.html
src/
  main.ts            # vault orchestration, state machine, decay timer
  state.ts           # vault state: idle -> blur -> swarm -> whisper -> lie -> handshake -> unlocked
  style.css          # vault theme, decay animations, lock layouts
  webmcp/
    registry.ts      # registerTool wrappers, feature detection, AbortController lifecycle
    types.ts         # tool schemas and shared types
  locks/
    blur.ts          # 240fps canvas, freeze logic, code extraction
    swarm.ts         # 5000 buttons generation, vibe filtering, candidate highlighting
    whisper.ts       # WebAudio ultrasonic buffer, spectrogram canvas, FFT
    lie.ts           # deceptive ledger, audit logic, trust UI
    handshake.ts     # slider and timing gate, 50ms window, simultaneous check
  utils/
    decay.ts         # vault decay timer and visual effects
public/
  _headers           # security and immutable caching
  _redirects         # SPA fallback to index.html
```

## How to run

Requires Node 24 and later, pnpm 9.15.4.

### Locally

```bash
pnpm --ignore-workspace install
pnpm dev      # http://127.0.0.1:5173
pnpm build
pnpm preview  # http://127.0.0.1:4173
```

Test in Chrome Canary with `chrome://flags/#enable-webmcp` or in ChatGPT in-app browser. Without WebMCP, the vault shows fallback mode and debug buttons.

Try this prompt after opening the vault:

> List my WebMCP tools and help me open this vault. Start with THE BLUR, call freeze_frame at the glitch.

### At https://webmcp-humanlock.pages.dev/

Live deployment on Cloudflare Pages:

```
https://webmcp-humanlock.pages.dev/
```

Open the URL in a WebMCP enabled browser (ChatGPT app or Chrome Canary with flag). Without WebMCP you will see `WebMCP unavailable - fallback mode` and can still play via debug buttons. Share the certificate URL after solving: `https://webmcp-humanlock.pages.dev/?code=XXXXX&sig=hl_...`

To redeploy:

```bash
pnpm run deploy
```

## Credits

HUMANLOCK by [Chitmark](https://chitmark.com). Built by dami.

Built for WebMCP Challenge. Inspired by Keep Talking and Nobody Explodes, DEFCON CTF, and the WebMCP spec by Microsoft and Google.

Spec: https://github.com/webmachinelearning/webmcp
Types: https://www.npmjs.com/package/webmcp-types
Challenge: https://webmcp.devpost.com
