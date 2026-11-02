import { loadScenarioDefinitions, scenarioDefinitionToData, type ScenarioDefinition } from './maps';
import { combinedTactics, type TacticalOptions } from './tactics';

const variants = new WeakMap<ScenarioDefinition, ScenarioDefinition>();

/** A snapshot variant: original catalog definitions and historical seeds stay intact. */
export function tacticalScenario(source: ScenarioDefinition, reviseLayout = true, options?: TacticalOptions): ScenarioDefinition {
  if (source.tacticalOptions && reviseLayout && !options) return source;
  if (reviseLayout && !options && variants.has(source)) return variants.get(source)!;
  const data = scenarioDefinitionToData(source);
  data.tacticalOptions = { ...(options ?? combinedTactics) };
  if (reviseLayout && !source.tacticalOptions) {
    const { width: w, height: h } = source.board;
    const reserved = new Set(source.initialUnits.map((u) => `${u.x},${u.y}`));
    for (const c of [...source.victoryConditions, ...source.defeatConditions]) if ('positions' in c) for (const p of c.positions) reserved.add(`${p.x},${p.y}`);
    const cells = new Map(data.board.cells.map((c) => [`${c[0]},${c[1]}`, [...c] as [number, number, (typeof c)[2], (typeof c)[3]?]]));
    const set = (x: number, y: number, kind: 'road' | 'forest' | 'supplyDepot') => {
      const tile = source.board.terrain[y]?.[x];
      if (!tile || reserved.has(`${x},${y}`) || !['plain', 'forest', 'swamp', 'mountain', 'road'].includes(tile.kind)) return;
      cells.set(`${x},${y}`, [x, y, kind]);
    };
    const lane = Math.max(2, Math.floor(h / 3) - 1);
    // Two approaches; water and authored objective/facility/initial-unit cells are preserved.
    for (let x = 1; x < w - 1; x++) {
      set(x, lane, 'road');
      set(w - 1 - x, h - 1 - lane, 'road');
    }
    const x = Math.max(1, Math.floor(w / 3));
    // Connect each approach to the central supply line without altering water,
    // authored properties, objectives or initial deployments.
    for (let y = lane + 1; y < Math.floor(h / 2); y++) {
      set(x, y, 'road');
      set(w - 1 - x, h - 1 - y, 'road');
    }
    set(x, lane + 1, 'forest');
    set(w - 1 - x, h - 2 - lane, 'forest');
    set(x, Math.floor(h / 2) - 1, 'supplyDepot');
    set(w - 1 - x, h - Math.floor(h / 2), 'supplyDepot');
    data.board.cells = [...cells.values()];
    data.name += ' / Tactical v2';
  }
  const loaded = loadScenarioDefinitions([data]);
  if (!loaded.ok) throw Error(loaded.error);
  if (reviseLayout && !options) variants.set(source, loaded.value[0]!);
  return loaded.value[0]!;
}
