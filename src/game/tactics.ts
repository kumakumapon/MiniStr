import { unitDefinitions, unitStats, type UnitDefinition } from './units';
import { manhattanDistance, positionKey } from './terrain';
import { isDeployedUnit, TACTICAL_RULE_VERSION, type GameState, type PlayerId, type Position, type Unit } from './types';

export const tacticalFeatures = ['simultaneous', 'ambush', 'terrain', 'weather', 'zoc', 'submarines'] as const;
export type TacticalFeature = (typeof tacticalFeatures)[number];
export type TacticalOptions = Record<TacticalFeature, boolean> & { initiative?: 0 | 3 | 5; plainCover?: boolean };
export const combinedTactics: Readonly<TacticalOptions> = Object.freeze({ simultaneous: true, ambush: true, terrain: true, weather: true, zoc: true, submarines: true });
export interface TacticalState {
  options: TacticalOptions;
  weatherSeed: number;
  revealed: Record<PlayerId, string[]>;
  lastCombat?: {
    attackerId: string;
    defenderId: string;
    ambush: boolean;
    simultaneous: boolean;
    attackerPosition: Position;
    defenderPosition: Position;
    attackWeapon: 0 | 1;
    counterWeapon?: 0 | 1;
  };
}
export const tacticalEnabled = (state: Pick<GameState, 'ruleVersion' | 'tactics'>, feature: TacticalFeature): boolean =>
  (state.ruleVersion ?? 0) >= TACTICAL_RULE_VERSION && state.tactics?.options[feature] === true;
export function validTacticalOptions(value: unknown): value is TacticalOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).every((key) => tacticalFeatures.includes(key as TacticalFeature) || key === 'initiative' || key === 'plainCover') &&
    tacticalFeatures.every((key) => typeof entry[key] === 'boolean') &&
    (entry.initiative === undefined || [0, 3, 5].includes(entry.initiative as number)) &&
    (entry.plainCover === undefined || typeof entry.plainCover === 'boolean')
  );
}
export function initialTactics(options: TacticalOptions, seed: number): TacticalState {
  return { options: { ...options }, weatherSeed: (seed ^ 0x57454154) >>> 0, revealed: { red: [], blue: [] } };
}
/** A separate stateless stream: both armies get the same two-round weather block. */
export function weatherAt(state: GameState, round = state.turn): 'clear' | 'rain' {
  if (!tacticalEnabled(state, 'weather')) return 'clear';
  let seed = (state.tactics!.weatherSeed + Math.imul(Math.floor((round - 1) / 2), 0x9e3779b9)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  return seed % 4 === 0 ? 'rain' : 'clear';
}
export const visionRange = (state: GameState, unit: Unit): number => Math.max(1, unitStats[unit.kind].vision - (weatherAt(state) === 'rain' ? 1 : 0));
export const groundUnit = (unit: Pick<Unit, 'kind'>): boolean => ['foot', 'vehicle'].includes(unitDefinitions[unit.kind].movementProfile);
/** Terrain visibility and submerged contact detection are deliberately separate. */
export function detectedContact(state: GameState, player: PlayerId, target: Unit): boolean {
  if (!isDeployedUnit(target)) return false;
  if (!tacticalEnabled(state, 'submarines') || !target.submerged) return true;
  if (state.tactics?.revealed[player].includes(target.id)) return true;
  return state.units.some(
    (observer) =>
      observer.owner === player &&
      isDeployedUnit(observer) &&
      (observer.kind === 'destroyer' || observer.kind === 'submarine') &&
      manhattanDistance(observer.position, target.position) <= (observer.kind === 'destroyer' ? 3 : 2),
  );
}
export function revealContact(state: GameState, player: PlayerId, id: string): GameState {
  if (!state.tactics) return state;
  return { ...state, tactics: { ...state.tactics, revealed: { ...state.tactics.revealed, [player]: [...new Set([...state.tactics.revealed[player], id])] } } };
}
/** Public type capability, independent of private ammunition or reservations. */
export function zocTiles(state: GameState, mover: Unit, observedEnemies: readonly Unit[]): Set<string> {
  const cells = new Set<string>();
  if (!tacticalEnabled(state, 'zoc') || !groundUnit(mover)) return cells;
  for (const enemy of observedEnemies) {
    if (enemy.owner === mover.owner || !isDeployedUnit(enemy) || !groundUnit(enemy) || unitDefinitions[enemy.kind].stats.indirect || unitDefinitions[enemy.kind].weapon === null)
      continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      cells.add(positionKey({ x: enemy.position.x + dx!, y: enemy.position.y + dy! }));
  }
  return cells;
}
export function tacticalTurnStart(state: GameState, actor: PlayerId): GameState {
  if (!state.tactics) return state;
  return {
    ...state,
    tactics: { ...state.tactics, lastCombat: undefined, revealed: { ...state.tactics.revealed, [actor]: [] } },
    units: state.units.map((unit) => {
      if (unit.owner !== state.activePlayer) return unit;
      const next = { ...unit };
      delete next.ambush;
      if (next.submerged) {
        next.diveTurns = (next.diveTurns ?? 0) + 1;
        if (next.diveTurns >= 3) {
          next.submerged = false;
          next.diveTurns = 0;
        }
      }
      return next;
    }),
  };
}
export function validTacticalState(state: GameState): boolean {
  const allUnits = [...state.units, ...(state.evacuatedUnits ?? [])];
  if (state.tactics === undefined)
    return state.draw === undefined && allUnits.every((u) => u.ambush === undefined && u.submerged === undefined && u.diveTurns === undefined && u.kind !== 'submarine');
  const t = state.tactics;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
  if (
    (state.ruleVersion ?? 0) < TACTICAL_RULE_VERSION ||
    !validTacticalOptions(t.options) ||
    !Number.isSafeInteger(t.weatherSeed) ||
    t.weatherSeed < 0 ||
    t.weatherSeed > 0xffffffff ||
    !t.revealed ||
    typeof t.revealed !== 'object' ||
    (state.draw !== undefined && (state.draw !== true || !!state.winner))
  )
    return false;
  for (const p of ['red', 'blue'] as const)
    if (
      !Array.isArray(t.revealed[p]) ||
      t.revealed[p].length > 4096 ||
      t.revealed[p].some((id) => typeof id !== 'string' || id.length > 128) ||
      new Set(t.revealed[p]).size !== t.revealed[p].length
    )
      return false;
  if (state.draw && !t.options.simultaneous) return false;
  if (t.lastCombat !== undefined) {
    if (!t.lastCombat || typeof t.lastCombat !== 'object' || Array.isArray(t.lastCombat)) return false;
    const event = t.lastCombat;
    const validPosition = (p: Position) =>
      !!p && typeof p === 'object' && Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < state.board.width && p.y < state.board.height;
    if (
      !validPosition(event.attackerPosition) ||
      !validPosition(event.defenderPosition) ||
      event.attackerId === event.defenderId ||
      (event.attackWeapon !== 0 && event.attackWeapon !== 1) ||
      (event.counterWeapon !== undefined && event.counterWeapon !== 0 && event.counterWeapon !== 1) ||
      (event.ambush && !t.options.ambush) ||
      (event.simultaneous && !t.options.simultaneous)
    )
      return false;
  }
  if (
    t.lastCombat &&
    (typeof t.lastCombat.attackerId !== 'string' ||
      typeof t.lastCombat.defenderId !== 'string' ||
      t.lastCombat.attackerId.length > 128 ||
      t.lastCombat.defenderId.length > 128 ||
      typeof t.lastCombat.ambush !== 'boolean' ||
      typeof t.lastCombat.simultaneous !== 'boolean')
  )
    return false;
  const validReservation = (unit: Unit) => {
    if (unit.ambush === undefined) return true;
    const d: UnitDefinition = unitDefinitions[unit.kind];
    const weapon = unit.ambush === 0 ? (d.weapon === null ? undefined : d.stats) : d.secondaryWeapon;
    const ammo = unit.ambush === 0 ? (unit.ammo ?? d.stats.ammo) : (unit.secondaryAmmo ?? d.secondaryWeapon?.ammo ?? 0);
    return !!weapon && !weapon.indirect && weapon.range[0] === 1 && ammo > 0;
  };
  return allUnits.every(
    (unit) =>
      validReservation(unit) &&
      (unit.ambush === undefined || (t.options.ambush && groundUnit(unit) && isDeployedUnit(unit) && unit.hasMoved && unit.hasActed && (unit.ambush === 0 || unit.ambush === 1))) &&
      (unit.kind !== 'submarine' || t.options.submarines) &&
      (unit.submerged === undefined ||
        (unit.kind === 'submarine' &&
          t.options.submarines &&
          typeof unit.submerged === 'boolean' &&
          (!unit.submerged || (!!unit.position && state.board.terrain[unit.position.y]?.[unit.position.x]?.kind === 'sea')))) &&
      (unit.diveTurns === undefined ||
        (unit.kind === 'submarine' && Number.isInteger(unit.diveTurns) && unit.diveTurns >= 0 && unit.diveTurns < 3 && (unit.diveTurns === 0 || unit.submerged === true))),
  );
}
export const adjacentCells = (p: Position): Position[] => [
  { x: p.x - 1, y: p.y },
  { x: p.x + 1, y: p.y },
  { x: p.x, y: p.y - 1 },
  { x: p.x, y: p.y + 1 },
];
