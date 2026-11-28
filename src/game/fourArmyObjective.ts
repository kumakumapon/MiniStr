import { isExpandedBattle } from './smallBattle';
import type { FourArmyState } from './fourArmyEngine';
import type { FourArmyId, FourArmyOutcome } from './fourArmyFoundation';
import type { SmallBattle } from './smallBattle';
import type { Position } from './types';

export interface FourArmyHoldObjective {
  type: 'hold';
  position: Position;
  rounds: number;
}

export interface FourArmyHoldProgress {
  army?: FourArmyId;
  rounds: number;
}

type ObjectiveState = Pick<FourArmyState, 'board' | 'match' | 'alive' | 'objectiveHold' | 'round'>;

export const fourArmyObjective = (match?: SmallBattle): FourArmyHoldObjective | undefined => (isExpandedBattle(match) ? match.objective : undefined);

function holdingArmy(state: ObjectiveState, objective: FourArmyHoldObjective): FourArmyId | undefined {
  const { x, y } = objective.position;
  const owner = state.board.terrain[y]?.[x]?.owner;
  return owner && state.alive.includes(owner) ? owner : undefined;
}

/** A change in ownership resets progress immediately; only complete rounds add to it. */
export function updateFourArmyHold<T extends ObjectiveState>(state: T, completedRound = false): T {
  const objective = fourArmyObjective(state.match);
  if (!objective) return state;
  const owner = holdingArmy(state, objective);
  const previous = state.objectiveHold;
  const rounds = owner ? (previous?.army === owner ? previous.rounds : 0) + Number(completedRound) : 0;
  return { ...state, objectiveHold: owner ? { army: owner, rounds } : { rounds } };
}

export function isFourArmyHoldProgress(state: ObjectiveState): boolean {
  const progress = state.objectiveHold;
  const objective = fourArmyObjective(state.match);
  if (!objective) return !Object.hasOwn(state, 'objectiveHold');
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return false;
  const owner = holdingArmy(state, objective);
  return (
    Object.keys(progress).length === (owner ? 2 : 1) &&
    Object.hasOwn(progress, 'rounds') &&
    progress.army === owner &&
    Number.isInteger(progress.rounds) &&
    progress.rounds >= 0 &&
    progress.rounds <= Math.min(state.round.round - 1, owner ? objective.rounds : 0) &&
    (progress.rounds !== objective.rounds || state.round.phase === 'pending')
  );
}

export function heldObjectiveOutcome(state: ObjectiveState): FourArmyOutcome | undefined {
  const objective = fourArmyObjective(state.match);
  const progress = state.objectiveHold;
  return objective && progress?.army && progress.rounds === objective.rounds ? { type: 'victory', winner: progress.army } : undefined;
}
