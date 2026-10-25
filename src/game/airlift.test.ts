import { expect, it } from 'vitest';
import {
  attackUnit,
  captureProperty,
  createBoard,
  createGameState,
  disembarkUnit,
  embarkUnit,
  endTurn,
  isGameState,
  moveUnit,
  produceUnit,
  productionKindsForRule,
  unitStats,
  type GameState,
  type Unit,
} from './index';
const u = (id: string, kind: Unit['kind'], x: number, y = 1, patch: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  owner: 'red',
  position: { x, y },
  hp: 100,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
const initial = (): GameState => {
  const board = createBoard(8, 3);
  board.terrain[1]![1] = { kind: 'airport', owner: 'red' };
  board.terrain[1]![3] = { kind: 'sea' };
  board.terrain[1]![5] = { kind: 'city', capturePoints: 20 };
  return {
    ...createGameState(board),
    ruleVersion: 11,
    players: { red: { gold: 20000, income: 0 }, blue: { gold: 0, income: 0 } },
    units: [u('h', 'transportHelicopter', 1), u('p', 'infantry', 0), u('b', 'infantry', 7, 2, { owner: 'blue' })],
  };
};
function must(result: ReturnType<typeof moveUnit>) {
  if (!result.ok) throw Error(result.error);
  return result.value;
}
const nextRound = (state: GameState) => endTurn(endTurn(state));
it('produces an unarmed transport only at an airport in rule 11', () => {
  const s = initial();
  s.units = s.units.filter((u) => u.id !== 'h');
  const made = must(produceUnit(s, { x: 1, y: 1 }, 'transportHelicopter'));
  expect(made.players.red.gold).toBe(11000);
  expect(made.units.at(-1)?.kind).toBe('transportHelicopter');
  expect(produceUnit({ ...s, ruleVersion: 10 }, { x: 1, y: 1 }, 'transportHelicopter').ok).toBe(false);
  expect(productionKindsForRule('facility-v2', 10).airport).not.toContain('transportHelicopter');
  expect(produceUnit(s, { x: 0, y: 1 }, 'transportHelicopter').ok).toBe(false);
  expect(productionKindsForRule('legacy-factory-air', 11).factory).not.toContain('transportHelicopter');
  expect(attackUnit(initial(), 'h', 'b').ok).toBe(false);
  expect(isGameState({ ...initial(), ruleVersion: 10 })).toBe(false);
});
it.each(['infantry', 'mech', 'engineer'] as const)('airlifts %s across water, unloads and captures on later turns', (kind) => {
  let s = initial();
  s.units[1]!.kind = kind;
  s = must(embarkUnit(s, 'p', 'h'));
  expect(moveUnit(s, 'h', { x: 4, y: 1 }).ok).toBe(false);
  s = nextRound(s);
  s = must(moveUnit(s, 'h', { x: 4, y: 1 }));
  expect(disembarkUnit(s, 'h', { x: 5, y: 1 }).ok).toBe(false);
  s = nextRound(s);
  expect(disembarkUnit(s, 'h', { x: 3, y: 1 }).ok).toBe(false);
  s = must(disembarkUnit(s, 'h', { x: 5, y: 1 }));
  expect(captureProperty(s, 'p').ok).toBe(false);
  s = nextRound(s);
  s = must(captureProperty(s, 'p'));
  s = nextRound(s);
  s = must(captureProperty(s, 'p'));
  expect(s.board.terrain[1]![5]!.owner).toBe('red');
  expect(isGameState(s)).toBe(true);
});
it('rejects tanks, extra cargo, occupied landing and moved transports', () => {
  let s = initial();
  s.units.push(u('t', 'tank', 1, 0));
  expect(embarkUnit(s, 't', 'h').ok).toBe(false);
  s = must(embarkUnit(s, 'p', 'h'));
  s = nextRound(s);
  s.units.push(u('p2', 'infantry', 0));
  expect(embarkUnit(s, 'p2', 'h').ok).toBe(false);
  expect(disembarkUnit(s, 'h', { x: 0, y: 1 }).ok).toBe(false);
});
it('loses the passenger with a destroyed or fuel-starved helicopter', () => {
  let s = nextRound(must(embarkUnit(initial(), 'p', 'h')));
  s.units[0] = { ...s.units[0]!, position: { x: 3, y: 1 }, fuel: 1 };
  expect(nextRound(s).units.some((u) => u.id === 'h' || u.id === 'p')).toBe(false);
  s = nextRound(must(embarkUnit(initial(), 'p', 'h')));
  s.activePlayer = 'blue';
  s.units[0]!.hp = 1;
  s.units.push(u('aa', 'antiAir', 2, 1, { owner: 'blue' }));
  s = must(attackUnit(s, 'aa', 'h'));
  expect(s.units.some((u) => u.id === 'h' || u.id === 'p')).toBe(false);
});
it('services helicopters only at airports, with full fuel capacity', () => {
  const s = initial();
  s.units[0]!.fuel = 5;
  s.units[0]!.hp = 50;
  const after = nextRound(s).units.find((u) => u.id === 'h')!;
  expect(after.fuel).toBe(unitStats.transportHelicopter.fuel);
  expect(after.hp).toBeGreaterThan(50);
  s.board.terrain[1]![1] = { kind: 'city', owner: 'red' };
  expect(nextRound(s).units.find((u) => u.id === 'h')!.fuel).toBeLessThan(5);
});
