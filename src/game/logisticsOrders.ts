import { isGameOver, type GameResult, type GameState, type Unit } from './types';

import { LOGISTICS_RULE_VERSION } from './types';
export { LOGISTICS_RULE_VERSION } from './types';
export interface LogisticsOrder {
  priority: boolean;
  resource: 'ammo' | 'fuel';
  repair: boolean;
}
export const defaultLogisticsOrder: Readonly<LogisticsOrder> = { priority: false, resource: 'ammo', repair: true };
export const usesLogisticsOrders = (state: Pick<GameState, 'ruleVersion'>): boolean => (state.ruleVersion ?? 0) >= LOGISTICS_RULE_VERSION;
export function validLogisticsOrder(value: unknown): value is LogisticsOrder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).sort().join() === 'priority,repair,resource' &&
    typeof v.priority === 'boolean' &&
    typeof v.repair === 'boolean' &&
    (v.resource === 'ammo' || v.resource === 'fuel')
  );
}
export const validRepairReserve = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
export const logisticsOrder = (state: Pick<GameState, 'ruleVersion'>, unit: Unit): Readonly<LogisticsOrder> =>
  usesLogisticsOrders(state) ? (unit.logistics ?? defaultLogisticsOrder) : defaultLogisticsOrder;
export function setLogisticsOrder(state: GameState, unitId: string, order: LogisticsOrder): GameResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!usesLogisticsOrders(state) || isGameOver(state) || !unit || unit.owner !== state.activePlayer || !validLogisticsOrder(order))
    return { ok: false, error: 'Invalid logistics order' };
  return { ok: true, value: { ...state, units: state.units.map((u) => (u.id === unitId ? { ...u, logistics: { ...order } } : u)) } };
}
export function setRepairReserve(state: GameState, amount: number): GameResult {
  if (!usesLogisticsOrders(state) || isGameOver(state) || !validRepairReserve(amount)) return { ok: false, error: 'Invalid repair reserve' };
  return { ok: true, value: { ...state, repairReserve: { ...state.repairReserve, [state.activePlayer]: amount } } };
}
