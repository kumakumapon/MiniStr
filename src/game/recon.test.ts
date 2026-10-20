import { describe, expect, it } from 'vitest';
import { scanArea, remainingRecon, reconPositions, validRecon } from './recon';
import { createScenarioInitialState } from './maps';
import { operation, valueOf } from './operations.fixture';
import { applyGameCommand, endTurn, isGameCommand, isGameState, parseSavedGame, saveGame, visibleEnemies, observedEnemy } from './index';
import { BattleHistory } from './battleHistory';
import { createReplay } from './replay';
import { ReplayTimeline } from './replayTimeline';

const initial = () => createScenarioInitialState(operation({ victoryConditions: [{ type: 'survive', untilTurn: 100 }] }));
describe('bounded army reconnaissance', () => {
  it('rejects old rules, finished matches, invalid centers and duplicate use without mutations', () => {
    const state = initial(),
      original = structuredClone(state);
    expect(remainingRecon({ ...state, ruleVersion: 6 }, 'red')).toBe(0);
    expect(reconPositions({ ...state, ruleVersion: 6 }, 'red')).toEqual([]);
    for (const center of [
      { x: -1, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 4 },
      { x: 1.5, y: 0 },
      { x: NaN, y: 0 },
    ])
      expect(scanArea(state, center).ok).toBe(false);
    expect(scanArea({ ...state, winner: 'red' }, { x: 0, y: 0 }).ok).toBe(false);
    expect(scanArea({ ...state, ruleVersion: 6 }, { x: 0, y: 0 }).ok).toBe(false);
    const first = valueOf(scanArea(state, { x: 6, y: 2 }));
    expect(scanArea(first, { x: 6, y: 2 }).ok).toBe(false);
    const second = valueOf(scanArea(first, { x: 5, y: 2 }));
    expect(remainingRecon(second, 'red')).toBe(0);
    expect(scanArea(second, { x: 4, y: 2 }).ok).toBe(false);
    expect(second.rngSeed).toBe(state.rngSeed);
    expect(state).toEqual(original);
  });

  it('shares current sight with attacks and observers, expires on turn end, and retains the last observation', () => {
    const state = initial();
    expect(visibleEnemies(state, 'red')).toHaveLength(0);
    const command = { type: 'recon' as const, center: { x: 6, y: 2 } };
    const scanned = valueOf(applyGameCommand(state, command));
    expect(visibleEnemies(scanned, 'red').map((unit) => unit.id)).toContain('b1');
    const enemy = visibleEnemies(scanned, 'red')[0]!;
    expect(observedEnemy({ ...enemy, ammo: 0, fuel: 0 }).ammo).not.toBe(0);
    expect(reconPositions(scanned, 'blue')).toEqual([]);
    expect(reconPositions(valueOf(scanArea(state, { x: 0, y: 0 })), 'red')).toHaveLength(10);
    const blue = endTurn(scanned);
    expect(blue.recon?.centers).toEqual([]);
    expect(visibleEnemies(blue, 'red')).toHaveLength(0);
    expect(remainingRecon(blue, 'red')).toBe(1);
    expect(remainingRecon(blue, 'blue')).toBe(2);
    const blueScan = valueOf(scanArea(blue, { x: 0, y: 1 }));
    expect(visibleEnemies(blueScan, 'blue').length).toBeGreaterThan(0);
    expect(remainingRecon(endTurn(blueScan), 'blue')).toBe(1);
    const history = new BattleHistory(state, [command, { type: 'endTurn' }]);
    expect(valueOf(history.recon(1, 'red'))).toHaveLength(0);
    expect(valueOf(history.recon(2, 'red')).some((contact) => contact.id === 'b1')).toBe(true);
    expect(valueOf(history.recon(0, 'red'))).toEqual([]);
  });

  it('round-trips saves and both replay directions while rejecting forged charges and keys', () => {
    const state = initial(),
      commands = [{ type: 'recon' as const, center: { x: 6, y: 2 } }];
    const scanned = valueOf(applyGameCommand(state, commands[0]!));
    const data = { mapId: state.scenarioId!, difficulty: 'normal' as const, initialState: state, gameState: scanned, commands };
    const saved = valueOf(saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'scan', data));
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(scanned);
    const replayInitial = createScenarioInitialState(operation({ victoryConditions: [{ type: 'survive', untilTurn: 2 }], defeatConditions: [{ type: 'survive', untilTurn: 3 }] }));
    const replay = valueOf(
      createReplay({ mapId: replayInitial.scenarioId!, difficulty: 'normal', initialState: replayInitial, commands: [...commands, { type: 'endTurn' }, { type: 'endTurn' }] }),
    );
    const timeline = new ReplayTimeline(replay);
    expect(valueOf(timeline.seek(1)).recon).toEqual(scanned.recon);
    expect(valueOf(timeline.seek(0)).recon).toBeUndefined();
    expect(timeline.event(0, 'blue')).toBe('未観測');
    expect(timeline.event(0, 'red')).toBe('recon');
    expect(isGameCommand({ ...commands[0], unknown: true })).toBe(false);
    for (const recon of [
      null,
      [],
      {},
      { remaining: {}, centers: [] },
      { remaining: { red: -1, blue: 2 }, centers: [] },
      { remaining: { red: 2, blue: 2 }, centers: [{ x: 1, y: 1 }] },
      { remaining: { red: 1, blue: 2 }, centers: [{ x: 8, y: 0 }] },
      {
        remaining: { red: 0, blue: 2 },
        centers: [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
      },
      { remaining: { red: 1, blue: 2, other: 1 }, centers: [] },
      { remaining: { red: 1, blue: 2 }, centers: [{ x: 1, y: 1, extra: 1 }] },
    ]) {
      expect(isGameState({ ...state, recon })).toBe(false);
    }
    expect(validRecon({ ...scanned, ruleVersion: 6 })).toBe(false);
    expect(validRecon(state)).toBe(true);
    expect(isGameState(scanned)).toBe(true);
    expect(parseSavedGame(JSON.stringify({ ...saved, gameState: { ...scanned, recon: { remaining: { red: 2, blue: 2 }, centers: [] } } })).ok).toBe(false);
  });
});
