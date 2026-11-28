import { authoredFourSources } from '../src/game/asymmetricFourSites';
import { isFixedFourArmySource } from '../src/game/asymmetricBattlefield';
import { FOUR_ARMY_IDS, type FourArmyId } from '../src/game/fourArmyFoundation';
import { createExpandedBattleMap } from '../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand } from '../src/game/fourArmyEngine';
import type { GameResult, Position } from '../src/game/types';
import { defaultFourArmyCpuSettings, chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { crossingDistances } from '../src/ai/crossing';
import { fourArmyPlanningView } from '../src/ai/fourArmyObservation';
import { positionKey } from '../src/game/terrain';
import { fourArmyOrders } from './fourArmyAssessment';
import { fourArmyRoster } from '../src/game/smallBattle';

const value = <T>(result: GameResult<T>) => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
const [stage = 'validation', part = '0', parts = '1', seedText, sourceList = 'canyon,marsh,skirmish', layout = 'current', armyCount] = process.argv.slice(2);
if (!['training', 'validation', 'routes', 'endurance'].includes(stage) || !Number.isInteger(+part) || !Number.isInteger(+parts) || +part < 0 || +parts < 1 || +part >= +parts)
  throw Error('training|validation|routes|endurance shard shardCount');
const seed = seedText === undefined ? (stage === 'training' ? 33501 : 33509) : Number(seedText);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('invalid seed');
const bearing = (from: Position, to: Position) => {
  const dx = from.x - to.x,
    dy = from.y - to.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
};
const sources = ['canyon', 'marsh', 'skirmish', 'strait', 'river', 'tundra', 'crown', 'encirclement', ...authoredFourSources] as const;
if (armyCount !== undefined && !['3', '4'].includes(armyCount)) throw Error('army count must be 3 or 4');
if (!sourceList.split(',').every((s) => sources.some((v) => v === s)) || !['current', '4'].includes(layout)) throw Error('invalid source or layout');
let index = 0;
for (const source of sources.filter((s) => sourceList.split(',').includes(s)))
  for (const count of [3, 4]) {
    if ((armyCount && count !== Number(armyCount)) || (source === 'tundra' && count !== 3) || (isFixedFourArmySource(source) && (count !== 4 || layout !== 'current'))) continue;
    const ids = FOUR_ARMY_IDS.slice(0, count),
      orders = fourArmyOrders(ids);
    for (const [i, order] of orders.entries())
      for (const tactics of [false, true])
        for (const swap of source === 'skirmish' || source === 'strait' ? [0] : [0, 1]) {
          if (stage === 'endurance' && (i !== 0 || swap !== 0 || !['strait', 'river'].includes(source))) continue;
          if (stage === 'routes' && (i !== 0 || tactics || swap !== 0)) continue;
          if (stage === 'training' && (isFixedFourArmySource(source) ? i % (orders.length / count) !== 0 : i >= count)) continue;
          if (index++ % +parts !== +part) continue;
          const offset = swap ? 1 + (i % (count - 1)) : 0;
          const sites = [...ids.slice(offset), ...ids.slice(0, offset)];
          const map = value(
            createExpandedBattleMap({
              sourceMapId: source,
              ending: stage === 'endurance' ? 'unlimited' : 'short',
              participants: ids,
              order,
              seed,
              rules: { version: 1, tactics },
              ...(source === 'skirmish'
                ? { layoutVersion: count === 3 ? 3 : 2 }
                : source === 'strait'
                  ? { layoutVersion: 2 }
                  : { siteArmies: sites, ...(layout === '4' ? { layoutVersion: 4 } : {}) }),
            }),
          );
          const settings = defaultFourArmyCpuSettings();
          let state = value(createFourArmyState(map)),
            commands = 0,
            fallbacks = 0;
          if (stage === 'routes') {
            const view = fourArmyPlanningView(value(observeFourArmy(state, ids[0]!)));
            for (const [site, army] of sites.entries()) {
              const factories = map.board.terrain.flatMap((row, y) => row.flatMap((t, x) => (t.kind === 'factory' && !t.owner ? [{ x, y }] : [])));
              const enemies = ids.filter((a) => a !== army).map((a) => map.capitals[a]);
              for (const kind of ['infantry', 'tank'] as const) {
                const starts = map.units.filter((u) => u.owner === army && u.kind === kind && u.position).map((u) => u.position!);
                const cost = (targets: Position[]) => Math.min(...starts.map((p) => crossingDistances(view, kind, targets).get(positionKey(p)) ?? Infinity));
                console.log(JSON.stringify({ source, count, layoutVersion: map.match!.layoutVersion, site, kind, nearestFactory: cost(factories), nearestEnemyHQ: cost(enemies) }));
              }
            }
            continue;
          }
          const pressure = fourArmyRoster(ids, () => 0),
            firstFactory = fourArmyRoster<number | null>(ids, () => null);
          const landed = new Set<FourArmyId>(),
            crossed = new Set<FourArmyId>(),
            farBankCapture = new Set<FourArmyId>();
          const away = (army: FourArmyId, p: Position) => source === 'river' && (p.y - 6) * (map.capitals[army].y - 6) < 0;
          let attacks = new Map<FourArmyId, { army: FourArmyId; direction: string }[]>();
          while (state.outcome.type === 'ongoing' && commands < 8192 && state.round.round <= 160) {
            const actor = state.round.order[state.round.index]!;
            let command: FourArmyCommand = state.paused
              ? { type: 'resume', actor }
              : chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), settings[actor], 'four-army-cpu-v7')!;
            let next = applyFourArmyCommand(state, command);
            if (!next.ok) {
              const unit = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
              command = unit ? { type: 'wait', actor, unitId: unit } : { type: 'endTurn', actor };
              next = applyFourArmyCommand(state, command);
              fallbacks++;
            }
            const after = value(next);
            if (command.type === 'disembark') landed.add(actor);
            if (source === 'river' && command.type === 'move' && away(actor, command.destination)) crossed.add(actor);
            if (source === 'river' && command.type === 'capture') {
              const p = state.units.find((u) => 'unitId' in command && u.id === command.unitId)?.position;
              if (p && away(actor, p) && state.board.terrain[p.y]![p.x]!.owner !== actor && after.board.terrain[p.y]![p.x]!.owner === actor) farBankCapture.add(actor);
            }
            if (command.type === 'attack') {
              const { unitId, targetId } = command;
              const from = state.units.find((u) => u.id === unitId),
                to = state.units.find((u) => u.id === targetId);
              if (from?.position && to?.position) {
                const list = attacks.get(to.owner) ?? [];
                list.push({ army: actor, direction: bearing(from.position, to.position) });
                attacks.set(to.owner, list);
              }
            }
            if (command.type === 'capture' && firstFactory[actor] === null) {
              const { unitId } = command;
              const p = state.units.find((u) => u.id === unitId)?.position;
              if (p && after.board.terrain[p.y]?.[p.x]?.kind === 'factory' && after.board.terrain[p.y]?.[p.x]?.owner === actor && state.board.terrain[p.y]?.[p.x]?.owner !== actor)
                firstFactory[actor] = state.round.round;
            }
            if (after.round.round !== state.round.round || after.outcome.type !== 'ongoing') {
              for (const [army, hits] of attacks) if (hits.some((a) => hits.some((b) => a.army !== b.army && a.direction !== b.direction))) pressure[army]++;
              attacks = new Map();
            }
            state = after;
            commands++;
          }
          console.log(
            JSON.stringify({
              source,
              sites,
              order,
              tactics,
              seed,
              layoutVersion: map.match!.layoutVersion,
              landed: [...landed],
              crossed: [...crossed],
              farBankCapture: [...farBankCapture],
              ...(source === 'delayed-power' ? { arrivedAt: state.arrivedAt ?? null } : {}),
              ...(source === 'canal-crossroads' ? { heldRounds: state.objectiveHold?.rounds ?? 0 } : {}),
              eliminated: state.eliminations.length,
              round: state.decision?.round ?? state.round.round,
              commands,
              fallbacks,
              winner: state.outcome.type === 'victory' ? state.outcome.winner : state.outcome.type,
              ...(source === 'encirclement' && state.outcome.type === 'victory' ? { winningTeam: state.outcome.winner === sites[0] ? 'hegemon' : 'alliance' } : {}),
              firstOut: state.eliminations[0]?.army ?? null,
              ending: state.decision ? 'deadline' : state.outcome.type === 'ongoing' ? 'cutoff' : 'natural',
              pressure,
              firstFactory,
            }),
          );
        }
  }
