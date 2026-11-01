import { describe, expect, it } from 'vitest';
import { createBoard } from '../game/state';
import { applyGameCommand } from '../game/session';
import { tacticalUnit as unit, tacticalState as state } from '../game/tactics.fixture';
import { chooseTacticalAction } from './tactics';
import { chooseCpuAction } from './rules';

describe('public tactical CPU planning', () => {
  it('reserves a loaded direct weapon at a threatened owned garrison', () => {
    const s = state([unit('infantry', 'red', 1, 2), unit('infantry', 'blue', 3, 2)]);
    s.board.terrain[2]![1] = { kind: 'city', owner: 'red' };
    s.tactics!.options.weather = false;
    const action = chooseTacticalAction(s, 'red', true)!;
    expect(action).toEqual({ type: 'ambush', unitId: 'r1', weaponSlot: 0 });
    expect(applyGameCommand(s, action).ok).toBe(true);
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.units[0]!.hp = 40;
    expect(chooseTacticalAction(s, 'red', false)?.type).toBe('ambush');
    s.units[0]!.ammo = 0;
    expect(chooseTacticalAction(s, 'red', true)).toBeUndefined();
  });
  it('uses a direct secondary weapon, limits reservations and ignores already spent units', () => {
    const s = state([unit('artillery', 'red', 1, 2), unit('infantry', 'blue', 3, 2)]);
    s.units[0]!.hp = 30;
    s.board.terrain[2]![1] = { kind: 'factory', owner: 'red' };
    expect(chooseTacticalAction(s, 'red', true)).toMatchObject({ weaponSlot: 1 });
    s.units.push(
      { ...unit('infantry', 'red', 0, 1, 'r2'), ambush: 0, hasMoved: true, hasActed: true },
      { ...unit('infantry', 'red', 0, 3, 'r3'), ambush: 0, hasMoved: true, hasActed: true },
    );
    expect(chooseTacticalAction(s, 'red', true)).toBeUndefined();
    s.units = s.units.slice(0, 2);
    s.units[0]!.hasMoved = true;
    expect(chooseTacticalAction(s, 'red', true)).toBeUndefined();
  });
  it('dives with fuel and no confirmed sonar danger, preserving its movement for later turns', () => {
    const s = state([unit('submarine', 'red', 1, 2), unit('infantry', 'blue', 8, 5)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    expect(chooseTacticalAction(s, 'red', false)).toEqual({ type: 'dive', unitId: 'r1' });
    s.units[0]!.fuel = 12;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.units[0]!.fuel = 60;
    s.units[0]!.submerged = true;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.units[0]!.submerged = false;
    s.units[1] = unit('destroyer', 'blue', 2, 2);
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
  });
  it('budgets escorts for loaded transports before a submarine', () => {
    const s = state([unit('landingShip', 'red', 2, 2), { ...unit('infantry', 'red', 0, 0, 'cargo'), position: undefined, embarkedIn: 'r1' }, unit('infantry', 'blue', 8, 5)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s.board.terrain[2]![1] = { kind: 'port', owner: 'red' };
    s.players.red.gold = 12000;
    expect(chooseTacticalAction(s, 'red', false)).toEqual({ type: 'produce', factory: { x: 1, y: 2 }, kind: 'destroyer' });
    s.players.red.gold = 11999;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.players.red.gold = 13000;
    s.units.push(unit('destroyer', 'red', 1, 3, 'escort'));
    expect(chooseTacticalAction(s, 'red', false)).toEqual({ type: 'produce', factory: { x: 1, y: 2 }, kind: 'submarine' });
    s.units.push({ ...unit('submarine', 'red', 1, 4, 'sub'), hasActed: true });
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
  });
  it('does not plan submarine production without a safe sea exit, port, feature or funds', () => {
    const s = state([unit('destroyer', 'red', 2, 2)]);
    s.players.red.gold = 50000;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.board.terrain[2]![1] = { kind: 'port', owner: 'red' };
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.board.terrain[1]![1] = { kind: 'sea' };
    s.players.red.gold = 12999;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.players.red.gold = 50000;
    s.tactics!.options.submarines = false;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
    s.tactics = undefined;
    expect(chooseTacticalAction(s, 'red', false)).toBeUndefined();
  });
  it('keeps decisions identical when only unobserved enemy positions and supplies change', () => {
    const s = state([unit('submarine', 'red', 1, 2), unit('submarine', 'blue', 8, 5)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    const changed = { ...s, units: [s.units[0]!, { ...s.units[1]!, position: { x: 7, y: 5 }, ammo: 0, submerged: true, diveTurns: 2 }] };
    expect(chooseTacticalAction(s, 'red', false)).toEqual(chooseTacticalAction(changed, 'red', false));
    expect(chooseCpuAction(s)).toEqual(chooseCpuAction(changed));
  });
  it('rejects a costly lethal simultaneous trade that the baseline heuristics accept', () => {
    const s = state([
      { ...unit('submarine', 'red', 1, 2), hp: 1 },
      { ...unit('destroyer', 'blue', 2, 2), hp: 1 },
    ]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    expect(chooseCpuAction(s, 'normal', 'red', 'balanced', false).type).toBe('attack');
    expect(chooseCpuAction(s, 'normal', 'red', 'balanced', true).type).not.toBe('attack');
  });
});
