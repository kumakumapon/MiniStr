import { afterEach, describe, expect, it } from 'vitest';
import { maps, operationScenarios, scenarioDefinitionToData, scenarioHistory, trainingScenario, type VictoryCondition } from '../game/maps';
import { campaignOperations } from '../game/campaignOperations';
import { generateSymmetricMap, generateSymmetricMapV1, generateSymmetricMapV2 } from '../game/mapGenerator';
import { setLocale } from './locale';
import { conditionDescription, scenarioDisplayBriefing, scenarioDisplayName } from './scenarioText';

const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
afterEach(() => setLocale('ja'));

describe('scenario display localization', () => {
  it('translates every built-in name and briefing without changing scenario snapshots', () => {
    setLocale('en');
    for (const scenario of [...maps, ...operationScenarios, trainingScenario, ...maps.flatMap((entry) => scenarioHistory(entry.id))]) {
      const snapshot = JSON.stringify(scenarioDefinitionToData(scenario));
      expect(scenarioDisplayName(scenario), scenario.id).not.toMatch(japanese);
      expect(scenarioDisplayBriefing(scenario), scenario.id).not.toMatch(japanese);
      expect(JSON.stringify(scenarioDefinitionToData(scenario))).toBe(snapshot);
    }
  });

  it('translates campaign metadata and preserves custom metadata even under a built-in ID', () => {
    setLocale('en');
    for (const [id, operation] of Object.entries(campaignOperations)) {
      const scenario = maps.find((entry) => entry.id === id)!;
      expect(scenario, id).toBeDefined();
      const prepared = {
        ...scenario,
        name: operation.title,
        briefing: `${operation.orders} 別途、敵司令部の占領でも勝利。補給方針：${operation.logistics} 敵軍の作戦：${operation.enemyOrders}`,
      };
      expect(scenarioDisplayName(prepared)).not.toMatch(japanese);
      expect(scenarioDisplayBriefing(prepared)).not.toMatch(japanese);
    }
    const custom = { ...maps[0]!, name: '占領', briefing: '利用者が書いた作戦の説明' };
    expect(scenarioDisplayName(custom)).toBe(custom.name);
    expect(scenarioDisplayBriefing(custom)).toBe(custom.briefing);
    expect(scenarioDisplayName({ ...custom, id: 'custom-language-test' })).toBe(custom.name);
  });

  it('translates generated v1, v2 and frontline v3 display data while keeping saved definitions', () => {
    setLocale('en');
    for (const generate of [generateSymmetricMapV1, generateSymmetricMapV2, generateSymmetricMap]) {
      const generated = generate({ size: 16, sea: 'coast', seed: 'english-test', preset: 'frontline' });
      if (!generated.ok) throw new Error(generated.error);
      const snapshot = JSON.stringify(scenarioDefinitionToData(generated.value));
      expect(scenarioDisplayName(generated.value)).not.toMatch(japanese);
      expect(scenarioDisplayBriefing(generated.value)).not.toMatch(japanese);
      expect(JSON.stringify(scenarioDefinitionToData(generated.value))).toBe(snapshot);
      const renamed = { ...generated.value, name: '利用者の名前', briefing: '占領' };
      expect(scenarioDisplayName(renamed)).toBe(renamed.name);
      expect(scenarioDisplayBriefing(renamed)).toBe(renamed.briefing);
    }
  });

  it('describes every objective and switches back to the original Japanese', () => {
    const conditions: VictoryCondition[] = [
      { type: 'eliminate' },
      { type: 'captureCapital' },
      { type: 'hold', positions: [{ x: 1, y: 1 }], turns: 3, requireOwnership: true, groundOnly: true },
      { type: 'hold', positions: [{ x: 1, y: 1 }], turns: 2 },
      { type: 'survive', untilTurn: 60 },
      { type: 'score', target: 18 },
      { type: 'control', positions: [{ x: 1, y: 1 }], target: 12 },
      { type: 'escort', unitIds: ['r1'], positions: [{ x: 1, y: 1 }], required: 1 },
      { type: 'withdraw', unitIds: ['r1', 'r3'], positions: [{ x: 1, y: 1 }], required: 2 },
    ];
    setLocale('en');
    for (const condition of conditions) expect(conditionDescription(condition)).not.toMatch(japanese);
    expect(conditionDescription(conditions[2]!)).toContain('3 consecutive turns');
    setLocale('ja');
    expect(conditionDescription(conditions[0]!)).toBe('敵部隊を全滅させる');
    expect(scenarioDisplayName(maps[0]!)).toBe(maps[0]!.name);
  });
});
