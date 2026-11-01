import { maps, type ScenarioDefinition } from '../src/game/maps';

/** Rotate public authored geometry without exchanging the armies or turn order. */
export function catalogTacticalScenario(id: string, rotated: boolean): ScenarioDefinition {
  const source = maps.find((map) => map.id === id);
  if (!source) throw Error(`Unknown catalog map: ${id}`);
  if (!rotated) return source;
  const next = structuredClone(source),
    { width, height } = next.board;
  const position = (p: { x: number; y: number }) => ({ x: width - 1 - p.x, y: height - 1 - p.y });
  next.board.terrain.reverse().forEach((row) => row.reverse());
  next.initialUnits = next.initialUnits.map((u) => ({ ...u, ...position(u) }));
  for (const conditions of [next.victoryConditions, next.defeatConditions]) for (const c of conditions) if ('positions' in c) c.positions = c.positions.map(position);
  return next;
}
