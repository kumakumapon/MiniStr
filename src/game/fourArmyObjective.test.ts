import { expect, it } from 'vitest';
import { chooseFourArmyCpuCommand } from '../ai/fourArmyCpu';
import { isFourArmyObservation } from '../ai/fourArmyObservation';
import { createExpandedBattleMap } from './expandedBattleMap';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { applyFourArmyCommand, createFourArmyState, isFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from './fourArmyEngine';
import { fourArmyObjective, updateFourArmyHold } from './fourArmyObjective';
import type { GameResult } from './types';

function value<T>(result: GameResult<T>): T {
  if (!result.ok) throw Error(result.error);
  return result.value;
}

it('wins at the fourth completed round of ownership and replays the same victory', () => {
  const map = value(createExpandedBattleMap({ sourceMapId: 'canal-crossroads' }));
  const objective = fourArmyObjective(map.match)!;
  expect(map.match).toMatchObject({ layoutVersion: 9, ending: 'unlimited' });
  let state = value(createFourArmyState(map));
  const commands: FourArmyCommand[] = [];
  const step = (command: FourArmyCommand) => {
    state = value(applyFourArmyCommand(state, command));
    commands.push(command);
  };
  const end = () => step({ type: 'endTurn', actor: state.round.order[state.round.index]! });
  const unitId = state.units.find((unit) => unit.owner === 'army1' && unit.kind === 'infantry')!.id;
  expect(state.objectiveHold).toEqual({ rounds: 0 });
  const observation = value(observeFourArmy(state, 'army1'));
  expect(isFourArmyObservation(observation)).toBe(true);
  const opening = { ...observation, units: observation.units.filter((unit) => unit.owner === 'army1') };
  expect(chooseFourArmyCpuCommand(opening, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v7')).toMatchObject({
    type: 'move',
    destination: objective.position,
  });
  step({ type: 'move', actor: 'army1', unitId, destination: objective.position });
  step({ type: 'capture', actor: 'army1', unitId });
  expect(state.objectiveHold).toEqual({ rounds: 0 });
  end();
  while (state.round.order[state.round.index] !== 'army1') end();
  step({ type: 'capture', actor: 'army1', unitId });
  expect(state.objectiveHold).toEqual({ army: 'army1', rounds: 0 });
  for (let completed = 1; completed <= objective.rounds; completed++) {
    const round = state.round.round;
    while (state.round.round === round) end();
    expect(state.objectiveHold).toEqual({ army: 'army1', rounds: completed });
  }
  expect(state.outcome).toEqual({ type: 'victory', winner: 'army1' });
  expect(state.alive).toHaveLength(4);
  expect(isFourArmyObservation(value(observeFourArmy(state, 'army4')))).toBe(true);
  const raw = value(serializeFourArmyArchive(map, commands, state));
  expect(value(parseFourArmyArchive(raw)).payload.state).toEqual(state);
  const corrupt = value(parseFourArmyArchive(raw));
  corrupt.payload.state.objectiveHold!.rounds = 1;
  expect(parseFourArmyArchive(JSON.stringify(corrupt)).ok).toBe(false);
  expect(applyFourArmyCommand(state, { type: 'endTurn', actor: state.round.order[state.round.index]! }).ok).toBe(false);
});

it('clears the old streak immediately when another army gains the objective', () => {
  const map = value(createExpandedBattleMap({ sourceMapId: 'canal-crossroads', ending: 'short' }));
  const start = value(createFourArmyState(map));
  const objective = fourArmyObjective(start.match)!;
  const state: FourArmyState = { ...structuredClone(start), round: { ...start.round, round: 2 } };
  const tile = state.board.terrain[objective.position.y]![objective.position.x]!;
  tile.owner = 'army1';
  state.objectiveHold = { army: 'army1', rounds: 1 };
  tile.owner = 'army3';
  expect(updateFourArmyHold(state).objectiveHold).toEqual({ army: 'army3', rounds: 0 });
  expect(updateFourArmyHold(state, true).objectiveHold).toEqual({ army: 'army3', rounds: 1 });
  delete tile.owner;
  expect(updateFourArmyHold(state, true).objectiveHold).toEqual({ rounds: 0 });
  expect(isFourArmyState({ ...start, objectiveHold: { army: 'army1', rounds: 1 } })).toBe(false);
  if (map.match?.version === 2) map.match.objective!.rounds++;
  expect(createFourArmyState(map).ok).toBe(false);
});
