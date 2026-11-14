import { applyGameCommand } from '../game/session';
import { reachablePositionsForPlayer } from '../game/commands';
import { forecastCombat } from '../game/combat';
import { canProduceUnit, isPropertyTerrainKind, productionKindsForRule, unitLimit } from '../game/facilities';
import { isServiceTile, isGroundUnit } from '../game/logistics';
import { isArmyPolicy, type ArmyPolicy } from '../game/armyPolicy';
import { isFourArmyCommand, type FourArmyCommand, type FourArmyObservation } from '../game/fourArmyEngine';
import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import { isDeployedUnit, type Position, type Unit } from '../game/types';
import { isEmbarkableUnit, transportCapacity, unitStats } from '../game/units';
import { manhattanDistance, positionKey, terrainAt, unitMovementCost } from '../game/terrain';
import { crossingDistances } from './crossing';
import { exactKeys, fourArmyPlanningView, isFourArmyObservation, record } from './fourArmyObservation';
import type { CpuDifficulty } from './rules';
import { fourArmyCpuOrder } from './fourArmyCpuOrder';
import { FOUR_ARMY_CPU_VERSION, isFourArmyCpuVersion, type FourArmyCpuVersion } from './fourArmyCpuVersion';

export interface FourArmyCpuOptions {
  difficulty: CpuDifficulty;
  policy: ArmyPolicy;
}
export type FourArmyCpuSettings = Record<(typeof FOUR_ARMY_IDS)[number], FourArmyCpuOptions>;
export const defaultFourArmyCpuSettings = (): FourArmyCpuSettings =>
  Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, { difficulty: 'normal', policy: 'balanced' }])) as FourArmyCpuSettings;
export const isFourArmyCpuOptions = (v: unknown): v is FourArmyCpuOptions =>
  record(v) && exactKeys(v, ['difficulty', 'policy']) && ['easy', 'normal', 'hard'].some((d) => d === v.difficulty) && isArmyPolicy(v.policy);
export const isFourArmyCpuSettings = (v: unknown): v is FourArmyCpuSettings => record(v) && exactKeys(v, FOUR_ARMY_IDS) && FOUR_ARMY_IDS.every((a) => isFourArmyCpuOptions(v[a]));

/** Validate on the known board only. The authoritative four-army engine validates again on commit. */
export function isObservedFourArmyCommand(o: FourArmyObservation, command: unknown): command is FourArmyCommand {
  if (o.outcome.type !== 'ongoing' || o.round.phase !== 'active' || o.round.order[o.round.index] !== o.viewer || !o.alive.includes(o.viewer)) return false;
  if (!isFourArmyCommand(command) || command.actor !== o.viewer || command.type === 'resume') return false;
  if (command.type === 'endTurn') return true;
  if (command.type === 'produce' && o.unitLimitPerArmy !== undefined && o.units.filter((u) => u.owner === o.viewer).length >= o.unitLimitPerArmy) return false;
  if (command.type === 'produce' && !canProduceUnit(o.board.terrain[command.factory.y]?.[command.factory.x]?.kind ?? 'plain', command.kind, 'facility-v2', 12)) return false;
  const { actor, ...c } = command;
  return actor === o.viewer && applyGameCommand(fourArmyPlanningView(o), c).ok;
}

/** One deterministic decision; only sanitized observations enter this function or the Worker. */
export function chooseFourArmyCpuCommand(input: unknown, options: unknown, cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION): FourArmyCommand | undefined {
  if (!isFourArmyObservation(input) || !isFourArmyCpuOptions(options) || !isFourArmyCpuVersion(cpuVersion)) throw Error('Invalid four-army CPU input');
  const o = input;
  if (o.outcome.type !== 'ongoing' || o.round.phase !== 'active' || o.round.order[o.round.index] !== o.viewer || !o.alive.includes(o.viewer)) return undefined;
  const view = fourArmyPlanningView(o),
    own = view.units.filter((u) => u.owner === 'red'),
    enemies = view.units.filter((u) => u.owner === 'blue' && isDeployedUnit(u));
  const ready = own.filter((u) => isDeployedUnit(u) && !u.hasActed).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const candidates: { command: FourArmyCommand; score: number; key: string }[] = [];
  const modern = cpuVersion !== 'four-army-cpu-v1',
    order = fourArmyCpuOrder(o),
    visible = new Set(o.visible.map(positionKey));
  const add = (command: FourArmyCommand, score: number) => {
    if (Number.isFinite(score)) candidates.push({ command, score, key: modern ? order.key(command) : JSON.stringify(command) });
  };
  const actor = o.viewer,
    cautious = options.policy === 'defensive' ? 0.65 : options.policy === 'offensive' ? 0.2 : 0.4;
  const properties = o.board.terrain.flatMap((row, y) => row.flatMap((t, x) => (isPropertyTerrainKind(t.kind) && t.owner !== actor ? [{ x, y }] : [])));
  const hostileHomes = o.alive.filter((a) => a !== actor && o.board.terrain[o.capitals[a].y]![o.capitals[a].x]!.owner === a).map((a) => o.capitals[a]);
  const goals = [...hostileHomes, ...properties];
  const danger = (u: Unit, p: Position): number => {
    const moved = { ...u, position: p };
    return enemies.reduce((sum, e) => {
      if (!e.position || manhattanDistance(e.position, p) > 5) return sum;
      const shot = forecastCombat(view, e, moved);
      return sum + (shot.ok ? shot.value.outgoing.max : 0);
    }, 0);
  };
  for (const u of ready) {
    if (!u.position) continue;
    const tile = terrainAt(view.board, u.position)!;
    if (unitStats[u.kind].capturePower > 0 && isPropertyTerrainKind(tile.kind) && tile.owner !== 'red')
      add({ actor, type: 'capture', unitId: u.id }, 1000 + (tile.kind === 'capital' ? 1000 : 0));
    for (const target of enemies) {
      const shot = forecastCombat(view, u, target);
      if (!shot.ok || shot.value.damageToDefender <= 0) continue;
      const score =
        300 +
        (shot.value.damageToDefender * unitStats[target.kind].cost) / 100 -
        ((shot.value.damageToAttacker * unitStats[u.kind].cost) / 100) * cautious +
        (shot.value.outgoing.min >= target.hp ? 500 : 0);
      add({ actor, type: 'attack', unitId: u.id, targetId: target.id, weaponSlot: shot.value.attackWeapon }, score);
    }
    const repairing = isServiceTile(view, u.position, u.kind, 'red') && u.hp < 85;
    add({ actor, type: 'wait', unitId: u.id }, repairing ? 250 : 1);
    if (u.hasMoved) continue;
    const cargo = own.find((c) => c.embarkedIn === u.id);
    const footDistance = cargo ? crossingDistances(view, cargo.kind, goals) : undefined;
    const shore =
      cargo && !isGroundUnit(u.kind)
        ? o.board.terrain.flatMap((row, y) =>
            row.flatMap((_tile, x) => {
              const p = { x, y };
              if (!Number.isFinite(unitMovementCost(view, p, u.kind))) return [];
              const d = Math.min(
                ...[
                  { x: x - 1, y },
                  { x: x + 1, y },
                  { x, y: y - 1 },
                  { x, y: y + 1 },
                ].map((q) => footDistance!.get(positionKey(q)) ?? Infinity),
              );
              return Number.isFinite(d) ? [{ p, d }] : [];
            }),
          )
        : [];
    const bestDrop = Math.min(...shore.map((s) => s.d));
    const targets = shore.length
      ? shore.filter((s) => s.d <= bestDrop + 1).map((s) => s.p)
      : unitStats[u.kind].capturePower > 0
        ? goals
        : [...enemies.flatMap((e) => (e.position ? [e.position] : [])), ...goals];
    const service =
      cpuVersion === 'four-army-cpu-v3' ? o.board.terrain.flatMap((row, y) => row.flatMap((_tile, x) => (isServiceTile(view, { x, y }, u.kind, 'red') ? [{ x, y }] : []))) : [];
    const homeDistances = service.length ? crossingDistances(view, u.kind, service) : undefined;
    const homeDistance = homeDistances?.get(positionKey(u.position)) ?? Infinity;
    const fuel = u.fuel ?? unitStats[u.kind].fuel;
    // Begin the return while the observed route is still reachable. No hidden occupancy is consulted.
    const returning = Number.isFinite(homeDistance) && homeDistance > 0 && fuel <= homeDistance + unitStats[u.kind].movement * 2;
    const distance = returning ? homeDistances! : crossingDistances(view, u.kind, targets);
    const currentDistance = distance.get(positionKey(u.position)) ?? Infinity;
    const destinations = reachablePositionsForPlayer(view, u.id, 'red')
      .map((p) => ({ p, d: distance.get(positionKey(p)) ?? Infinity }))
      .sort((a, b) => a.d - b.d || (modern ? order.compare(a.p, b.p) : a.p.y - b.p.y || a.p.x - b.p.x))
      .slice(0, 16);
    for (const { p, d } of destinations) {
      const threats = danger(u, p),
        retreating = u.hp < 45 || (u.fuel ?? unitStats[u.kind].fuel) < unitStats[u.kind].movement;
      let score = Number.isFinite(currentDistance) && Number.isFinite(d) ? 60 + (currentDistance - d) * 15 - d : -20;
      if (unitStats[u.kind].capturePower > 0 && isPropertyTerrainKind(terrainAt(view.board, p)!.kind) && terrainAt(view.board, p)!.owner !== 'red') score += 240;
      if (options.policy === 'defensive' && enemies.some((e) => e.position && manhattanDistance(e.position, o.capitals[actor]) <= 5))
        score += (manhattanDistance(u.position, o.capitals[actor]) - manhattanDistance(p, o.capitals[actor])) * 25;
      if (retreating && isServiceTile(view, p, u.kind, 'red')) score += 500;
      if (returning && Number.isFinite(d)) score += 550;
      score -= threats * cautious * (retreating ? 2 : 1);
      if (repairing && !retreating) score -= 300;
      if (options.difficulty !== 'easy') {
        const moved = { ...u, position: p, hasMoved: true };
        for (const target of enemies) {
          const shot = forecastCombat(view, moved, target);
          if (shot.ok && (options.difficulty === 'hard' || shot.value.outgoing.min >= target.hp))
            score = Math.max(
              score,
              200 +
                (shot.value.damageToDefender * unitStats[target.kind].cost) / 100 -
                ((shot.value.damageToAttacker * unitStats[u.kind].cost) / 100) * cautious -
                threats * cautious,
            );
        }
      }
      add({ actor, type: 'move', unitId: u.id, destination: p }, score);
    }
    // Cargo stays tied to its actual army; unload near a capturable objective or from a naval transport onto land.
    if (cargo && footDistance) {
      for (const p of [
        { x: u.position.x - 1, y: u.position.y },
        { x: u.position.x + 1, y: u.position.y },
        { x: u.position.x, y: u.position.y - 1 },
        { x: u.position.x, y: u.position.y + 1 },
      ]) {
        const d = footDistance.get(positionKey(p));
        if (d !== undefined && Number.isFinite(unitMovementCost(view, p, cargo.kind)) && d <= Math.max(3, Number.isFinite(bestDrop) ? bestDrop + 1 : 3))
          add({ actor, type: 'disembark', transportId: u.id, destination: p }, 400 - d * 10 - danger(cargo, p));
      }
    }
    if (isEmbarkableUnit(u.kind) && currentDistance > 6) {
      for (const carrier of ready)
        if (
          carrier.position &&
          !carrier.hasMoved &&
          transportCapacity(carrier.kind) > 0 &&
          !own.some((c) => c.embarkedIn === carrier.id) &&
          manhattanDistance(carrier.position, u.position) === 1
        )
          add({ actor, type: 'embark', unitId: u.id, transportId: carrier.id }, 220);
    }
  }
  const scale = options.difficulty === 'easy' ? 0.45 : options.difficulty === 'normal' ? 0.7 : 1;
  const limit = Math.max(4, Math.floor((o.unitLimitPerArmy ?? unitLimit(view.board, 12)) * scale));
  if (own.length < limit && o.units.length < 128)
    for (let y = 0; y < o.board.height; y++)
      for (let x = 0; x < o.board.width; x++) {
        const tile = o.board.terrain[y]![x]!;
        if (tile.owner !== actor || view.units.some((u) => u.position?.x === x && u.position.y === y)) continue;
        const kinds = productionKindsForRule('facility-v2', 12)[tile.kind] ?? [];
        for (const kind of kinds) {
          const stats = unitStats[kind];
          if (stats.cost > o.player.gold) continue;
          const capturers = own.filter((u) => unitStats[u.kind].capturePower > 0).length;
          let score = 80 + (kind === 'infantry' ? (capturers < 2 ? 180 : 10) : kind === 'tank' || kind === 'fighter' || kind === 'destroyer' ? 100 : 0) - stats.cost / 1000;
          if (kind === 'apc' && !own.some((u) => u.kind === 'apc') && own.some((u) => isGroundUnit(u.kind) && (u.fuel ?? unitStats[u.kind].fuel) < 10)) score += 200;
          if (kind === 'antiAir' && enemies.some((e) => e.kind === 'fighter' || e.kind === 'bomber' || e.kind === 'helicopter')) score += 240;
          // Unobserved production can be rejected by a hidden occupant. Finish known unit actions first;
          // retain fog production without probing private occupancy or discarding those actions on rejection.
          add({ actor, type: 'produce', factory: { x, y }, kind }, modern && !visible.has(`${x},${y}`) ? score - 1000 : score);
        }
      }
  candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key, 'en'));
  for (const c of candidates) if (isObservedFourArmyCommand(o, c.command)) return c.command;
  return { actor, type: 'endTurn' };
}
