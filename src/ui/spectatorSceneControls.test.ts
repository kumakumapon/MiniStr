import { afterEach, expect, it } from 'vitest';
import { renderSpectatorSceneControls } from './spectatorSceneControls';
import { setLocale } from './locale';
import { renderBattleScene, type BattleScene } from './battleScene';
import { renderActionScene, type ActionScene } from './actionScene';
afterEach(() => setLocale('ja'));

it('keeps pause and menu inside the active combat dialog only in live spectating', () => {
  const scene: BattleScene = {
    attacker: { kind: 'tank', owner: 'red', position: { x: 0, y: 0 }, hpBefore: 100, hpAfter: 80 },
    defender: { kind: 'tank', owner: 'blue', position: { x: 1, y: 0 }, hpBefore: 100, hpAfter: 60 },
    terrain: 'plain',
  };
  expect(renderBattleScene(scene)).not.toContain('spectate-scene-pause');
  document.body.innerHTML = renderBattleScene(scene, true);
  expect(document.querySelector('[role="dialog"] #spectate-scene-pause')).not.toBeNull();
  expect(document.querySelector('[role="dialog"] #spectate-scene-menu')).not.toBeNull();
  expect(document.querySelector('#battle-scene-skip')).not.toBeNull();
});
it('translates both actions without mixing Japanese into English', () => {
  setLocale('ja');
  expect(renderSpectatorSceneControls()).toContain('観戦を一時停止');
  setLocale('en');
  expect(renderSpectatorSceneControls()).toContain('Pause spectating');
  expect(renderSpectatorSceneControls()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
});

it('keeps the same controls available inside capture and logistics dialogs', () => {
  const scenes: ActionScene[] = [
    { kind: 'capture', unitKind: 'infantry', owner: 'red', position: { x: 0, y: 0 }, terrain: 'city', progressBefore: 0, progressAfter: 50, captured: false },
    {
      kind: 'logistics',
      owner: 'blue',
      changes: [{ kind: 'tank', owner: 'blue', position: { x: 0, y: 0 }, source: { type: 'facility', terrain: 'city' }, resources: [{ resource: 'hp', before: 80, after: 100 }] }],
    },
  ];
  for (const scene of scenes) {
    expect(renderActionScene(scene)).not.toContain('spectate-scene-pause');
    document.body.innerHTML = renderActionScene(scene, true);
    expect(document.querySelector('[role="dialog"] #spectate-scene-pause')).not.toBeNull();
    expect(document.querySelector('[role="dialog"] #spectate-scene-menu')).not.toBeNull();
    expect(document.querySelector('#tactical-scene-skip')).not.toBeNull();
  }
});
