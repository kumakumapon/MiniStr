import { CURRENT_RULE_VERSION, type GameState } from '../../../src/game/types';
import { chooseCpuAction } from '../../../src/ai';
import { createScenarioInitialState, operationScenarios } from '../../../src/game/maps';
import { createReplay, type ReplayFile } from '../../../src/game/replay';
import { applyGameCommand, saveGame, saveGameToSlot, type GameCommand, type StorageLike } from '../../../src/game/session';
import { dailyScenario, dailyVictory, DAILY_RECORDS_KEY } from '../../../src/game/dailyChallenge';
import { operationVictory, OPERATION_RECORDS_KEY } from '../../../src/game/operationRecords';
import { createCampaignProgress, CAMPAIGN_STORAGE_KEY } from '../../../src/game/campaign';
import { createCampaignScenario } from '../../../src/game/campaignOperations';
import { operation, valueOf } from '../../../src/game/operations.fixture';
import { researchReplayFixture } from '../../../src/game/research.fixture';

export function normalResearchTestEntries(): Record<string, string> {
  const file = researchReplayFixture();
  const values = new Map<string, string>();
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
  const input = { mapId: file.mapId, difficulty: file.difficulty, mode: 'cpu' as const, initialState: file.initialState, gameState: file.initialState, commands: [] };
  valueOf(saveGame(storage, 'ministr.save.manual', input));
  valueOf(saveGame(storage, 'ministr.save.auto', input));
  valueOf(saveGameToSlot(storage, 'protected', 'Protected normal match', input));
  values.set(CAMPAIGN_STORAGE_KEY, JSON.stringify(createCampaignProgress('2026-11-12T00:00:00.000Z')));
  values.set(DAILY_RECORDS_KEY, JSON.stringify({ schemaVersion: 1, records: [] }));
  values.set(OPERATION_RECORDS_KEY, JSON.stringify({ schemaVersion: 1, records: [] }));
  return Object.fromEntries(values);
}

const finished = new Map<string, ReplayFile>();
export function recordableResearchReplay(kind: 'operation' | 'daily' | 'campaign'): ReplayFile {
  const cached = finished.get(kind);
  if (cached) return cached;
  const map =
    kind === 'daily'
      ? valueOf(dailyScenario('2026-11-12'))
      : kind === 'campaign'
        ? valueOf(createCampaignScenario(createCampaignProgress(), 'skirmish'))
        : (operationScenarios.find((s) => s.id === 'convoy-escort') ?? operation());
  const initialState: GameState = { ...createScenarioInitialState(map), ruleVersion: kind === 'operation' ? 14 : CURRENT_RULE_VERSION };
  let state = initialState;
  const commands: GameCommand[] = [];
  for (let index = 0; index < 5000 && !state.winner && !state.draw; index++) {
    const command: GameCommand = state.activePlayer === 'blue' ? { type: 'endTurn' } : chooseCpuAction(state, 'hard');
    state = valueOf(applyGameCommand(state, command));
    commands.push(command);
  }
  if (state.winner !== 'red') throw Error('Research result fixture must be a red victory: ' + kind);
  if (kind === 'operation') valueOf(operationVictory(initialState, state, commands, 'normal'));
  if (kind === 'daily') valueOf(dailyVictory(initialState, state, commands, { difficulty: 'normal', matchMode: 'cpu' }, new Date('2026-11-12T12:00:00.000Z')));
  const replay = valueOf(createReplay({ mapId: map.id, difficulty: 'normal', initialState, commands }));
  finished.set(kind, replay);
  return replay;
}
