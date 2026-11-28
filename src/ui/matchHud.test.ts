import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './locale';
import { renderMatchActionBar, renderTurnProgress } from './matchHud';
import { armyCountLabel, classicVariant, multiplayerCardId, multiplayerName, multiplayerOnlyMaps, multiplayerSize, multiplayerVariant, renderMatchVariants } from './matchVariants';

afterEach(() => {
  setLocale('ja');
  document.body.replaceChildren();
});

describe('shared match screen controls', () => {
  it('distinguishes the two ways to play with two armies and keeps a fixed layout at four', () => {
    setLocale('en');
    expect(multiplayerVariant('skirmish')).toBe('compact');
    expect(multiplayerVariant('outpost')).toBe('outpost');
    expect(multiplayerVariant('islands')).toBeUndefined();
    expect(classicVariant('outpost')).toBe('outpost');
    expect(classicVariant('frontier')).toBeUndefined();
    expect(multiplayerOnlyMaps.map(multiplayerCardId)).toEqual(['multiplayer:strait', 'multiplayer:frontier', 'multiplayer:wide']);
    expect(multiplayerName('strait')).toBe('Cross Strait');
    expect(multiplayerSize('strait')).toEqual({ width: 17, height: 15 });
    expect(multiplayerSize('frontier')).toEqual({ width: 32, height: 32 });
    expect(multiplayerSize('wide')).toEqual({ width: 32, height: 32 });
    expect(multiplayerSize('outpost')).toEqual({ width: 18, height: 14 });
    expect(armyCountLabel('wide')).toBe('Fixed 4 armies');
    expect(armyCountLabel('compact')).toBe('2–4 armies');
    document.body.innerHTML = renderMatchVariants('compact', 'standard', 'variants');
    const radios = () => Array.from(document.querySelectorAll<HTMLInputElement>('#variants input[type=radio]'));
    expect(radios().find((radio) => radio.checked)?.value).toBe('standard');
    expect(radios().map((radio) => radio.value)).toEqual(['standard', '2', '3', '4']);
    document.body.innerHTML = renderMatchVariants('wide', 4, 'variants');
    expect(radios().map((radio) => radio.value)).toEqual(['4']);
  });

  it('renders only the supplied command controls and escapes display content', () => {
    setLocale('en');
    document.body.innerHTML =
      renderTurnProgress('A < B', { id: 'turn', hint: 'Use <here>', action: '<button id="board-end">End turn</button>', tone: 'player' }) +
      renderMatchActionBar([
        { label: 'Unit <1>', id: 'ready', count: 1, icon: '▶', enabled: false },
        { label: 'End turn', command: 'endTurn', primary: true },
      ]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('A < BUse <here>');
    expect(document.querySelector('#board-end')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#ready')?.disabled).toBe(true);
    expect(document.querySelector('.mobile-action-primary')?.getAttribute('data-quick-action')).toBe('endTurn');
    expect(document.querySelector('nav')?.getAttribute('aria-label')).toBe('Quick actions');
    expect(renderTurnProgress('Ready')).not.toContain('<button');
  });
});
