import { asymmetricBoard, type AsymmetricSource } from '../game/asymmetricBattlefield';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { FourArmyControllers } from '../game/fourArmyControl';
import { getLocale } from './locale';
import { renderMapPreview } from './mapPreview';
const copy = {
  canyon: [
    ['北の峠口・工場手前の山道', 'Northern pass · mountain approaches to the factory'],
    ['西の街道口・中央へ通じる道路', 'Western highway · roads toward the center'],
    ['東の山麓・山沿いの迂回路', 'Eastern foothills · skirt the ridge'],
    ['南の谷口・街道と外周路', 'Southern valley · highway or perimeter route'],
  ],
  marsh: [
    ['北の堤・湿地沿いの工場', 'Northern bank · factory on the wetland edge'],
    ['西の入口・湿地を横切る近道', 'Western approach · shortcut through the marsh'],
    ['東の低地・外周の乾いた道', 'Eastern lowland · dry route around the perimeter'],
    ['南の土手・中央への道路', 'Southern levee · road to the center'],
  ],
} as const;
export function renderStartingSites(source: AsymmetricSource, armies: readonly FourArmyId[], controllers: FourArmyControllers): string {
  const en = getLocale() === 'en';
  const { board, homes } = asymmetricBoard(source, armies);
  const labels = armies.map((a, i) => {
    const h = homes[a];
    return `${copy[source][i]![en ? 1 : 0]} (${h.x + 1}, ${h.y + 1})`;
  });
  return `<fieldset class="four-start-sites"><legend>${en ? 'Starting sites' : '出発地点'}</legend>${renderMapPreview(board, [], source === 'marsh' ? 'temperate' : 'desert')}${[
    ...armies,
  ]
    .sort()
    .map(
      (a) =>
        `<label class="four-army-label ${a}">${en ? 'Army ' + a.slice(-1) : '第' + a.slice(-1) + '軍'} · ${controllers[a] === 'cpu' ? 'CPU' : en ? 'Human' : '人間'}<select id="four-site-${a}" data-site-army="${a}">${labels.map((label, i) => `<option value="${i}" ${armies[i] === a ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`,
    )
    .join('')}</fieldset>`;
}
