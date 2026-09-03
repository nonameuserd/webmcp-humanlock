import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecayTimer } from "../src/utils/decay";

describe("DecayTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires after 30s and poke resets the window", () => {
    const timer = new DecayTimer();
    const onDecay = vi.fn();
    timer.start(onDecay);
    expect(timer.remaining()).toBeGreaterThan(29_000);
    vi.advanceTimersByTime(10_000);
    timer.poke();
    vi.advanceTimersByTime(29_000);
    expect(onDecay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onDecay).toHaveBeenCalledTimes(1);
  });

  it("poke is a no-op before start, stop clears remaining to full duration", () => {
    const timer = new DecayTimer();
    timer.poke();
    expect(timer.remaining()).toBe(30_000);
    timer.start(() => {});
    timer.stop();
    expect(timer.remaining()).toBe(30_000);
  });
});
