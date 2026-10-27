import { expect, it } from 'vitest';
import {
  createCampaignProgress,
  recordCampaignVictory,
  recordCampaignVeterans,
  parseCampaignProgress,
  campaignPredecessor,
  CAMPAIGN_SCHEMA_VERSION,
  renameCampaignVeteran,
} from './campaign';
import { createCampaignScenario } from './campaignOperations';
import { createScenarioInitialState } from './maps';
import { isGameState, saveGame, parseSavedGame } from './session';
import { defaultArmyPolicies, validArmyPolicies } from './armyPolicy';
import { cpuDifficultyConfig, chooseCpuAction } from '../ai/rules';
import { policyConfig } from '../ai/armyPolicy';
import { valueOf } from './operations.fixture';

it('lets either opening branch unlock the merge and records the actual predecessor', () => {
  for (const path of ['islands', 'canyon']) {
    let progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', 'A'));
    expect(progress.unlockedScenarioIds).toEqual(['skirmish', 'islands', 'canyon']);
    progress = valueOf(recordCampaignVictory(progress, path, 'B'));
    expect(progress.unlockedScenarioIds).toContain('siege');
    expect(campaignPredecessor(progress, 'siege')).toBe(path);
    expect(createCampaignScenario(progress, 'siege').ok).toBe(true);
    expect(parseCampaignProgress(JSON.stringify(progress)).ok).toBe(true);
  }
});
it('migrates schema4 without removing existing unlocks, grades or veterans', () => {
  const old = {
    schemaVersion: 4,
    unlockedScenarioIds: ['skirmish', 'islands'],
    bestGrades: { skirmish: 'A' },
    updatedAt: '2026-10-27T00:00:00.000Z',
    veteransByScenario: { skirmish: [{ kind: 'infantry', experience: 3 }] },
  };
  const migrated = valueOf(parseCampaignProgress(JSON.stringify(old)));
  expect(migrated.schemaVersion).toBe(CAMPAIGN_SCHEMA_VERSION);
  expect(migrated.unlockedScenarioIds).toEqual(old.unlockedScenarioIds);
  expect(migrated.bestGrades).toEqual(old.bestGrades);
  expect(migrated.veteransByScenario).toEqual(old.veteransByScenario);
});
it('keeps a survivor callsign and experience through a following operation snapshot', () => {
  let progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', 'A'));
  const initial = createScenarioInitialState(valueOf(createCampaignScenario(progress, 'skirmish')));
  const final = { ...initial, winner: 'red' as const };
  final.units[0] = { ...final.units[0]!, callsign: 'ALPHA-01' };
  progress = valueOf(recordCampaignVeterans(progress, final));
  expect(progress.veteransByScenario?.skirmish?.some((unit) => unit.callsign === 'ALPHA-01')).toBe(true);
  const next = createScenarioInitialState(valueOf(createCampaignScenario(progress, 'islands')));
  expect(next.units.some((unit) => unit.callsign === 'ALPHA-01')).toBe(true);
  expect(isGameState(next)).toBe(true);
  const saved = valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'test', {
      mapId: next.scenarioId!,
      difficulty: 'normal',
      initialState: next,
      gameState: next,
      commands: [],
      cpuPolicies: { red: 'offensive', blue: 'defensive' },
    }),
  );
  expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(next);
  expect(parseSavedGame(JSON.stringify({ ...saved, cpuPolicies: { red: 'offensive', blue: 'invalid' } })).ok).toBe(false);

  expect(isGameState({ ...next, ruleVersion: 11 })).toBe(false);
  const malformed = { ...progress, predecessors: { islands: 'toString' } };
  expect(parseCampaignProgress(JSON.stringify(malformed)).ok).toBe(false);
});
it('rejects malformed names and policies and keeps difficulty handicaps independent', () => {
  expect(validArmyPolicies(defaultArmyPolicies())).toBe(true);
  for (const value of [null, [], { red: 'offensive' }, { red: 'balanced', blue: 'unknown' }, { red: 'balanced', blue: 'defensive', extra: true }])
    expect(validArmyPolicies(value)).toBe(false);
  for (const base of Object.values(cpuDifficultyConfig)) {
    for (const policy of ['balanced', 'offensive', 'defensive'] as const) {
      const adjusted = policyConfig(base, policy);
      expect(adjusted.forceLimitScale).toBe(base.forceLimitScale);
      expect(adjusted.strikePlanning).toBe(base.strikePlanning);
    }
  }
  const progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', 'A'));
  for (const callsign of ['', 'a'.repeat(33), 'bad\nname', 12]) {
    const malformed = { ...progress, veteransByScenario: { skirmish: [{ kind: 'infantry', experience: 2, callsign }] } };
    expect(parseCampaignProgress(JSON.stringify(malformed)).ok).toBe(false);
  }
});
it('keeps CPU choices unchanged for old rule versions regardless of policy', () => {
  const state = { ...createScenarioInitialState(valueOf(createCampaignScenario(createCampaignProgress(), 'skirmish'))), ruleVersion: 11 as const };
  expect(chooseCpuAction(state, 'normal', 'red', 'offensive')).toEqual(chooseCpuAction(state, 'normal', 'red', 'balanced'));
  expect(chooseCpuAction(state, 'normal', 'red', 'defensive')).toEqual(chooseCpuAction(state, 'normal', 'red', 'balanced'));
});

it('renames a survivor without mutating progress and rejects duplicates or invalid selection', () => {
  const progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', 'A'));
  progress.veteransByScenario = {
    skirmish: [
      { kind: 'infantry', experience: 2, callsign: 'ALPHA' },
      { kind: 'tank', experience: 3, callsign: 'BRAVO' },
    ],
  };
  const next = valueOf(renameCampaignVeteran(progress, 'skirmish', 0, 'CHARLIE'));
  expect(next.veteransByScenario?.skirmish?.[0]?.callsign).toBe('CHARLIE');
  expect(progress.veteransByScenario.skirmish![0]!.callsign).toBe('ALPHA');
  expect(renameCampaignVeteran(progress, 'skirmish', 0, 'BRAVO').ok).toBe(false);
  expect(renameCampaignVeteran(progress, 'missing', 0, 'CHARLIE').ok).toBe(false);
  expect(renameCampaignVeteran(progress, 'skirmish', -1, 'CHARLIE').ok).toBe(false);
  expect(renameCampaignVeteran(progress, 'skirmish', 0, '').ok).toBe(false);
});
