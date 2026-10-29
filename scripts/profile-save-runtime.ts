/** node --expose-gc node_modules/vite-node/vite-node.mjs scripts/profile-save-runtime.ts */
import { performance } from 'node:perf_hooks';
import { createScenarioInitialState, loadScenarioDefinitions } from '../src/game/maps';
import { applyGameCommand, type GameCommand } from '../src/game/session';
import type { GameState } from '../src/game/types';
import { UndoHistory } from '../src/ui/undoHistory';
if (!global.gc) throw Error('Requires --expose-gc');
const rows = [];
for (const size of [16, 32])
  for (let cycle = 0; cycle < 4; cycle++)
    for (const variant of cycle % 2 ? ['bounded', 'array'] : ['array', 'bounded']) {
      const loaded = loadScenarioDefinitions([
        {
          id: 'undo-profile',
          name: 'Undo profile',
          briefing: '',
          startingGold: 0,
          board: { width: size, height: size, cells: [] },
          turnLimit: 1000,
          initialUnits: [
            { kind: 'infantry', owner: 'red', x: 0, y: 0 },
            { kind: 'infantry', owner: 'blue', x: size - 1, y: size - 1 },
          ],
          victoryConditions: [{ type: 'eliminate' }],
          defeatConditions: [{ type: 'eliminate' }],
        },
      ]);
      if (!loaded.ok) throw Error(loaded.error);
      const initial = createScenarioInitialState(loaded.value[0]!);
      const commands: GameCommand[] = [];
      const holder: { history?: { push(entry: { state: GameState; commandCount: number }): unknown; pop(): { state: GameState; commandCount: number } | undefined } } = {};
      global.gc();
      const before = process.memoryUsage().heapUsed;
      holder.history =
        variant === 'array'
          ? []
          : new UndoHistory(
              () => initial,
              () => commands,
            );
      let state = initial;
      for (let i = 0; i < 1000; i++) {
        holder.history.push({ state, commandCount: commands.length });
        const command: GameCommand = { type: 'endTurn' };
        const result = applyGameCommand(state, command);
        if (!result.ok) throw Error(result.error);
        state = result.value;
        commands.push(command);
      }
      global.gc();
      const retainedBytes = process.memoryUsage().heapUsed - before;
      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        const entry = holder.history.pop()!;
        if (entry.state.turn !== Math.floor(entry.commandCount / 2) + 1) throw Error('Undo mismatch');
        commands.length = entry.commandCount;
      }
      const undoMs = performance.now() - start;
      delete holder.history;
      global.gc();
      rows.push({ size, cycle, variant, retainedBytes, undoMs, afterReleaseBytes: process.memoryUsage().heapUsed - before });
    }
console.log(JSON.stringify({ node: process.version, commands: 1000, undos: 20, warmupCycles: 1, rows }, null, 2));
