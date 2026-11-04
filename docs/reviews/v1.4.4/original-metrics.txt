import { visibleEnemies } from '../src/game/fog';
import { isPropertyTerrainKind } from '../src/game/facilities';
import { manhattanDistance } from '../src/game/terrain';
import { weatherAt } from '../src/game/tactics';
import { isDeployedUnit, type GameState, type PlayerId, type Position } from '../src/game/types';
import { unitStats } from '../src/game/units';
import { weaponAmmo } from '../src/game/weapons';
import type { GameCommand } from '../src/game/session';

const halfTurn = (s: GameState) => (s.turn - 1) * 2 + (s.activePlayer === 'red' ? 1 : 2);
const zero = (): Record<PlayerId, number> => ({ red: 0, blue: 0 });
const actors = ['red', 'blue'] as const;

/** Full-information measurements never enter the CPU's planning inputs. */
export class TacticalMetrics {
  readonly firstObjectiveArrival: Partial<Record<PlayerId, number>> = {};
  readonly firstNeutralCapture: Partial<Record<PlayerId, number>> = {};
  readonly firstNeutralIncome: Partial<Record<PlayerId, number>> = {};
  readonly firstProduction: Partial<Record<PlayerId, number>> = {};
  readonly firstReinforcementArrival: Partial<Record<PlayerId, number>> = {};
  readonly damageValue = zero();
  readonly destroyedValue = zero();
  readonly repairExpense = zero();
  readonly ammunitionSpent = zero();
  readonly prepared = zero();
  readonly fired = zero();
  readonly expired = zero();
  readonly cancelled = zero();
  readonly diveActions = zero();
  readonly sonarEpisodes = zero();
  readonly detectedSubmarines: Record<PlayerId, Set<string>> = { red: new Set(), blue: new Set() };
  readonly rainRounds = new Set<number>();
  blockedUnloads = 0;
  peakUnits: number;
  private readonly objectives: Position[] = [];
  private readonly incomeObjectives: Position[] = [];
  private readonly initialIds: Set<string>;
  constructor(initial: GameState) {
    this.peakUnits = initial.units.length;
    this.initialIds = new Set(initial.units.map((u) => u.id));
    for (let y = 0; y < initial.board.height; y++)
      for (let x = 0; x < initial.board.width; x++) {
        const tile = initial.board.terrain[y]![x]!;
        if (tile.owner === undefined && isPropertyTerrainKind(tile.kind)) {
          this.objectives.push({ x, y });
          if (tile.kind !== 'supplyDepot') this.incomeObjectives.push({ x, y });
        }
      }
  }
  observe(before: GameState, after: GameState, command: GameCommand): void {
    const actor = before.activePlayer,
      tick = halfTurn(before);
    this.peakUnits = Math.max(this.peakUnits, after.units.length);
    if (weatherAt(before) === 'rain') this.rainRounds.add(before.turn);
    if (command.type === 'ambush') this.prepared[actor]++;
    if (command.type === 'dive') this.diveActions[actor]++;
    if (command.type === 'produce') this.firstProduction[actor] ??= tick;
    const nextUnits = new Map(after.units.map((u) => [u.id, u]));
    const event = after.tactics?.lastCombat;
    for (const unit of before.units) {
      const next = nextUnits.get(unit.id);
      if (command.type !== 'merge' && command.type !== 'evacuate') {
        this.damageValue[unit.owner] += (Math.max(0, unit.hp - (next?.hp ?? 0)) * unitStats[unit.kind].cost) / 100;
        if (!next) this.destroyedValue[unit.owner] += unitStats[unit.kind].cost;
      }
      if (unit.ambush !== undefined && next?.ambush === undefined) {
        if (event?.ambush && event.attackerId === unit.id) this.fired[unit.owner]++;
        else if (command.type === 'endTurn' && after.activePlayer === unit.owner) this.expired[unit.owner]++;
        else this.cancelled[unit.owner]++;
      }
    }
    if (event) {
      const attacker = before.units.find((u) => u.id === event.attackerId),
        defender = before.units.find((u) => u.id === event.defenderId);
      if (attacker) this.ammunitionSpent[attacker.owner]++;
      if (defender && event.counterWeapon !== undefined) this.ammunitionSpent[defender.owner]++;
    } else if (command.type === 'attack') {
      this.ammunitionSpent[actor]++;
      const defender = before.units.find((u) => u.id === command.targetId),
        next = nextUnits.get(command.targetId);
      if (defender && next && weaponAmmo(defender, 0) + weaponAmmo(defender, 1) > weaponAmmo(next, 0) + weaponAmmo(next, 1)) this.ammunitionSpent[defender.owner]++;
    }
    if (command.type === 'capture') {
      const unit = before.units.find((u) => u.id === command.unitId);
      if (
        unit &&
        isDeployedUnit(unit) &&
        before.board.terrain[unit.position.y]![unit.position.x]!.owner === undefined &&
        after.board.terrain[unit.position.y]![unit.position.x]!.owner === actor
      )
        this.firstNeutralCapture[actor] ??= tick;
    }
    if (command.type === 'disembark' && after.units.some((u) => u.embarkedIn === command.transportId)) this.blockedUnloads++;
    for (const player of actors) {
      const own = after.units.filter((u) => u.owner === player && isDeployedUnit(u));
      if (own.some((u) => unitStats[u.kind].capturePower > 0 && this.objectives.some((p) => manhattanDistance(p, u.position!) === 0))) this.firstObjectiveArrival[player] ??= tick;
      const center = this.objectives.filter((p) => Math.abs(p.y - (after.board.height - 1) / 2) <= 2);
      if (own.some((u) => !this.initialIds.has(u.id) && center.some((p) => manhattanDistance(p, u.position!) <= 2))) this.firstReinforcementArrival[player] ??= tick;
      if (command.type === 'endTurn' && after.activePlayer === player) {
        this.repairExpense[player] += Math.max(0, before.players[player].gold + after.players[player].income - after.players[player].gold);
        if (this.incomeObjectives.some((p) => after.board.terrain[p.y]![p.x]!.owner === player)) this.firstNeutralIncome[player] ??= halfTurn(after);
      }
      if (after.units.some((u) => u.kind === 'submarine')) {
        const previous = new Set(
          visibleEnemies(before, player)
            .filter((u) => u.kind === 'submarine' && u.submerged)
            .map((u) => u.id),
        );
        for (const sub of visibleEnemies(after, player).filter((u) => u.kind === 'submarine' && u.submerged)) {
          if (!previous.has(sub.id)) this.sonarEpisodes[player]++;
          this.detectedSubmarines[player].add(sub.id);
        }
      }
    }
  }
  summary() {
    return {
      firstObjectiveArrival: this.firstObjectiveArrival,
      firstNeutralCapture: this.firstNeutralCapture,
      firstNeutralIncome: this.firstNeutralIncome,
      firstProduction: this.firstProduction,
      firstReinforcementArrival: this.firstReinforcementArrival,
      damageValue: this.damageValue,
      destroyedValue: this.destroyedValue,
      repairExpense: this.repairExpense,
      ammunitionSpent: this.ammunitionSpent,
      ambush: { prepared: this.prepared, fired: this.fired, expired: this.expired, cancelled: this.cancelled },
      diveActions: this.diveActions,
      sonarEpisodes: this.sonarEpisodes,
      detectedSubmarines: { red: this.detectedSubmarines.red.size, blue: this.detectedSubmarines.blue.size },
      rainRounds: this.rainRounds.size,
      blockedUnloads: this.blockedUnloads,
      peakUnits: this.peakUnits,
    };
  }
}
