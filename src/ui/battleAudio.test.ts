import { afterEach, describe, expect, it, vi } from 'vitest';
import { playBattleSceneAudio } from './battleAudio';
import type { BattleScene } from './battleScene';

const scene = (): BattleScene => ({
  attacker: { kind: 'tank', owner: 'red', position: { x: 0, y: 0 }, hpBefore: 100, hpAfter: 80 },
  defender: { kind: 'infantry', owner: 'blue', position: { x: 1, y: 0 }, hpBefore: 100, hpAfter: 40 },
  terrain: 'plain',
});

describe('battle scene audio timeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('synchronizes firing, impact and counterattack and cancels active sounds', () => {
    vi.useFakeTimers();
    const stops: ReturnType<typeof vi.fn>[] = [];
    const play = vi.fn(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    const cancel = playBattleSceneAudio(scene(), play);
    vi.advanceTimersByTime(349);
    expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(play).toHaveBeenLastCalledWith('fire', 'tank');
    vi.advanceTimersByTime(270);
    expect(play).toHaveBeenLastCalledWith('impact', 'infantry');
    vi.advanceTimersByTime(300);
    expect(play).toHaveBeenLastCalledWith('fire', 'infantry');
    vi.advanceTimersByTime(200);
    expect(play).toHaveBeenLastCalledWith('impact', 'tank');
    expect(play).toHaveBeenCalledTimes(4);
    cancel();
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });

  it('uses destruction only for destroyed participants, and has no counterattack after a one-sided kill', () => {
    vi.useFakeTimers();
    const battle = scene();
    battle.defender.hpAfter = 0;
    battle.attacker.hpAfter = battle.attacker.hpBefore;
    const play = vi.fn();
    const cancel = playBattleSceneAudio(battle, play);
    vi.advanceTimersByTime(2050);
    expect(play.mock.calls).toEqual([
      ['fire', 'tank'],
      ['destroy', 'infantry'],
    ]);
    cancel();

    battle.defender.hpAfter = battle.defender.hpBefore;
    battle.attacker.hpAfter = 0;
    const counter = vi.fn();
    const cancelCounter = playBattleSceneAudio(battle, counter);
    vi.advanceTimersByTime(2050);
    expect(counter.mock.calls).toEqual([
      ['fire', 'tank'],
      ['fire', 'infantry'],
      ['destroy', 'tank'],
    ]);
    cancelCounter();
  });

  it('skipping or replacing a scene stops active sounds and prevents pending impacts', () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const play = vi.fn(() => stop);
    const cancel = playBattleSceneAudio(scene(), play);
    vi.advanceTimersByTime(350);
    cancel();
    vi.advanceTimersByTime(2050);
    expect(play).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
