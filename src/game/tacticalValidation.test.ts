import { describe, expect, it } from 'vitest';
import { tacticalState as state, tacticalUnit as unit, tacticalOk as ok } from './tactics.fixture';
import { combinedTactics, validTacticalOptions, validTacticalState } from './tactics';
import { prepareAmbush, toggleDive } from './tacticalActions';
import { createBoard } from './state';
import { applyGameCommand, isGameState, replayCommands, saveGame } from './session';
import { createScenarioInitialState, loadScenarioDefinitions } from './maps';
import { createReplay, parseReplay, serializeReplay } from './replay';
import { battleSceneForCommand } from '../ui/battleScene';
import type { GameCommand, StorageLike } from './session';
import type { GameState } from './types';

const base = () => state([unit('infantry', 'red', 1, 2), unit('infantry', 'blue', 7, 2)]);
describe('tactical state and command boundaries', () => {
  const badOptions = [null, [], {}, { ...combinedTactics, weather: 'rain' }, { ...combinedTactics, extra: false }];
  for (const [index, value] of badOptions.entries()) it(`rejects malformed option set ${index}`, () => expect(validTacticalOptions(value)).toBe(false));
  const invalidTactics = [
    null,
    false,
    [],
    { options: combinedTactics, weatherSeed: -1, revealed: { red: [], blue: [] } },
    { options: combinedTactics, weatherSeed: 0x100000000, revealed: { red: [], blue: [] } },
    { options: combinedTactics, weatherSeed: 1, revealed: null },
  ];
  for (const [index, tactics] of invalidTactics.entries()) it(`rejects malformed tactical container ${index}`, () => expect(isGameState({ ...base(), tactics })).toBe(false));
  it('rejects duplicate, oversized and non-string reveal lists', () => {
    for (const ids of [['x', 'x'], ['x'.repeat(129)], Array.from({ length: 4097 }, (_, i) => String(i)), [1], 'x']) {
      const s = base();
      (s.tactics!.revealed as unknown as Record<string, unknown>).red = ids;
      expect(isGameState(s)).toBe(false);
    }
  });
  it('validates tactical version, terminal draws and event coordinates', () => {
    expect(isGameState({ ...base(), ruleVersion: 12 })).toBe(false);
    expect(isGameState({ ...base(), draw: true, winner: 'red' })).toBe(false);
    const s = base();
    s.draw = true;
    s.tactics!.options.simultaneous = false;
    expect(isGameState(s)).toBe(false);
    for (const lastCombat of [
      false,
      0,
      null,
      [],
      {},
      { attackerId: 'r1', defenderId: 'b1', ambush: false, simultaneous: false, attackerPosition: { x: -1, y: 0 }, defenderPosition: { x: 1, y: 0 }, attackWeapon: 0 },
    ]) {
      const next = base();
      (next.tactics as unknown as Record<string, unknown>).lastCombat = lastCombat;
      expect(isGameState(next)).toBe(false);
    }
  });
  it('validates reservations against weapon, ammo, deployment and spent action state', () => {
    const s = ok(prepareAmbush(base(), 'r1'));
    expect(isGameState(s)).toBe(true);
    for (const patch of [{ hasMoved: false }, { hasActed: false }, { ammo: 0 }, { ambush: 1 }, { kind: 'artillery' }, { kind: 'landingShip' }]) {
      const next = structuredClone(s);
      Object.assign(next.units[0]!, patch);
      expect(isGameState(next)).toBe(false);
    }
    const legacy = { ...base(), tactics: undefined };
    legacy.units[0]!.ambush = 0;
    expect(isGameState(legacy)).toBe(false);
    const archived = { ...legacy, units: [legacy.units[1]!], evacuatedUnits: [legacy.units[0]!] };
    expect(validTacticalState(archived)).toBe(false);
  });
  it('rejects submarine state without the feature, sea deployment or a legal dive count', () => {
    const s = state([unit('submarine', 'red', 1, 2), unit('submarine', 'blue', 7, 2)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    const dived = ok(toggleDive(s, 'r1'));
    expect(isGameState(dived)).toBe(true);
    for (const patch of [{ diveTurns: -1 }, { diveTurns: 3 }, { diveTurns: 0.5 }, { submerged: false, diveTurns: 1 }]) {
      const next = structuredClone(dived);
      Object.assign(next.units[0]!, patch);
      expect(isGameState(next)).toBe(false);
    }
    dived.tactics!.options.submarines = false;
    expect(isGameState(dived)).toBe(false);
    s.units[0]!.submerged = true;
    s.board.terrain[2]![1] = { kind: 'port', owner: 'red' };
    expect(isGameState(s)).toBe(false);
  });
  it('rejects unavailable, spent, foreign and indirect reservations or dive actions', () => {
    const s = base();
    expect(prepareAmbush(s, 'missing').ok).toBe(false);
    expect(prepareAmbush(s, 'b1').ok).toBe(false);
    expect(prepareAmbush(s, 'r1', 1).ok).toBe(false);
    s.units[0]!.hasMoved = true;
    expect(prepareAmbush(s, 'r1').ok).toBe(false);
    s.units[0]!.hasMoved = false;
    s.units[0]!.kind = 'artillery';
    expect(prepareAmbush(s, 'r1', 0).ok).toBe(false);
    expect(prepareAmbush(s, 'r1', 1).ok).toBe(true);
    s.tactics!.options.ambush = false;
    expect(prepareAmbush(s, 'r1', 1).ok).toBe(false);
    expect(toggleDive(s, 'r1').ok).toBe(false);
    s.units[0]!.kind = 'submarine';
    expect(toggleDive(s, 'r1').ok).toBe(false);
    s.board.terrain[2]![1] = { kind: 'sea' };
    s.units[0]!.hasActed = true;
    expect(toggleDive(s, 'r1').ok).toBe(false);
    expect(toggleDive({ ...s, draw: true }, 'r1').ok).toBe(false);
  });
});

describe('canonical saves and terminal replay results', () => {
  it('replays and saves a genuine draw reached from a canonical starting snapshot', () => {
    let fixture: { initial: GameState; commands: GameCommand[]; final: GameState } | undefined;
    // Select a deterministic mutual-loss fixture, not a balance-evaluation sample.
    for (let seed = 0; seed < 64 && !fixture; seed++) {
      const definition = ok(
        loadScenarioDefinitions([
          {
            id: 'tactical-draw',
            name: 'Draw fixture',
            briefing: '',
            startingGold: 0,
            battleSeed: seed,
            tacticalOptions: { ...combinedTactics },
            board: {
              width: 2,
              height: 1,
              cells: [
                [0, 0, 'road'],
                [1, 0, 'road'],
              ],
            },
            initialUnits: [
              { kind: 'infantry', owner: 'red', x: 0, y: 0 },
              { kind: 'infantry', owner: 'blue', x: 1, y: 0 },
            ],
            victoryConditions: [{ type: 'eliminate' }],
            defeatConditions: [{ type: 'eliminate' }],
          },
        ]),
      )[0]!;
      const initial = createScenarioInitialState(definition),
        commands: GameCommand[] = [];
      let current = initial;
      for (let i = 0; i < 60 && !current.winner && !current.draw; i++) {
        const own = current.units.find((u) => u.owner === current.activePlayer)!,
          enemy = current.units.find((u) => u.owner !== current.activePlayer)!;
        const command: GameCommand = own.hasActed ? { type: 'endTurn' } : { type: 'attack', unitId: own.id, targetId: enemy.id };
        const next = applyGameCommand(current, command);
        if (!next.ok) throw Error(next.error);
        commands.push(command);
        current = next.value;
      }
      if (current.draw) fixture = { initial, commands, final: current };
    }
    expect(fixture).toBeDefined();
    if (!fixture) throw Error('No deterministic draw fixture');
    expect(isGameState(fixture.final)).toBe(true);
    const replay = ok(createReplay({ mapId: 'tactical-draw', difficulty: 'normal', initialState: fixture.initial, commands: fixture.commands }));
    expect(replay.summary.winner).toBe('draw');
    expect(ok(parseReplay(ok(serializeReplay(replay)))).finalState).toEqual(fixture.final);
    expect(ok(replayCommands(fixture.initial, fixture.commands))).toEqual(fixture.final);
    const stored = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => stored.get(k) ?? null,
      setItem: (k, v) => {
        stored.set(k, v);
      },
      removeItem: (k) => {
        stored.delete(k);
      },
    };
    expect(
      saveGame(storage, 'fixture', { mapId: 'tactical-draw', difficulty: 'normal', initialState: fixture.initial, commands: fixture.commands, gameState: fixture.final }).ok,
    ).toBe(true);
    const last = fixture.commands.at(-1)!;
    expect(battleSceneForCommand(ok(replayCommands(fixture.initial, fixture.commands.slice(0, -1))), last, fixture.final)?.simultaneous).toBe(true);
    expect(createReplay({ mapId: 'tactical-draw', difficulty: 'normal', initialState: fixture.initial, commands: [...fixture.commands, { type: 'endTurn' }] }).ok).toBe(false);
  });
});
