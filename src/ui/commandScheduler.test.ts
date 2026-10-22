import { describe, expect, it, vi } from 'vitest';
import { COMMAND_SPEEDS, CommandScheduler, parseCommandSpeed } from './commandScheduler';

describe('CommandScheduler', () => {
  it('accepts only supported CPU speed options', () => {
    for (const speed of COMMAND_SPEEDS) expect(parseCommandSpeed(String(speed))).toBe(speed);
    for (const value of ['', '0', '-1', '3', 'Infinity', 'NaN', '2x', ' 1', '1e0']) expect(parseCommandSpeed(value)).toBeUndefined();
  });
  it('runs one immediate step, then continues at the requested interval', () => {
    vi.useFakeTimers();
    try {
      const scheduler = new CommandScheduler();
      let steps = 0;
      scheduler.start({ initialDelayMs: 0, nextDelayMs: () => 100, step: () => ++steps < 3 });
      expect(steps).toBe(1);
      vi.advanceTimersByTime(99);
      expect(steps).toBe(1);
      vi.advanceTimersByTime(1);
      expect(steps).toBe(2);
      vi.advanceTimersByTime(100);
      expect(steps).toBe(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels pending and replaced sequences', () => {
    vi.useFakeTimers();
    try {
      const scheduler = new CommandScheduler();
      const first = vi.fn(() => true);
      const second = vi.fn(() => false);
      scheduler.start({ nextDelayMs: () => 10, step: first });
      scheduler.start({ nextDelayMs: () => 10, step: second });
      vi.advanceTimersByTime(10);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      scheduler.start({ nextDelayMs: () => 10, step: () => true });
      scheduler.cancel();
      vi.runAllTimers();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
