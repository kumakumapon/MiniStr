import { chooseCpuAction } from '../ai';
import type { CpuPlan } from './cpuPlanner';

// Only the deterministic CPU decision runs here. Persistence, audio and DOM stay on the UI thread.
self.onmessage = (event: MessageEvent<CpuPlan>) => {
  const { state, difficulty, side, policy } = event.data;
  self.postMessage(chooseCpuAction(state, difficulty, side, policy));
};
