import { describe, expect, it } from 'vitest';
import { renderControlObjective, renderOperationChallenges, renderOperationRecords, renderReconControl } from './operationsExpansion';
import { operationVictory, saveOperationVictory, operationTurnTarget } from '../game/operationRecords';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { endTurn } from '../game/commands';
import { valueOf } from '../game/operations.fixture';
import type { GameCommand } from '../game/session';

function record() {
  const initial = createScenarioInitialState(scenarioById('frontier-defense')!),
    commands: GameCommand[] = [];
  let final = initial;
  while (!final.winner) {
    commands.push({ type: 'endTurn' });
    final = endTurn(final);
  }
  return valueOf(operationVictory(initial, final, commands, 'normal'));
}
describe('operations UI surfaces', () => {
  it('shows scan use, expiry, targeting, cancellation and disabled/legacy states', () => {
    const state = createScenarioInitialState(scenarioById('control-crossroads')!);
    expect(renderReconControl({ ...state, ruleVersion: 6 }, 'red', true, false)).toBe('');
    expect(renderReconControl(state, 'red', true, false)).toContain('残り2回');
    expect(renderReconControl(state, 'red', true, true)).toContain('recon-cancel');
    expect(renderReconControl(state, 'red', false, false)).toContain('disabled');
    expect(renderReconControl({ ...state, recon: { remaining: { red: 0, blue: 2 }, centers: [] } }, 'red', true, false)).toContain('disabled');
  });
  it('makes objective ownership and round scoring public without including hidden units', () => {
    const scenario = scenarioById('control-coast')!,
      state = createScenarioInitialState(scenario);
    expect(renderControlObjective(state, scenario)).toContain('中立');
    state.board = structuredClone(state.board);
    state.board.terrain[5]![6]!.owner = 'red';
    state.board.terrain[6]![9]!.owner = 'blue';
    expect(renderControlObjective({ ...state, controlScores: { red: 3, blue: 4 } }, scenario)).toContain('赤 3 ／ 青 4');
    expect(renderControlObjective(state, scenario)).toContain('青軍');
    expect(renderControlObjective(state, scenarioById('skirmish')!)).toBe('');
    expect(renderControlObjective(state, scenario)).not.toContain('b1');
  });
  it('renders optional challenges, exact condition summaries, corrupt recovery and escaped notices', () => {
    const result = record(),
      values = new Map<string, string>();
    const catalog = valueOf(
      saveOperationVictory(
        {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, text) => {
            values.set(key, text);
          },
          removeItem: (key) => {
            values.delete(key);
          },
        },
        result,
      ),
    ).catalog;
    expect(renderOperationChallenges('skirmish')).toBe('');
    expect(renderOperationChallenges(result.scenarioId)).toContain(`${operationTurnTarget(result.scenarioId)}ターン以内`);
    expect(renderOperationChallenges(result.scenarioId, result)).toContain('✓ 達成');
    expect(renderOperationChallenges(result.scenarioId, { ...result, challenges: [] })).toContain('未達成');
    const html = renderOperationRecords(catalog, '<script>evil</script>', true);
    expect(html).toContain('標準編成');
    expect(html).toContain('開始');
    expect(html).toContain('data-record-delete');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(renderOperationRecords({ schemaVersion: 1, records: [] }, '', false)).toContain('まだありません');
    expect(renderOperationRecords(undefined, '破損', true)).toContain('operation-records-reset');
    const other = { ...result, difficulty: 'hard' as const, revision: 'older', challenges: [], ruleVersion: 6 as const };
    expect(renderOperationRecords({ schemaVersion: 1, records: [other, { ...other, difficulty: 'easy' }] }, '', false)).toContain('旧作戦');
    expect(renderOperationRecords({ schemaVersion: 1, records: [other] }, '', false)).toContain('追加課題なし');
  });
});
