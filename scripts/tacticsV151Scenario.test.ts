import { expect, it } from 'vitest';
import { scenarioById, scenarioDefinitionToData } from '../src/game/maps';
import { evaluationScenario } from './tacticsV151Scenario';
it('exchanges armies and roles twice without altering opening turn-order grants or the catalog', () => {
  const source = scenarioById('skirmish')!;
  const before = scenarioDefinitionToData(source);
  const outward = evaluationScenario(source, 'off', 15101);
  const back = evaluationScenario(outward, 'off', 15101, true);
  const restored = evaluationScenario(back, 'off', 15101, true);
  expect(scenarioDefinitionToData(restored)).toEqual(scenarioDefinitionToData(outward));
  expect(back.firstPlayerBonus).toBe(outward.firstPlayerBonus);
  expect(back.secondPlayerBonus).toBe(outward.secondPlayerBonus);
  expect(scenarioDefinitionToData(source)).toEqual(before);
});
it('separates rule changes from terrain changes and refuses asymmetric deadlines', () => {
  const source = scenarioById('skirmish')!;
  expect(evaluationScenario(source, 'rules-only').board).toEqual(source.board);
  expect(evaluationScenario(source, 'default').board).not.toEqual(source.board);
  expect(evaluationScenario(source, 'off').tacticalOptions).toBeUndefined();
  expect(evaluationScenario(source, 'rules-only').tacticalOptions).toEqual(evaluationScenario(source, 'default').tacticalOptions);
  expect(() => evaluationScenario(scenarioById('convoy-escort')!, 'default', 15101, true)).toThrow('symmetric');
});
