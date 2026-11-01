import { describe, expect, it } from 'vitest';
import { TacticalMetrics } from './tacticalMetrics';
import { tacticalState as state, tacticalUnit as unit, tacticalOk as ok } from '../src/game/tactics.fixture';
import { applyGameCommand, type GameCommand } from '../src/game/session';
import { createBoard } from '../src/game/state';
import type { GameState } from '../src/game/types';

function measured(initial: GameState, commands: GameCommand[]) {
  const metrics = new TacticalMetrics(initial);
  let s = initial;
  for (const command of commands) {
    const next = ok(applyGameCommand(s, command));
    metrics.observe(s, next, command);
    s = next;
  }
  return metrics.summary();
}
describe('tactical comparison measurements', () => {
  it('counts simultaneous damage, both ammunition uses and destroyed values once', () => {
    const s = state([
      { ...unit('infantry', 'red', 1, 2), hp: 1 },
      { ...unit('infantry', 'blue', 2, 2), hp: 1 },
    ]);
    const m = measured(s, [{ type: 'attack', unitId: 'r1', targetId: 'b1' }]);
    expect(m.ammunitionSpent).toEqual({ red: 1, blue: 1 });
    expect(m.destroyedValue).toEqual({ red: 1000, blue: 1000 });
    expect(m.damageValue).toEqual({ red: 10, blue: 10 });
  });
  it('separates prepared, expired and fired reservations', () => {
    const s = state([unit('infantry', 'red', 4, 2), unit('tank', 'blue', 0, 2)]);
    const expired = measured(s, [{ type: 'ambush', unitId: 'r1' }, { type: 'endTurn' }, { type: 'endTurn' }]);
    expect(expired.ambush).toMatchObject({ prepared: { red: 1, blue: 0 }, expired: { red: 1, blue: 0 }, fired: { red: 0, blue: 0 } });
    const fired = measured(s, [{ type: 'ambush', unitId: 'r1' }, { type: 'endTurn' }, { type: 'move', unitId: 'b1', destination: { x: 4, y: 2 } }]);
    expect(fired.ambush.fired.red).toBe(1);
    expect(fired.ambush.expired.red).toBe(0);
    expect(fired.ammunitionSpent).toEqual({ red: 1, blue: 0 });
  });
  it('records initial objective capture and income on actual half-turns', () => {
    const s = state([unit('infantry', 'red', 1, 2), unit('infantry', 'blue', 8, 5)]);
    s.board.terrain[2]![1] = { kind: 'city', capturePoints: 20 };
    const m = measured(s, [
      { type: 'capture', unitId: 'r1' },
      { type: 'endTurn' },
      { type: 'endTurn' },
      { type: 'capture', unitId: 'r1' },
      { type: 'endTurn' },
      { type: 'endTurn' },
    ]);
    expect(m.firstObjectiveArrival.red).toBe(1);
    expect(m.firstNeutralCapture.red).toBe(3);
    expect(m.firstNeutralIncome.red).toBe(5);
  });
  it('separates repeated sonar episodes from unique detected submarines', () => {
    const s = state([unit('destroyer', 'red', 0, 2), unit('submarine', 'blue', 4, 2)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s.tactics!.options.weather = false;
    const m = measured(s, [{ type: 'endTurn' }, { type: 'dive', unitId: 'b1' }, { type: 'endTurn' }, { type: 'move', unitId: 'r1', destination: { x: 1, y: 2 } }]);
    expect(m.diveActions).toEqual({ red: 0, blue: 1 });
    expect(m.sonarEpisodes.red).toBe(1);
    expect(m.detectedSubmarines.red).toBe(1);
  });
});
