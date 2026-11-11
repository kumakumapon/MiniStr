import { describe, expect, it, vi } from 'vitest';
import { exportBackup, restoreBackup } from './backup';
import { previewSaveRecovery } from './saveRecovery';
import { valueOf } from './operations.fixture';
import { parseReplay, serializeReplay } from './replay';
import { researchReplayFixture } from './research.fixture';
import {
  createResearchSave,
  forkResearch,
  isResearchBranchPoint,
  isResearchKey,
  loadResearch,
  MAX_RESEARCH_BYTES,
  parseResearch,
  RESEARCH_AUTO_KEY,
  RESEARCH_MANUAL_KEY,
  researchSavedMatch,
  retryResearch,
  saveResearch,
  type ResearchFile,
} from './research';
import { applyGameCommand, AUTO_SAVE_KEY, MANUAL_SAVE_KEY, parseSavedGame, replayCommands, saveGame, type StorageLike } from './session';

function memory(initial: [string, string][] = []) {
  const values = new Map(initial);
  const storage: StorageLike = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, raw) => {
      values.set(key, raw);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}
const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('isolated research matches', () => {
  it('branches from an exact red turn boundary, retains the canonical initial state and drops the future', async () => {
    const file = researchReplayFixture();
    const before = JSON.stringify(file);
    const studied = valueOf(await forkResearch(file, 3, 'defensive'));
    expect(studied.origin).toMatchObject({ branchIndex: 3, replaySha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(studied.match.initialState).toEqual(copyJson(file.initialState));
    expect(studied.match.commands).toEqual(file.commands.slice(0, 3));
    expect(studied.match.gameState).toEqual(copyJson(valueOf(replayCommands(file.initialState, file.commands.slice(0, 3)))));
    expect(studied.match.gameState.units[0]?.position).toEqual({ x: 1, y: 1 });
    expect(studied.match.cpuPolicies).toEqual({ red: 'balanced', blue: 'defensive' });
    expect(studied.match.difficulty).toBe('normal');
    expect(studied.match).not.toHaveProperty('finalState');
    expect(studied.match).not.toHaveProperty('redDifficulty');
    expect(JSON.stringify(file)).toBe(before);
    studied.match.commands.push({ type: 'wait', unitId: 'r1' });
    expect(file.commands).toHaveLength(5);
  });

  it('allows turn one but rejects blue turns, mid-turn, terminal and invalid positions', async () => {
    const file = researchReplayFixture();
    expect((await forkResearch(file, 0)).ok).toBe(true);
    for (const index of [-1, 1, 2, 4, 5, 6, 0.5, Number.NaN]) expect((await forkResearch(file, index)).ok).toBe(false);
    expect(isResearchBranchPoint(file.commands, 0, file.finalState)).toBe(false);
    expect((await forkResearch(file, 3, 'unknown' as never)).ok).toBe(false);
  });

  it('uses balanced policy for legacy rules and preserves the original rule version', async () => {
    const file = researchReplayFixture(7);
    const studied = valueOf(await forkResearch(file, 3));
    expect(studied.match.gameState.ruleVersion).toBe(7);
    expect(studied.match.cpuPolicies).toBeUndefined();
    expect((await forkResearch(file, 3, 'offensive')).ok).toBe(false);
  });

  it('rejects invalid source replay state and a failed digest without producing a match', async () => {
    const file = researchReplayFixture();
    file.summary.turns++;
    expect((await forkResearch(file, 0)).ok).toBe(false);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('unavailable'));
    try {
      expect((await forkResearch(researchReplayFixture(), 0)).ok).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('round-trips as a separate strict envelope rejected by ordinary save, replay and recovery readers', async () => {
    const studied = valueOf(await forkResearch(researchReplayFixture(), 3));
    const text = JSON.stringify(studied);
    expect(valueOf(parseResearch(text))).toEqual(copyJson(studied));
    expect(parseSavedGame(text).ok).toBe(false);
    expect(parseSavedGame(JSON.stringify(studied.match)).ok).toBe(false);
    expect(parseReplay(text).ok).toBe(false);
    expect(previewSaveRecovery(text).ok).toBe(false);
    const restored = researchSavedMatch(studied);
    expect(restored.mode).toBe('cpu');
    expect(restored.campaignScenarioId).toBeUndefined();
    expect(valueOf(parseSavedGame(JSON.stringify(restored))).gameState).toEqual(copyJson(studied.match.gameState));
  });

  it('rejects unknown formats, versions, keys, provenance, injected modes and inconsistent command streams', async () => {
    const original = valueOf(await forkResearch(researchReplayFixture(), 3));
    const mutations: ((v: ResearchFile) => void)[] = [
      (v) => {
        Reflect.set(v, 'format', 'other');
      },
      (v) => {
        Reflect.set(v, 'schemaVersion', 2);
      },
      (v) => {
        Reflect.set(v, 'futureCommands', []);
      },
      (v) => {
        v.origin.branchIndex = -1;
      },
      (v) => {
        v.origin.branchIndex = 99;
      },
      (v) => {
        v.origin.branchIndex = 1;
      },
      (v) => {
        v.origin.replaySha256 = 'not-a-digest';
      },
      (v) => {
        Reflect.set(v.origin, 'extra', true);
      },
      (v) => {
        Reflect.set(v.match, 'mode', 'hotseat');
      },
      (v) => {
        Reflect.set(v.match, 'campaignScenarioId', v.match.mapId);
      },
      (v) => {
        Reflect.set(v.match, 'schemaVersion', 4);
      },
      (v) => {
        v.match.gameState.turn++;
      },
      (v) => {
        Reflect.set(v.match.commands, '0', { type: 'invalid' });
      },
      (v) => {
        Reflect.deleteProperty(v.match, 'savedAt');
      },
      (v) => {
        Reflect.set(v.match, 'cpuPolicies', { red: 'invalid', blue: 'balanced' });
      },
    ];
    for (const mutate of mutations) {
      const v = copyJson(original);
      mutate(v);
      expect(parseResearch(JSON.stringify(v)).ok).toBe(false);
    }
    for (const raw of ['null', '[]', '{', ' '.repeat(MAX_RESEARCH_BYTES + 1), JSON.stringify({ a: Array.from({ length: 70 }).reduce((v) => ({ v }), {}) })])
      expect(parseResearch(raw).ok).toBe(false);
  });

  it('persists only to its two slots and leaves all ordinary data byte-identical', async () => {
    const source = researchReplayFixture();
    const studied = valueOf(await forkResearch(source, 3));
    const old = [
      [AUTO_SAVE_KEY, 'auto'],
      [MANUAL_SAVE_KEY, 'manual'],
      ['ministr.save.slot.fixture', 'slot'],
      ['ministr.campaign', 'campaign'],
      ['ministr.daily.records', 'daily'],
      ['ministr.operations.records', 'records'],
    ] as [string, string][];
    const { values, storage } = memory(old);
    for (const key of [RESEARCH_AUTO_KEY, RESEARCH_MANUAL_KEY]) {
      expect(isResearchKey(key)).toBe(true);
      expect(saveResearch(storage, key, studied.origin, researchSavedMatch(studied)).ok).toBe(true);
      expect(valueOf(loadResearch(storage, key)).origin).toEqual(studied.origin);
      expect(saveResearch(storage, key, studied.origin, researchSavedMatch(studied)).ok).toBe(true);
    }
    for (const [key, raw] of old) expect(values.get(key)).toBe(raw);
    expect(saveResearch(storage, MANUAL_SAVE_KEY, studied.origin, researchSavedMatch(studied)).ok).toBe(false);
    expect(loadResearch(storage, MANUAL_SAVE_KEY).ok).toBe(false);
    expect(loadResearch(memory().storage, RESEARCH_AUTO_KEY).ok).toBe(false);
  });

  it('preserves corrupt or unsupported slot contents and handles unavailable or full storage', async () => {
    const studied = valueOf(await forkResearch(researchReplayFixture(), 0));
    const input = researchSavedMatch(studied);
    for (const raw of ['broken', JSON.stringify({ ...studied, schemaVersion: 2 })]) {
      const { storage, values } = memory([[RESEARCH_AUTO_KEY, raw]]);
      expect(loadResearch(storage, RESEARCH_AUTO_KEY).ok).toBe(false);
      expect(saveResearch(storage, RESEARCH_AUTO_KEY, studied.origin, input).ok).toBe(false);
      expect(values.get(RESEARCH_AUTO_KEY)).toBe(raw);
    }
    const { storage, values } = memory();
    expect(saveResearch(storage, RESEARCH_AUTO_KEY, studied.origin, input).ok).toBe(true);
    values.set(RESEARCH_AUTO_KEY, 'changed in another tab');
    expect(saveResearch(storage, RESEARCH_AUTO_KEY, studied.origin, input).ok).toBe(false);
    const throwing = {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadResearch(throwing, RESEARCH_AUTO_KEY).ok).toBe(false);
    expect(saveResearch(throwing, RESEARCH_AUTO_KEY, studied.origin, input).ok).toBe(false);
    const quota = {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      },
      removeItem: () => {},
    };
    expect(saveResearch(quota, RESEARCH_AUTO_KEY, studied.origin, input).ok).toBe(false);
  });

  it('retains research identity on continuation, terminal import and retry', async () => {
    const file = researchReplayFixture();
    const studied = valueOf(await forkResearch(file, 3));
    const input = researchSavedMatch(studied);
    for (const command of file.commands.slice(3)) {
      input.gameState = valueOf(applyGameCommand(input.gameState, command));
      input.commands.push(command);
    }
    const terminal = valueOf(createResearchSave(studied.origin, input));
    expect(valueOf(parseResearch(JSON.stringify(terminal))).match.gameState.winner).toBe('red');
    const retry = valueOf(retryResearch(terminal.origin, researchSavedMatch(terminal)));
    expect(retry.origin).toEqual(studied.origin);
    expect(retry.match.gameState).toEqual(studied.match.gameState);
    expect(retry.match.commands).toHaveLength(3);
    expect(retry.match.initialState).toEqual(studied.match.initialState);
    expect(retryResearch({ ...studied.origin, branchIndex: 99 }, input).ok).toBe(false);
    expect(retryResearch({ ...studied.origin, branchIndex: 1 }, input).ok).toBe(false);
    expect(createResearchSave({ ...studied.origin, replaySha256: 'bad' }, input).ok).toBe(false);
    expect(createResearchSave(studied.origin, { ...input, mapId: 'wrong' }).ok).toBe(false);
  });

  it('restores research through whole-data backup without recovering it as a normal slot', async () => {
    const studied = valueOf(await forkResearch(researchReplayFixture(), 3));
    const input = researchSavedMatch(studied);
    const { storage } = memory();
    valueOf(saveGame(storage, MANUAL_SAVE_KEY, input));
    valueOf(saveResearch(storage, RESEARCH_AUTO_KEY, studied.origin, input));
    valueOf(saveResearch(storage, RESEARCH_MANUAL_KEY, studied.origin, input));
    const backup = valueOf(exportBackup(storage));
    const target = memory();
    expect(restoreBackup(target.storage, backup).ok).toBe(true);
    expect(valueOf(loadResearch(target.storage, RESEARCH_AUTO_KEY)).origin).toEqual(studied.origin);
    expect(valueOf(previewSaveRecovery(backup))).toEqual({ recovered: 1, rejected: 0 });
    const bad = memory([[RESEARCH_AUTO_KEY, 'broken']]);
    const before = [...target.values];
    expect(restoreBackup(target.storage, valueOf(exportBackup(bad.storage))).ok).toBe(false);
    expect([...target.values]).toEqual(before);
    expect(serializeReplay(researchReplayFixture()).ok).toBe(true);
  });

  it('enforces interactive and byte limits before replacing persisted research', async () => {
    const studied = valueOf(await forkResearch(researchReplayFixture(), 3));
    const wide = researchReplayFixture(14, 33);
    expect((await forkResearch(wide, 3)).ok).toBe(false);
    const untrusted = {
      ...studied,
      match: { ...studied.match, initialState: wide.initialState, gameState: valueOf(replayCommands(wide.initialState, wide.commands.slice(0, 3))) },
    };
    expect(parseResearch(JSON.stringify(untrusted)).ok).toBe(false);
    const input = researchSavedMatch(studied);
    const huge = { ...input, commands: Array.from({ length: 40_000 }, () => ({ type: 'move' as const, unitId: 'r1', destination: { x: 1, y: 1 } })) };
    expect(createResearchSave(studied.origin, huge).ok).toBe(false);
    expect(createResearchSave({ ...studied.origin, branchIndex: 99 }, input).ok).toBe(false);
  });
});
