import { expect, it, vi } from 'vitest';
import { CpuPlanner } from './cpuPlanner';
import { createScenarioInitialState, maps } from '../game/maps';
import { chooseCpuAction } from '../ai';
const input = () => ({ state: createScenarioInitialState(maps[0]!), difficulty: 'easy' as const, side: 'red' as const, policy: 'balanced' as const });
it('terminates pending computation and ignores late results', async () => {
  const worker = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'] };
  const planner = new CpuPlanner(() => worker as unknown as Worker);
  const pending = planner.plan(input());
  const late = worker.onmessage!;
  planner.cancel();
  expect(await pending).toBeUndefined();
  expect(worker.terminate).toHaveBeenCalledOnce();
  late.call(worker as unknown as Worker, { data: { type: 'endTurn' } } as MessageEvent);
});
it('returns deterministic decisions when workers are unavailable', async () => {
  const planner = new CpuPlanner(() => {
    throw Error('unavailable');
  });
  const request = input();
  expect(await planner.plan(request)).toEqual(chooseCpuAction(request.state, request.difficulty, request.side, request.policy));
});
it('reuses the worker and releases it on errors', async () => {
  const worker = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'] };
  const factory = vi.fn(() => worker as unknown as Worker);
  const planner = new CpuPlanner(factory);
  const pending = planner.plan(input());
  worker.onmessage!.call(worker as unknown as Worker, { data: { type: 'wait', unitId: 'r1' } } as MessageEvent);
  expect(await pending).toEqual({ type: 'wait', unitId: 'r1' });
  const failed = planner.plan(input());
  const assertion = expect(failed).rejects.toThrow('CPU worker failed');
  worker.onerror!.call(worker as unknown as Worker, {} as ErrorEvent);
  await assertion;
  expect(factory).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});
