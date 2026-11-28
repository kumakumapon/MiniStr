import { emptyFourArmyExperience, fourArmyExperienceManifest } from './fourArmyExperience';
import { expect, it } from 'vitest';
import { defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { isFourArmyObservation } from '../ai/fourArmyObservation';
import { createExpandedBattleMap } from './expandedBattleMap';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { enterReservedArmy, fourArmyArrival } from './fourArmyArrival';
import { fourArmyControllers } from './fourArmyControl';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from './fourArmyEngine';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { unitStats } from './units';
import type { GameResult } from './types';

function value<T>(result: GameResult<T>): T {
  if (!result.ok) throw Error(result.error);
  return result.value;
}

function endTo(state: FourArmyState, round: number, log: FourArmyCommand[] = []): FourArmyState {
  while (state.outcome.type === 'ongoing' && state.round.round < round) {
    const command = { type: 'endTurn', actor: state.round.order[state.round.index]! } as const;
    state = value(applyFourArmyCommand(state, command));
    log.push(command);
  }
  return state;
}

const sourceMapId = 'delayed-power';

it('materializes the assigned reserve once, after the first seven rounds and with no advance income or sight', () => {
  const siteArmies = ['army4', 'army2', 'army3', 'army1'] as const;
  const map = value(createExpandedBattleMap({ sourceMapId, siteArmies, order: ['army1', 'army2', 'army3', 'army4'], rules: { version: 1, tactics: true } }));
  const reserve = fourArmyArrival(map.match)!;
  expect(map.match).toMatchObject({ version: 3, layoutVersion: 10, arrival: { army: 'army1', team: 'army1', round: 8 } });
  const initial = value(createFourArmyState(map));
  expect(initial.engineVersion).toBe(6);
  expect(initial.round.order[0]).toBe('army2');
  expect(initial.alive).toEqual(['army2', 'army3', 'army4']);
  expect(initial.players.army1).toEqual({ gold: 0, income: 0 });
  expect(initial.board.terrain[reserve.capital.y]![reserve.capital.x]).not.toHaveProperty('owner');
  const waiting = value(observeFourArmy(initial, 'army1'));
  expect(isFourArmyObservation(waiting)).toBe(true);
  expect(waiting.visible).toEqual([]);
  expect(waiting.units).toEqual([]);
  expect(applyFourArmyCommand(initial, { type: 'endTurn', actor: 'army1' }).ok).toBe(false);

  const commands: FourArmyCommand[] = [];
  const seven = endTo(initial, 7, commands);
  expect(seven.round.startedArmies).not.toContain(reserve.army);
  const eight = endTo(seven, 8, commands);
  expect(eight.arrivedAt).toBe(8);
  expect(eight.alive).toContain(reserve.army);
  expect(eight.players.army1.gold).toBe(reserve.gold);
  const arrivingUnits = eight.units.filter((unit) => unit.owner === reserve.army);
  expect(arrivingUnits).toHaveLength(reserve.units.length);
  expect(eight.round.startedArmies).not.toContain(reserve.army);
  const nine = endTo(eight, 9, commands);
  expect(nine.round.startedArmies).toContain(reserve.army);
  expect(nine.players.army1.gold).toBeGreaterThan(reserve.gold);
  expect(nine.units.filter((unit) => unit.owner === reserve.army && unit.fuel === unitStats[unit.kind].fuel)).toHaveLength(arrivingUnits.length);

  const raw = value(serializeFourArmyArchive(map, commands, nine));
  const archive = value(parseFourArmyArchive(raw));
  expect(archive).toMatchObject({ schemaVersion: 6, ruleset: 'four-army-v6', payload: { state: nine } });
  expect(parseFourArmyArchive(JSON.stringify({ ...archive, schemaVersion: 5, ruleset: 'four-army-v5' })).ok).toBe(false);
  const altered = structuredClone(archive);
  if (altered.payload.map.match?.version === 3) altered.payload.map.match.arrival!.round = 2;
  expect(parseFourArmyArchive(JSON.stringify(altered)).ok).toBe(false);

  const pendingArchive = value(parseFourArmyArchive(value(serializeFourArmyArchive(map, [], initial))));
  const controllers = fourArmyControllers(['army1']);
  const save: FourArmySpectatorSave = {
    format: 'ministr-four-army-configurable',
    schemaVersion: 7,
    controllers,
    controlHistory: { initial: controllers, events: [] },
    experience: fourArmyExperienceManifest(emptyFourArmyExperience()),
    cpuVersion: 'four-army-cpu-v7',
    name: 'Arrival',
    savedAt: '2026-11-28T00:00:00.000Z',
    settings: defaultFourArmyCpuSettings(),
    view: 'army1',
    speed: 1,
    archive: pendingArchive,
  };
  const storage = value(serializeFourArmySpectatorSave(save));
  expect(value(parseFourArmySpectatorSave(storage)).archive.payload.state).toEqual(initial);
  expect(serializeFourArmySpectatorSave({ ...save, view: 'all' }).ok).toBe(false);
  expect(serializeFourArmySpectatorSave({ ...save, schemaVersion: 6 }).ok).toBe(false);
});

it('delays entry while a unit occupies the reservation, then admits it at the next clear boundary', () => {
  const map = value(createExpandedBattleMap({ sourceMapId, ending: 'unlimited' }));
  const seven = endTo(value(createFourArmyState(map)), 7);
  const { x, y } = fourArmyArrival(map.match)!.zone;
  const occupying = seven.units.find((unit) => unit.owner === 'army1')!;
  occupying.position = { x, y };
  const eight = endTo(seven, 8);
  expect(eight.arrivedAt).toBeUndefined();
  expect(eight.players.army4).toEqual({ gold: 0, income: 0 });
  expect(eight.units.some((unit) => unit.owner === 'army4')).toBe(false);
  eight.units.find((unit) => unit.id === occupying.id)!.position = { x, y: y - 1 };
  const nine = endTo(eight, 9);
  expect(nine.arrivedAt).toBe(9);
  expect(nine.alive).toContain('army4');
  const ended = { ...eight, outcome: { type: 'victory', winner: 'army1' } } as const;
  expect(enterReservedArmy(ended, 10)).toBe(ended);
});
