import { chooseCpuAction, type CpuDifficulty } from '../src/ai';
import {
  applyGameCommand,
  createCampaignScenario,
  createScenarioInitialState,
  createReplay,
  gradeCampaignBattle,
  isDeployedUnit,
  recordCampaignVictory,
  recordCampaignVeterans,
  serializeReplay,
  victoryReason,
  type CampaignProgress,
  type CampaignStage,
  type GameCommand,
} from '../src/game';

export function playCampaignStage(progress: CampaignProgress, stage: CampaignStage, difficulty: CpuDifficulty) {
  const scenario = createCampaignScenario(progress, stage.scenarioId);
  if (!scenario.ok) throw new Error(`${stage.scenarioId}: ${scenario.error}`);
  const initialState = createScenarioInitialState(scenario.value);
  let state = initialState;
  const commands: GameCommand[] = [];
  const turns = [];
  const started = Date.now();
  while (!state.winner && state.turn <= 80) {
    const side = state.activePlayer;
    // Match the browser's CPU order budget, including its end-turn fallback.
    const limit = Math.max(30, state.units.filter((unit) => unit.owner === side && isDeployedUnit(unit)).length * 3 + 5);
    const counts: Record<string, number> = {};
    for (let step = 0; step <= limit && !state.winner && state.activePlayer === side; step++) {
      const command = step === limit ? { type: 'endTurn' as const } : chooseCpuAction(state, side === 'red' ? 'hard' : difficulty);
      const next = applyGameCommand(state, command);
      if (!next.ok) throw new Error(`${stage.scenarioId}/${side}: ${JSON.stringify(command)}: ${next.error}`);
      state = next.value;
      commands.push(command);
      counts[command.type] = (counts[command.type] ?? 0) + 1;
    }
    turns.push({ turn: state.turn, side, counts });
  }
  if (!state.winner) throw new Error(`${stage.scenarioId}: no result within 80 rounds`);
  const replay = createReplay({ mapId: stage.scenarioId, difficulty, initialState, commands });
  if (!replay.ok) throw new Error(replay.error);
  const serialized = serializeReplay(replay.value);
  if (!serialized.ok) throw new Error(serialized.error);
  const losses = replay.value.summary.kills.blue;
  const grade = state.winner === 'red' ? gradeCampaignBattle({ initialState, finalState: state, losses, recommendedTurns: stage.recommendedTurns }) : undefined;
  if (grade && !grade.ok) throw new Error(grade.error);
  let nextProgress = progress;
  if (grade?.ok) {
    const recorded = recordCampaignVictory(progress, stage.scenarioId, grade.value.grade);
    if (!recorded.ok) throw new Error(recorded.error);
    const veterans = recordCampaignVeterans(recorded.value, state);
    if (!veterans.ok) throw new Error(veterans.error);
    nextProgress = veterans.value;
  }
  const summary = {
    id: stage.scenarioId,
    difficulty,
    winner: state.winner,
    turns: state.turn,
    reason: victoryReason(state),
    commands: commands.length,
    losses,
    survivors: state.units.filter((unit) => unit.owner === 'red').length,
    grade: grade?.ok ? grade.value.grade : undefined,
    support: scenario.value.firstPlayerBonus ?? 0,
    deployedVeterans: initialState.units.filter((unit) => unit.owner === 'red' && (unit.experience ?? 0) > 0).length,
    blueMoves: turns.filter((turn) => turn.side === 'blue').reduce((sum, turn) => sum + (turn.counts.move ?? 0), 0),
    blueAttacks: turns.filter((turn) => turn.side === 'blue').reduce((sum, turn) => sum + (turn.counts.attack ?? 0), 0),
    milliseconds: Date.now() - started,
  };
  if (state.winner !== 'red') {
    const objectives = scenario.value.victoryConditions.flatMap((condition) => (condition.type === 'hold' ? condition.positions : []));
    console.warn(
      `Campaign reference loss: ${JSON.stringify({
        ...summary,
        objectives: objectives.map((position) => ({
          ...position,
          terrain: state.board.terrain[position.y]?.[position.x],
          unit: state.units.find((unit) => isDeployedUnit(unit) && unit.position.x === position.x && unit.position.y === position.y),
        })),
        units: state.units,
        lastTurns: turns.slice(-4),
        lastCommands: commands.slice(-30),
      })}`,
    );
  }
  return { summary, initialState, commands, finalState: state, turns, replay: serialized.value, progress: nextProgress };
}
