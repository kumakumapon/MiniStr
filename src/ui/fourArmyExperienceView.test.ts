import { expect, it } from 'vitest';
import { renderFourArmyHistory, renderFourArmyResult, fourArmyEventSound, fourArmyEventText } from './fourArmyExperienceView';
import { emptyFourArmyExperience } from '../game/fourArmyExperience';
import { fourArmyControllers } from '../game/fourArmyControl';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { setLocale } from './locale';
it('never renders future contacts or other armies histories at an earlier replay position', () => {
  setLocale('en');
  const e = emptyFourArmyExperience();
  e.sightings.army1.push({ unitId: 'u9', owner: 'army2', kind: 'infantry', hp: 50, position: { x: 10, y: 10 }, round: 2, at: 8 });
  e.events.army2.push({ actor: 'army1', at: 2, round: 1, type: 'recon', to: { x: 2, y: 2 } });
  expect(renderFourArmyHistory(e, 'army1', 7).contacts).not.toContain('data-four-sighting');
  expect(renderFourArmyHistory(e, 'army1', 8).contacts).toContain('data-four-sighting="10,10"');
  expect(renderFourArmyHistory(e, 'army1', 8).events).not.toContain('reconnaissance');
  expect(renderFourArmyHistory(e, 'all', 8).contacts).not.toContain('data-four-sighting');
});
it('keeps results private until the whole match ends and excludes replay rematches', () => {
  setLocale('en');
  const state = fourArmySpectatorFixture().archive.payload.state,
    controllers = fourArmyControllers(['army1']);
  expect(renderFourArmyResult(state, controllers, 0, false, false)).toBe('');
  state.outcome = { type: 'victory', winner: 'army4' };
  state.eliminations = [
    { army: 'army1', round: 4 },
    { army: 'army2', round: 5 },
    { army: 'army3', round: 6 },
  ];
  const html = renderFourArmyResult(state, controllers, 100, false, false);
  expect(html).toContain('Army 4 wins');
  expect(html).toContain('R4 eliminated');
  expect(html).toContain('four-rematch');
  expect(renderFourArmyResult(state, controllers, 100, true, false)).not.toContain('id="four-rematch"');
  expect(renderFourArmyResult(state, controllers, 100, false, true)).toContain('class="four-primary" disabled');
  state.outcome = { type: 'draw' };
  setLocale('ja');
  expect(renderFourArmyResult(state, controllers, 100, false, false)).toContain('引き分け');
});
it('labels visible departures and maps only visible action feedback to bounded sound cues', () => {
  setLocale('en');
  const event = { actor: 'army2', at: 1, round: 1, type: 'move', unitKind: 'infantry', from: { x: 3, y: 1 } } as const;
  expect(fourArmyEventText(event)).toContain('no longer observed');
  expect(fourArmyEventSound(event)).toBe('move');
  expect(fourArmyEventSound({ ...event, type: 'endTurn' })).toBeUndefined();
  expect(fourArmyEventSound({ ...event, type: 'attack' })).toBe('attack');
});
