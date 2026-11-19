import type { GameState } from '../game';
import { observeFourArmy, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { FourArmyExperienceView } from '../game/fourArmyExperience';
import { fourArmyRuleProjection } from '../game/fourArmyRules';
import { alliedArmies } from '../game/smallBattle';
import { actionSceneForCommand, actionSceneForVisiblePositions, type ActionScene } from './actionScene';

/** Read-only adapter for the existing presentation helpers. Never executes upkeep or commands. */
function presentationView(state: FourArmyState, actor: FourArmyId): GameState {
  return {
    board: {
      ...state.board,
      terrain: state.board.terrain.map((row) => row.map((tile) => ({ ...tile, owner: tile.owner === undefined ? undefined : tile.owner === actor ? 'red' : 'blue' }))),
    },
    units: state.units.map((unit) => ({ ...unit, owner: unit.owner === actor ? 'red' : 'blue' })),
    players: { red: state.players[actor], blue: { gold: 0, income: 0 } },
    activePlayer: 'red',
    turn: state.round.round,
    rngSeed: state.rngSeed,
    nextUnitId: state.nextUnitId,
    ...fourArmyRuleProjection(
      state.rules,
      state.extensions
        ? {
            recon: state.extensions.recon[actor],
            fortifications: state.extensions.fortifications,
            repairReserve: state.extensions.repairReserve[actor],
            weatherSeed: state.extensions.weatherSeed,
          }
        : undefined,
      actor,
    ),
  };
}

/** Presentation from actual canonical state differences; no save, rules or RNG changes. */
export function fourArmyActionSceneForCommand(before: FourArmyState, command: FourArmyCommand, after: FourArmyState): ActionScene | undefined {
  if (command.type === 'capture') {
    const scene = actionSceneForCommand(presentationView(before, command.actor), command, presentationView(after, command.actor), true);
    if (scene?.kind !== 'capture') return;
    return { ...scene, owner: command.actor, propertyOwner: after.board.terrain[scene.position.y]?.[scene.position.x]?.owner };
  }
  const actor = after.round.order[after.round.index];
  const turnStarted = before.paused || before.round.phase !== after.round.phase || before.round.round !== after.round.round || before.round.order[before.round.index] !== actor;
  if (!actor || after.paused || after.round.phase !== 'active' || !turnStarted) return;
  const scene = actionSceneForCommand(presentationView(before, actor), { type: 'endTurn' }, presentationView(after, actor), true);
  return scene?.kind === 'logistics' ? { ...scene, owner: actor, changes: scene.changes.map((change) => ({ ...change, owner: actor })) } : undefined;
}

/** Restricted observers never receive enemy fuel/ammo, cargo, or hidden capture details. */
export function fourArmyActionSceneForViewer(scene: ActionScene, before: FourArmyState, after: FourArmyState, view: FourArmyExperienceView): ActionScene | undefined {
  if (view === 'all') return scene;
  const observations = [observeFourArmy(before, view), observeFourArmy(after, view)].flatMap((o) => (o.ok ? [o.value] : []));
  const visible = new Set(observations.flatMap((o) => o.visible.map((p) => `${p.x},${p.y}`)));
  const known = (id: string | undefined) => !!id && observations.some((o) => o.units.some((unit) => unit.id === id));
  if (scene.kind === 'capture') return known(scene.unitId) ? actionSceneForVisiblePositions(scene, visible) : undefined;
  if (scene.owner === 'red' || scene.owner === 'blue' || !alliedArmies(after.match, view, scene.owner)) return;
  const filtered = {
    ...scene,
    changes: scene.changes
      .filter((change) => known(change.unitId))
      .map((change) => {
        const source = change.source;
        return (source.type === 'supply' || source.type === 'transport') && !known(source.unitId) ? { ...change, source: { type: 'field' as const } } : change;
      }),
  };
  return actionSceneForVisiblePositions(filtered, visible);
}
