import { describe, expect, it } from 'vitest';
import { tacticalUnit as unit, tacticalState as state, tacticalOk as ok } from './tactics.fixture';
import { createBoard } from './state';
import { BattleHistory } from './battleHistory';
import { observedCommand, visibleEnemies } from './fog';
import { forecastCombat, effectiveTerrainReduction } from './combat';
import { applyGameCommand, type GameCommand } from './session';
import { scanArea } from './recon';
import { fortifyUnit } from './engineering';
import { buildBridge, destroyBridge } from './bridges';
import { canEvacuateUnit } from './evacuation';
import { tacticalScenario } from './tacticalMaps';
import { maps } from './maps';
import { combinedTactics } from './tactics';

describe('tactical contact and independent comparison parameters', () => {
  it('uses the configured initiative only for ordinary adjacent direct fire', () => {
    const s = state([unit('tank', 'red', 1, 2), unit('tank', 'blue', 2, 2)]);
    const values = [0, 3, 5].map((initiative) => {
      s.tactics!.options.initiative = initiative as 0 | 3 | 5;
      const forecast = ok(forecastCombat(s, s.units[0]!, s.units[1]!));
      expect(forecast.simultaneous).toBe(true);
      const reaction = ok(forecastCombat(s, s.units[0]!, s.units[1]!, 0, true));
      expect(reaction.simultaneous).toBeUndefined();
      expect(reaction.damageToDefender).toBe(75);
      expect(reaction.damageToAttacker).toBe(0);
      return forecast.damageToDefender;
    });
    expect(values).toEqual([75, 77, 79]);
    s.tactics!.options.plainCover = true;
    s.board.terrain[2]![2] = { kind: 'plain' };
    expect(effectiveTerrainReduction(s, s.units[1]!)).toBe(15);
    s.tactics!.options.plainCover = false;
    expect(effectiveTerrainReduction(s, s.units[1]!)).toBe(10);
    s.board.terrain[2]![2] = { kind: 'forest' };
    expect(effectiveTerrainReduction(s, s.units[1]!)).toBe(20);
  });
  it('changes comparison options without rewriting an already versioned map', () => {
    const variant = tacticalScenario(maps[0]!);
    const changed = tacticalScenario(variant, true, { ...combinedTactics, initiative: 5 });
    expect(changed.board).toEqual(variant.board);
    expect(changed.name).toBe(variant.name);
    expect(changed.tacticalOptions?.initiative).toBe(5);
    expect(tacticalScenario(maps[0]!)).toBe(variant);
  });
  it('retains a last known submarine on visible sea without sonar and forgets it after a sonar search', () => {
    const s = state([unit('fighter', 'red', 3, 1), unit('destroyer', 'red', 0, 2, 'r2'), unit('submarine', 'blue', 4, 2)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s.tactics!.options.weather = false;
    const commands: GameCommand[] = [{ type: 'endTurn' }, { type: 'dive', unitId: 'b1' }, { type: 'endTurn' }, { type: 'move', unitId: 'r2', destination: { x: 2, y: 2 } }];
    const history = new BattleHistory(s, commands);
    const remembered = ok(history.recon(3, 'red'));
    expect(remembered).toMatchObject([{ id: 'b1', position: { x: 4, y: 2 } }]);
    expect(ok(history.recon(4, 'red'))).toEqual([]);
    const after = commands.reduce((current, command) => ok(applyGameCommand(current, command)), s);
    expect(visibleEnemies(after, 'red').map((u) => u.id)).toContain('b1');
    expect(ok(history.recon(3, 'red'))).toEqual(remembered);
  });
  it('withholds movement trails and camera targets when a submerged contact leaves sonar', () => {
    const s = state([unit('destroyer', 'red', 0, 2), { ...unit('submarine', 'blue', 3, 2), submerged: true }]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s.tactics!.options.weather = false;
    const command: GameCommand = { type: 'move', unitId: 'b1', destination: { x: 5, y: 2 } };
    const after = { ...s, units: [s.units[0]!, { ...s.units[1]!, position: { x: 5, y: 2 } }] };
    expect(visibleEnemies(s, 'red')).toHaveLength(1);
    expect(visibleEnemies(after, 'red')).toHaveLength(0);
    expect(observedCommand({ ...s, activePlayer: 'blue' }, after, command, 'red')).toBe(false);
    expect(observedCommand({ ...s, activePlayer: 'blue' }, after, command, 'blue')).toBe(true);
  });
  it('refuses direct support actions after a terminal draw', () => {
    const s = { ...state([unit('engineer', 'red', 1, 2), unit('infantry', 'blue', 8, 5)]), draw: true as const };
    s.recon = { remaining: { red: 2, blue: 2 }, centers: [] };
    expect(scanArea(s, { x: 3, y: 2 }).ok).toBe(false);
    expect(fortifyUnit(s, 'r1').ok).toBe(false);
    expect(buildBridge(s, 'r1', { x: 2, y: 2 }).ok).toBe(false);
    expect(destroyBridge(s, 'r1', { x: 2, y: 2 }).ok).toBe(false);
    expect(canEvacuateUnit(s, 'r1')).toBe(false);
  });
});

describe('ZOC and submarine movement boundaries', () => {
  it('ends at a visible ground ZOC, can leave its start zone, and does not stop aircraft', async () => {
    const { reachablePositionsForPlayer, moveUnit } = await import('./commands');
    const s = state([unit('tank', 'red', 0, 1), unit('infantry', 'blue', 2, 0)]);
    s.board = createBoard(7, 3, { kind: 'mountain' });
    for (let x = 0; x < 7; x++) s.board.terrain[1]![x] = { kind: 'road' };
    s.tactics!.options.weather = false;
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).toContainEqual({ x: 2, y: 1 });
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).not.toContainEqual({ x: 3, y: 1 });
    expect(moveUnit(s, 'r1', { x: 3, y: 1 }).ok).toBe(false);
    s.units[0]!.position = { x: 2, y: 1 };
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).toContainEqual({ x: 4, y: 1 });
    s.units[0] = unit('fighter', 'red', 0, 1);
    expect(reachablePositionsForPlayer(s, 'r1', 'red')).toContainEqual({ x: 4, y: 1 });
  });
  it('surfaces a submerged submarine on entering a port and keeps one-unit occupancy', async () => {
    const { moveUnit } = await import('./commands');
    const s = state([{ ...unit('submarine', 'red', 1, 2), submerged: true, diveTurns: 2 }, unit('submarine', 'blue', 8, 5)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    s.board.terrain[2]![2] = { kind: 'port', owner: 'red' };
    const entered = ok(moveUnit(s, 'r1', { x: 2, y: 2 }));
    expect(entered.units[0]).toMatchObject({ submerged: false, diveTurns: 0 });
    const occupied = { ...s, units: [s.units[0]!, { ...unit('destroyer', 'red', 2, 2, 'r2') }, s.units[1]!] };
    expect(moveUnit(occupied, 'r1', { x: 2, y: 2 }).ok).toBe(false);
  });
});
