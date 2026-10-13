import { scenarioDefinitionToData, scenarioForState, type ScenarioData, type VictoryCondition } from '../game/maps';
import { holdConditionKey } from '../game/victory';
import type { Board, GameState, Position } from '../game/types';

const snapshots = new WeakMap<object, ScenarioData>();
const boards = new WeakMap<Board, { rotated: Board; tiles: Board['terrain'][number]; kinds: string[] }>();

export const rotatePosition = (position: Position, board: Pick<Board, 'width' | 'height'>): Position => ({
  x: board.width - 1 - position.x,
  y: board.height - 1 - position.y,
});

/** Blue plans in the same coordinate orientation as red, avoiding top-left tie bias. */
export function bluePlanningState(state: GameState): GameState {
  const tiles = state.board.terrain.flat();
  const cached = boards.get(state.board);
  const sameTiles =
    cached &&
    cached.rotated.width === state.board.width &&
    cached.rotated.height === state.board.height &&
    tiles.length === cached.tiles.length &&
    tiles.every((tile, index) => tile === cached.tiles[index] && tile.kind === cached.kinds[index]);
  const board = sameTiles ? cached.rotated : { ...state.board, terrain: [...state.board.terrain].reverse().map((row) => [...row].reverse()) };
  if (!sameTiles) boards.set(state.board, { rotated: board, tiles, kinds: tiles.map((tile) => tile.kind) });
  const scenario = scenarioForState(state);
  let scenarioSnapshot: ScenarioData | undefined;
  let objectiveHoldTurns = state.objectiveHoldTurns;
  if (scenario) {
    scenarioSnapshot = snapshots.get(scenario);
    const rotateCondition = (condition: VictoryCondition): VictoryCondition =>
      condition.type === 'hold' ? { ...condition, positions: condition.positions.map((position) => rotatePosition(position, state.board)) } : condition;
    if (!scenarioSnapshot) {
      const data = scenarioDefinitionToData(scenario);
      scenarioSnapshot = {
        ...data,
        board: { ...data.board, cells: data.board.cells.map(([x, y, kind, owner]) => [state.board.width - 1 - x, state.board.height - 1 - y, kind, owner]) },
        initialUnits: data.initialUnits.map((unit) => ({ ...unit, ...rotatePosition(unit, state.board) })),
        victoryConditions: data.victoryConditions.map(rotateCondition),
        defeatConditions: data.defeatConditions.map(rotateCondition),
      };
      snapshots.set(scenario, scenarioSnapshot);
    }
    if (objectiveHoldTurns) {
      const keys = new Map(
        [...scenario.victoryConditions, ...scenario.defeatConditions]
          .filter((condition) => condition.type === 'hold')
          .map((condition) => [holdConditionKey(condition), holdConditionKey(rotateCondition(condition) as Extract<VictoryCondition, { type: 'hold' }>)]),
      );
      objectiveHoldTurns = Object.fromEntries(
        Object.entries(objectiveHoldTurns).map(([owner, progress]) => [owner, Object.fromEntries(Object.entries(progress).map(([key, value]) => [keys.get(key) ?? key, value]))]),
      );
    }
  }
  return {
    ...state,
    board,
    scenarioSnapshot,
    objectiveHoldTurns,
    units: state.units.map((unit) => (unit.position ? { ...unit, position: rotatePosition(unit.position, state.board) } : unit)),
  };
}
