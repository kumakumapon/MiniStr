import { loadScenarioDefinitions, type ScenarioData, type ScenarioDefinition } from './maps';
import { unitStats } from './units';
import type { DeployedUnit, GameResult, UnitKind } from './types';

export function valueOf<T>(result: GameResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function operationData(patch: Partial<ScenarioData> = {}): ScenarioData {
  return {
    id: 'operations-fixture',
    name: 'Operation',
    briefing: 'Orders',
    startingGold: 0,
    productionRules: 'facility-v2',
    board: { width: 8, height: 4, cells: [] },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 0, y: 1 },
      { kind: 'tank', owner: 'red', x: 1, y: 2 },
      { kind: 'apc', owner: 'red', x: 0, y: 2 },
      { kind: 'tank', owner: 'blue', x: 7, y: 2 },
      { kind: 'infantry', owner: 'blue', x: 7, y: 3 },
    ],
    victoryConditions: [{ type: 'withdraw', unitIds: ['r1', 'r2'], positions: [{ x: 3, y: 1 }], required: 2 }],
    defeatConditions: [{ type: 'survive', untilTurn: 100 }],
    ...patch,
  };
}

export function operation(patch: Partial<ScenarioData> = {}): ScenarioDefinition {
  return valueOf(loadScenarioDefinitions([operationData(patch)]))[0]!;
}

export function force(id: string, kind: UnitKind, x: number, y: number, patch: Partial<DeployedUnit> = {}): DeployedUnit {
  return { id, kind, owner: 'red', position: { x, y }, hp: 100, fuel: unitStats[kind].fuel, ammo: unitStats[kind].ammo, hasMoved: false, hasActed: false, ...patch };
}
