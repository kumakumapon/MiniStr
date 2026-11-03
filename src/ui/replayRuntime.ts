import { ReplayTimeline } from '../game/replayTimeline';
import type { GameState, PlayerId, ReplayFile } from '../game';
import type { CommandSpeed } from './commandScheduler';

export interface ReplayRuntime {
  file: ReplayFile;
  state: GameState;
  index: number;
  playing: boolean;
  speed: CommandSpeed;
  timeline: ReplayTimeline;
  viewpoint: PlayerId | 'all';
}

/** Own one complete replay, shared by the timeline and controls. The current
 * state remains independent, so seeking never changes the imported snapshot. */
export function createReplayRuntime(file: ReplayFile): ReplayRuntime {
  const snapshot = structuredClone(file);
  return {
    file: snapshot,
    state: { ...structuredClone(snapshot.initialState), scenarioId: snapshot.mapId },
    index: 0,
    playing: false,
    speed: 1,
    timeline: new ReplayTimeline(snapshot),
    viewpoint: 'red',
  };
}
