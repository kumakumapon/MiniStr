import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { observeFourArmy, type FourArmyState, type FourArmyUnit, type FourArmyCommand } from './fourArmyEngine';
import { unitStats } from './units';
import type { Position, GameResult } from './types';

export type FourArmyExperienceView = 'all' | FourArmyId;
export const FOUR_ARMY_HISTORY_LIMIT = 128;
const views: FourArmyExperienceView[] = ['all', ...FOUR_ARMY_IDS];
export interface FourArmySighting {
  unitId: string;
  owner: FourArmyId;
  kind: FourArmyUnit['kind'];
  hp: number;
  position: Position;
  round: number;
  at: number;
}
export interface FourArmyObservedEvent {
  at: number;
  round: number;
  actor: FourArmyId;
  type: FourArmyCommand['type'] | 'contact';
  unitKind?: FourArmyUnit['kind'];
  targetKind?: FourArmyUnit['kind'];
  from?: Position;
  to?: Position;
  damage?: number;
  counterDamage?: number;
}
export interface FourArmyExperience {
  sightings: Record<FourArmyId, FourArmySighting[]>;
  events: Record<FourArmyExperienceView, FourArmyObservedEvent[]>;
}
/** Persist references, never user-supplied enemy facts. The verifier resolves them from legal history. */
export interface FourArmyExperienceManifest {
  version: 1;
  sightings: Record<FourArmyId, { unitId: string; at: number }[]>;
  events: Record<FourArmyExperienceView, number[]>;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const army = (v: unknown): v is FourArmyId => FOUR_ARMY_IDS.includes(v as FourArmyId);
const kind = (v: unknown): v is FourArmyUnit['kind'] => typeof v === 'string' && Object.hasOwn(unitStats, v);
const position = (v: unknown): v is Position => record(v) && exact(v, ['x', 'y']) && integer(v.x, 0, 31) && integer(v.y, 0, 31);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const key = (p: Position) => `${p.x},${p.y}`;
const ordered = (a: FourArmySighting, b: FourArmySighting) => b.at - a.at || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);
export function emptyFourArmyExperience(): FourArmyExperience {
  return { sightings: { army1: [], army2: [], army3: [], army4: [] }, events: { all: [], army1: [], army2: [], army3: [], army4: [] } };
}
export function isFourArmyExperienceManifest(v: unknown, count: number): v is FourArmyExperienceManifest {
  return (
    record(v) &&
    exact(v, ['version', 'sightings', 'events']) &&
    v.version === 1 &&
    record(v.sightings) &&
    exact(v.sightings, FOUR_ARMY_IDS) &&
    FOUR_ARMY_IDS.every((a) => {
      const rows = (v.sightings as Record<string, unknown>)[a];
      return (
        Array.isArray(rows) &&
        rows.length <= FOUR_ARMY_HISTORY_LIMIT &&
        rows.every((r) => record(r) && exact(r, ['unitId', 'at']) && id(r.unitId) && integer(r.at, 0, count)) &&
        new Set(rows.map((r) => r.unitId)).size === rows.length
      );
    }) &&
    record(v.events) &&
    exact(v.events, views) &&
    views.every((a) => {
      const rows = (v.events as Record<string, unknown>)[a];
      return Array.isArray(rows) && rows.length <= FOUR_ARMY_HISTORY_LIMIT && rows.every((n, i) => integer(n, 1, count) && (!i || n > rows[i - 1]));
    })
  );
}
export function fourArmyExperienceManifest(v: FourArmyExperience): FourArmyExperienceManifest {
  const sightings = Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, v.sightings[a].map(({ unitId, at }) => ({ unitId, at }))])) as FourArmyExperienceManifest['sightings'];
  const events = Object.fromEntries(views.map((a) => [a, v.events[a].map((e) => e.at)])) as FourArmyExperienceManifest['events'];
  return { version: 1, sightings, events };
}
export function isFourArmyExperience(v: unknown, count: number): v is FourArmyExperience {
  if (!record(v) || !exact(v, ['sightings', 'events']) || !record(v.sightings) || !exact(v.sightings, FOUR_ARMY_IDS) || !record(v.events) || !exact(v.events, views)) return false;
  const eventTypes = [
    'move',
    'wait',
    'attack',
    'merge',
    'capture',
    'produce',
    'embark',
    'disembark',
    'endTurn',
    'resume',
    'fortify',
    'recon',
    'ambush',
    'logistics',
    'repairReserve',
    'contact',
  ];
  if (
    !FOUR_ARMY_IDS.every(
      (a) =>
        Array.isArray((v.sightings as Record<string, unknown>)[a]) &&
        (v.sightings as Record<string, unknown[]>)[a]!.length <= FOUR_ARMY_HISTORY_LIMIT &&
        (v.sightings as Record<string, unknown[]>)[a]!.every(
          (r) =>
            record(r) &&
            exact(r, ['unitId', 'owner', 'kind', 'hp', 'position', 'round', 'at']) &&
            id(r.unitId) &&
            army(r.owner) &&
            r.owner !== a &&
            kind(r.kind) &&
            integer(r.hp, 1, 100) &&
            position(r.position) &&
            integer(r.round, 1, 1_000_000_000) &&
            integer(r.at, 0, count),
        ),
    )
  )
    return false;
  if (
    !views.every(
      (a) =>
        Array.isArray((v.events as Record<string, unknown>)[a]) &&
        (v.events as Record<string, unknown[]>)[a]!.length <= FOUR_ARMY_HISTORY_LIMIT &&
        (v.events as Record<string, unknown[]>)[a]!.every(
          (r) =>
            record(r) &&
            ['at', 'round', 'actor', 'type'].every((k) => Object.hasOwn(r, k)) &&
            Object.keys(r).every((k) => ['at', 'round', 'actor', 'type', 'unitKind', 'targetKind', 'from', 'to', 'damage', 'counterDamage'].includes(k)) &&
            integer(r.at, 1, count) &&
            integer(r.round, 1, 1_000_000_000) &&
            army(r.actor) &&
            eventTypes.includes(r.type as string) &&
            (r.unitKind === undefined || kind(r.unitKind)) &&
            (r.targetKind === undefined || kind(r.targetKind)) &&
            (r.from === undefined || position(r.from)) &&
            (r.to === undefined || position(r.to)) &&
            (r.damage === undefined || integer(r.damage, 0, 100)) &&
            (r.counterDamage === undefined || integer(r.counterDamage, 0, 100)),
        ),
    )
  )
    return false;
  return isFourArmyExperienceManifest(fourArmyExperienceManifest(v as unknown as FourArmyExperience), count);
}
interface Seen {
  units: readonly FourArmyUnit[];
  visible?: Set<string>;
}
const frames = new WeakMap<FourArmyState, Map<FourArmyExperienceView, Seen>>();
function seen(state: FourArmyState, view: FourArmyExperienceView): Seen {
  let cache = frames.get(state);
  if (!cache) {
    cache = new Map();
    frames.set(state, cache);
  }
  let value = cache.get(view);
  if (!value) {
    if (view === 'all') value = { units: state.units };
    else {
      const o = observeFourArmy(state, view);
      if (!o.ok) throw Error(o.error);
      value = { units: o.value.units, visible: new Set(o.value.visible.map(key)) };
    }
    cache.set(view, value);
  }
  return value;
}
const sighting = (u: FourArmyUnit, state: FourArmyState, at: number): FourArmySighting => ({
  unitId: u.id,
  owner: u.owner,
  kind: u.kind,
  hp: u.hp,
  position: { ...u.position! },
  round: state.round.round,
  at,
});
export function initialFourArmyExperience(state: FourArmyState, at: number): FourArmyExperience {
  const result = emptyFourArmyExperience();
  for (const a of FOUR_ARMY_IDS)
    result.sightings[a] = seen(state, a)
      .units.filter((u) => u.owner !== a && u.position)
      .map((u) => sighting(u, state, at))
      .sort(ordered)
      .slice(0, FOUR_ARMY_HISTORY_LIMIT);
  return result;
}
/** All optional coordinates/kinds come from the two restricted observations, never the raw command. */
export function observedFourArmyEvent(
  before: FourArmyState,
  command: FourArmyCommand,
  after: FourArmyState,
  view: FourArmyExperienceView,
  at: number,
): FourArmyObservedEvent | undefined {
  const base = { at, round: before.round.round, actor: command.actor, type: command.type };
  if (command.type === 'endTurn' || command.type === 'resume') return base;
  if (['recon', 'ambush', 'logistics', 'repairReserve'].includes(command.type) && view !== command.actor) return;
  const a = seen(before, view),
    b = seen(after, view);
  if (command.type === 'recon') return { ...base, to: { ...command.center } };
  if (command.type === 'repairReserve') return base;
  if (command.type === 'disembark') {
    const cargo = b.units.find(
      (u) => u.owner === command.actor && u.position?.x === command.destination.x && u.position?.y === command.destination.y && !a.units.find((old) => old.id === u.id)?.position,
    );
    if (!cargo) return;
    const transport = a.units.find((u) => u.id === command.transportId);
    return { ...base, unitKind: cargo.kind, ...(transport?.position ? { from: { ...transport.position } } : {}), to: { ...cargo.position! } };
  }
  const sourceId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
  const source = a.units.find((u) => u.id === sourceId);
  let next = b.units.find((u) => u.id === sourceId);
  if (command.type === 'produce')
    next = b.units.find((u) => u.owner === command.actor && u.position?.x === command.factory.x && u.position?.y === command.factory.y && !a.units.some((old) => old.id === u.id));
  const targetId = 'targetId' in command ? command.targetId : undefined;
  const target = a.units.find((u) => u.id === targetId),
    targetNext = b.units.find((u) => u.id === targetId);
  const transport = command.type === 'embark' ? (a.units.find((u) => u.id === command.transportId) ?? b.units.find((u) => u.id === command.transportId)) : undefined;
  if (command.type === 'embark' && (!source || !transport)) return;
  if (command.type === 'merge' && (!source || !target)) return;
  if (!source && !next && !target && !targetNext) {
    if (view === 'all' || (command.type !== 'attack' && command.type !== 'move')) return;
    const hurt = a.units.find(
      (u) =>
        u.owner === view &&
        u.position &&
        ((b.units.find((n) => n.id === u.id)?.hp ?? 0) < u.hp || (b.units.find((n) => n.id === u.id)?.ammo ?? unitStats[u.kind].ammo) < (u.ammo ?? unitStats[u.kind].ammo)),
    );
    if (!hurt) return;
    return { ...base, type: 'contact', targetKind: hurt.kind, to: { ...hurt.position! }, damage: Math.max(0, hurt.hp - (b.units.find((n) => n.id === hurt.id)?.hp ?? 0)) };
  }
  const damage =
    target && (targetNext || !b.visible || target.owner === view || (target.position && b.visible.has(key(target.position)))) ? target.hp - (targetNext?.hp ?? 0) : undefined;
  const destination = command.type === 'attack' || command.type === 'merge' ? (targetNext?.position ?? target?.position) : (next?.position ?? transport?.position);
  const counterDamage =
    command.type === 'attack' && source && (next || !b.visible || source.owner === view || (source.position && b.visible.has(key(source.position))))
      ? source.hp - (next?.hp ?? 0)
      : undefined;
  return {
    ...base,
    ...(source || next ? { unitKind: (source ?? next)!.kind } : {}),
    ...(target || targetNext ? { targetKind: (target ?? targetNext)!.kind } : {}),
    ...(source?.position ? { from: { ...source.position } } : {}),
    ...(destination ? { to: { ...destination } } : {}),
    ...(damage !== undefined && damage >= 0 ? { damage } : {}),
    ...(counterDamage !== undefined && counterDamage >= 0 ? { counterDamage } : {}),
  };
}
export function advanceFourArmyExperience(value: FourArmyExperience, before: FourArmyState, command: FourArmyCommand, after: FourArmyState, at: number): FourArmyExperience {
  const result = { sightings: { ...value.sightings }, events: { ...value.events } };
  for (const a of FOUR_ARMY_IDS) {
    const current = new Map(value.sightings[a].map((r) => [r.unitId, r]));
    if (!['wait', 'logistics', 'repairReserve', 'ambush'].includes(command.type))
      for (const u of seen(after, a).units) if (u.owner !== a && u.position) current.set(u.id, sighting(u, after, at));
    result.sightings[a] = [...current.values()].sort(ordered).slice(0, FOUR_ARMY_HISTORY_LIMIT);
  }
  for (const v of views) {
    const event = observedFourArmyEvent(before, command, after, v, at);
    if (event) result.events[v] = [...value.events[v], event].slice(-FOUR_ARMY_HISTORY_LIMIT);
  }
  return result;
}
/** Called by the existing full-history verifier. At most bounded witness positions require observations. */
export function fourArmyExperienceVerifier(manifest: FourArmyExperienceManifest, commands: readonly FourArmyCommand[]) {
  const result = emptyFourArmyExperience(),
    contacts = new Map<number, { army: FourArmyId; unitId: string }[]>(),
    events = new Map<number, FourArmyExperienceView[]>();
  let previous: FourArmyState | undefined, error: string | undefined;
  for (const a of FOUR_ARMY_IDS) for (const ref of manifest.sightings[a]) contacts.set(ref.at, [...(contacts.get(ref.at) ?? []), { army: a, unitId: ref.unitId }]);
  for (const v of views) for (const at of manifest.events[v]) events.set(at, [...(events.get(at) ?? []), v]);
  return {
    visit: (state: FourArmyState, at: number) => {
      for (const ref of contacts.get(at) ?? []) {
        const u = seen(state, ref.army).units.find((u) => u.id === ref.unitId && u.owner !== ref.army && u.position);
        if (!u) error = '目撃履歴を可視の命令履歴から確認できません。';
        else result.sightings[ref.army].push(sighting(u, state, at));
      }
      for (const v of events.get(at) ?? []) {
        const event = previous && commands[at - 1] ? observedFourArmyEvent(previous, commands[at - 1]!, state, v, at) : undefined;
        if (!event) error = '行動履歴に未観測の命令が含まれています。';
        else result.events[v].push(event);
      }
      previous = state;
    },
    finish: (): GameResult<FourArmyExperience> => {
      for (const a of FOUR_ARMY_IDS) result.sightings[a].sort(ordered);
      return error ? { ok: false, error } : { ok: true, value: result };
    },
  };
}
