/** Reproducible Node benchmarks. Browser rendering and mobile hardware are measured separately. */
import { cpus } from 'node:os';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyGameCommand, createScenarioInitialState, listSaveSlots, maps, saveGameToSlot, createReplay, replayCommands, type StorageLike, type GameCommand } from '../src/game';
import { ReplayTimeline } from '../src/game/replayTimeline';
import { renderReplayNavigation } from '../src/ui/replayControls';
import { chooseCpuAction } from '../src/ai';
import { measureOperation } from './performanceMetrics';

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
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--samples' || !/^\d+$/.test(args[1]!))) throw Error('Usage: --samples 1..1000');
const samples = Number(args[1] ?? 30),
  warmup = 5;
if (samples < 1 || samples > 1000) throw Error('Invalid sample count');
const hash = createHash('sha256');
for (const folder of ['src/game', 'src/ai', 'src/ui', 'scripts'])
  for (const file of readdirSync(folder)
    .filter((file) => /\.(ts|mjs)$/.test(file) && !/\.(test|fixture)\./.test(file))
    .sort())
    hash
      .update(`${folder}/${file}\0`)
      .update(readFileSync(`${folder}/${file}`))
      .update('\0');
const initialState = createScenarioInitialState({ ...maps[0]!, id: 'profile-long', turnLimit: 1000 });
let state = initialState;
const commands: GameCommand[] = [];
for (let i = 0; i < 400; i++) {
  const unit = state.units.find((unit) => unit.owner === state.activePlayer && !unit.hasActed && unit.position);
  const orders: GameCommand[] = [...(unit ? [{ type: 'wait' as const, unitId: unit.id }] : []), { type: 'endTurn' }];
  for (const command of orders) {
    const result = applyGameCommand(state, command);
    if (!result.ok || result.value.winner) throw Error('Long fixture must remain legal and unfinished');
    state = result.value;
    commands.push(command);
  }
}
// A valid finished replay, rather than a cast or imported unchecked fixture.
const finalOrders: GameCommand[] = [...commands];
let final = state;
while (!final.winner) {
  const order = { type: 'endTurn' } as const;
  const result = applyGameCommand(final, order);
  if (!result.ok) throw Error(result.error);
  final = result.value;
  finalOrders.push(order);
}
const made = createReplay({ mapId: initialState.scenarioId!, difficulty: 'normal', initialState, commands: finalOrders });
if (!made.ok) throw Error(made.error);
const file = made.value;
const timeline = new ReplayTimeline(file);
const end = commands.length;
const storage = new MemoryStorage();
for (let i = 0; i < 12; i++) {
  const saved = saveGameToSlot(storage, `profile-${i}`, `Profile ${i}`, { mapId: initialState.scenarioId!, difficulty: 'normal', initialState, gameState: state, commands });
  if (!saved.ok) throw Error(saved.error);
}
const large = createScenarioInitialState({
  ...maps[0]!,
  id: 'profile-large',
  board: { width: 32, height: 32, terrain: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ({ kind: 'plain' as const }))) },
  initialUnits: Array.from({ length: 128 }, (_, i) => ({
    kind: 'infantry' as const,
    owner: i < 64 ? ('red' as const) : ('blue' as const),
    x: i % 32,
    y: i < 64 ? Math.floor(i / 32) : 30 + Math.floor((i - 64) / 32),
  })),
});
const checked = (result: { ok: boolean }) => {
  if (!result.ok) throw Error('Benchmark operation failed');
};
const measure = (run: () => unknown) => measureOperation(run, samples, warmup);
const measurements = {
  coldSaveList: measure(() => {
    const cold = new MemoryStorage();
    cold.data = new Map(storage.data);
    if (listSaveSlots(cold).length !== 12) throw Error('Missing slots');
  }),
  cachedSaveList: measure(() => {
    if (listSaveSlots(storage).length !== 12) throw Error('Missing slots');
  }),
  normalCpu: measure(() => chooseCpuAction(createScenarioInitialState(maps[0]!), 'hard')),
  largeCpu: measure(() => chooseCpuAction(large, 'hard')),
  largeEndTurn: measure(() => checked(applyGameCommand(large, { type: 'endTurn' }))),
  linearReplay: measure(() => checked(replayCommands(initialState, commands))),
  coldSeek: measure(() => checked(new ReplayTimeline(file).seek(end))),
  cachedSeek: measure(() => checked(timeline.seek(end))),
  backwardForwardSeek: measure(() => {
    checked(timeline.seek(Math.floor(end / 2)));
    checked(timeline.seek(end));
  }),
  fogNavigation: measure(() => renderReplayNavigation(end, file.commands.length, 'blue', timeline)),
};
console.log(
  JSON.stringify(
    {
      schemaVersion: 2,
      sha: process.env.GITHUB_SHA ?? 'unrecorded',
      sourceState: 'working-tree',
      sourceDigest: hash.digest('hex'),
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      note: 'Node only; no browser/mobile latency guarantee. Heap deltas include GC and are not a memory-leak test.',
      fixture: { slots: 12, commandsPerSlot: commands.length, replayCommands: file.commands.length, largeBoard: [32, 32], largeUnits: 128 },
      measurements,
    },
    null,
    2,
  ),
);
