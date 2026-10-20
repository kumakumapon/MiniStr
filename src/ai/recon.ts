import { scenarioForState } from '../game/maps';
import { visiblePositions } from '../game/fog';
import { remainingRecon, RECON_RADIUS } from '../game/recon';
import { isDeployedUnit, type GameState, type PlayerId, type Position } from '../game/types';
import { manhattanDistance } from '../game/terrain';
import { isPropertyTerrainKind } from '../game/facilities';

/** Uses public terrain/objectives and friendly positions only; hidden enemies cannot affect a scan order. */
export function chooseReconCenter(state: GameState, player: PlayerId): Position | undefined {
  if (state.winner || state.activePlayer !== player || state.turn < 2 || remainingRecon(state, player) === 0) return undefined;
  const scenario = scenarioForState(state);
  if (!scenario) return undefined;
  const allies = state.units.filter((unit) => unit.owner === player && isDeployedUnit(unit));
  if (!allies.length) return undefined;
  const known = new Set(visiblePositions(state, player).map((p) => `${p.x},${p.y}`));
  const objectives = [...scenario.victoryConditions, ...scenario.defeatConditions].flatMap((condition) => ('positions' in condition ? condition.positions : []));
  const candidates = scenario.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (isPropertyTerrainKind(tile.kind) && tile.owner !== player ? [{ x, y }] : [])));
  const ranked = [...candidates, ...objectives]
    .map((center) => {
      const distance = Math.min(...allies.map((unit) => manhattanDistance(unit.position!, center)));
      let unseen = 0;
      for (let y = Math.max(0, center.y - RECON_RADIUS); y <= Math.min(state.board.height - 1, center.y + RECON_RADIUS); y++)
        for (let x = Math.max(0, center.x - RECON_RADIUS); x <= Math.min(state.board.width - 1, center.x + RECON_RADIUS); x++)
          if (manhattanDistance(center, { x, y }) <= RECON_RADIUS && !known.has(`${x},${y}`)) unseen++;
      return { center, score: distance <= 7 && unseen >= 6 ? unseen + (7 - distance) * 2 : -1 };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.center.y - b.center.y || a.center.x - b.center.x);
  return ranked[0]?.center;
}
