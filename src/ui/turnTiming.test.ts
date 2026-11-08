import { afterEach, describe, expect, it } from 'vitest';
import {
  createScenarioInitialState,
  loadScenarioDefinitions,
  maps,
  operationScenarios,
  scenarioById,
  scenarioDefinitionToData,
  trainingScenario,
  type VictoryCondition,
} from '../game/maps';
import { createCampaignProgress } from '../game/campaign';
import { createCampaignScenario } from '../game/campaignOperations';
import { dailyScenario } from '../game/dailyChallenge';
import { generateSymmetricMap } from '../game/mapGenerator';
import { tacticalScenario } from '../game/tacticalMaps';
import { decisionRound } from '../game/victory';
import { setLocale } from './locale';
import { renderBriefingOverlay } from './overlays';
import { campaignTimingSummary, isDeadlineCondition, objectiveTimingDescription, scenarioConditionDescription, scenarioTiming, timingProgress, timingSummary } from './turnTiming';

afterEach(() => setLocale('ja'));

function map(id: string) {
  const scenario = scenarioById(id);
  if (!scenario) throw Error(id);
  return scenario;
}

describe('effective turn timing (#273)', () => {
  it.each(['skirmish', 'islands', 'canyon', 'siege', 'river', 'outpost', 'marsh', 'admiralty'])('%s shows the actual round-60 decision, with tactics on and off', (id) => {
    for (const scenario of [map(id), tacticalScenario(map(id))]) {
      const initial = createScenarioInitialState(scenario);
      expect(scenarioTiming(scenario, initial)).toEqual({ deadline: undefined, decision: 60 });
      const text = timingSummary(scenarioTiming(scenario));
      expect(text).toContain('60ラウンド終了時から');
      expect(text).toContain('完全同点なら続行');
      expect(text).not.toContain('なし');
      expect(
        renderBriefingOverlay({
          visible: true,
          mapName: scenario.name,
          briefing: '',
          victoryConditions: [],
          defeatConditions: [],
          startingGold: 0,
          timing: text,
          difficultyName: '',
          campaignRun: false,
        }),
      ).toContain(text);
    }
  });

  it('uses recorded historical versions and custom decision timing without changing their snapshots', () => {
    const data = { ...scenarioDefinitionToData(map('skirmish')), id: 'custom-clock', decisionRound: 75 };
    const result = loadScenarioDefinitions([data]);
    if (!result.ok) throw Error(result.error);
    const scenario = result.value[0]!;
    const initial = createScenarioInitialState(scenario);
    const before = JSON.stringify(initial);
    expect(scenarioTiming(scenario, initial).decision).toBe(75);
    expect(scenarioTiming(scenario, { ruleVersion: 3 }).decision).toBe(40);
    expect(scenarioTiming(scenario, { ruleVersion: 4 }).decision).toBe(75);
    expect(scenarioTiming(scenario, { ruleVersion: 2 }).decision).toBeUndefined();
    expect(scenarioTiming(scenario, { ruleVersion: undefined }).decision).toBeUndefined();
    expect(objectiveTimingDescription(initial, { type: 'eliminate' }, 'red')).toBe('敵部隊を全滅させる');
    expect(JSON.stringify(initial)).toBe(before);
  });

  it.each(['landing', 'tactics-logistics'])('%s describes normalized timeout as the last playable round, including separately loaded snapshots', (id) => {
    const scenario = map(id);
    const initial = createScenarioInitialState(scenario);
    const limit = scenario.turnLimit!;
    const condition = scenario.defeatConditions.find((c) => c.type === 'survive' && c.untilTurn === limit + 1)!;
    expect(condition).toBeDefined();
    expect(scenarioTiming(scenario).decision).toBeUndefined();
    expect(timingSummary(scenarioTiming(scenario))).toBe(`期限：${limit}ラウンド終了`);
    expect(scenarioConditionDescription(scenario, condition, 'blue')).toBe(`作戦期限（${limit}ラウンド終了）に到達`);
    expect(objectiveTimingDescription(initial, structuredClone(condition), 'blue')).toBe(`作戦期限（${limit}ラウンド終了）に到達`);
    expect(timingProgress(scenarioTiming(scenario), limit)).toBe('期限まで残り1ラウンド');
    expect(timingProgress(scenarioTiming(scenario), limit + 1)).toBe('期限まで残り0ラウンド');
    expect(isDeadlineCondition(scenario, condition, 'red')).toBe(false);
    expect(isDeadlineCondition(undefined, condition, 'blue')).toBe(false);
  });

  it('distinguishes real survival goals from deadlines and preserves the start-of-round boundary', () => {
    const condition: VictoryCondition = { type: 'survive', untilTurn: 21 };
    const scenario = map('tundra');
    expect(scenarioConditionDescription(scenario, condition, 'red')).toBe('21ラウンド開始まで生存する');
    expect(timingSummary(scenarioTiming(scenario))).toBe('期限・定時判定なし（作戦目標で終了）');
    expect(timingProgress({}, 1)).toBe('作戦目標で決着');
    expect(objectiveTimingDescription({ ...createScenarioInitialState(scenario), scenarioId: 'absent', scenarioSnapshot: undefined }, condition, 'red')).toBe(
      '21ラウンド開始まで生存する',
    );
  });

  it('shows subsequent decisions after a complete tie instead of a misleading zero countdown', () => {
    expect(timingProgress({ decision: 60 }, 60)).toBe('判定まで残り1ラウンド');
    expect(timingProgress({ decision: 60 }, 61)).toBe('毎ラウンド終了時に再判定（完全同点なら続行）');
  });

  it('labels campaign recommendations as grading guidance, separately from the actual deadline', () => {
    const result = createCampaignScenario(createCampaignProgress(), 'skirmish');
    if (!result.ok) throw Error(result.error);
    expect(scenarioTiming(result.value)).toEqual({ deadline: 50, decision: undefined });
    expect(campaignTimingSummary(22, scenarioTiming(result.value))).toBe('推奨：22ラウンド（評価の目安） / 期限：50ラウンド終了');
    expect(campaignTimingSummary(24)).toContain('期限・定時判定なし');
    expect(campaignTimingSummary(22, { decision: 40 })).toContain('判定：40ラウンド終了時から');
  });

  it('matches game evaluation for every catalogue and training scenario', () => {
    for (const scenario of [...maps, ...operationScenarios, trainingScenario]) {
      const initial = createScenarioInitialState(scenario);
      expect(scenarioTiming(scenario, initial).decision).toBe(decisionRound(initial));
      expect(scenarioTiming(scenario, initial).deadline).toBe(scenario.turnLimit);
    }
  });

  it('uses daily challenge timing from its dedicated definition', () => {
    const result = dailyScenario('2026-11-08');
    if (!result.ok) throw Error(result.error);
    expect(scenarioTiming(result.value).decision).toBe(60);
  });

  it('uses generated map timing from the definition', () => {
    const generated = generateSymmetricMap({ size: 20, sea: 'coast', seed: 'clock' });
    if (!generated.ok) throw Error(generated.error);
    expect(scenarioTiming(generated.value).decision).toBe(60);
  });

  it('provides English timing, survival and deadline descriptions for every mode', () => {
    setLocale('en');
    expect(timingSummary({ deadline: 40 })).toBe('Deadline: end of round 40');
    expect(timingSummary({ decision: 60 })).toBe('Decision: from the end of round 60; complete ties continue');
    expect(timingSummary({})).toBe('No deadline or scheduled decision; objectives end the match');
    expect(timingProgress({ deadline: 40 }, 40)).toBe('1 round left until deadline');
    expect(timingProgress({ decision: 60 }, 60)).toBe('1 round until decision');
    expect(timingProgress({ decision: 60 }, 61)).toContain('each round end');
    expect(timingProgress({}, 1)).toBe('Victory by objectives');
    const landing = map('landing');
    expect(scenarioConditionDescription(landing, { type: 'survive', untilTurn: 41 }, 'blue')).toBe('Deadline reached (end of round 40)');
    expect(scenarioConditionDescription(landing, { type: 'survive', untilTurn: 41 }, 'red')).toBe('Survive to the start of round 41');
    expect(campaignTimingSummary(22, { deadline: 50 })).toContain('Recommended: 22 rounds (grading guide) / Deadline: end of round 50');
  });
});
