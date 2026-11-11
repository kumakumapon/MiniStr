import { describe, expect, it } from 'vitest';
import { createDeploymentScenario, deploymentSlots } from './deployment';
import {
  createPositionedDeploymentScenario,
  defaultDeploymentPlacements,
  deploymentPositionArea,
  deploymentPositionOptions,
  isFixedDeploymentPosition,
  supportsDeploymentPositions,
} from './deploymentPositions';
import { createScenarioInitialState, legacyBuiltInScenarioData, loadScenarioDefinitions, maps, scenarioDefinitionToData } from './maps';
import { operation, valueOf } from './operations.fixture';
import { applyGameCommand, parseSavedGame, replayCommands, saveGame, type GameCommand } from './session';
import { tacticalScenario } from './tacticalMaps';
import { movementCost, positionKey } from './terrain';
import type { PlayerId, Position } from './types';
import { unitStats } from './units';

const canyon = maps.find((scenario) => scenario.id === 'canyon')!;
const players = ['red', 'blue'] as const;
const choicesFor = (base = canyon) => ({ red: deploymentSlots(base).map((slot) => slot.kind), blue: deploymentSlots(base, 'blue').map((slot) => slot.kind) });

describe('standalone canyon starting positions', () => {
  it('opts in only the current canyon and its standard tactical variant', () => {
    expect(supportsDeploymentPositions(canyon)).toBe(true);
    expect(supportsDeploymentPositions(tacticalScenario(canyon))).toBe(true);
    for (const base of maps.filter((scenario) => scenario !== canyon)) expect(supportsDeploymentPositions(base)).toBe(false);
    for (const base of [structuredClone(canyon), valueOf(loadScenarioDefinitions([legacyBuiltInScenarioData.find((scenario) => scenario.id === 'canyon')!]))[0]!]) {
      expect(supportsDeploymentPositions(base)).toBe(false);
      expect(deploymentPositionArea(base, 'red')).toEqual([]);
      expect(createPositionedDeploymentScenario(base, choicesFor(base), defaultDeploymentPlacements(base), players).ok).toBe(false);
    }
  });

  it('provides exactly rotated 4 by 4 home areas and fixes the aircraft slots', () => {
    const red = deploymentPositionArea(canyon, 'red');
    const blue = new Set(deploymentPositionArea(canyon, 'blue').map(positionKey));
    expect(red).toHaveLength(16);
    expect(red.every((p) => p.x >= 0 && p.x <= 3 && p.y >= 1 && p.y <= 4)).toBe(true);
    expect(red.every((p) => blue.has(`${19 - p.x},${15 - p.y}`))).toBe(true);
    for (const player of players)
      expect(deploymentSlots(canyon, player).map((_, index) => isFixedDeploymentPosition(canyon, player, index))).toEqual([false, false, false, false, true]);
    const mission = operation();
    expect(isFixedDeploymentPosition(mission, 'red', 0)).toBe(true);
    expect(isFixedDeploymentPosition(mission, 'red', 1)).toBe(true);
    expect(isFixedDeploymentPosition(mission, 'red', 2)).toBe(false);
    expect(isFixedDeploymentPosition(mission, 'red', 99)).toBe(true);
    const naval = operation({
      board: { width: 8, height: 4, fill: 'sea', cells: [] },
      initialUnits: [
        { kind: 'destroyer', owner: 'red', x: 0, y: 0 },
        { kind: 'destroyer', owner: 'blue', x: 7, y: 3 },
      ],
      victoryConditions: [{ type: 'eliminate' }],
      defeatConditions: [{ type: 'eliminate' }],
    });
    expect(isFixedDeploymentPosition(naval, 'red', 0)).toBe(true);
  });

  it.each([false, true])('keeps the exact previous prepared initial state with default positions (tactics=%s)', (tactics) => {
    const base = tactics ? tacticalScenario(canyon) : canyon;
    const before = structuredClone(base);
    const choices = choicesFor(base);
    const old = valueOf(createDeploymentScenario(valueOf(createDeploymentScenario(base, choices.red)), choices.blue, 'blue'));
    const prepared = valueOf(createPositionedDeploymentScenario(base, choices, defaultDeploymentPlacements(base), players));
    expect(prepared).toEqual(old);
    expect(createScenarioInitialState(prepared)).toEqual(createScenarioInitialState(old));
    expect(base).toEqual(before);
  });

  it('moves both armies without changing IDs, types, funds, seed or source definitions', () => {
    const positions = defaultDeploymentPlacements(canyon);
    positions.red[0] = { x: 3, y: 4 };
    positions.blue[0] = { x: 16, y: 11 };
    const draft = structuredClone(positions);
    const prepared = valueOf(createPositionedDeploymentScenario(canyon, choicesFor(), positions, players));
    const state = createScenarioInitialState(prepared);
    expect(state.units.find((unit) => unit.id === 'r1')?.position).toEqual(positions.red[0]);
    expect(state.units.find((unit) => unit.id === 'b1')?.position).toEqual(positions.blue[0]);
    expect(prepared.initialUnits.map((unit) => [unit.owner, unit.kind])).toEqual(canyon.initialUnits.map((unit) => [unit.owner, unit.kind]));
    expect(state.units.map((unit) => unit.id)).toEqual(createScenarioInitialState(canyon).units.map((unit) => unit.id));
    expect(state.players).toEqual(createScenarioInitialState(canyon).players);
    expect(positions).toEqual(draft);
    expect(canyon.initialUnits[0]).toMatchObject({ x: 0, y: 2 });
  });

  it('keeps every area cell connected to both capitals for each selectable ground type', () => {
    for (const base of [canyon, tacticalScenario(canyon)])
      for (const player of players) {
        const area = deploymentPositionArea(base, player);
        const kinds = new Set(
          deploymentSlots(base, player)
            .slice(0, 4)
            .flatMap((slot) => slot.choices),
        );
        const capitals = base.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (tile.kind === 'capital' ? [{ x, y }] : [])));
        for (const kind of kinds) {
          const queue = [area[0]!],
            seen = new Set(queue.map(positionKey));
          for (let index = 0; index < queue.length; index++) {
            const current = queue[index]!;
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const next = { x: current.x + dx, y: current.y + dy };
              if (!seen.has(positionKey(next)) && Number.isFinite(movementCost(base.board, next, kind))) {
                seen.add(positionKey(next));
                queue.push(next);
              }
            }
          }
          expect(
            [...area, ...capitals].every((position) => seen.has(positionKey(position))),
            `${player}/${kind}`,
          ).toBe(true);
        }
      }
  });

  it('keeps uneditable CPU positions and unit choices at their authored defaults', () => {
    const positions = defaultDeploymentPlacements(canyon);
    positions.blue[0] = { x: -50, y: -50 };
    const choices = choicesFor();
    choices.blue = [];
    const prepared = valueOf(createPositionedDeploymentScenario(canyon, choices, positions, ['red']));
    expect(prepared.initialUnits.filter((unit) => unit.owner === 'blue')).toEqual(canyon.initialUnits.filter((unit) => unit.owner === 'blue'));
    expect(prepared.secondPlayerBonus).toBe(canyon.secondPlayerBonus);
  });

  it('rejects invalid counts, coordinates, occupied cells, area escapes and moved aircraft', () => {
    const invalid = [
      (p: ReturnType<typeof defaultDeploymentPlacements>) => p.red.pop(),
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { x: 4, y: 4 };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { x: 19, y: 15 };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { x: 1.5, y: 4 };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { x: Number.NaN, y: 4 };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { x: '3', y: 4 } as unknown as Position;
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = null as unknown as Position;
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { ...p.red[1]! };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[0] = { ...p.red[4]! };
      },
      (p: ReturnType<typeof defaultDeploymentPlacements>) => {
        p.red[4] = { x: 3, y: 4 };
      },
    ];
    for (const mutate of invalid) {
      const positions = defaultDeploymentPlacements(canyon);
      mutate(positions);
      expect(createPositionedDeploymentScenario(canyon, choicesFor(), positions, players).ok).toBe(false);
    }
    for (const editable of [[], ['red', 'red'], ['green']] as readonly PlayerId[][])
      expect(createPositionedDeploymentScenario(canyon, choicesFor(), defaultDeploymentPlacements(canyon), editable).ok).toBe(false);
  });

  it('uses existing budget and capturing-unit checks, and credits remaining funds only once', () => {
    const choices = choicesFor();
    choices.red[1] = 'recon';
    const positions = defaultDeploymentPlacements(canyon);
    positions.red[1] = { x: 3, y: 3 };
    const once = valueOf(createPositionedDeploymentScenario(canyon, choices, positions, players));
    expect(valueOf(createPositionedDeploymentScenario(canyon, choices, positions, players))).toEqual(once);
    expect(once.firstPlayerBonus).toBe((canyon.firstPlayerBonus ?? 0) + unitStats.tank.cost - unitStats.recon.cost);
    choices.red[0] = 'recon';
    expect(createPositionedDeploymentScenario(canyon, choices, positions, players).ok).toBe(false);
    choices.red = choicesFor().red.map((kind) => (kind === 'bomber' ? kind : 'heavyTank'));
    expect(createPositionedDeploymentScenario(canyon, choices, positions, players).ok).toBe(false);
    choices.red = choicesFor().red;
    choices.red[4] = 'fighter';
    expect(createPositionedDeploymentScenario(canyon, choices, positions, players).ok).toBe(true);
  });

  it('offers only vacant passable cells, including the current cell', () => {
    const positions = defaultDeploymentPlacements(canyon);
    const options = deploymentPositionOptions(canyon, 'red', 0, positions, 'infantry');
    expect(options).toHaveLength(12);
    expect(options).toContainEqual(positions.red[0]);
    expect(options).not.toContainEqual(positions.red[1]);
    expect(options).not.toContainEqual(positions.red[4]);
    expect(options.every((p) => Number.isFinite(movementCost(canyon.board, p, 'infantry')))).toBe(true);
    expect(deploymentPositionOptions(canyon, 'red', 4, positions, 'bomber')).toEqual([]);
    expect(deploymentPositionOptions(canyon, 'red', 0, positions, 'destroyer')).toEqual([]);
  });

  it('copies coordinate fields only, protecting the unit type and owner from extra keys', () => {
    const positions = defaultDeploymentPlacements(canyon);
    positions.red[0] = { x: 3, y: 4, kind: 'bomber', owner: 'blue', callsign: 'Injected' } as Position;
    const prepared = valueOf(createPositionedDeploymentScenario(canyon, choicesFor(), positions, players));
    expect(prepared.initialUnits[0]).toEqual({ ...canyon.initialUnits[0], x: 3, y: 4 });
  });

  it('round-trips moved positions through schema4 save/resume and recorded commands', () => {
    const positions = defaultDeploymentPlacements(canyon);
    positions.red[0] = { x: 3, y: 4 };
    const prepared = valueOf(createPositionedDeploymentScenario(canyon, choicesFor(), positions, players));
    const initialState = createScenarioInitialState(prepared);
    const commands: GameCommand[] = [{ type: 'move', unitId: 'r1', destination: { x: 3, y: 5 } }];
    const gameState = valueOf(applyGameCommand(initialState, commands[0]!));
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'fixture', {
        mapId: prepared.id,
        difficulty: 'normal',
        mode: 'hotseat',
        initialState,
        commands,
        gameState,
      }),
    );
    const loaded = valueOf(parseSavedGame(JSON.stringify(saved)));
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.initialState).toEqual(initialState);
    expect(valueOf(replayCommands(loaded.initialState, loaded.commands))).toEqual(gameState);
    expect(scenarioDefinitionToData(prepared).initialUnits[0]).toMatchObject({ x: 3, y: 4 });
  });
});
