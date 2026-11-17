export const FOUR_ARMY_CPU_VERSION = 'four-army-cpu-v4' as const;
export type FourArmyCpuVersion = 'four-army-cpu-v1' | 'four-army-cpu-v2' | 'four-army-cpu-v3' | typeof FOUR_ARMY_CPU_VERSION | 'four-army-cpu-v5' | 'four-army-cpu-v6';
export const isFourArmyCpuVersion = (v: unknown): v is FourArmyCpuVersion =>
  v === 'four-army-cpu-v1' || v === 'four-army-cpu-v2' || v === 'four-army-cpu-v3' || v === FOUR_ARMY_CPU_VERSION || v === 'four-army-cpu-v5' || v === 'four-army-cpu-v6';
