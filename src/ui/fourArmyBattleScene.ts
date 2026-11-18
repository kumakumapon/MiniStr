import { observeFourArmy, type FourArmyState } from '../game/fourArmyEngine';
import type { FourArmyExperienceView } from '../game/fourArmyExperience';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { CombatSummary } from '../game/combatSummary';
import { BATTLE_SCENE_DURATION_MS, renderBattleScene, type BattleScene } from './battleScene';
import { renderBattleSceneSetting } from './battleSceneSettings';

/** A scene must not disclose a participant that neither restricted observation knows. */
export function fourArmyBattleIsVisible(scene: CombatSummary<FourArmyId>, before: FourArmyState, after: FourArmyState, view: FourArmyExperienceView): boolean {
  if (view === 'all') return true;
  const observations = [observeFourArmy(before, view), observeFourArmy(after, view)].flatMap((o) => (o.ok ? [o.value] : []));
  return [scene.attacker, scene.defender].every((p) =>
    observations.some((o) => o.units.some((u) => u.id === p.unitId && u.position && (u.owner === view || (u.position.x === p.position.x && u.position.y === p.position.y)))),
  );
}

interface Dependencies {
  pause: () => void;
  menu: () => void;
  disable: () => void;
  sound?: (scene: BattleScene) => (() => void) | undefined;
}
/** Owns the modal, audio and one cancellable lifetime, independently of board redraws. */
export class FourArmyBattleScene {
  private host?: HTMLDivElement;
  private timer?: ReturnType<typeof setTimeout>;
  private stopSound?: () => void;
  private settled?: () => void;
  private pending?: Promise<void>;
  private previousFocus?: HTMLElement;
  private previousInert = false;
  constructor(
    private root: HTMLElement,
    private deps: Dependencies,
  ) {}
  get active(): boolean {
    return !!this.host;
  }
  finished(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }
  show(scene: BattleScene, automatic: boolean): void {
    this.dismiss(false);
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.previousInert = this.root.inert === true;
    this.root.inert = true;
    this.host = document.createElement('div');
    this.host.className = 'four-battle-scene';
    this.host.innerHTML = renderBattleScene(scene, automatic);
    this.host.querySelector('.battle-scene')!.insertAdjacentHTML('beforeend', renderBattleSceneSetting('multiArmy', true, 'overlay'));
    document.body.append(this.host);
    this.pending = new Promise<void>((resolve) => {
      this.settled = resolve;
    });
    this.host.querySelector('#battle-scene-skip')!.addEventListener('click', () => this.dismiss());
    this.host.querySelector('#spectate-scene-pause')?.addEventListener('click', () => this.deps.pause());
    this.host.querySelector('#spectate-scene-menu')?.addEventListener('click', () => this.deps.menu());
    this.host.querySelector('input')!.addEventListener('change', () => this.deps.disable());
    this.host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.dismiss();
      }
    });
    this.stopSound = this.deps.sound?.(scene);
    this.timer = setTimeout(() => this.dismiss(), BATTLE_SCENE_DURATION_MS);
    this.host.querySelector<HTMLButtonElement>(automatic ? '#spectate-scene-pause' : '#battle-scene-skip')!.focus({ preventScroll: true });
  }
  dismiss(restoreFocus = true): void {
    if (!this.host) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.stopSound?.();
    this.stopSound = undefined;
    this.host.remove();
    this.host = undefined;
    this.root.inert = this.previousInert;
    const resolve = this.settled;
    this.settled = undefined;
    this.pending = undefined;
    resolve?.();
    if (restoreFocus && !this.root.hidden && !this.root.inert) {
      const focus =
        this.previousFocus?.isConnected && this.root.contains(this.previousFocus)
          ? this.previousFocus
          : this.root.querySelector<HTMLElement>('#four-board [tabindex="0"], #four-menu, #four-heading');
      focus?.focus({ preventScroll: true });
    }
    this.previousFocus = undefined;
  }
}
