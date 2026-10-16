import type { UnitKind } from '../game';
import type { BattleScene } from './battleScene';

export type BattleSound = 'fire' | 'impact' | 'destroy';
export type BattleSoundPlayer = (cue: BattleSound, kind: UnitKind) => (() => void) | undefined;

/** Matches the .62s / 1.12s impact flashes in the battle tableau CSS. */
export function playBattleSceneAudio(scene: BattleScene, play: BattleSoundPlayer): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stops: (() => void)[] = [];
  const schedule = (delay: number, cue: BattleSound, kind: UnitKind) => {
    timers.push(
      setTimeout(() => {
        const stop = play(cue, kind);
        if (stop) stops.push(stop);
      }, delay),
    );
  };
  schedule(350, 'fire', scene.attacker.kind);
  if (scene.defender.hpAfter < scene.defender.hpBefore) {
    schedule(620, scene.defender.hpAfter === 0 ? 'destroy' : 'impact', scene.defender.kind);
  }
  if (scene.attacker.hpAfter < scene.attacker.hpBefore) {
    schedule(920, 'fire', scene.defender.kind);
    schedule(1120, scene.attacker.hpAfter === 0 ? 'destroy' : 'impact', scene.attacker.kind);
  }
  return () => {
    timers.forEach(clearTimeout);
    stops.forEach((stop) => stop());
  };
}
