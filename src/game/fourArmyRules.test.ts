import { expect, it } from 'vitest';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { createFourArmyMap32 } from './fourArmyMap32';
import { applyFourArmyCommand, createFourArmyState, isFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from './fourArmyEngine';
import { fourArmyPlanningView, isFourArmyObservation } from '../ai/fourArmyObservation';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { fourArmyControllers } from './fourArmyControl';
import { unitStats } from './units';
import { packFourArmyCommands, unpackFourArmyCommands } from './fourArmyCommandLog';
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const map = (tactics = true) => value(createFourArmyMap32(42, undefined, 1, { version: 1, tactics }));
const state = (tactics = true) => value(createFourArmyState(map(tactics)));
const actor = (s: FourArmyState) => s.round.order[s.round.index]!;
const end = (s: FourArmyState) => value(applyFourArmyCommand(s, { type: 'endTurn', actor: actor(s) }));

it('keeps old maps at engine 2 and enables explicit immutable engine 3 rules', () => {
  expect(value(createFourArmyState(value(createFourArmyMap32()))).engineVersion).toBe(2);
  const s = state();
  expect(s.engineVersion).toBe(3);
  for (const viewer of FOUR_ARMY_IDS) {
    const o = value(observeFourArmy(s, viewer));
    expect(isFourArmyObservation(o)).toBe(true);
    expect(fourArmyPlanningView(o).ruleVersion).toBe(14);
    expect(fourArmyPlanningView(o).tactics?.options.submarines).toBe(false);
  }
  const forged = structuredClone(s);
  forged.engineVersion = 2;
  expect(isFourArmyState(forged)).toBe(false);
  expect(createFourArmyState({ ...map(), rules: { version: 1, tactics: true, extra: 1 } }).ok).toBe(false);
});
it('keeps scans and repair budgets private and expires a scan once at the owning turn end', () => {
  let s = state();
  const before = structuredClone(s);
  expect(applyFourArmyCommand(s, { actor: 'army1', type: 'recon', center: { x: 99, y: 1 } }).ok).toBe(false);
  expect(s).toEqual(before);
  s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'recon', center: { x: 16, y: 16 } }));
  expect(s.extensions!.recon.army1.remaining).toBe(1);
  const own = value(observeFourArmy(s, 'army1'));
  expect(own.visible).toContainEqual({ x: 16, y: 16 });
  expect(isFourArmyObservation(own)).toBe(true);
  s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'repairReserve', amount: 1234 }));
  const other = value(observeFourArmy(s, 'army2'));
  expect(other.extensions!.repairReserve).toBe(0);
  expect(other.extensions!.recon).toEqual({ remaining: 2, centers: [] });
  expect(isFourArmyObservation(other)).toBe(true);
  s = end(s);
  expect(s.extensions!.recon.army1).toEqual({ remaining: 1, centers: [] });
  expect(s.extensions!.repairReserve.army1).toBe(1234);
});
it('charges only the engineer owner and removes an enemy fort on entry using real army IDs', () => {
  const m = map(false);
  m.units[0] = { ...m.units[0]!, kind: 'engineer', fuel: unitStats.engineer.fuel, ammo: unitStats.engineer.ammo };
  let s = value(createFourArmyState(m));
  const before = s.players.army1.gold;
  s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'fortify', unitId: m.units[0]!.id }));
  expect(s.players.army1.gold).toBe(before - 500);
  expect(s.players.army2.gold).toBe(10000);
  expect(s.extensions!.fortifications).toEqual([{ owner: 'army1', position: { x: 4, y: 4 } }]);
  expect(s.units[0]!.hasActed).toBe(true);
  s = end(s);
  const engineer = s.units.find((u) => u.id === m.units[0]!.id)!;
  engineer.position = { x: 3, y: 4 };
  const invader = s.units.find((u) => u.owner === 'army2' && u.kind === 'infantry')!;
  invader.position = { x: 4, y: 3 };
  expect(isFourArmyState(s)).toBe(true);
  s = value(applyFourArmyCommand(s, { actor: 'army2', type: 'move', unitId: invader.id, destination: { x: 4, y: 4 } }));
  expect(s.extensions!.fortifications).toEqual([]);
});
it('resolves a hidden ambush once and expires preparations on the owner’s next turn', () => {
  let s = state();
  s.units = FOUR_ARMY_IDS.map((a) => s.units.find((u) => u.owner === a && u.kind === 'tank')!);
  const mover = s.units.find((u) => u.owner === 'army1')!;
  const defender = s.units.find((u) => u.owner === 'army2')!;
  mover.position = { x: 4, y: 4 };
  defender.position = { x: 8, y: 4 };
  defender.ambush = 0;
  defender.hasActed = true;
  defender.hasMoved = true;
  expect(isFourArmyState(s)).toBe(true);
  const o = value(observeFourArmy(s, 'army1'));
  expect(o.units.some((u) => u.id === defender.id)).toBe(false);
  s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: mover.id, destination: { x: 8, y: 4 } }));
  expect(s.units.find((u) => u.id === mover.id)!.position).toEqual({ x: 7, y: 4 });
  expect(s.units.find((u) => u.id === mover.id)!.hp).toBeLessThan(100);
  expect(value(observeFourArmy(s, 'army1')).units.find((u) => u.id === defender.id)).not.toHaveProperty('ambush');
  s = end(s);
  expect(s.units.find((u) => u.id === defender.id)).not.toHaveProperty('ambush');
});
it('round-trips new commands with the new archive and refuses legacy command encoding', () => {
  const m = map();
  let s = value(createFourArmyState(m));
  const commands: FourArmyCommand[] = [
    { actor: 'army1', type: 'repairReserve', amount: 1000 },
    { actor: 'army1', type: 'logistics', unitId: 'u1', order: { priority: true, resource: 'fuel', repair: false } },
    { actor: 'army1', type: 'recon', center: { x: 16, y: 16 } },
    { actor: 'army1', type: 'ambush', unitId: 'u1', weaponSlot: 0 },
  ];
  for (const c of commands) s = value(applyFourArmyCommand(s, c));
  const packed = packFourArmyCommands(commands);
  expect(packed.encoding).toBe('four-army-log-v2');
  expect(unpackFourArmyCommands(packed)).toEqual({ ok: true, value: commands });
  expect(unpackFourArmyCommands({ ...packed, encoding: 'four-army-log-v1' }).ok).toBe(false);
  const save: FourArmySpectatorSave = {
    format: 'ministr-four-army-configurable',
    schemaVersion: 3,
    controllers: fourArmyControllers(['army1', 'army2']),
    cpuVersion: 'four-army-cpu-v4',
    name: 'New rules',
    savedAt: '2026-11-15T00:00:00.000Z',
    settings: defaultFourArmyCpuSettings(),
    view: 'army1',
    speed: 1,
    archive: { format: 'ministr-four-army-save', schemaVersion: 3, ruleset: 'four-army-v3', payload: { map: m, commands, state: s } },
  };
  const raw = value(serializeFourArmySpectatorSave(save));
  expect(parseFourArmySpectatorSave(raw)).toEqual({ ok: true, value: save });
  expect(parseFourArmySpectatorSave(JSON.stringify({ ...JSON.parse(raw), schemaVersion: 2 })).ok).toBe(false);
});
it('runs the current CPU on new observations and keeps all three opponents separate', () => {
  let s = state();
  const settings = defaultFourArmyCpuSettings();
  for (let i = 0; i < 80 && s.outcome.type === 'ongoing'; i++) {
    const a = actor(s);
    const o = value(observeFourArmy(s, a));
    expect(isFourArmyObservation(o)).toBe(true);
    const command = chooseFourArmyCpuCommand(o, settings[a], 'four-army-cpu-v4');
    expect(command).toBeDefined();
    s = value(applyFourArmyCommand(s, command));
    expect(isFourArmyState(s)).toBe(true);
  }
});

it('rejects malformed rule state without throwing or consuming commands', () => {
  const invalid = [
    (s: FourArmyState) => {
      s.extensions!.repairReserve.army1 = -1;
    },
    (s: FourArmyState) => {
      s.extensions!.weatherSeed = -1;
    },
    (s: FourArmyState) => {
      s.extensions!.recon.army1.remaining = 3;
    },
    (s: FourArmyState) => {
      s.extensions!.recon.army2.centers = [{ x: 1, y: 1 }];
    },
    (s: FourArmyState) => {
      s.extensions!.recon.army1 = {
        remaining: 0,
        centers: [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
      };
    },
    (s: FourArmyState) => {
      s.extensions!.fortifications = [{ owner: 'army1', position: { x: 8, y: 8 } }];
    },
    (s: FourArmyState) => {
      s.extensions!.fortifications = [
        { owner: 'army1', position: { x: 1, y: 1 } },
        { owner: 'army2', position: { x: 1, y: 1 } },
      ];
    },
    (s: FourArmyState) => {
      s.extensions!.fortifications = [1, 2, 3, 4, 6].map((x) => ({ owner: 'army1', position: { x, y: 1 } }));
    },
    (s: FourArmyState) => {
      s.units[0]!.logistics = { priority: true, resource: 'oil', repair: true } as never;
    },
    (s: FourArmyState) => {
      s.extensions!.fortifications = [{ owner: 'army1', position: { x: 1, y: 1 } }];
      s.units[0]!.kind = 'unknown' as never;
    },
  ];
  for (const change of invalid) {
    const s = state();
    change(s);
    expect(isFourArmyState(s)).toBe(false);
  }
});
it('never exports enemy orders or preparations and rejects private fields injected into observations', () => {
  const s = state();
  const enemy = s.units.find((u) => u.owner === 'army2')!;
  enemy.position = { x: 7, y: 4 };
  enemy.ambush = 0;
  enemy.hasActed = true;
  enemy.hasMoved = true;
  enemy.logistics = { priority: true, resource: 'fuel', repair: false };
  const o = value(observeFourArmy(s, 'army1'));
  const seen = o.units.find((u) => u.id === enemy.id)!;
  expect(seen).toBeDefined();
  expect(seen).not.toHaveProperty('ambush');
  expect(seen).not.toHaveProperty('logistics');
  expect(isFourArmyObservation(o)).toBe(true);
  seen.ambush = 0;
  expect(isFourArmyObservation(o)).toBe(false);
});
it('accounts for all 16 real-army fortifications without the legacy two-army cap', async () => {
  const { rotateFourArmy32 } = await import('./fourArmyMap32');
  const s = state();
  s.extensions!.fortifications = FOUR_ARMY_IDS.flatMap((owner, rotation) => [1, 2, 3, 4].map((x) => ({ owner, position: rotateFourArmy32({ x, y: 1 }, rotation) })));
  expect(isFourArmyState(s)).toBe(true);
  for (const a of FOUR_ARMY_IDS) expect(isFourArmyObservation(value(observeFourArmy(s, a)))).toBe(true);
});
