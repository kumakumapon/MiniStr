import { FOUR_ARMY_IDS, type FourArmyId } from '../src/game/fourArmyFoundation';
import { createExpandedBattleMap } from '../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand } from '../src/game/fourArmyEngine';
import type { GameResult, Position } from '../src/game/types';
import { defaultFourArmyCpuSettings, chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { fourArmyOrders } from './fourArmyAssessment';
import { fourArmyRoster } from '../src/game/smallBattle';

const value = <T>(result: GameResult<T>) => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
const [stage = 'validation', part = '0', parts = '1', seedText] = process.argv.slice(2);
if (!['training', 'validation'].includes(stage) || !Number.isInteger(+part) || !Number.isInteger(+parts) || +part < 0 || +parts < 1 || +part >= +parts)
  throw Error('training|validation shard shardCount');
const seed = seedText === undefined ? (stage === 'training' ? 33501 : 33509) : Number(seedText);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('invalid seed');
const bearing = (from: Position, to: Position) => {
  const dx = from.x - to.x,
    dy = from.y - to.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
};
let index = 0;
for (const source of ['canyon', 'marsh', 'skirmish'] as const)
  for (const count of [3, 4]) {
    const ids = FOUR_ARMY_IDS.slice(0, count),
      orders = fourArmyOrders(ids);
    for (const [i, order] of orders.entries())
      for (const tactics of [false, true])
        for (const swap of source === 'skirmish' ? [0] : [0, 1]) {
          if (stage === 'training' && i >= count) continue;
          if (index++ % +parts !== +part) continue;
          const offset = swap ? 1 + (i % (count - 1)) : 0;
          const sites = [...ids.slice(offset), ...ids.slice(0, offset)];
          const map = value(
            createExpandedBattleMap({
              sourceMapId: source,
              participants: ids,
              order,
              seed,
              rules: { version: 1, tactics },
              ...(source === 'skirmish' ? { layoutVersion: count === 3 ? 3 : 2 } : { siteArmies: sites }),
            }),
          );
          const settings = defaultFourArmyCpuSettings();
          let state = value(createFourArmyState(map)),
            commands = 0,
            fallbacks = 0;
          const pressure = fourArmyRoster(ids, () => 0),
            firstFactory = fourArmyRoster<number | null>(ids, () => null);
          let attacks = new Map<FourArmyId, { army: FourArmyId; direction: string }[]>();
          while (state.outcome.type === 'ongoing' && commands < 8192) {
            const actor = state.round.order[state.round.index]!;
            let command: FourArmyCommand = chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), settings[actor], 'four-army-cpu-v7')!;
            let next = applyFourArmyCommand(state, command);
            if (!next.ok) {
              const unit = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
              command = unit ? { type: 'wait', actor, unitId: unit } : { type: 'endTurn', actor };
              next = applyFourArmyCommand(state, command);
              fallbacks++;
            }
            const after = value(next);
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
              commands,
              fallbacks,
              winner: state.outcome.type === 'victory' ? state.outcome.winner : state.outcome.type,
              firstOut: state.eliminations[0]?.army ?? null,
              ending: state.decision ? 'deadline' : state.outcome.type === 'ongoing' ? 'cutoff' : 'natural',
              pressure,
              firstFactory,
            }),
          );
        }
  }
