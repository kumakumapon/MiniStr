import type { UnitKind } from '../game';
import { BATTLE_SCENE_TIMING, type BattleScene } from './battleScene';

export type BattleSound = 'fire' | 'impact' | 'destroy';
export type BattleSoundPlayer = (cue: BattleSound, kind: UnitKind) => (() => void) | undefined;

/** Uses the same millisecond cues as the battle tableau CSS. */
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
  schedule(BATTLE_SCENE_TIMING.fire, 'fire', scene.attacker.kind);
  if (scene.defender.hpAfter < scene.defender.hpBefore) {
    schedule(BATTLE_SCENE_TIMING.impact, scene.defender.hpAfter === 0 ? 'destroy' : 'impact', scene.defender.kind);
  }
  if (scene.attacker.hpAfter < scene.attacker.hpBefore) {
    schedule(BATTLE_SCENE_TIMING.counterFire, 'fire', scene.defender.kind);
    schedule(BATTLE_SCENE_TIMING.counterImpact, scene.attacker.hpAfter === 0 ? 'destroy' : 'impact', scene.attacker.kind);
  }
  return () => {
    timers.forEach(clearTimeout);
    stops.forEach((stop) => stop());
  };
}
