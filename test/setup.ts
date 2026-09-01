import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { clearWebMCPMock, installWebMCPMock } from "./helpers";

// Canvas 2D mock: jsdom does not implement getContext
type CanvasCtx2d = {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  filter: string;
  clearRect: () => void;
  fillRect: () => void;
  fillText: () => void;
  strokeRect: () => void;
  save: () => void;
  restore: () => void;
  createLinearGradient: () => {
    addColorStop: () => void;
  };
  beginPath: () => void;
  stroke: () => void;
};

function createMock2d(): CanvasCtx2d {
  return {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    filter: "none",
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    beginPath: vi.fn(),
    stroke: vi.fn(),
  };
}

function installCanvasMock(): void {
  // Direct assignment survives vi.clearAllMocks; spy would be cleared incorrectly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
  ): RenderingContext | null {
    if (contextId === "2d") {
      const mock = createMock2d();
      (this as unknown as { _mockCtx: CanvasCtx2d })._mockCtx = mock;
      return mock as unknown as RenderingContext;
    }
    return null;
  };
}

installCanvasMock();

// AudioContext mock
class MockOscillator {
  frequency: { value: number } = { value: 0 };
  type: OscillatorType = "sine";
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class MockGain {
  gain: { value: number } = { value: 0 };
  connect = vi.fn();
}
class MockAudioContext {
  state: AudioContextState = "running";
  destination = {};
  createOscillator = vi.fn(() => new MockOscillator() as unknown as OscillatorNode);
  createGain = vi.fn(() => new MockGain() as unknown as GainNode);
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

vi.stubGlobal(
  "AudioContext",
  MockAudioContext as unknown as typeof AudioContext,
);
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).webkitAudioContext =
    MockAudioContext as unknown as typeof AudioContext;
}

// requestAnimationFrame polyfill for jsdom
if (typeof window !== "undefined" && !window.requestAnimationFrame) {
  let rafId = 0;
  const rafMap = new Map<number, number>();
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafId += 1;
    const id = rafId;
    const timeout = window.setTimeout(() => {
      cb(performance.now());
    }, 16) as unknown as number;
    rafMap.set(id, timeout);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    const t = rafMap.get(id);
    if (t) window.clearTimeout(t);
    rafMap.delete(id);
  };
}

beforeEach(() => {
  installWebMCPMock();
});

afterEach(() => {
  // clear call histories but keep implementations (canvas mock survives via direct assignment)
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = "";
  clearWebMCPMock();
  // re-install canvas mock if it was somehow cleared
  installCanvasMock();
});
