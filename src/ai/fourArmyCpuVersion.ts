export const FOUR_ARMY_CPU_VERSION = 'four-army-cpu-v2' as const;
export type FourArmyCpuVersion = 'four-army-cpu-v1' | typeof FOUR_ARMY_CPU_VERSION;
export const isFourArmyCpuVersion = (v: unknown): v is FourArmyCpuVersion => v === 'four-army-cpu-v1' || v === FOUR_ARMY_CPU_VERSION;
