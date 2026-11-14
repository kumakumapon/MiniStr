import { describe, expect, it } from 'vitest';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { fourArmyDisplay } from './fourArmyBoard';
import { fourArmyBoardCells } from './fourArmyBattleView';
import { fourArmyHumanChoices } from './fourArmyHuman';
import { observeFourArmy } from '../game/fourArmyEngine';

describe('shared four-army board rendering', () => {
  it('renders retained keyboard tiles and shared artwork without leaking unseen contacts', () => {
    const state = fourArmySpectatorFixture().archive.payload.state;
    const observed = observeFourArmy(state, 'army1');
    if (!observed.ok) throw Error(observed.error);
    const source = { x: 4, y: 4 };
    const cells = fourArmyBoardCells(fourArmyDisplay(state, 'army1'), source, source, fourArmyHumanChoices(observed.value, source));
    expect(cells).toHaveLength(1024);
    const root = document.createElement('div');
    root.innerHTML = cells.join('');
    expect(root.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    expect(root.querySelectorAll('.unit')).toHaveLength(8);
    expect(root.querySelectorAll('.unit-art')).toHaveLength(8);
    expect(root.querySelector('.unit.army2')).toBeNull();
    expect(root.querySelectorAll('.fog').length).toBeGreaterThan(0);
    expect(root.querySelector('.selected')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('.reachable').length).toBeGreaterThan(0);
  });
  it('keeps all four army numbers and facilities visible in unrestricted spectator view', () => {
    const state = fourArmySpectatorFixture().archive.payload.state;
    const root = document.createElement('div');
    root.innerHTML = fourArmyBoardCells(fourArmyDisplay(state, 'all'), { x: 3, y: 3 }, undefined, []).join('');
    expect(root.querySelectorAll('.unit')).toHaveLength(32);
    expect(root.querySelectorAll('.fog')).toHaveLength(0);
    for (const army of ['army1', 'army2', 'army3', 'army4']) {
      expect(root.querySelector(`.unit.${army} .unit-owner-marker`)?.textContent).toBe(army.slice(-1));
      expect(root.querySelector(`.facility.${army}`)).not.toBeNull();
    }
  });
});
