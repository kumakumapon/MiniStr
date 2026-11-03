import { expect, it, vi } from 'vitest';
import { createReplayRuntime } from './replayRuntime';
import { createReplay, createScenarioInitialState, loadScenarioDefinitions } from '../game';

it('owns one command stream, isolates the source and preserves deterministic seeks', () => {
  const loaded = loadScenarioDefinitions([
    {
      id: 'runtime-memory',
      name: 'Runtime',
      briefing: '',
      startingGold: 0,
      board: { width: 2, height: 1, cells: [] },
      initialUnits: [
        { kind: 'bomber', owner: 'red', x: 0, y: 0 },
        { kind: 'infantry', owner: 'blue', x: 1, y: 0 },
      ],
      victoryConditions: [{ type: 'eliminate' }],
      defeatConditions: [{ type: 'eliminate' }],
    },
  ]);
  if (!loaded.ok) throw Error(loaded.error);
  const created = createReplay({
    mapId: 'runtime-memory',
    difficulty: 'normal',
    initialState: createScenarioInitialState(loaded.value[0]!),
    commands: [{ type: 'attack', unitId: 'r1', targetId: 'b1' }],
  });
  if (!created.ok) throw Error(created.error);
  const file = created.value;
  const clone = vi.spyOn(globalThis, 'structuredClone');
  try {
    const runtime = createReplayRuntime(file);
    expect(clone.mock.calls.filter(([value]) => value === file)).toHaveLength(1);
    expect(runtime.file).toEqual(file);
    expect(runtime.file).not.toBe(file);
    // The timeline must share the owned stream, not retain the original input.
    file.commands[0] = { type: 'wait', unitId: 'missing' };
    expect(runtime.timeline.seek(1)).toEqual({ ok: true, value: runtime.file.finalState });
    expect(runtime.timeline.seek(0)).toEqual({ ok: true, value: runtime.file.initialState });
    runtime.state.units[0]!.hp = 1;
    expect(runtime.file.initialState.units[0]!.hp).toBe(100);
    expect(runtime.timeline.seek(0)).toEqual({ ok: true, value: runtime.file.initialState });
    expect(runtime).toMatchObject({ index: 0, playing: false, speed: 1, viewpoint: 'red' });
  } finally {
    clone.mockRestore();
  }
});
