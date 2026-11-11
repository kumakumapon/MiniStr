import { armyPolicies, type ArmyPolicy } from '../game/armyPolicy';
import { isResearchBranchPoint, RESEARCH_AUTO_KEY, RESEARCH_MANUAL_KEY, type ResearchOrigin } from '../game/research';
import type { ReplayRuntime } from './replayRuntime';
import type { StorageLike } from '../game/session';
import { getLocale } from './locale';
import { escapeHtml } from './strings';

export function renderResearchFork(replay: ReplayRuntime, policy: ArmyPolicy, pending = false): string {
  const en = getLocale() === 'en';
  const eligible = isResearchBranchPoint(replay.file.commands, replay.index, replay.state);
  const legacy = (replay.file.initialState.ruleVersion ?? 0) < 12;
  const names = en ? ['Balanced', 'Offensive', 'Defensive'] : ['均衡', '攻勢', '守勢'];
  return `<section class="research-fork" aria-label="${en ? 'Branch into research' : '研究対局へ分岐'}"><p>${en ? 'At the start of a red turn, take control of red against a new blue CPU. Research uses separate saves and never updates normal records.' : '赤軍の手番開始から、人間赤／CPU青で指示を試せます。研究専用保存を使い、通常の戦績には反映しません。'}</p><label>${en ? 'Research blue CPU policy' : '研究用の青軍CPU方針'}<select id="research-policy" ${legacy ? 'disabled' : ''}>${armyPolicies.map((value, index) => `<option value="${escapeHtml(value)}" ${policy === value ? 'selected' : ''}>${names[index]}</option>`).join('')}</select></label><p>${en ? 'Blue difficulty starts at the replay setting. Its original army policy is not recorded.' : '青軍難易度は元リプレイから引き継ぎます。元の軍方針は記録されていません。'}${legacy ? (en ? ' Legacy rules use Balanced.' : ' 旧規則では均衡を使います。') : ''}</p><button id="research-fork" class="save-action" ${eligible && !replay.playing && !pending ? '' : 'disabled'}>${en ? 'Research from here' : 'ここから研究対局'}</button>${eligible ? '' : `<p>${en ? 'Seek to the start of a red turn to branch.' : '分岐するには赤軍の手番開始へ位置を戻してください。'}</p>`}</section>`;
}

export function renderResearchStatus(origin: ResearchOrigin, ended: boolean, canRetry = true): string {
  const en = getLocale() === 'en';
  return `<section class="research-status" role="status"><strong>${en ? 'RESEARCH MATCH — no normal records' : '研究対局 — 通常の記録には反映しません'}</strong><p>${en ? 'Branch after command' : '分岐位置'} ${Number(origin.branchIndex)} · ${escapeHtml(origin.replaySha256.slice(0, 12))}</p>${ended ? `<p>${en ? 'The result includes the history before branching. Retry returns to the same branch point.' : '結果集計には分岐前の履歴も含みます。やり直すと同じ分岐点へ戻ります。'}</p>` : ''}${!ended ? `<button class="save-action" data-research-retry ${canRetry ? '' : 'disabled'}>${en ? 'Retry from branch point' : '分岐点からやり直す'}</button>` : ''}${ended ? `<button class="save-action" data-research-save>${en ? 'Save research result' : '研究結果を手動保存'}</button>` : ''}<button class="save-action" data-research-export>${en ? 'Export research JSON' : '研究JSONを書き出す'}</button></section>`;
}

export function renderResearchSaves(storage: StorageLike): string {
  const en = getLocale() === 'en';
  let entries: { key: string; label: string; present: boolean }[];
  try {
    entries = [RESEARCH_MANUAL_KEY, RESEARCH_AUTO_KEY].map((key, i) => ({
      key,
      label: en ? (i === 0 ? 'Manual research' : 'Auto research') : i === 0 ? '研究・手動' : '研究・自動',
      present: storage.getItem(key) !== null,
    }));
  } catch {
    return '';
  }
  if (!entries.some((entry) => entry.present)) return '';
  return `<section class="research-saves" aria-label="${en ? 'Research saves' : '研究用セーブ'}"><h2>${en ? 'Research saves' : '研究用セーブ'}</h2><p>${en ? 'These two slots are separate from normal matches. Import a research JSON with the JSON import button.' : '通常の対局と分離した2枠です。研究JSONはJSON取込ボタンから読み込めます。'}</p>${entries.map((entry) => `<div><span>${entry.label}</span><button class="save-action" data-research-resume="${entry.key}" ${entry.present ? '' : 'disabled'}>${en ? 'Resume' : '再開'}</button><button class="save-action" data-research-raw="${entry.key}" ${entry.present ? '' : 'disabled'}>${en ? 'Export raw data' : '元データを書き出す'}</button><button class="save-action" data-research-delete="${entry.key}" ${entry.present ? '' : 'disabled'}>${en ? 'Delete' : '削除'}</button></div>`).join('')}</section>`;
}
