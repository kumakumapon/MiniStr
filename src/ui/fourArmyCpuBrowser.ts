import type { FourArmyId } from '../game/fourArmyFoundation';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { defaultFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import type { FourArmyState } from '../game/fourArmyEngine';
import { FOUR_ARMY_CPU_VERSION, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';

/** Browser integration point for the four-army spectator screen. */
export function createFourArmyCpuSession(
  state: FourArmyState,
  settings: FourArmyCpuSettings = defaultFourArmyCpuSettings(),
  cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION,
  humanArmy?: FourArmyId,
): FourArmyCpuSession {
  return new FourArmyCpuSession(state, () => new Worker(new URL('./fourArmyCpuWorker.ts', import.meta.url), { type: 'module' }), settings, cpuVersion, humanArmy);
}
