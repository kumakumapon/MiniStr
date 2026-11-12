import { FourArmyCpuSession } from './fourArmyCpuSession';
import { defaultFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import type { FourArmyState } from '../game/fourArmyEngine';

/** Browser integration point for the future four-army spectator screen. */
export function createFourArmyCpuSession(state: FourArmyState, settings: FourArmyCpuSettings = defaultFourArmyCpuSettings()): FourArmyCpuSession {
  return new FourArmyCpuSession(state, () => new Worker(new URL('./fourArmyCpuWorker.ts', import.meta.url), { type: 'module' }), settings);
}
