/** Run with node --expose-gc node_modules/vite-node/vite-node.mjs scripts/profile-retention.ts. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createScenarioInitialState, loadScenarioDefinitions } from '../src/game/maps';
import { createReplay } from '../src/game/replay';
import { ReplayTimeline } from '../src/game/replayTimeline';
import { type GameCommand } from '../src/game/session';

if (!global.gc) throw Error('Use --expose-gc for retained-heap measurements');
const rows = [];
for (const size of [16, 32]) {
  const loaded = loadScenarioDefinitions([
    {
      id: 'retention-profile',
      name: 'Retention profile',
      briefing: '',
      startingGold: 0,
      board: { width: size, height: size, cells: [] },
      turnLimit: 1000,
      initialUnits: Array.from({ length: size * 4 }, (_, i) => ({
        kind: 'infantry',
        owner: i < size * 2 ? 'red' : 'blue',
        x: i % size,
        y: i < size * 2 ? Math.floor(i / size) : size - 2 + Math.floor((i - size * 2) / size),
      })),
      victoryConditions: [{ type: 'eliminate' }],
      defeatConditions: [{ type: 'eliminate' }],
    },
  ]);
  if (!loaded.ok) throw Error(loaded.error);
  const initialState = createScenarioInitialState(loaded.value[0]!);
  const commands: GameCommand[] = Array.from({ length: 2000 }, () => ({ type: 'endTurn' }));
  const made = createReplay({ mapId: 'retention-profile', difficulty: 'normal', initialState, commands });
  if (!made.ok) throw Error(made.error);
  for (let cycle = 0; cycle < 5; cycle++) {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    const holder: { timeline?: ReplayTimeline } = { timeline: new ReplayTimeline(made.value) };
    const started = performance.now();
    for (const index of [512, 1024, 1600, 1900, 800, 1800]) {
      const result = holder.timeline!.seek(index);
      if (!result.ok || result.value.turn !== Math.floor(index / 2) + 1) throw Error('Seek mismatch');
    }
    const seekMs = performance.now() - started;
    global.gc();
    const retained = process.memoryUsage().heapUsed - before;
    delete holder.timeline;
    global.gc();
    rows.push({ size, cycle, retainedBytes: retained, afterReleaseBytes: process.memoryUsage().heapUsed - before, seekMs });
  }
}
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      sourceSha: process.env.GITHUB_SHA ?? 'working-tree',
      sourceDigest: createHash('sha256').update(readFileSync('src/game/replayTimeline.ts')).digest('hex'),
      commands: 2000,
      rows,
      note: 'Explicit GC; each cycle retains a timeline then releases it. The replay file stays alive. Heap values vary and do not prove absence of browser leaks.',
    },
    null,
    2,
  ),
);
