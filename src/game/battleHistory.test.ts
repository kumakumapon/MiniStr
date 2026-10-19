import { describe, expect, it } from 'vitest';
import { BattleHistory, MAX_ANALYSIS_TURNS } from './battleHistory';
import { createScenarioInitialState } from './maps';
import { force, operation, valueOf } from './operations.fixture';
import { applyGameCommand, parseSavedGame, saveGame, type GameCommand } from './session';

const reconScenario = () =>
  operation({
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 0, y: 1 },
      { kind: 'tank', owner: 'blue', x: 2, y: 1 },
    ],
    victoryConditions: [{ type: 'survive', untilTurn: 1000 }],
    defeatConditions: [{ type: 'survive', untilTurn: 1001 }],
  });
const reconCommands: GameCommand[] = [
  { type: 'move', unitId: 'r1', destination: { x: 0, y: 3 } },
  { type: 'endTurn' },
  { type: 'move', unitId: 'b1', destination: { x: 5, y: 1 } },
  { type: 'endTurn' },
  { type: 'move', unitId: 'r1', destination: { x: 0, y: 1 } },
];

describe('viewer recon and full-information analysis', () => {
  it('retains only the observed position, forgets an empty revisited cell, and rewinds without future knowledge', () => {
    const initial = createScenarioInitialState(reconScenario());
    const history = new BattleHistory(initial, reconCommands);
    expect(valueOf(history.recon(0, 'red'))).toEqual([]);
    expect(valueOf(history.recon(1, 'red'))).toEqual([{ id: 'b1', kind: 'tank', position: { x: 2, y: 1 }, turn: 1, phase: 'red' }]);
    expect(valueOf(history.recon(3, 'red'))).toEqual(valueOf(history.recon(1, 'red')));
    expect(valueOf(history.recon(5, 'red'))).toEqual([]);
    expect(valueOf(history.recon(1, 'red'))[0]?.position).toEqual({ x: 2, y: 1 });
    expect(valueOf(history.recon(0, 'red'))).toEqual([]);
    const invisible = { ...initial, units: [initial.units[0]!, { ...initial.units[1]!, position: { x: 7, y: 1 } }] };
    expect(valueOf(new BattleHistory(invisible, []).recon(0, 'red'))).toEqual([]);
  });

  it('keeps red recon unchanged when hidden enemy movement, ammunition and funds differ', () => {
    const initial = createScenarioInitialState(reconScenario());
    const hiddenVariant = {
      ...initial,
      units: initial.units.map((unit) => (unit.owner === 'blue' ? { ...unit, ammo: 0, secondaryAmmo: 0, fuel: 30 } : unit)),
      players: { ...initial.players, blue: { gold: 12345, income: 3000 } },
    };
    const alternative: GameCommand[] = [...reconCommands.slice(0, 2), { type: 'move', unitId: 'b1', destination: { x: 6, y: 1 } }];
    expect(valueOf(new BattleHistory(initial, reconCommands).recon(3, 'red'))).toEqual(valueOf(new BattleHistory(hiddenVariant, alternative).recon(3, 'red')));
    const corrupt: GameCommand[] = [{ type: 'move', unitId: 'missing', destination: { x: 0, y: 0 } }];
    const blocked = new BattleHistory(initial, corrupt);
    expect(blocked.analysis(1, 'red')).toEqual({ ok: true, value: undefined });
    expect(blocked.analysis(1, 'blue')).toEqual({ ok: true, value: undefined });
    expect(blocked.analysis(1, 'all').ok).toBe(false);
    expect(blocked.recon(1, 'red').ok).toBe(false);
    expect(blocked.recon(-1, 'red').ok).toBe(false);
    expect(blocked.recon(0.5, 'red').ok).toBe(false);
    expect(blocked.recon(2, 'red').ok).toBe(false);
  });

  it('maintains a separate blue observation history and refreshes a revealed enemy', () => {
    const initial = createScenarioInitialState(reconScenario());
    const blueInitial = { ...initial, activePlayer: 'blue' as const, units: [force('b1', 'infantry', 7, 2, { owner: 'blue' }), force('r1', 'tank', 5, 2)] };
    const commands: GameCommand[] = [
      { type: 'move', unitId: 'b1', destination: { x: 7, y: 0 } },
      { type: 'endTurn' },
      { type: 'move', unitId: 'r1', destination: { x: 4, y: 0 } },
      { type: 'endTurn' },
      { type: 'move', unitId: 'b1', destination: { x: 6, y: 0 } },
    ];
    const history = new BattleHistory(blueInitial, commands);
    expect(valueOf(history.recon(1, 'blue'))[0]?.position).toEqual({ x: 5, y: 2 });
    expect(valueOf(history.recon(5, 'blue'))).toEqual([]);
    expect(valueOf(history.recon(1, 'blue'))[0]?.turn).toBe(1);
  });

  it('rebuilds after an undo branch and reproduces recon after saving and loading', () => {
    const initial = createScenarioInitialState(reconScenario());
    const commands = [...reconCommands];
    const history = new BattleHistory(initial, commands);
    valueOf(history.recon(3, 'red'));
    commands.splice(2, commands.length - 2, { type: 'move', unitId: 'b1', destination: { x: 6, y: 1 } });
    expect(valueOf(history.recon(3, 'red'))[0]?.position).toEqual({ x: 2, y: 1 });
    let final = initial;
    for (const command of commands) final = valueOf(applyGameCommand(final, command));
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'history', {
        initialState: initial,
        gameState: final,
        mapId: initial.scenarioId!,
        difficulty: 'normal',
        commands,
      }),
    );
    const restored = valueOf(parseSavedGame(JSON.stringify(saved)));
    expect(valueOf(new BattleHistory(restored.initialState, restored.commands).recon(commands.length, 'red'))).toEqual(valueOf(history.recon(commands.length, 'red')));
  });

  it('counts destroyed units and aggregates capture, production and turn samples', () => {
    const initial = createScenarioInitialState(
      operation({
        startingGold: 20000,
        board: {
          width: 8,
          height: 4,
          cells: [
            [0, 1, 'factory', 'red'],
            [1, 1, 'city'],
          ],
        },
        initialUnits: [
          { kind: 'infantry', owner: 'red', x: 1, y: 1 },
          { kind: 'tank', owner: 'red', x: 2, y: 2 },
          { kind: 'infantry', owner: 'blue', x: 3, y: 2 },
          { kind: 'infantry', owner: 'blue', x: 7, y: 3 },
        ],
        victoryConditions: [{ type: 'survive', untilTurn: 1000 }],
        defeatConditions: [{ type: 'survive', untilTurn: 1001 }],
      }),
    );
    initial.units = initial.units.map((unit) => (unit.id === 'b1' ? { ...unit, hp: 1 } : unit));
    const commands: GameCommand[] = [
      { type: 'produce', factory: { x: 0, y: 1 }, kind: 'infantry' },
      { type: 'attack', unitId: 'r2', targetId: 'b1' },
      { type: 'capture', unitId: 'r1' },
      { type: 'endTurn' },
      { type: 'endTurn' },
      { type: 'capture', unitId: 'r1' },
    ];
    const history = new BattleHistory(initial, commands);
    const analysis = valueOf(history.analysis(commands.length, 'all'))!;
    expect(analysis.samples.at(-1)?.blue.losses).toBe(1);
    expect(analysis.samples.at(-1)?.red.units).toBe(3);
    expect(analysis.summaries[0]).toMatchObject({ attacks: 1, produced: 1, captured: 0, losses: { red: 0, blue: 1 } });
    expect(analysis.summaries[1]?.captured).toBe(1);
    analysis.samples[0]!.red.units = 999;
    expect(valueOf(history.analysis(commands.length, 'all'))?.samples[0]?.red.units).toBe(3);
  });

  it('excludes merged and evacuated units from losses and bounds retained turn data', () => {
    const initial = createScenarioInitialState(operation());
    const commands: GameCommand[] = [
      { type: 'move', unitId: 'r1', destination: { x: 3, y: 1 } },
      { type: 'evacuate', unitId: 'r1' },
    ];
    expect(valueOf(new BattleHistory(initial, commands).analysis(2, 'all'))?.summaries[0]).toMatchObject({ evacuated: 1, losses: { red: 0, blue: 0 } });
    const mergeInitial = createScenarioInitialState(reconScenario());
    mergeInitial.units = [force('r1', 'infantry', 0, 1, { hp: 40 }), force('r2', 'infantry', 1, 1, { hp: 40 }), force('b1', 'infantry', 7, 3, { owner: 'blue' })];
    const merged = new BattleHistory(mergeInitial, [{ type: 'merge', unitId: 'r1', targetId: 'r2' }]);
    expect(valueOf(merged.analysis(1, 'all'))?.samples.at(-1)?.red).toMatchObject({ units: 1, losses: 0 });
    const turns: GameCommand[] = Array.from({ length: (MAX_ANALYSIS_TURNS + 5) * 2 }, () => ({ type: 'endTurn' }));
    const result = valueOf(new BattleHistory(mergeInitial, turns).analysis(turns.length, 'all'))!;
    expect(result.samples).toHaveLength(MAX_ANALYSIS_TURNS);
    expect(result.summaries).toHaveLength(MAX_ANALYSIS_TURNS);
    expect(result.samples.at(-1)?.turn).toBe(MAX_ANALYSIS_TURNS + 6);
  });
});
