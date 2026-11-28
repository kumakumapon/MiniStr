import type { ScenarioDefinition } from '../game/maps';
import { getLocale } from './locale';
import { renderMapPreview } from './mapPreview';
import { renderBriefingPreview } from './briefingShell';

export function renderScenarioBriefingMap(map: ScenarioDefinition, showPlayerDeployment: boolean, zoomed: boolean): string {
  const { board } = map;
  // The shared device can be seen by both players. Show planned units only to a solo commander.
  const units = showPlayerDeployment ? map.initialUnits.filter((unit) => unit.owner === 'red') : [];
  const english = getLocale() === 'en';
  const objectives = [...map.victoryConditions, ...map.defeatConditions].flatMap((condition) => ('positions' in condition ? condition.positions : []));
  const locations = new Map(objectives.map((position) => [`${position.x},${position.y}`, position]));
  const marker = (x: number, y: number, kind: string, label: string) =>
    `<span aria-hidden="true" class="briefing-marker ${kind}" style="left:${((x + 0.5) / board.width) * 100}%;top:${((y + 0.5) / board.height) * 100}%">${label}</span>`;
  const capitals = board.terrain.flatMap((row, y) => row.flatMap((tile, x) => (tile.kind === 'capital' ? [marker(x, y, `briefing-hq ${tile.owner ?? ''}`, '⚑')] : [])));
  const targets = [...locations.values()].map(({ x, y }) => marker(x, y, 'briefing-objective', '◇'));
  const legend = [
    ...(capitals.length ? [`<span><b>⚑</b> ${english ? 'Headquarters' : '司令部'}</span>`] : []),
    ...(units.length ? [`<span><b>●</b> ${english ? 'Your starting units' : '自軍の初期部隊'}</span>`] : []),
    ...(targets.length ? [`<span><b>◇</b> ${english ? 'Objective' : '目標地点'}</span>`] : []),
  ].join('');
  return renderBriefingPreview(
    `<div class="briefing-map-viewport" tabindex="0" role="region" aria-label="${english ? 'Battlefield map' : '戦域図'}">
    <div class="briefing-map-surface">${renderMapPreview(board, units, map.theme)}${capitals.join('')}${targets.join('')}</div></div>
    <div class="briefing-map-legend">${legend}</div>`,
    zoomed,
  );
}
