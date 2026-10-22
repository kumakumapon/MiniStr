import { expect, it } from 'vitest';
import { applyGameCommand, createDeploymentScenario, createScenarioInitialState, scenarioById, victoryReason, type GameCommand } from '../game';
import { isDefaultOperationRecord, operationTurnTarget, operationVictory, parseOperationRecords } from '../game/operationRecords';
import { valueOf } from '../game/operations.fixture';
import { chooseCpuAction } from './rules';

it.each(['bridgehead', 'river-withdrawal'])(
  'clears %s with its authored goal against easy CPU',
  (id) => {
    const scenario = scenarioById(id)!;
    const choices = scenario.initialUnits.filter((unit) => unit.owner === 'red').map((unit) => unit.kind);
    expect(createDeploymentScenario(scenario, choices).ok).toBe(true);
    const initial = createScenarioInitialState(scenario),
      commands: GameCommand[] = [];
    let state = initial;
    while (!state.winner && state.turn <= 60 && commands.length < 14_400) {
      const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
      state = valueOf(applyGameCommand(state, command));
      commands.push(command);
    }
    expect(state.winner).toBe('red');
    expect(victoryReason(state, scenario)).toBe(id === 'bridgehead' ? 'hold' : 'withdraw');
    expect(state.turn).toBeLessThanOrEqual(operationTurnTarget(id));
    const record = valueOf(operationVictory(initial, state, commands, 'easy'));
    expect(record).toMatchObject({ scenarioId: id, ruleVersion: 9 });
    expect(record.challenges).toContain('swift');
    expect(isDefaultOperationRecord(record)).toBe(true);
    expect(valueOf(parseOperationRecords(JSON.stringify({ schemaVersion: 1, records: [record] }))).records).toEqual([record]);
  },
  30_000,
);
