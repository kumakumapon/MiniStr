import { expect } from '@playwright/test';
import { build } from 'vite';
import { test } from './helpers/engineTest';
import { fourCpuMap, fourCpuUnit } from '../../src/ai/fourArmyCpu.fixture';
import { defaultFourArmyCpuSettings } from '../../src/ai/fourArmyCpu';
import { createFourArmyState } from '../../src/game/fourArmyEngine';
import { serializeFourArmyArchive } from '../../src/game/fourArmyArchive';
import { FOUR_ARMY_IDS } from '../../src/game/fourArmyFoundation';
import type { FourArmyCpuSession } from '../../src/ui/fourArmyCpuSession';

let library: string, workerCode: string;
async function bundle(entry: string, name: string): Promise<string> {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, target: 'es2022', lib: { entry, formats: ['iife'], name } } });
  for (const output of Array.isArray(result) ? result : [result])
    if ('output' in output) for (const chunk of output.output) if (chunk.type === 'chunk' && chunk.isEntry) return chunk.code;
  throw Error('Worker test bundle missing');
}
test.beforeAll(async () => {
  [library, workerCode] = await Promise.all([bundle('src/ui/fourArmyCpuSession.ts', 'FourArmyCpuLib'), bundle('src/ui/fourArmyCpuWorker.ts', 'FourArmyCpuWorkerLib')]);
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
