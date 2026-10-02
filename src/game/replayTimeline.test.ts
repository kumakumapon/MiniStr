import { describe, expect, it } from 'vitest';
import { createReplay, createScenarioInitialState, loadScenarioDefinitions, loadCustomScenarios, parseReplay, replayCommands, type GameCommand, type ScenarioData } from './index';
import { ReplayTimeline } from './replayTimeline';
import { ResultCache } from '../ui/resultCache';
import { renderReplayNavigation } from '../ui/replayControls';

const source: ScenarioData = {
  id: 'portable-duel',
  name: 'Portable duel',
  briefing: '',
  startingGold: 0,
  board: { width: 9, height: 1, cells: [[0, 0, 'airport', 'red']] },
  initialUnits: [
    { kind: 'bomber', owner: 'red', x: 0, y: 0 },
    { kind: 'infantry', owner: 'blue', x: 8, y: 0 },
  ],
  victoryConditions: [{ type: 'eliminate' }],
  defeatConditions: [{ type: 'eliminate' }],
};
function fixture() {
  const parsed = loadScenarioDefinitions([source]);
  if (!parsed.ok) throw Error(parsed.error);
  const initialState = createScenarioInitialState(parsed.value[0]!);
  delete initialState.ruleVersion; // Legacy rules have no round-40 decision; the airport refuels the bomber.
  // Many empty turns exercise checkpoint eviction without mutable test-only states.
  const commands: GameCommand[] = Array.from({ length: 80 }, () => ({ type: 'endTurn' }));
  commands.push({ type: 'move', unitId: 'r1', destination: { x: 7, y: 0 } }, { type: 'attack', unitId: 'r1', targetId: 'b1' });
  const created = createReplay({ mapId: source.id, difficulty: 'normal', initialState, commands });
  if (!created.ok) throw Error(created.error);
  return created.value;
}
describe('portable replay analysis', () => {
  it('seeks identically to linear replay across checkpoints in either direction', () => {
    const file = fixture();
    const timeline = new ReplayTimeline(file, 2);
    for (const index of [82, 32, 0, 65, 1, 81, 82]) expect(timeline.seek(index)).toEqual(replayCommands(file.initialState, file.commands.slice(0, index)));
    for (const index of [-1, 0.5, 83]) expect(timeline.seek(index).ok).toBe(false);
    expect(timeline.event(99, 'all')).toBe('');
    expect(timeline.event(0, 'blue')).toBe('endTurn');
    expect(timeline.event(80, 'blue')).toBe('未観測');
    expect(timeline.event(80, 'red')).toBe('move');
    expect(timeline.event(81, 'blue')).toBe('attack');
    expect(timeline.event(81, 'all')).toBe('attack');
    expect(renderReplayNavigation(82, 82, 'all', timeline)).toContain('replay-seek');
    expect(renderReplayNavigation(0, 82, 'red', timeline)).toContain('disabled');
  });
  it('imports a custom match into an empty catalog without registering its definition', () => {
    const file = fixture();
    loadCustomScenarios({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    expect(parseReplay(JSON.stringify(file))).toEqual({ ok: true, value: file });
    const cache = new ResultCache();
    const result = cache.summarize(file.finalState, file.initialState, file.commands, file.mapId, 'normal');
    expect(result.ok).toBe(true);
    expect(cache.summarize(file.finalState, file.initialState, file.commands, file.mapId, 'normal')).toBe(result);
    expect(cache.summarize(file.finalState, file.initialState, file.commands, file.mapId, 'hard')).not.toBe(result);
  });
  it('returns a failure for an illegal command without replacing a checkpoint', () => {
    const file = fixture();
    file.commands[0] = { type: 'wait', unitId: 'missing' };
    const timeline = new ReplayTimeline(file);
    expect(timeline.seek(1).ok).toBe(false);
    expect(timeline.event(1, 'red')).toBe('endTurn');
    file.commands[1] = { type: 'wait', unitId: 'missing' };
    expect(timeline.event(1, 'red')).toBe('');
    expect(timeline.seek(0)).toEqual({ ok: true, value: file.initialState });
  });
});
