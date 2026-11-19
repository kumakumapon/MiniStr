import { BATTLE_SCENE_DURATION_MS, renderBattleScene, type BattleScene } from './battleScene';
import { ACTION_SCENE_DURATION_MS, renderActionScene, type ActionScene } from './actionScene';
import { renderBattleSceneSetting } from './battleSceneSettings';
import { renderActionSceneSetting } from './actionSceneSettings';

interface Dependencies {
  pause: () => void;
  menu: () => void;
  disable: (kind: 'battle' | 'action') => void;
  sound?: (scene: BattleScene) => (() => void) | undefined;
}
/** Owns the modal, audio and one cancellable lifetime, independently of board redraws. */
export class FourArmyTacticalScene {
  private host?: HTMLDivElement;
  private currentKind?: 'battle' | 'action';
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
  get kind(): 'battle' | 'action' | undefined {
    return this.currentKind;
  }
  finished(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }
  show(scene: BattleScene | ActionScene, automatic: boolean): void {
    this.dismiss(false);
    const battle = 'attacker' in scene;
    this.currentKind = battle ? 'battle' : 'action';
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.previousInert = this.root.inert === true;
    this.root.inert = true;
    this.host = document.createElement('div');
    this.host.className = battle ? 'four-battle-scene' : 'four-action-scene';
    this.host.innerHTML = battle ? renderBattleScene(scene, automatic) : renderActionScene(scene, automatic);
    this.host
      .querySelector(battle ? '.battle-scene' : '.action-scene')!
      .insertAdjacentHTML('beforeend', battle ? renderBattleSceneSetting('multiArmy', true, 'overlay') : renderActionSceneSetting('multiArmy', true, 'overlay'));
    document.body.append(this.host);
    this.pending = new Promise<void>((resolve) => {
      this.settled = resolve;
    });
    this.host.querySelector(battle ? '#battle-scene-skip' : '#tactical-scene-skip')!.addEventListener('click', () => this.dismiss());
    this.host.querySelector('#spectate-scene-pause')?.addEventListener('click', () => this.deps.pause());
    this.host.querySelector('#spectate-scene-menu')?.addEventListener('click', () => this.deps.menu());
    this.host.querySelector('input')!.addEventListener('change', () => this.deps.disable(battle ? 'battle' : 'action'));
    this.host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.dismiss();
      }
    });
    this.stopSound = battle ? this.deps.sound?.(scene) : undefined;
    this.timer = setTimeout(() => this.dismiss(), battle ? BATTLE_SCENE_DURATION_MS : ACTION_SCENE_DURATION_MS);
    this.host.querySelector<HTMLButtonElement>(automatic ? '#spectate-scene-pause' : battle ? '#battle-scene-skip' : '#tactical-scene-skip')!.focus({ preventScroll: true });
  }
  dismiss(restoreFocus = true): void {
    if (!this.host) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.stopSound?.();
    this.stopSound = undefined;
    this.host.remove();
    this.host = undefined;
    this.currentKind = undefined;
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
