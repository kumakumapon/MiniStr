export const FOUR_ARMY_CPU_VERSION = 'four-army-cpu-v4' as const;
/** Explicit for new games and user-requested upgrades; legacy API defaults stay pinned. */
export const FOUR_ARMY_LATEST_CPU_VERSION = 'four-army-cpu-v7' as const;
export type FourArmyCpuVersion =
  'four-army-cpu-v1' | 'four-army-cpu-v2' | 'four-army-cpu-v3' | typeof FOUR_ARMY_CPU_VERSION | 'four-army-cpu-v5' | 'four-army-cpu-v6' | typeof FOUR_ARMY_LATEST_CPU_VERSION;
export const isFourArmyCpuVersion = (v: unknown): v is FourArmyCpuVersion =>
  v === 'four-army-cpu-v1' ||
  v === 'four-army-cpu-v2' ||
  v === 'four-army-cpu-v3' ||
  v === FOUR_ARMY_CPU_VERSION ||
  v === 'four-army-cpu-v5' ||
  v === 'four-army-cpu-v6' ||
  v === FOUR_ARMY_LATEST_CPU_VERSION;

export const isFourArmyCpuCompatible = (version: FourArmyCpuVersion, matchVersion?: 1 | 2): boolean =>
  matchVersion === 2
    ? version === 'four-army-cpu-v6' || version === FOUR_ARMY_LATEST_CPU_VERSION
    : matchVersion === 1
      ? ['four-army-cpu-v5', 'four-army-cpu-v6', FOUR_ARMY_LATEST_CPU_VERSION].includes(version)
      : true;
