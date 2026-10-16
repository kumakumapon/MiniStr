import { describe, expect, it } from 'vitest';
import { endTurn } from './commands';
import { idleProductionFacilities } from './facilities';
import { createScenarioInitialState, maps } from './maps';
import type { PlayerId, TerrainKind } from './types';

const swapOwner = (owner: PlayerId | undefined): PlayerId | undefined =>
  owner === undefined ? undefined : owner === 'red' ? 'blue' : 'red';

function terrainSignature(kind: TerrainKind, owner: PlayerId | undefined): string {
  return `${kind}:${owner ?? 'neutral'}`;
}

function unitSignature(kind: string, owner: PlayerId, x: number, y: number): string {
  return `${kind}:${owner}:${x},${y}`;
}

describe('issues #85, #87, and #90 built-in map invariants', () => {
  it('gives both sides an explicit idle airport on every built-in map', () => {
    for (const scenario of maps) {
      expect(scenario.productionRules).toBe('facility-v2');
      for (const owner of ['red', 'blue'] as const) {
        const position = scenario.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => tile.kind === 'airport' && tile.owner === owner ? [{ x, y }] : []))[0]!;
        expect(position).toBeDefined();
        const tile = scenario.board.terrain[position.y]![position.x]!;
        expect(tile).toMatchObject({ kind: 'airport', owner });
        const state = createScenarioInitialState(scenario);
        const facilities = idleProductionFacilities(state, owner, scenario.productionRules);
        const airport = facilities.find(facility => facility.position.x === position.x && facility.position.y === position.y);
        expect(airport?.kinds).toEqual(expect.arrayContaining(['fighter', 'bomber']));
      }
    }
  });

  it('keeps the documented symmetric maps rotationally symmetric', () => {
    const symmetricIds = ['skirmish', 'islands', 'landing', 'canyon', 'siege', 'river', 'industrial', 'outpost', 'marsh', 'admiralty'];
    for (const scenario of maps.filter(candidate => symmetricIds.includes(candidate.id))) {
      for (let y = 0; y < scenario.board.height; y += 1) for (let x = 0; x < scenario.board.width; x += 1) {
        const mirrorX = scenario.board.width - 1 - x;
        const mirrorY = scenario.board.height - 1 - y;
        const tile = scenario.board.terrain[y]![x]!;
        const mirror = scenario.board.terrain[mirrorY]![mirrorX]!;
        expect(terrainSignature(tile.kind, tile.owner)).toBe(terrainSignature(mirror.kind, swapOwner(mirror.owner)));
      }
      const units = scenario.initialUnits.map(unit => unitSignature(unit.kind, unit.owner, unit.x, unit.y)).sort();
      const mirroredUnits = scenario.initialUnits.map(unit => unitSignature(
        unit.kind,
        unit.owner === 'red' ? 'blue' : 'red',
        scenario.board.width - 1 - unit.x,
        scenario.board.height - 1 - unit.y,
      )).sort();
      expect(units).toEqual(mirroredUnits);
    }
  });

  it('starts the first player with its opening income', () => {
    const scenario = maps.find(candidate => candidate.id === 'skirmish')!;
    const initial = createScenarioInitialState(scenario);
    const redIncome = scenario.board.terrain.flat().filter(tile => tile.owner === 'red').length * 1000;
    const blueIncome = scenario.board.terrain.flat().filter(tile => tile.owner === 'blue').length * 1000;
    expect(initial.players.red).toEqual({ gold: scenario.startingGold + redIncome, income: redIncome });
    expect(initial.players.blue).toEqual({ gold: scenario.startingGold + (scenario.secondPlayerBonus ?? 0), income: 0 });

    const blueOpening = endTurn(initial);
    expect(blueOpening.activePlayer).toBe('blue');
    expect(blueOpening.players.blue.gold).toBe(scenario.startingGold + blueIncome + (scenario.secondPlayerBonus ?? 0));
    expect(blueOpening.players.red.gold).toBe(scenario.startingGold + redIncome);
    expect(blueOpening.players.blue.gold - blueOpening.players.red.gold).toBe(scenario.secondPlayerBonus ?? 0);
  });
});
