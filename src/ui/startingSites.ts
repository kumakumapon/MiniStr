import { asymmetricBoard, isAsymmetricSource } from '../game/asymmetricBattlefield';
import type { FourArmyId } from '../game/fourArmyFoundation';
import type { FourArmyControllers } from '../game/fourArmyControl';
import { createExpandedBattleMap, latestExpandedBattleLayout } from '../game/expandedBattleMap';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { type MultiplayerMap } from './matchVariants';
import { getLocale } from './locale';
import { renderMapPreview } from './mapPreview';
const copy = {
  river: [
    ['北岸・北の橋頭堡', 'North bank · northern bridgehead'],
    ['西岸道・西の橋への進路', 'Western road · western crossing'],
    ['東岸道・東の橋への進路', 'Eastern road · eastern crossing'],
    ['南岸・中央と東の橋への進路', 'South bank · central and eastern crossings'],
  ],
  tundra: [
    ['北の守備軍・司令部を15ラウンド防衛', 'Northern defender · hold headquarters for 15 rounds'],
    ['西の攻撃軍・西峠から同盟軍と攻める', 'Western attacker · advance through the western pass'],
    ['東の攻撃軍・東峠から同盟軍と攻める', 'Eastern attacker · advance through the eastern pass'],
  ],
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
export function battlefieldTheme(source: unknown) {
  return source === 'tundra' ? 'snow' : source === 'canyon' ? 'desert' : 'temperate';
}
const cardinalNames = [
  ['北', 'North'],
  ['西', 'West'],
  ['東', 'East'],
] as const;
const cornerNames = [
  ['北西', 'Northwest'],
  ['北東', 'Northeast'],
  ['南東', 'Southeast'],
  ['南西', 'Southwest'],
] as const;

function previewLayout(source: MultiplayerMap, armies: readonly FourArmyId[]) {
  if (isAsymmetricSource(source)) return asymmetricBoard(source, armies);
  const sourceMapId = source === 'compact' ? 'skirmish' : source;
  const made =
    sourceMapId === 'wide'
      ? createFourArmyMap32()
      : createExpandedBattleMap({
          sourceMapId,
          participants: armies,
          layoutVersion: latestExpandedBattleLayout(sourceMapId, armies.length),
        });
  if (made.ok) return { board: made.value.board, homes: made.value.capitals, bridges: made.value.bridges ?? [] };
}

export function renderStartingSites(
  source: MultiplayerMap,
  armies: readonly FourArmyId[],
  controllers: FourArmyControllers,
  selectedArmy: FourArmyId,
  mode: 'human' | 'custom' | 'spectator',
  teams?: Readonly<Record<FourArmyId, FourArmyId>>,
): { diagram: string; roster: string } {
  const layout = previewLayout(source, armies);
  if (!layout) return { diagram: '', roster: '' };
  const { board, homes, bridges } = layout;
  for (const {
    position: { x, y },
  } of bridges)
    board.terrain[y]![x] = { kind: 'road' };
  const en = getLocale() === 'en';
  const loc = en ? 1 : 0;
  const armyName = (army: FourArmyId) => (en ? `Army ${army.slice(-1)}` : `第${army.slice(-1)}軍`);
  const authored = isAsymmetricSource(source);
  const names = armies.map((army, i) => {
    if (authored) return copy[source][i]![loc];
    if (armies.length === 3) return cardinalNames[i]![loc];
    const { x, y } = homes[army];
    return cornerNames[y < board.height / 2 ? (x < board.width / 2 ? 0 : 1) : x < board.width / 2 ? 3 : 2]![loc];
  });
  const teamLabel = (army: FourArmyId, i: number) => {
    if (source === 'tundra') return i === 0 ? (en ? 'Defender' : '守備側') : en ? 'Attackers' : '攻撃側';
    if (!teams) return en ? 'Free-for-all' : '個人戦';
    const team = String.fromCharCode(64 + Number(teams[army].slice(-1)));
    return en ? `Team ${team}` : `チーム${team}`;
  };
  const role = (army: FourArmyId, i: number) => [armyName(army), controllers[army] === 'human' ? (en ? 'Human' : '人間') : 'CPU', teamLabel(army, i)].join(' · ');
  const markers = armies
    .map((army, i) => {
      const { x, y } = homes[army];
      return `<button type="button" id="four-site-marker-${i}" data-site-index="${i}" class="four-site-marker four-army-label ${army}" style="left:${((x + 0.5) / board.width) * 100}%;top:${((y + 0.5) / board.height) * 100}%" aria-pressed="${army === selectedArmy}" aria-label="${names[i]} · ${role(army, i)}">${army.slice(-1)}</button>`;
    })
    .join('');
  const label = mode === 'human' ? (en ? 'Your army' : '操作する軍') : en ? 'Selected army' : '選択中の軍';
  const picker = `<label>${label}<select id="four-human-army">${armies
    .slice()
    .sort()
    .map((army) => `<option value="${army}" ${selectedArmy === army ? 'selected' : ''}>${armyName(army)}</option>`)
    .join('')}</select></label>`;
  const rows = armies
    .map((army, i) => {
      const site = authored
        ? `<label>${en ? 'Starting site' : '出発地点'}<select id="four-site-${army}" data-site-army="${army}">${names.map((name, j) => `<option value="${j}" ${i === j ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`
        : `<span>${names[i]}</span>`;
      const controller =
        mode === 'custom'
          ? `<label>${en ? 'Controller' : '操作担当'}<select id="four-controller-${army}" data-controller="${army}"><option value="human" ${controllers[army] === 'human' ? 'selected' : ''}>${en ? 'Human' : '人間'}</option><option value="cpu" ${controllers[army] === 'cpu' ? 'selected' : ''}>CPU</option></select></label>`
          : '';
      return `<li class="four-army-label ${army}"><strong>${role(army, i)}</strong>${site}${controller}</li>`;
    })
    .join('');
  const hint = authored
    ? en
      ? 'Select an army, then its starting headquarters on the map.'
      : '軍を選び、地図上の司令部を押すと、その軍の出発地点を入れ替えます。'
    : mode === 'human'
      ? en
        ? 'Choose a headquarters on the map to play as its army.'
        : '地図上の司令部を押して、操作する軍を選びます。'
      : en
        ? 'Select a headquarters to inspect its army.'
        : '地図上の司令部を押して、担当する軍を確認できます。';
  return {
    diagram: `<div class="briefing-map-viewport"><div class="briefing-map-surface four-site-map">${renderMapPreview(board, [], battlefieldTheme(source))}${markers}</div></div>`,
    roster: `<fieldset class="four-start-sites"><legend>${en ? 'Starting headquarters' : '出発地点・司令部'}</legend><p class="four-hint">${hint}</p>${picker}<ul>${rows}</ul></fieldset>`,
  };
}
