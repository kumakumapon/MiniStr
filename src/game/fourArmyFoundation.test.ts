import { describe, expect, it } from 'vitest';
import {
  createFourArmyRound,
  finishFourArmyTurn,
  FOUR_ARMY_ARCHIVES,
  FOUR_ARMY_IDS,
  FOUR_ARMY_SCOPE,
  isFourArmyBattlefield,
  isFourArmyRound,
  resolveFourArmyEliminations,
  startFourArmyTurn,
  type FourArmyBattlefield,
  type FourArmyId,
} from './fourArmyFoundation';
import { valueOf } from './operations.fixture';
import { researchReplayFixture } from './research.fixture';
import { parseReplay, serializeReplay } from './replay';
import { forkResearch, parseResearch } from './research';
import { previewSaveRecovery } from './saveRecovery';
import { parseSavedGame, saveGame } from './session';
import { restoreBackup } from './backup';

const permutations = (ids: readonly FourArmyId[]): FourArmyId[][] =>
  ids.length === 0 ? [[]] : ids.flatMap((id) => permutations(ids.filter((other) => other !== id)).map((rest) => [id, ...rest]));
const fixture = (): FourArmyBattlefield => ({
  alive: [...FOUR_ARMY_IDS],
  units: FOUR_ARMY_IDS.map((army, i) => ({ id: `u${i}`, army })),
  facilities: [...FOUR_ARMY_IDS.map((owner, i) => ({ id: `home${i}`, owner, capitalOf: owner })), { id: 'factory', owner: 'army2' }],
});

describe('four-army first-stage specification', () => {
  it('reserves a CPU-only equal-army scope and isolated persistence identifiers', () => {
    expect(FOUR_ARMY_SCOPE).toMatchObject({ mode: 'spectate', diplomacy: 'free-for-all', mapCount: 1, boardSize: 32, decisionRound: null });
    expect(FOUR_ARMY_SCOPE.trialUnitsPerArmy * 4).toBe(FOUR_ARMY_SCOPE.trialTotalUnits);
    expect(FOUR_ARMY_ARCHIVES.schemaVersion).toBe(1);
    expect(FOUR_ARMY_ARCHIVES.saveFormat).not.toBe(FOUR_ARMY_ARCHIVES.replayFormat);
    expect(Object.isFrozen(FOUR_ARMY_SCOPE)).toBe(true);
  });

  it('gives every army one turn and one opening fuel exemption in every order', () => {
    for (const order of permutations(FOUR_ARMY_IDS)) {
      let round = valueOf(createFourArmyRound(order));
      const before = JSON.stringify(order);
      const acted: FourArmyId[] = [];
      const boundaries: number[] = [];
      for (let turn = 0; turn < 8; turn++) {
        const started = valueOf(startFourArmyTurn(round, FOUR_ARMY_IDS));
        expect(started.applyStart).toBe(true);
        expect(started.firstTurn).toBe(turn < 4);
        expect(started.consumeStandingFuel).toBe(turn >= 4);
        acted.push(started.army);
        const resumed = valueOf(startFourArmyTurn(JSON.parse(JSON.stringify(started.round)), FOUR_ARMY_IDS));
        expect(resumed.applyStart).toBe(false);
        expect(resumed.consumeStandingFuel).toBe(false);
        expect(resumed.round).toEqual(started.round);
        const finished = valueOf(finishFourArmyTurn(started.round, FOUR_ARMY_IDS));
        if (finished.completedRound !== undefined) boundaries.push(finished.completedRound);
        round = finished.round;
      }
      expect(acted).toEqual([...order, ...order]);
      expect(boundaries).toEqual([1, 2]);
      expect(round.round).toBe(3);
      expect(JSON.stringify(order)).toBe(before);
    }
  });

  it.each([0, 1, 2, 3])('skips an eliminated army at index %i without repeating or losing a round', (eliminatedIndex) => {
    let round = valueOf(createFourArmyRound());
    const initial = valueOf(startFourArmyTurn(round, FOUR_ARMY_IDS));
    const alive = FOUR_ARMY_IDS.filter((_, i) => i !== eliminatedIndex);
    const acted: FourArmyId[] = [];
    let boundaries = 0;
    // A death during the active first turn is finished once, before the next start.
    let next = valueOf(finishFourArmyTurn(initial.round, alive));
    round = next.round;
    if (next.completedRound) boundaries++;
    while (round.round < 3) {
      const turn = valueOf(startFourArmyTurn(round, alive));
      if (round.round === 2) acted.push(turn.army);
      next = valueOf(finishFourArmyTurn(turn.round, alive));
      if (next.completedRound) boundaries++;
      round = next.round;
    }
    expect(acted).toEqual(alive);
    expect(boundaries).toBe(2);
  });

  it('handles two survivors, including an eliminated first and last army', () => {
    const alive: FourArmyId[] = ['army2', 'army3'];
    const started = valueOf(startFourArmyTurn(valueOf(createFourArmyRound()), FOUR_ARMY_IDS));
    const second = valueOf(finishFourArmyTurn(started.round, alive));
    expect(second.round.index).toBe(1);
    expect(second.completedRound).toBeUndefined();
    const third = valueOf(finishFourArmyTurn(valueOf(startFourArmyTurn(second.round, alive)).round, alive));
    const wrap = valueOf(finishFourArmyTurn(valueOf(startFourArmyTurn(third.round, alive)).round, alive));
    expect(wrap.completedRound).toBe(1);
    expect(wrap.round).toMatchObject({ round: 2, index: 1, phase: 'pending' });
    expect(startFourArmyTurn(wrap.round, alive).ok).toBe(true);
    expect(finishFourArmyTurn(wrap.round, alive).ok).toBe(false);
  });

  it('rejects malformed cursors, duplicate/unknown armies, terminal schedules and overflow', () => {
    const round = valueOf(createFourArmyRound());
    for (const order of [[], ['army1', 'army1', 'army3', 'army4'], ['red', 'blue', 'army3', 'army4']]) expect(createFourArmyRound(order as FourArmyId[]).ok).toBe(false);
    for (const bad of [
      null,
      [],
      { ...round, extra: true },
      { ...round, round: 0 },
      { ...round, round: 1.5 },
      { ...round, index: -1 },
      { ...round, index: 4 },
      { ...round, phase: 'unknown' },
      { ...round, phase: 'active' },
      { ...round, startedArmies: ['army1', 'army1'] },
    ]) {
      expect(isFourArmyRound(bad)).toBe(false);
      expect(startFourArmyTurn(bad as never, FOUR_ARMY_IDS).ok).toBe(false);
      expect(finishFourArmyTurn(bad as never, FOUR_ARMY_IDS).ok).toBe(false);
    }
    expect(finishFourArmyTurn(round, FOUR_ARMY_IDS).ok).toBe(false);
    expect(startFourArmyTurn(round, ['army2', 'army3']).ok).toBe(false);
    for (const alive of [[], ['army1'], ['army1', 'army1'], ['army1', 'unknown']]) {
      expect(startFourArmyTurn(round, alive as FourArmyId[]).ok).toBe(false);
      expect(finishFourArmyTurn({ ...round, phase: 'active', startedArmies: ['army1'] }, alive as FourArmyId[]).ok).toBe(false);
    }
    const final = { ...round, round: Number.MAX_SAFE_INTEGER, index: 3, phase: 'active' as const, startedArmies: ['army4' as const] };
    expect(finishFourArmyTurn(final, FOUR_ARMY_IDS).ok).toBe(false);
  });
});

describe('simultaneous four-army elimination', () => {
  it('keeps a captured capital, neutralises other defeated properties, and removes troops and cargo', () => {
    const input = fixture();
    input.units.push({ id: 'cargo', army: 'army2', carrierId: 'u1' });
    input.facilities[1]!.owner = 'army1';
    const before = JSON.stringify(input);
    const result = valueOf(resolveFourArmyEliminations(input));
    expect(result.battlefield.alive).toEqual(['army1', 'army3', 'army4']);
    expect(result.battlefield.units.some((u) => u.army === 'army2')).toBe(false);
    expect(result.battlefield.facilities.find((f) => f.id === 'home1')?.owner).toBe('army1');
    expect(result.battlefield.facilities.find((f) => f.id === 'factory')).not.toHaveProperty('owner');
    expect(result.outcome).toEqual({ type: 'ongoing' });
    expect(valueOf(resolveFourArmyEliminations(result.battlefield))).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
    result.battlefield.units[0]!.id = 'changed';
    expect(JSON.stringify(input)).toBe(before);
  });

  it('eliminates a zero-unit army even with a production facility, with no resurrection', () => {
    const input = fixture();
    input.units = input.units.filter((u) => u.army !== 'army2');
    const result = valueOf(resolveFourArmyEliminations(input));
    expect(result.battlefield.alive).not.toContain('army2');
    expect(result.battlefield.facilities.find((f) => f.id === 'factory')).not.toHaveProperty('owner');
    result.battlefield.units.push({ id: 'resurrected', army: 'army2' });
    expect(resolveFourArmyEliminations(result.battlefield).ok).toBe(false);
  });

  it('resolves two simultaneous losses while the other armies continue', () => {
    const input = fixture();
    input.units = input.units.filter((u) => u.army === 'army3' || u.army === 'army4');
    expect(valueOf(resolveFourArmyEliminations(input))).toMatchObject({ battlefield: { alive: ['army3', 'army4'] }, outcome: { type: 'ongoing' } });
  });

  it('awards the sole survivor and draws only when no army survives', () => {
    const input = fixture();
    input.units = input.units.filter((u) => u.army === 'army3');
    expect(valueOf(resolveFourArmyEliminations(input)).outcome).toEqual({ type: 'victory', winner: 'army3' });
    input.units = [];
    const drawn = valueOf(resolveFourArmyEliminations(input));
    expect(drawn.outcome).toEqual({ type: 'draw' });
    expect(valueOf(resolveFourArmyEliminations(drawn.battlefield))).toEqual(drawn);
  });

  it('does not transfer a captured capital to an army eliminated in the same resolution', () => {
    const input = fixture();
    input.facilities[1]!.owner = 'army1';
    input.units = input.units.filter((u) => u.army !== 'army1');
    const result = valueOf(resolveFourArmyEliminations(input));
    expect(result.battlefield.facilities.find((f) => f.id === 'home1')).not.toHaveProperty('owner');
    expect(result.battlefield.alive).toEqual(['army3', 'army4']);
  });

  it('counts transported troops as live units and preserves valid friendly cargo references', () => {
    const input = fixture();
    input.units.push({ id: 'cargo', army: 'army2', carrierId: 'u1' });
    expect(valueOf(resolveFourArmyEliminations(input)).battlefield.units).toEqual(input.units);
  });

  it('rejects invalid army lists, orphan/mixed/nested cargo, duplicate IDs and missing capitals', () => {
    const mutations: ((s: FourArmyBattlefield) => void)[] = [
      (s) => {
        Reflect.set(s, 'extra', true);
      },
      (s) => {
        Reflect.set(s, 'alive', ['army1', 'army1']);
      },
      (s) => {
        Reflect.set(s, 'alive', ['red', 'blue']);
      },
      (s) => {
        Reflect.set(s, 'units', null);
      },
      (s) => {
        Reflect.set(s, 'facilities', null);
      },
      (s) => {
        Reflect.set(s.units, '0', null);
      },
      (s) => {
        Reflect.set(s.units[0]!, 'extra', true);
      },
      (s) => {
        s.units[0]!.id = '';
      },
      (s) => {
        s.units[0]!.id = s.units[1]!.id;
      },
      (s) => {
        s.units[0]!.carrierId = 'missing';
      },
      (s) => {
        s.units[0]!.carrierId = 'u0';
      },
      (s) => {
        s.units[0]!.carrierId = 'u1';
      },
      (s) => {
        s.units.push({ id: 'u5', army: 'army1', carrierId: 'u0' }, { id: 'u6', army: 'army1', carrierId: 'u5' });
      },
      (s) => {
        Reflect.set(s.units[0]!, 'carrierId', null);
      },
      (s) => {
        Reflect.set(s.units[0]!, 'army', 'unknown');
      },
      (s) => {
        s.facilities.pop();
        s.facilities.pop();
      },
      (s) => {
        s.facilities[1]!.capitalOf = 'army1';
      },
      (s) => {
        s.facilities[1]!.id = 'home0';
      },
      (s) => {
        Reflect.set(s.facilities, '0', null);
      },
      (s) => {
        Reflect.set(s.facilities[0]!, 'extra', true);
      },
      (s) => {
        Reflect.set(s.facilities[0]!, 'owner', 'unknown');
      },
      (s) => {
        Reflect.set(s.facilities[0]!, 'capitalOf', 'unknown');
      },
      (s) => {
        s.units = Array.from({ length: 129 }, (_, i) => ({ id: `u${i}`, army: 'army1' }));
      },
      (s) => {
        s.facilities = Array.from({ length: 1025 }, (_, i) => ({ id: `f${i}` }));
      },
    ];
    expect(isFourArmyBattlefield(null)).toBe(false);
    for (const mutate of mutations) {
      const input = fixture();
      mutate(input);
      expect(resolveFourArmyEliminations(input).ok).toBe(false);
    }
  });
});

it('keeps future four-army envelopes outside legacy save/replay/research/recovery readers', async () => {
  const file = researchReplayFixture();
  const saved = valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'memory', {
      mapId: file.mapId,
      difficulty: file.difficulty,
      initialState: file.initialState,
      commands: [],
      gameState: file.initialState,
    }),
  );
  expect(parseSavedGame(JSON.stringify(saved)).ok).toBe(true);
  expect(parseReplay(valueOf(serializeReplay(file))).ok).toBe(true);
  const research = valueOf(await forkResearch(file, 0));
  expect(parseResearch(JSON.stringify(research)).ok).toBe(true);
  for (const format of [FOUR_ARMY_ARCHIVES.saveFormat, FOUR_ARMY_ARCHIVES.replayFormat]) {
    const text = JSON.stringify({
      format,
      schemaVersion: 1,
      ruleset: FOUR_ARMY_ARCHIVES.ruleset,
      payload: { ...saved, round: valueOf(createFourArmyRound()), battlefield: fixture() },
    });
    expect(parseSavedGame(text).ok).toBe(false);
    expect(parseReplay(text).ok).toBe(false);
    expect(parseResearch(text).ok).toBe(false);
    expect(previewSaveRecovery(text).ok).toBe(false);
  }
  const values = new Map([
    ['ministr.save.manual', JSON.stringify(saved)],
    ['ministr.locale', 'en'],
  ]);
  const original = [...values];
  const storage = {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const unsupported = JSON.stringify({
    schemaVersion: 1,
    entries: [
      ['ministr.locale', 'ja'],
      ['ministr.fourArmy.manual', '{}'],
    ],
  });
  expect(restoreBackup(storage, unsupported)).toMatchObject({ ok: false, error: expect.stringContaining('未対応の保存項目') });
  expect([...values]).toEqual(original);
});
