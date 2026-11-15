import { describe, expect, it } from 'vitest';
import { fourCpuMap, fourCpuUnit } from '../ai/fourArmyCpu.fixture';
import { applyFourArmyCommand, createFourArmyState, type FourArmyCommand, type FourArmyMap } from './fourArmyEngine';
import {
  advanceFourArmyExperience,
  emptyFourArmyExperience,
  initialFourArmyExperience,
  observedFourArmyEvent,
  fourArmyExperienceManifest,
  isFourArmyExperience,
  isFourArmyExperienceManifest,
} from './fourArmyExperience';
import { fourArmySpectatorFixture } from './fourArmySpectator.fixture';
import { fourArmyControllers } from './fourArmyControl';
import { encodeFourArmySpectatorSave, serializeFourArmySpectatorSave, verifyFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import type { GameResult } from './types';
import { exportBackup, previewBackup, restoreBackup } from './backup';
import { FOUR_ARMY_AUTO_SAVE_KEY, FOUR_ARMY_SAVE_KEYS } from './fourArmySpectatorSave';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function map(enemyX = 3): FourArmyMap {
  const m = fourCpuMap();
  m.order = ['army2', 'army1', 'army3', 'army4'];
  m.units[1]!.position = { x: enemyX, y: 1 };
  return m;
}
function move(x: number, to: number) {
  const before = value(createFourArmyState(map(x))),
    command: FourArmyCommand = { actor: 'army2', type: 'move', unitId: 'u2', destination: { x: to, y: 1 } };
  return { before, command, after: value(applyFourArmyCommand(before, command)) };
}
function saved(): FourArmySpectatorSave {
  const legacy = fourArmySpectatorFixture(8);
  let state = value(createFourArmyState(legacy.archive.payload.map)),
    experience = initialFourArmyExperience(state, 0);
  legacy.archive.payload.commands.forEach((command, i) => {
    const next = value(applyFourArmyCommand(state, command));
    experience = advanceFourArmyExperience(experience, state, command, next, i + 1);
    state = next;
  });
  return { ...legacy, format: 'ministr-four-army-configurable', schemaVersion: 4, controllers: fourArmyControllers(), experience: fourArmyExperienceManifest(experience) };
}
describe('army-private observed history', () => {
  it('retains the last visible position when an enemy leaves, without disclosing its destination', () => {
    const { before, command, after } = move(3, 4),
      initial = initialFourArmyExperience(before, 0);
    expect(initial.sightings.army1.find((r) => r.unitId === 'u2')?.position).toEqual({ x: 3, y: 1 });
    const next = advanceFourArmyExperience(initial, before, command, after, 1);
    expect(next.sightings.army1.find((r) => r.unitId === 'u2')).toMatchObject({ at: 0, position: { x: 3, y: 1 } });
    expect(next.events.army1[0]).toMatchObject({ type: 'move', from: { x: 3, y: 1 } });
    expect(next.events.army1[0]!.to).toBeUndefined();
    expect(next.events.all[0]!.to).toEqual({ x: 4, y: 1 });
    expect(initial.events.army1).toEqual([]);
  });
  it('records a visible arrival without inventing the unseen source position', () => {
    const { before, command, after } = move(4, 3),
      event = observedFourArmyEvent(before, command, after, 'army1', 1)!;
    expect(event.from).toBeUndefined();
    expect(event.to).toEqual({ x: 3, y: 1 });
    expect(event.unitKind).toBe('infantry');
  });
  it('does not log wholly unseen movement or enemy private preparation', () => {
    const { before, command, after } = move(5, 6);
    expect(observedFourArmyEvent(before, command, after, 'army1', 1)).toBeUndefined();
    for (const privateCommand of [
      { actor: 'army2', type: 'recon', center: { x: 1, y: 1 } },
      { actor: 'army2', type: 'ambush', unitId: 'u2' },
      { actor: 'army2', type: 'logistics', unitId: 'u2', order: { priority: true } },
      { actor: 'army2', type: 'repairReserve', amount: 500 },
    ] as FourArmyCommand[])
      expect(observedFourArmyEvent(before, privateCommand, after, 'army1', 1)).toBeUndefined();
    expect(observedFourArmyEvent(before, { actor: 'army2', type: 'recon', center: { x: 4, y: 1 } }, after, 'army2', 1)?.to).toEqual({ x: 4, y: 1 });
    expect(observedFourArmyEvent(before, { actor: 'army2', type: 'repairReserve', amount: 500 }, after, 'army2', 1)?.type).toBe('repairReserve');
  });
  it('does not reveal an unseen transport or an unseen unloaded passenger', () => {
    const m = map(4);
    m.units[1] = fourCpuUnit('u2', 'army2', { x: 4, y: 1 }, 'apc');
    m.units.push(fourCpuUnit('u5', 'army2', { x: 3, y: 1 }));
    const before = value(createFourArmyState(m)),
      command: FourArmyCommand = { actor: 'army2', type: 'embark', unitId: 'u5', transportId: 'u2' },
      after = value(applyFourArmyCommand(before, command));
    expect(observedFourArmyEvent(before, command, after, 'army1', 1)).toBeUndefined();
    expect(observedFourArmyEvent(before, command, after, 'all', 1)?.type).toBe('embark');
    const loaded = map(3);
    loaded.units[1] = fourCpuUnit('u2', 'army2', { x: 3, y: 1 }, 'apc');
    const cargo = fourCpuUnit('u5', 'army2', { x: 2, y: 1 });
    delete cargo.position;
    cargo.embarkedIn = 'u2';
    loaded.units.push(cargo);
    const b = value(createFourArmyState(loaded)),
      c: FourArmyCommand = { actor: 'army2', type: 'disembark', transportId: 'u2', destination: { x: 4, y: 1 } },
      a = value(applyFourArmyCommand(b, c));
    expect(observedFourArmyEvent(b, c, a, 'army1', 1)).toBeUndefined();
    expect(observedFourArmyEvent(b, c, a, 'all', 1)).toMatchObject({ type: 'disembark', unitKind: 'infantry', to: { x: 4, y: 1 } });
  });
  it('reports only observed attack damage and return fire', () => {
    const before = value(createFourArmyState(map(2))),
      command: FourArmyCommand = { actor: 'army2', type: 'attack', unitId: 'u2', targetId: 'u1' },
      after = value(applyFourArmyCommand(before, command));
    const event = observedFourArmyEvent(before, command, after, 'army1', 1)!;
    expect(event).toMatchObject({ type: 'attack', unitKind: 'infantry', targetKind: 'infantry', to: { x: 1, y: 1 } });
    expect(event.damage).toBe(before.units[0]!.hp - after.units[0]!.hp);
    expect(event.counterDamage).toBe(before.units[1]!.hp - after.units[1]!.hp);
  });
  it('describes an unloaded visible arrival as movement when the transport was unseen', () => {
    const m = map(4);
    m.units[1] = fourCpuUnit('u2', 'army2', { x: 4, y: 1 }, 'apc');
    const cargo = fourCpuUnit('u5', 'army2', { x: 4, y: 1 });
    delete cargo.position;
    cargo.embarkedIn = 'u2';
    m.units.push(cargo);
    const before = value(createFourArmyState(m));
    const command: FourArmyCommand = { actor: 'army2', type: 'disembark', transportId: 'u2', destination: { x: 3, y: 1 } };
    const after = value(applyFourArmyCommand(before, command));
    const visible = observedFourArmyEvent(before, command, after, 'army1', 1)!;
    expect(visible).toMatchObject({ type: 'move', unitKind: 'infantry', to: { x: 3, y: 1 } });
    expect(visible.from).toBeUndefined();
    expect(observedFourArmyEvent(before, command, after, 'army2', 1)?.type).toBe('disembark');
    expect(observedFourArmyEvent(before, command, after, 'all', 1)?.type).toBe('disembark');
  });
  it('reports a hidden-contact stop using the mover’s actual position, never the requested enemy destination', () => {
    const m = fourCpuMap();
    m.units[0] = fourCpuUnit('u1', 'army1', { x: 1, y: 1 }, 'tank');
    m.units[1] = fourCpuUnit('u2', 'army2', { x: 5, y: 1 }, 'tank');
    const before = value(createFourArmyState(m));
    const command: FourArmyCommand = { actor: 'army1', type: 'move', unitId: 'u1', destination: { x: 5, y: 1 } };
    const after = value(applyFourArmyCommand(before, command));
    const event = observedFourArmyEvent(before, command, after, 'army1', 1)!;
    expect(event.type).toBe('contact');
    expect(event.to).toEqual(after.units[0]!.position);
    expect(event.to).not.toEqual(command.destination);
    expect(event.targetKind).toBeUndefined();
  });
  it('reports damage during a move without exposing an unseen ambush preparation', async () => {
    const { createFourArmyMap32 } = await import('./fourArmyMap32');
    const m = value(createFourArmyMap32(42, undefined, 1, { version: 1, tactics: true }));
    const before = value(createFourArmyState(m));
    before.units = ['army1', 'army2', 'army3', 'army4'].map((army) => before.units.find((u) => u.owner === army && u.kind === 'tank')!);
    const mover = before.units[0]!,
      enemy = before.units[1]!;
    mover.position = { x: 4, y: 4 };
    enemy.position = { x: 8, y: 4 };
    enemy.ambush = 0;
    enemy.hasActed = enemy.hasMoved = true;
    const command: FourArmyCommand = { actor: 'army1', type: 'move', unitId: mover.id, destination: { x: 8, y: 4 } };
    const after = value(applyFourArmyCommand(before, command));
    const event = observedFourArmyEvent(before, command, after, 'army1', 1)!;
    expect(event).toMatchObject({ type: 'contact', to: { x: 7, y: 4 }, damage: mover.hp - after.units[0]!.hp });
    expect(event).not.toHaveProperty('ambush');
    expect(event.targetKind).toBeUndefined();
  });
  it('rejects forged runtime facts and private fields in Worker replies', () => {
    const { before } = move(3, 4),
      original = initialFourArmyExperience(before, 0);
    expect(isFourArmyExperience(original, 0)).toBe(true);
    for (const change of [
      (e: typeof original) => {
        e.sightings.army1[0]!.hp = 101;
      },
      (e: typeof original) => {
        e.sightings.army1[0]!.owner = 'army1';
      },
      (e: typeof original) => {
        e.sightings.army1[0]!.position.x = 32;
      },
      (e: typeof original) => {
        e.sightings.army1[0]!.at = 1;
      },
      (e: typeof original) => {
        e.events.army1 = [{ actor: 'army2', type: 'move', at: 1, round: 1, damage: -1 }];
      },
      (e: typeof original) => {
        (e as unknown as { secret: number }).secret = 1;
      },
    ]) {
      const changed = structuredClone(original);
      change(changed);
      expect(isFourArmyExperience(changed, 0)).toBe(false);
    }
    expect(isFourArmyExperience(null, 0)).toBe(false);
    expect(isFourArmyExperienceManifest(null, 0)).toBe(false);
  });
  it('bounds long action histories and stores only validated references', () => {
    let state = value(createFourArmyState(map())),
      experience = initialFourArmyExperience(state, 0);
    for (let i = 1; i <= 140; i++) {
      const command: FourArmyCommand = { actor: state.round.order[state.round.index]!, type: 'endTurn' },
        next = value(applyFourArmyCommand(state, command));
      experience = advanceFourArmyExperience(experience, state, command, next, i);
      state = next;
    }
    expect(experience.events.army1).toHaveLength(128);
    expect(experience.events.all[0]!.at).toBe(13);
    const manifest = fourArmyExperienceManifest(experience);
    expect(isFourArmyExperienceManifest(manifest, 140)).toBe(true);
    expect(isFourArmyExperience(experience, 140)).toBe(true);
    expect(JSON.stringify(manifest)).not.toContain('position');
    expect(JSON.stringify(manifest)).not.toContain('hp');
  });
  it('verifies schema4 observation references in the authoritative full replay', () => {
    const save = saved(),
      raw = value(serializeFourArmySpectatorSave(save)),
      verifier = verifyFourArmySpectatorSave(raw);
    let step = verifier.next();
    while (!step.done) step = verifier.next();
    expect(step.value.ok).toBe(true);
    if (!step.value.ok) return;
    expect(step.value.value.experience?.events.army1).toHaveLength(8);
    expect(step.value.value.save.schemaVersion).toBe(4);
    expect(isFourArmyExperience(step.value.value.experience, 8)).toBe(true);
  });
  it('rejects a fabricated enemy sighting even when its ID and command index are structurally valid', () => {
    const save = saved();
    if (save.schemaVersion !== 4 || save.format !== 'ministr-four-army-configurable') throw Error();
    save.experience.sightings.army1 = [{ unitId: 'u9', at: 0 }];
    const encoded = value(encodeFourArmySpectatorSave(save));
    expect(serializeFourArmySpectatorSave(save).ok).toBe(false);
    const verifier = verifyFourArmySpectatorSave(encoded);
    let step = verifier.next();
    while (!step.done) step = verifier.next();
    expect(step.value.ok).toBe(false);
  });
  it('rejects a structurally valid action reference that was invisible to that army', () => {
    const save = saved();
    if (save.format !== 'ministr-four-army-configurable' || save.schemaVersion !== 4) throw Error();
    const before = value(createFourArmyState(save.archive.payload.map));
    const command: FourArmyCommand = { actor: 'army1', type: 'move', unitId: 'u1', destination: { x: 3, y: 4 } };
    save.archive.payload.commands = [command];
    save.archive.payload.state = value(applyFourArmyCommand(before, command));
    save.experience = fourArmyExperienceManifest(emptyFourArmyExperience());
    save.experience.events.army3 = [1];
    expect(isFourArmyExperienceManifest(save.experience, 1)).toBe(true);
    expect(serializeFourArmySpectatorSave(save).ok).toBe(false);
  });
  it('backs up and restores the separate schema4 autosave while preserving manual slots and rejects corrupt replacements atomically', () => {
    const raw = value(serializeFourArmySpectatorSave(saved()));
    const data = new Map([
      [FOUR_ARMY_AUTO_SAVE_KEY, raw],
      [FOUR_ARMY_SAVE_KEYS[0], raw],
      [FOUR_ARMY_SAVE_KEYS[1], raw],
    ]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    const backup = value(exportBackup(storage));
    expect(previewBackup(storage, backup).ok).toBe(true);
    data.clear();
    expect(restoreBackup(storage, backup).ok).toBe(true);
    expect(data.size).toBe(3);
    expect(data.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(raw);
    const bad = JSON.parse(backup) as { entries: [string, string][] };
    bad.entries[0]![1] = '{';
    expect(restoreBackup(storage, JSON.stringify(bad)).ok).toBe(false);
    expect(data.size).toBe(3);
    expect(data.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(raw);
  });
  it.each([
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.events.army1 = [2, 1];
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.events.army1 = [1, 1];
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.events.army1 = [9];
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.events.army1 = Array(129).fill(1);
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.sightings.army1 = [{ unitId: 'u2', at: -1 }];
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      m.sightings.army1 = [
        { unitId: 'u2', at: 0 },
        { unitId: 'u2', at: 1 },
      ];
    },
    (m: ReturnType<typeof fourArmyExperienceManifest>) => {
      (m as unknown as { extra: number }).extra = 1;
    },
  ])('rejects malformed, duplicate, oversized or future references', (mutate) => {
    const manifest = fourArmyExperienceManifest(emptyFourArmyExperience());
    mutate(manifest);
    expect(isFourArmyExperienceManifest(manifest, 8)).toBe(false);
  });
});
