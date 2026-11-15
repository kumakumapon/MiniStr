import { expect, it } from 'vitest';
import { chooseFourArmyCpuCommand, isObservedFourArmyCommand } from './fourArmyCpu';
import { isFourArmyObservation } from './fourArmyObservation';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyState, type FourArmyObservation } from '../game/fourArmyEngine';
import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import { unitStats } from '../game/units';
import type { UnitKind } from '../game/types';
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function scene(kind: UnitKind = 'infantry'): FourArmyState {
  const s = value(createFourArmyState(value(createFourArmyMap32(42, undefined, 1, { version: 1, tactics: true }))));
  s.units = FOUR_ARMY_IDS.map((army) => ({ ...s.units.find((u) => u.owner === army)! }));
  s.units[0] = { ...s.units[0]!, kind, fuel: 0, ammo: unitStats[kind].ammo, ...(unitStats[kind].ammo === 0 ? {} : { secondaryAmmo: undefined }) };
  s.players.army1.gold = 0;
  return s;
}
const observation = (s: FourArmyState) => value(observeFourArmy(s, 'army1'));
it('uses a defensive engineer to fortify without changing classic CPU decisions', () => {
  const s = scene('engineer');
  s.players.army1.gold = 500;
  const o = observation(s);
  const command = chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'defensive' }, 'four-army-cpu-v4');
  expect(command).toMatchObject({ type: 'fortify', actor: 'army1', unitId: 'u1' });
  expect(value(applyFourArmyCommand(s, command)).players.army1.gold).toBe(0);
  expect(chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v4')).toMatchObject({ type: 'fortify' });
  const legacy = value(createFourArmyState(value(createFourArmyMap32())));
  expect(isObservedFourArmyCommand(value(observeFourArmy(legacy, 'army1')), { type: 'recon', actor: 'army1', center: { x: 1, y: 1 } })).toBe(false);
});
it('prepares a legal primary ambush near observed enemies only for non-offensive policies', () => {
  const s = scene('tank');
  s.units[1]!.position = { x: 8, y: 4 };
  s.units.push({ ...s.units[0]!, id: 'observer', kind: 'recon', fuel: unitStats.recon.fuel, ammo: unitStats.recon.ammo, position: { x: 6, y: 4 }, hasActed: true, hasMoved: true });
  const o = observation(s);
  for (const policy of ['balanced', 'defensive'] as const) {
    const command = chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy }, 'four-army-cpu-v4');
    expect(command).toMatchObject({ type: 'ambush', unitId: 'u1' });
    expect(value(applyFourArmyCommand(s, command)).units[0]!.ambush).toBeDefined();
  }
  expect(chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'offensive' }, 'four-army-cpu-v4')?.type).not.toBe('ambush');
});
it('scans an unseen nearby headquarters rather than exposing or reusing private information', () => {
  const s = scene();
  s.units[0]!.position = { x: 22, y: 3 };
  s.units[1]!.position = { x: 24, y: 3 };
  const o = observation(s);
  const command = chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'offensive' }, 'four-army-cpu-v4');
  expect(command).toMatchObject({ type: 'recon', center: s.capitals.army2 });
  const after = value(applyFourArmyCommand(s, command));
  expect(after.extensions!.recon.army1.remaining).toBe(1);
  expect(chooseFourArmyCpuCommand(observation(after), { difficulty: 'normal', policy: 'offensive' }, 'four-army-cpu-v4')?.type).not.toBe('recon');
  s.extensions!.recon.army1.remaining = 0;
  expect(chooseFourArmyCpuCommand(observation(s), { difficulty: 'normal', policy: 'offensive' }, 'four-army-cpu-v4')?.type).not.toBe('recon');
});
it.each([0, 20, undefined])('sets a damaged supply unit’s resource priority once at fuel %s', (fuel) => {
  const s = scene('apc');
  s.units[0]!.hp = 60;
  s.units[0]!.fuel = fuel;
  const command = chooseFourArmyCpuCommand(observation(s), { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v4');
  expect(command).toMatchObject({ type: 'logistics', order: { priority: true, resource: (fuel ?? unitStats.apc.fuel) < 10 ? 'fuel' : 'ammo', repair: true } });
  const next = value(applyFourArmyCommand(s, command));
  expect(chooseFourArmyCpuCommand(observation(next), { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v4')?.type).not.toBe('logistics');
});
it('rejects malformed new-rule observations before planning or revealing hidden fortifications', () => {
  const base = observation(scene());
  const invalid: Array<(o: FourArmyObservation) => void> = [
    (o) => {
      delete o.extensions;
    },
    (o) => {
      delete o.rules;
    },
    (o) => {
      o.extensions = null as never;
    },
    (o) => {
      o.rules = { version: 2, tactics: true } as never;
    },
    (o) => {
      Object.assign(o.extensions!, { extra: 1 });
    },
    (o) => {
      o.extensions!.repairReserve = -1;
    },
    (o) => {
      o.extensions!.weatherSeed = 0.5;
    },
    (o) => {
      o.extensions!.recon.remaining = 3;
    },
    (o) => {
      o.extensions!.recon.centers = null as never;
    },
    (o) => {
      o.extensions!.recon.centers = [{ x: 1, y: 1 }];
    },
    (o) => {
      o.extensions!.recon = { remaining: 1, centers: [{ x: 32, y: 0 }] };
    },
    (o) => {
      o.extensions!.recon = {
        remaining: 0,
        centers: [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
      };
    },
    (o) => {
      o.extensions!.fortifications = null as never;
    },
    (o) => {
      o.extensions!.fortifications = [null] as never;
    },
    (o) => {
      o.extensions!.fortifications = Array.from({ length: 17 }, () => ({ owner: 'army1', position: { x: 1, y: 1 } }));
    },
    (o) => {
      o.extensions!.fortifications = [{ owner: 'army5', position: { x: 1, y: 1 } }] as never;
    },
    (o) => {
      o.extensions!.fortifications = [{ owner: 'army1', position: { x: -1, y: 0 } }];
    },
    (o) => {
      o.extensions!.fortifications = [{ owner: 'army1', position: { x: 8, y: 8 } }];
    },
    (o) => {
      o.extensions!.fortifications = [
        { owner: 'army1', position: { x: 1, y: 1 } },
        { owner: 'army2', position: { x: 1, y: 1 } },
      ];
    },
    (o) => {
      o.extensions!.fortifications = [1, 2, 3, 4, 6].map((x) => ({ owner: 'army1', position: { x, y: 1 } }));
    },
    (o) => {
      o.extensions!.fortifications = [{ owner: 'army2', position: { x: 1, y: 1 } }];
    },
  ];
  const idle = value(observeFourArmy(scene(), 'army2'));
  idle.extensions!.recon = { remaining: 1, centers: [{ x: 1, y: 1 }] };
  expect(isFourArmyObservation(idle)).toBe(false);
  const lost = scene();
  lost.units = lost.units.filter((u) => u.owner !== 'army4');
  lost.alive = lost.alive.filter((a) => a !== 'army4');
  lost.eliminations.push({ army: 'army4', round: 1 });
  lost.board.terrain = lost.board.terrain.map((row) => row.map((tile) => (tile.owner === 'army4' ? { ...tile, owner: undefined } : tile)));
  const lostView = observation(lost);
  lostView.extensions!.fortifications = [{ owner: 'army4', position: { x: 1, y: 1 } }];
  expect(isFourArmyObservation(lostView)).toBe(false);
  for (const corrupt of invalid) {
    const o = structuredClone(base);
    corrupt(o);
    expect(isFourArmyObservation(o)).toBe(false);
    expect(() => chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v4')).toThrow('Invalid four-army CPU input');
  }
});
