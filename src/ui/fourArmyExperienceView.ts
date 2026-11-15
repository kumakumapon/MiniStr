import type { FourArmyExperience, FourArmyExperienceView, FourArmyObservedEvent } from '../game/fourArmyExperience';
import type { FourArmyState } from '../game/fourArmyEngine';
import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import { fourArmyHumanArmies, type FourArmyControllers } from '../game/fourArmyControl';
import type { SoundEvent } from './presentationEffects';
import { fourArmyName } from './fourArmyBattleView';
import { getLocale } from './locale';
import { unitNames } from './labels';
import { escapeHtml } from './strings';

const text = (ja: string, en: string) => (getLocale() === 'en' ? en : ja);
const point = (p: { x: number; y: number }) => `(${p.x + 1}, ${p.y + 1})`;
export function fourArmyEventText(event: FourArmyObservedEvent): string {
  const names: Record<FourArmyObservedEvent['type'], string> = {
    move: text('移動', 'moved'),
    wait: text('行動終了', 'waited'),
    attack: text('攻撃', 'attacked'),
    merge: text('合流', 'merged'),
    capture: text('占領', 'captured'),
    produce: text('生産', 'produced'),
    embark: text('搭乗', 'embarked'),
    disembark: text('降車', 'disembarked'),
    endTurn: text('手番終了', 'ended turn'),
    resume: text('ラウンド再開', 'resumed'),
    fortify: text('陣地設営', 'fortified'),
    recon: text('広域偵察', 'reconnaissance'),
    ambush: text('待伏せ準備', 'prepared ambush'),
    logistics: text('兵站指示', 'logistics order'),
    repairReserve: text('修理予算', 'repair reserve'),
    contact: text('接触による交戦', 'contact engagement'),
  };
  const where =
    event.from && event.to && point(event.from) !== point(event.to)
      ? `${point(event.from)} → ${point(event.to)}`
      : event.to
        ? point(event.to)
        : event.from
          ? point(event.from)
          : '';
  const departed = event.type === 'move' && event.from && !event.to ? text('（移動後は未確認）', ' (no longer observed)') : '';
  return [
    `R${event.round}`,
    fourArmyName(event.actor),
    event.unitKind ? unitNames[event.unitKind] : '',
    names[event.type] + departed,
    event.targetKind ? '→ ' + unitNames[event.targetKind] : '',
    event.damage !== undefined ? `HP −${event.damage}` : '',
    event.counterDamage !== undefined ? text(`反撃 HP −${event.counterDamage}`, `Return fire HP −${event.counterDamage}`) : '',
    where,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function fourArmyEventSound(event: FourArmyObservedEvent): SoundEvent | undefined {
  if (event.type === 'attack' || event.type === 'contact') return 'attack';
  if (event.type === 'capture' || event.type === 'fortify') return 'capture';
  if (event.type === 'produce') return 'produce';
  if (['move', 'embark', 'disembark', 'merge'].includes(event.type)) return 'move';
  return;
}
export function renderFourArmyHistory(experience: FourArmyExperience, view: FourArmyExperienceView, position: number): { contacts: string; events: string } {
  const contacts = view === 'all' ? [] : experience.sightings[view].filter((r) => r.at <= position);
  const events = experience.events[view].filter((e) => e.at <= position);
  return {
    contacts:
      view === 'all'
        ? `<p class="four-hint">${text('軍別視点では、その軍の目撃履歴を確認できます。', 'Choose an army view to inspect its sighting history.')}</p>`
        : `<p class="four-hint">${text('当時の位置・HPです。現在の敵位置とは限りません。各軍128部隊まで保持します。', 'Positions and HP are from the sighting, not a guarantee of current positions. Up to 128 contacts per army.')}</p>` +
          (contacts.length
            ? `<ol class="four-history-list">${contacts.map((r) => `<li><button data-four-sighting="${r.position.x},${r.position.y}" class="four-history-contact"><strong>${escapeHtml(fourArmyName(r.owner) + ' ' + unitNames[r.kind])}</strong><span>R${r.round} · ${point(r.position)} · HP ${r.hp}</span></button></li>`).join('')}</ol>`
            : `<p>${text('この範囲に保存された目撃履歴はありません。', 'No saved sightings in this range.')}</p>`),
    events:
      `<p class="four-hint">${text('この視点で観測できた行動のみ、直近128件を保持します。', 'Only actions observable from this view are retained, up to the latest 128.')}</p>` +
      (events.length
        ? `<ol class="four-history-list four-event-list" reversed>${[...events]
            .reverse()
            .map((e) => `<li>${escapeHtml(fourArmyEventText(e))}</li>`)
            .join('')}</ol>`
        : `<p>${text('この範囲に保存された行動履歴はありません。', 'No saved actions in this range.')}</p>`),
  };
}
/** Full results are revealed only after the whole match has ended. Never expose hidden survivors on a human loss. */
export function renderFourArmyResult(state: FourArmyState, controllers: FourArmyControllers, count: number, readonly: boolean, conflicted: boolean): string {
  if (state.outcome.type === 'ongoing') return '';
  const humans = fourArmyHumanArmies(controllers);
  const title = state.outcome.type === 'draw' ? text('引き分け', 'Draw') : fourArmyName(state.outcome.winner) + text('の勝利', ' wins');
  const personal =
    humans.length === 1 && state.outcome.type === 'victory'
      ? state.outcome.winner === humans[0]
        ? text('あなたの勝利です。', 'You win.')
        : text('あなたの軍は敗北しました。', 'Your army lost.')
      : '';
  return `<section class="four-result" aria-labelledby="four-result-title"><h2 id="four-result-title" tabindex="-1">${escapeHtml(title)}</h2><p>${personal} ${text('ラウンド', 'Round')} ${state.round.round} · ${count.toLocaleString()} ${text('命令', 'commands')}</p><div class="four-result-table"><table><thead><tr><th>${text('軍', 'Army')}</th><th>${text('結果', 'Result')}</th><th>${text('残部隊', 'Units left')}</th><th>${text('施設', 'Properties')}</th></tr></thead><tbody>${FOUR_ARMY_IDS.map(
    (army) => {
      const eliminated = state.eliminations.find((e) => e.army === army);
      const result =
        state.outcome.type === 'victory' && state.outcome.winner === army
          ? text('勝利', 'Winner')
          : eliminated
            ? `R${eliminated.round} ${text('脱落', 'eliminated')}`
            : text('引分', 'Draw');
      const properties = state.board.terrain.flat().filter((tile) => tile.owner === army).length;
      return `<tr><th>${escapeHtml(fourArmyName(army))}<small>${controllers[army] === 'human' ? text('人間', 'Human') : 'CPU'}</small></th><td>${result}</td><td>${state.units.filter((u) => u.owner === army).length}</td><td>${properties}</td></tr>`;
    },
  ).join(
    '',
  )}</tbody></table></div><p class="four-hint">${text('通常2軍の戦績・キャンペーンには反映しません。', 'Four-army results do not affect normal two-army or campaign records.')}</p><div class="four-buttons">${readonly ? '' : `<button id="four-rematch" class="four-primary" ${conflicted ? 'disabled' : ''}>${text('同条件で再戦', 'Rematch same conditions')}</button>`}<button id="four-result-export">${text('記録を書き出す', 'Export record')}</button></div><p class="four-hint">${text('再戦はseed・手番順・人間／CPU割当・規則・CPU版・現在のCPU設定を引き継ぎます。', 'Rematches retain the seed, turn order, controllers, rules, CPU version and current CPU settings.')}</p></section>`;
}
