import { describe, expect, it } from 'vitest';
import { applyFourArmyCommand, applyFourArmyCommandWithCombat, createFourArmyState, type FourArmyCommand } from './fourArmyEngine';
import { fourArmyCombatMap, fourArmyCombatState } from './fourArmyCombat.fixture';
import { fourArmyBattleIsVisible } from '../ui/fourArmyBattleScene';
import { renderBattleScene } from '../ui/battleScene';
import { setLocale } from '../ui/locale';
import { FourArmyReplay } from '../ui/fourArmyReplay';
describe('resolved four-army combat presentation', () => {
  it.each([false, true])('uses authoritative HP, weapons, counterfire and unchanged state/RNG (tactics=%s)', (tactics) => {
    const before = fourArmyCombatState(tactics),
      original = structuredClone(before);
    const command: FourArmyCommand = { actor: 'army1', type: 'attack', unitId: 'a1', targetId: 'a2' };
    const legacy = applyFourArmyCommand(before, command),
      shown = applyFourArmyCommandWithCombat(before, command);
    if (!shown.ok || !legacy.ok) throw Error('Combat fixture failed');
    expect(shown.value).toEqual(legacy.value);
    expect(Object.keys(legacy).sort()).toEqual(['ok', 'value']);
    expect(before).toEqual(original);
    expect(shown.combat?.attacker).toMatchObject({
      owner: 'army1',
      unitId: 'a1',
      hpBefore: 100,
      hpAfter: shown.value.units.find((u) => u.id === 'a1')?.hp ?? 0,
      weapon: 'tankCannon',
    });
    expect(shown.combat?.defender).toMatchObject({ owner: 'army2', unitId: 'a2', hpAfter: shown.value.units.find((u) => u.id === 'a2')?.hp ?? 0 });
    expect(shown.combat?.simultaneous).toBe(tactics ? true : undefined);
    expect(fourArmyBattleIsVisible(shown.combat!, before, shown.value, 'army1')).toBe(true);
    expect(fourArmyBattleIsVisible(shown.combat!, before, shown.value, 'army4')).toBe(false);
    expect(fourArmyBattleIsVisible(shown.combat!, before, shown.value, 'all')).toBe(true);
    expect(JSON.stringify(shown.value)).not.toContain('hpBefore');
  });
  it('preserves the fatal combat before elimination removes units and restores a cached single replay step', async () => {
    const map = fourArmyCombatMap();
    map.units[1]!.hp = 1;
    const initial = createFourArmyState(map);
    if (!initial.ok) throw Error(initial.error);
    const commands: FourArmyCommand[] = [{ actor: 'army1', type: 'attack', unitId: 'a1', targetId: 'a2' }];
    const done = applyFourArmyCommandWithCombat(initial.value, commands[0]);
    if (!done.ok) throw Error(done.error);
    expect(done.value.alive).not.toContain('army2');
    expect(done.combat?.defender.hpAfter).toBe(0);
    const replay = new FourArmyReplay(map, commands, [{ position: 1, state: done.value }]);
    await replay.seek(1);
    expect(replay.lastCombat).toEqual(done.combat);
    await replay.seek(0);
    expect(replay.lastCombat).toBeUndefined();
    await replay.seek(1);
    expect(replay.lastCombat).toEqual(done.combat);
  });
  it('extracts ambush from a resolved move rather than guessing who fired', () => {
    const map = fourArmyCombatMap(true);
    map.order = ['army2', 'army1', 'army3', 'army4'];
    map.units[0]!.position = { x: 0, y: 2 };
    map.units[1]!.position = { x: 4, y: 2 };
    let r = createFourArmyState(map);
    if (!r.ok) throw Error(r.error);
    r = applyFourArmyCommand(r.value, { actor: 'army2', type: 'ambush', unitId: 'a2' });
    if (!r.ok) throw Error(r.error);
    r = applyFourArmyCommand(r.value, { actor: 'army2', type: 'endTurn' });
    if (!r.ok) throw Error(r.error);
    const shown = applyFourArmyCommandWithCombat(r.value, { actor: 'army1', type: 'move', unitId: 'a1', destination: { x: 4, y: 2 } });
    if (!shown.ok) throw Error(shown.error);
    expect(shown.combat?.ambush).toBe(true);
    expect(shown.combat?.attacker).toMatchObject({ owner: 'army2', unitId: 'a2' });
    expect(shown.combat?.defender).toMatchObject({ owner: 'army1', unitId: 'a1', position: { x: 3, y: 2 } });
  });
  it('withholds a battle when an observer can identify only one combatant', () => {
    const before = fourArmyCombatState();
    before.units.find((u) => u.owner === 'army4')!.position = { x: 0, y: 2 };
    const done = applyFourArmyCommandWithCombat(before, { actor: 'army1', type: 'attack', unitId: 'a1', targetId: 'a2' });
    if (!done.ok || !done.combat) throw Error('No combat');
    expect(fourArmyBattleIsVisible(done.combat, before, done.value, 'army4')).toBe(false);
  });
  it('retains the actual third/fourth army names and badges in both languages', () => {
    const before = fourArmyCombatState();
    const done = applyFourArmyCommandWithCombat(before, { actor: 'army1', type: 'attack', unitId: 'a1', targetId: 'a2' });
    if (!done.ok || !done.combat) throw Error('No combat');
    const scene = { ...done.combat, attacker: { ...done.combat.attacker, owner: 'army3' as const }, defender: { ...done.combat.defender, owner: 'army4' as const } };
    for (const locale of ['ja', 'en'] as const) {
      setLocale(locale);
      const html = renderBattleScene(scene);
      expect(html).toContain(locale === 'ja' ? '第3軍' : 'Army 3');
      expect(html).toContain('battle-team-army4');
      expect(html).toContain('◆');
      expect(html).toContain('▲');
    }
    setLocale('ja');
  });
});
