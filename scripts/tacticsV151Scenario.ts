import { loadScenarioDefinitions, scenarioDefinitionToData, type ScenarioDefinition } from '../src/game/maps';
import { tacticalScenario } from '../src/game/tacticalMaps';
import type { PlayerId } from '../src/game/types';
export const profiles = ['off', 'rules-only', 'default'] as const;
export type Profile = (typeof profiles)[number];
export function evaluationScenario(source: ScenarioDefinition, profile: Profile, seed?: number, swap = false): ScenarioDefinition {
  const variant = profile === 'off' ? source : tacticalScenario(source, profile === 'default');
  const data = scenarioDefinitionToData(variant);
  if (seed !== undefined) data.battleSeed = seed;
  if (swap) {
    if (data.turnLimit !== undefined || [...data.victoryConditions, ...data.defeatConditions].some((c) => !['eliminate', 'captureCapital', 'control', 'score'].includes(c.type)))
      throw Error('Return legs require symmetric public victory types without an authored deadline');
    const { width, height } = data.board;
    const owner = (p: PlayerId | undefined) => (p === undefined ? undefined : p === 'red' ? ('blue' as const) : ('red' as const));
    const rotate = (p: { x: number; y: number }) => ({ x: width - 1 - p.x, y: height - 1 - p.y });
    data.board.cells = data.board.cells.map(([x, y, kind, p]) => [width - 1 - x, height - 1 - y, kind, owner(p)]);
    data.initialUnits = data.initialUnits.map((u) => ({ ...u, owner: owner(u.owner)!, ...rotate(u) }));
    const transform = (c: ScenarioDefinition['victoryConditions'][number]) => (c.type === 'control' ? { ...c, positions: c.positions.map(rotate) } : c);
    const old = data.victoryConditions;
    data.victoryConditions = data.defeatConditions.map(transform);
    data.defeatConditions = old.map(transform);
    // Opening grants remain tied to first/second turn order.
  }
  const loaded = loadScenarioDefinitions([data]);
  if (!loaded.ok) throw Error(loaded.error);
  return loaded.value[0]!;
}
