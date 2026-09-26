import { isDeployedUnit, MODERN_RULE_VERSION, type GameState, type PlayerId, type Position, type TerrainKind, type UnitKind } from './types';
import { unitDefinitions, unitKinds, type ProductionTerrain, type UnitDefinition } from './units';

export const propertyTerrainKinds = ['city', 'factory', 'airport', 'capital', 'port'] as const;
export type PropertyTerrainKind = (typeof propertyTerrainKinds)[number];

const propertyTerrainKindSet = new Set<TerrainKind>(propertyTerrainKinds);

export function isPropertyTerrainKind(kind: TerrainKind): kind is PropertyTerrainKind {
  return propertyTerrainKindSet.has(kind);
}

export const productionRules = ['facility-v2', 'legacy-factory-air'] as const;
export type ProductionRule = (typeof productionRules)[number];
export const productionRuleSet: ReadonlySet<string> = new Set(productionRules);
export const defaultProductionRule: ProductionRule = 'facility-v2';

type ProductionKindsByTerrain = Partial<Record<TerrainKind, readonly UnitKind[]>>;

/**
 * Production is derived from the unit registry so adding a unit updates every
 * production consumer together. `legacy-factory-air` is deliberately additive:
 * JSON written before airports existed keeps aircraft available at factories,
 * while a newly authored airport still works as an air facility.
 */
function buildProductionKindsByTerrain(rule: ProductionRule, ruleVersion: RuleVersion): ProductionKindsByTerrain {
  const byTerrain: Record<ProductionTerrain, UnitKind[]> = { factory: [], airport: [], port: [] };
  for (const kind of unitKinds) if (isUnitKindAvailable(kind, ruleVersion)) byTerrain[unitDefinitions[kind].productionTerrain].push(kind);
  if (rule === 'legacy-factory-air') {
    for (const kind of byTerrain.airport) byTerrain.factory.push(kind);
  }
  return byTerrain;
}

type RuleVersion = GameState['ruleVersion'];

/** Units introduced by the modern rules are unavailable in classic matches, including old saves. */
export function isUnitKindAvailable(kind: UnitKind, ruleVersion: RuleVersion): boolean {
  return (unitDefinitions[kind] as UnitDefinition).modernOnly !== true || ruleVersion === MODERN_RULE_VERSION;
}

/** Classic facility-v2 production, kept for callers that predate rule versions. */
export const productionKindsByTerrain: ProductionKindsByTerrain = buildProductionKindsByTerrain(defaultProductionRule, undefined);
const productionTables: Record<ProductionRule, Record<'classic' | 'modern', ProductionKindsByTerrain>> = {
  'facility-v2': { classic: productionKindsByTerrain, modern: buildProductionKindsByTerrain('facility-v2', MODERN_RULE_VERSION) },
  'legacy-factory-air': {
    classic: buildProductionKindsByTerrain('legacy-factory-air', undefined),
    modern: buildProductionKindsByTerrain('legacy-factory-air', MODERN_RULE_VERSION),
  },
};

/**
 * The single production-availability table shared by commands, the CPU, and
 * the UI. Omitting `ruleVersion` selects the classic unit roster.
 */
export function productionKindsForRule(rule: ProductionRule = defaultProductionRule, ruleVersion?: RuleVersion): ProductionKindsByTerrain {
  return productionTables[rule][ruleVersion === MODERN_RULE_VERSION ? 'modern' : 'classic'];
}

export const allProducibleUnitKinds: readonly UnitKind[] = unitKinds.filter(kind => unitDefinitions[kind].productionTerrain !== undefined);

export function canProduceUnit(terrain: TerrainKind, unit: UnitKind, rule: ProductionRule = defaultProductionRule, ruleVersion?: RuleVersion): boolean {
  return productionKindsForRule(rule, ruleVersion)[terrain]?.includes(unit) ?? false;
}

export interface ProductionFacility { position: Position; kind: PropertyTerrainKind; kinds: readonly UnitKind[] }

/** Owned production facilities with no deployed unit on them, in stable row-major order. */
export function idleProductionFacilities(state: GameState, player: PlayerId, rule: ProductionRule = defaultProductionRule): ProductionFacility[] {
  const production = productionKindsForRule(rule, state.ruleVersion);
  const facilities: ProductionFacility[] = [];
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      const tile = state.board.terrain[y]![x]!;
      if (tile.owner !== player) continue;
      const kinds = production[tile.kind];
      if (!kinds || kinds.length === 0) continue;
      const occupied = state.units.some(unit => isDeployedUnit(unit) && unit.position.x === x && unit.position.y === y);
      if (occupied) continue;
      facilities.push({ position: { x, y }, kind: tile.kind as PropertyTerrainKind, kinds });
    }
  }
  return facilities;
}

/** Total owned production facilities, regardless of occupancy. */
export function countProductionFacilities(state: GameState, player: PlayerId, rule: ProductionRule = defaultProductionRule): number {
  const production = productionKindsForRule(rule);
  let count = 0;
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      const tile = state.board.terrain[y]![x]!;
      if (tile.owner !== player) continue;
      const kinds = production[tile.kind];
      if (kinds && kinds.length > 0) count += 1;
    }
  }
  return count;
}
