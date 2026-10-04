/** Node microbenchmarks; these are not mobile-browser latency measurements. */
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { applyGameCommand, createScenarioInitialState, listSaveSlots, maps, saveGameToSlot, type StorageLike, type GameCommand } from '../src/game';
import { chooseCpuAction } from '../src/ai';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
function measure(run: () => unknown, samples: number) {
  const times: number[] = [];
  const heap = process.memoryUsage().heapUsed;
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    samples,
    p50Ms: times[Math.floor(samples * 0.5)],
    p95Ms: times[Math.min(samples - 1, Math.floor(samples * 0.95))],
    maxMs: times.at(-1),
    heapDeltaBytes: process.memoryUsage().heapUsed - heap,
  };
}
const storage = new MemoryStorage();
const initialState = createScenarioInitialState({
  ...maps[0]!,
  id: 'profile-long',
  turnLimit: 1000,
});
let state = initialState;
const commands: GameCommand[] = [];
for (let i = 0; i < 150; i++) {
  const command = { type: 'endTurn' } as const;
  const result = applyGameCommand(state, command);
  if (!result.ok) throw Error(result.error);
  state = result.value;
  commands.push(command);
}
for (let i = 0; i < 12; i++) {
  const result = saveGameToSlot(storage, `profile-${i}`, `Profile ${i}`, {
    mapId: initialState.scenarioId!,
    difficulty: 'normal',
    initialState,
    gameState: state,
    commands,
  });
  if (!result.ok) throw Error(result.error);
}
const coldList = measure(() => {
  const cold = new MemoryStorage();
  cold.data = new Map(storage.data);
  listSaveSlots(cold);
}, 20);
listSaveSlots(storage);
const cachedList = measure(() => listSaveSlots(storage), 100);
const normal = createScenarioInitialState(maps[0]!);
const large = createScenarioInitialState({
  ...maps[0]!,
  id: 'profile-large',
  board: {
    width: 32,
    height: 32,
    terrain: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ({ kind: 'plain' as const }))),
  },
  initialUnits: Array.from({ length: 128 }, (_, i) => ({
    kind: 'infantry' as const,
    owner: i < 64 ? ('red' as const) : ('blue' as const),
    x: i % 32,
    y: i < 64 ? Math.floor(i / 32) : 30 + Math.floor((i - 64) / 32),
  })),
});
console.log(
  JSON.stringify(
    {
      sha: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      runtime: process.version,
      platform: process.platform,
      note: 'Node-only; heap deltas include GC; no browser/render/p95 guarantee',
      slots: 12,
      commandsPerSlot: 150,
      coldList,
      cachedList,
      normalCpu: measure(() => chooseCpuAction(normal, 'hard'), 20),
      largeCpu: measure(() => chooseCpuAction(large, 'hard'), 10),
    },
    null,
    2,
  ),
);
