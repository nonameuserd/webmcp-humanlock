import { vi } from "vitest";

function canvasContext(): CanvasRenderingContext2D {
  const gradient = {
    addColorStop: vi.fn(),
  };
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "center",
    textBaseline: "middle",
    lineWidth: 1,
    globalAlpha: 1,
    filter: "none",
  } as unknown as CanvasRenderingContext2D;
}

HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  id: string,
): CanvasRenderingContext2D | null {
  if (id === "2d") return canvasContext();
  return null;
} as typeof HTMLCanvasElement.prototype.getContext;

vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
  return window.setTimeout(() => cb(performance.now()), 0) as unknown as number;
});
vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
  window.clearTimeout(id);
});
