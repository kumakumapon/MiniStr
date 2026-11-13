import { expect } from '@playwright/test';
import { build } from 'vite';
import { test } from './helpers/engineTest';
import { fourCpuMap, fourCpuUnit } from '../../src/ai/fourArmyCpu.fixture';
import { defaultFourArmyCpuSettings } from '../../src/ai/fourArmyCpu';
import { createFourArmyState } from '../../src/game/fourArmyEngine';
import { serializeFourArmyArchive } from '../../src/game/fourArmyArchive';
import { FOUR_ARMY_IDS } from '../../src/game/fourArmyFoundation';
import { createFourArmyMap32 } from '../../src/game/fourArmyMap32';
import { fourArmyCapacityFixture } from './helpers/fourArmyMapProbe';
import { writeFile } from 'node:fs/promises';
import type { FourArmyCpuPlanner } from '../../src/ui/fourArmyCpuPlanner';
import type { FourArmyCpuSession } from '../../src/ui/fourArmyCpuSession';

let library: string, workerCode: string;
async function bundle(entry: string, name: string): Promise<string> {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, target: 'es2022', lib: { entry, formats: ['iife'], name } } });
  for (const output of Array.isArray(result) ? result : [result])
    if ('output' in output) for (const chunk of output.output) if (chunk.type === 'chunk' && chunk.isEntry) return chunk.code;
  throw Error('Worker test bundle missing');
}
test.beforeAll(async () => {
  [library, workerCode] = await Promise.all([bundle('tests/e2e/helpers/fourArmyMapBrowser.ts', 'FourArmyCpuLib'), bundle('src/ui/fourArmyCpuWorker.ts', 'FourArmyCpuWorkerLib')]);
});

test('real Worker cancellation settles old steps and prevents same-turn replacement replies', async ({ page }) => {
  const state = createFourArmyState(fourCpuMap());
  if (!state.ok) throw Error(state.error);
  await page.goto('/');
  await page.addScriptTag({ content: library });
  const result = await page.evaluate(
    async ({ state, workerCode }) => {
      const Session = (window as unknown as { FourArmyCpuLib: { FourArmyCpuSession: typeof FourArmyCpuSession } }).FourArmyCpuLib.FourArmyCpuSession;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      let created = 0,
        terminated = 0;
      const session = new Session(state, () => {
        const w = new Worker(url);
        created++;
        const end = w.terminate.bind(w);
        w.terminate = () => {
          terminated++;
          end();
        };
        return w;
      });
      session.resume();
      const cancelled = session.step();
      session.pause();
      const old = await cancelled;
      const before = session.state;
      session.resume();
      const command = await session.step();
      const count = session.commands.length;
      const late = session.step();
      const replacement = structuredClone(state);
      replacement.rngSeed = 99;
      session.replaceState(replacement);
      const discarded = await late;
      session.stop();
      URL.revokeObjectURL(url);
      return { old, discarded, before, command, count, state: session.state, history: session.commands, created, terminated };
    },
    { state: state.value, workerCode },
  );
  expect(result.old).toBeUndefined();
  expect(result.discarded).toBeUndefined();
  expect(result.before).toEqual(state.value);
  expect(result.command?.actor).toBe('army1');
  expect(result.count).toBe(1);
  expect(result.state.rngSeed).toBe(99);
  expect(result.history).toEqual([]);
  expect(result.created).toBeGreaterThanOrEqual(2);
  expect(result.terminated).toBe(result.created);
});

test('real Worker drives all four armies with only observations and keeps a replayable command history', async ({ page }) => {
  const map = fourCpuMap(),
    state = createFourArmyState(map);
  if (!state.ok) throw Error(state.error);
  const settings = defaultFourArmyCpuSettings();
  settings.army2 = { difficulty: 'easy', policy: 'offensive' };
  settings.army3 = { difficulty: 'hard', policy: 'defensive' };
  await page.goto('/');
  await page.addScriptTag({ content: library });
  const result = await page.evaluate(
    async ({ state, settings, workerCode }) => {
      const Session = (window as unknown as { FourArmyCpuLib: { FourArmyCpuSession: typeof FourArmyCpuSession } }).FourArmyCpuLib.FourArmyCpuSession;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      const requests: unknown[] = [];
      const session = new Session(
        state,
        () => {
          const w = new Worker(url),
            post = w.postMessage.bind(w);
          w.postMessage = (data: unknown) => {
            requests.push(structuredClone(data));
            post(data);
          };
          return w;
        },
        settings,
      );
      session.resume();
      for (let i = 0; i < 40 && session.state.outcome.type === 'ongoing'; i++) await session.step();
      const result = { state: session.state, commands: session.commands, requests };
      session.stop();
      URL.revokeObjectURL(url);
      return result;
    },
    { state: state.value, settings, workerCode },
  );
  expect(new Set(result.commands.map((c) => c.actor)).size).toBe(4);
  for (const data of result.requests) {
    const r = data as { turn: { actor: keyof typeof settings }; options: unknown; observation: Record<string, unknown> };
    expect(r.options).toEqual(settings[r.turn.actor]);
    expect(r.observation).not.toHaveProperty('players');
    expect(r.observation).not.toHaveProperty('rngSeed');
    expect(r).not.toHaveProperty('state');
  }
  expect(serializeFourArmyArchive(map, result.commands, result.state).ok).toBe(true);
});

test('real Worker reaches an adjudicated finish and releases computation at game over', async ({ page }) => {
  const map = fourCpuMap();
  map.board = {
    width: 2,
    height: 2,
    terrain: [
      [
        { kind: 'capital', owner: 'army1' },
        { kind: 'capital', owner: 'army2' },
      ],
      [
        { kind: 'capital', owner: 'army4' },
        { kind: 'capital', owner: 'army3' },
      ],
    ],
  };
  map.capitals = { army1: { x: 0, y: 0 }, army2: { x: 1, y: 0 }, army3: { x: 1, y: 1 }, army4: { x: 0, y: 1 } };
  map.units = FOUR_ARMY_IDS.map((a, i) => ({ ...fourCpuUnit(`u${i + 1}`, a, map.capitals[a]), hp: i === 0 ? 100 : 1 }));
  const state = createFourArmyState(map);
  if (!state.ok) throw Error(state.error);
  await page.goto('/');
  await page.addScriptTag({ content: library });
  const result = await page.evaluate(
    async ({ state, workerCode }) => {
      const Session = (window as unknown as { FourArmyCpuLib: { FourArmyCpuSession: typeof FourArmyCpuSession } }).FourArmyCpuLib.FourArmyCpuSession;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      let terminated = 0;
      const session = new Session(state, () => {
        const w = new Worker(url),
          end = w.terminate.bind(w);
        w.terminate = () => {
          terminated++;
          end();
        };
        return w;
      });
      session.resume();
      for (let i = 0; i < 64 && session.state.outcome.type === 'ongoing'; i++) await session.step();
      const command = await session.step();
      const result = { state: session.state, commands: session.commands, command, paused: session.paused, terminated };
      session.stop();
      URL.revokeObjectURL(url);
      return result;
    },
    { state: state.value, workerCode },
  );
  expect(result.state.outcome.type).toBe('victory');
  expect(result.paused).toBe(true);
  expect(result.command).toBeUndefined();
  expect(result.terminated).toBe(1);
  expect(serializeFourArmyArchive(map, result.commands, result.state).ok).toBe(true);
});

test('real Worker compares 32-board capacity candidates and cancels a crowded 64-unit request', async ({ page, browserName }, testInfo) => {
  await page.goto('/');
  await page.addScriptTag({ content: library });
  const result = await page.evaluate(
    async ({ workerCode }) => {
      const lib = (window as unknown as { FourArmyCpuLib: { FourArmyCpuPlanner: typeof FourArmyCpuPlanner; fourArmyCapacityFixture: typeof fourArmyCapacityFixture } })
        .FourArmyCpuLib;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      const rows: { cap: number; crowded: boolean; actor: string; sample: number; cold: boolean; elapsedMs: number }[] = [];
      let terminated = 0,
        created = 0;
      const factory = () => {
        const w = new Worker(url),
          end = w.terminate.bind(w);
        created++;
        w.terminate = () => {
          terminated++;
          end();
        };
        return w;
      };
      for (const cap of [8, 12, 16]) {
        const planner = new lib.FourArmyCpuPlanner(factory);
        let cold = true;
        try {
          for (const crowded of [false, true])
            for (const actor of ['army1', 'army2', 'army3', 'army4'] as const) {
              const { state } = lib.fourArmyCapacityFixture(cap, crowded, actor);
              for (let sample = 0; sample < 2; sample++) {
                const start = performance.now(),
                  command = await planner.plan(state, { difficulty: 'hard', policy: 'balanced' });
                if (!command || command.actor !== actor) throw Error('Capacity probe failed');
                rows.push({ cap, crowded, actor, sample, cold, elapsedMs: performance.now() - start });
                cold = false;
              }
            }
        } finally {
          planner.cancel();
        }
      }
      const planner = new lib.FourArmyCpuPlanner(factory),
        stress = lib.fourArmyCapacityFixture(16, true).state;
      let timer = false;
      const timerDone = new Promise<void>((resolve) =>
        setTimeout(() => {
          timer = true;
          resolve();
        }, 0),
      );
      await planner.plan(stress, { difficulty: 'hard', policy: 'defensive' });
      await timerDone;
      const pending = planner.plan(stress, { difficulty: 'hard', policy: 'defensive' }),
        started = performance.now();
      planner.cancel();
      const cancelled = await pending,
        cancelMs = performance.now() - started;
      URL.revokeObjectURL(url);
      return { rows, cancelled, cancelMs, timer, created, terminated };
    },
    { workerCode },
  );
  expect(result.cancelled).toBeUndefined();
  expect(result.cancelMs).toBeLessThan(250);
  expect(result.timer).toBe(true);
  expect(result.terminated).toBe(result.created);
  expect(result.rows).toHaveLength(48);
  expect(result.rows.every((r) => r.elapsedMs < 2000)).toBe(true);
  const summaries = [8, 12, 16].map((cap) => {
    const times = result.rows
      .filter((r) => r.cap === cap && !r.cold)
      .map((r) => r.elapsedMs)
      .sort((a, b) => a - b);
    return {
      cap,
      totalUnits: cap * 4,
      p50: times[Math.ceil(times.length * 0.5) - 1],
      p95: times[Math.ceil(times.length * 0.95) - 1],
      max: times.at(-1),
      cold: result.rows.find((r) => r.cap === cap && r.cold)!.elapsedMs,
    };
  });
  const report = { schemaVersion: 1, phase: 'four-army-capacity-worker', browser: browserName, summaries, cancelMs: result.cancelMs, rows: result.rows };
  await writeFile(testInfo.outputPath('four-army-capacity.json'), JSON.stringify(report, null, 2));
  console.info(JSON.stringify({ ...report, rows: undefined }));
});

test('real Worker advances the published 32 board with cap16 and verifies v2 command history', async ({ page }) => {
  const made = createFourArmyMap32();
  if (!made.ok) throw Error(made.error);
  const initial = createFourArmyState(made.value);
  if (!initial.ok) throw Error(initial.error);
  await page.goto('/');
  await page.addScriptTag({ content: library });
  const result = await page.evaluate(
    async ({ state, workerCode }) => {
      const Session = (window as unknown as { FourArmyCpuLib: { FourArmyCpuSession: typeof FourArmyCpuSession } }).FourArmyCpuLib.FourArmyCpuSession;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      const session = new Session(state, () => new Worker(url));
      session.resume();
      try {
        for (let i = 0; i < 96; i++) await session.step();
        return { state: session.state, commands: session.commands };
      } finally {
        session.stop();
        URL.revokeObjectURL(url);
      }
    },
    { state: initial.value, workerCode },
  );
  expect(result.state.engineVersion).toBe(2);
  expect(result.state.setup).toEqual(made.value.setup);
  expect(new Set(result.commands.map((c) => c.actor)).size).toBe(4);
  expect(result.state.units.every((u) => result.state.units.filter((v) => v.owner === u.owner).length <= 16)).toBe(true);
  const archived = serializeFourArmyArchive(made.value, result.commands, result.state);
  expect(archived.ok).toBe(true);
  if (archived.ok) expect(JSON.parse(archived.value).schemaVersion).toBe(2);
});
