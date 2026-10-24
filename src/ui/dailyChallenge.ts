import { dailyConditions, type DailyConditions, type DailyRecord, type DailyRecords } from '../game/dailyChallenge';
import { escapeHtml } from './strings';

const seaNames = { none: '海域なし', coast: '海域少なめ', ocean: '海域多め' } as const;
const presetNames = { standard: '標準', frontline: '前線補給・工兵' } as const;

/** Board size as shown elsewhere (`W×H`): generated boards are `size x (size - 4)`. */
export const dailyBoardLabel = (size: number): string => `${size}×${size - 4}`;

export interface DailyCardView {
  conditions: DailyConditions;
  /** Today's saved record, if any. */
  today?: DailyRecord;
  /** Undefined when the stored records could not be read. */
  catalog?: DailyRecords;
  notice: string;
  recordsOpen: boolean;
}

function facts(conditions: DailyConditions): string {
  return `<dl class="daily-facts"><div><dt>識別子</dt><dd><code class="daily-code">${escapeHtml(conditions.code)}</code></dd></div><div><dt>盤面</dt><dd>${dailyBoardLabel(conditions.size)}</dd></div><div><dt>海域</dt><dd>${seaNames[conditions.sea]}</dd></div><div><dt>種別</dt><dd>${presetNames[conditions.preset]}</dd></div></dl>`;
}
const bestText = (record: Pick<DailyRecord, 'bestTurns' | 'bestLosses'>): string => `最短${record.bestTurns}ターン・損失${record.bestLosses}`;

/** The title's "today's battlefield" card. It deliberately does not reuse `.title-map-card`. */
export function renderDailyCard(view: DailyCardView): string {
  const { conditions } = view;
  const records = view.catalog
    ? view.catalog.records.length
      ? `<ol class="daily-record-list">${view.catalog.records
          .map((record) => {
            const recordConditions = dailyConditions(record.date, record.generation);
            return `<li><article><h4><time datetime="${record.date}">${record.date}</time></h4><p><code class="daily-code">${recordConditions.ok ? escapeHtml(recordConditions.value.code) : ''}</code></p><p>${bestText(record)}</p><button type="button" class="save-action" data-daily-delete="${record.date}" aria-label="${record.date}の記録を削除">削除</button></article></li>`;
          })
          .join('')}</ol>`
      : '<p>日替わりチャレンジの記録はまだありません。</p>'
    : '<p>記録を読み出せませんでした。初期化すると記録保存を再開できます。</p>';
  return `<section data-ui-copy class="daily-card" aria-labelledby="daily-heading" data-daily-date="${conditions.date}"><p class="card-kicker">DAILY CHALLENGE</p><h3 id="daily-heading">今日の戦域</h3><p class="daily-date"><time datetime="${conditions.date}">${conditions.date}</time> <small>UTC基準</small></p><p class="daily-note">日付はUTC基準で切り替わります（日本時間では9時）。</p>${facts(conditions)}<p class="daily-best">${view.today ? bestText(view.today) : '今日はまだクリアしていません。'}</p><p class="daily-rules">固定条件：難易度は普通、補給は有限、人間の赤軍対CPU。編成を変えると記録されません。</p><button id="daily-start" type="button" class="end-turn">今日の戦域を開始 <span aria-hidden="true">→</span></button>${view.notice ? `<p class="daily-notice" role="status">${escapeHtml(view.notice)}</p>` : ''}<details id="daily-records" class="history-panel daily-records" ${view.recordsOpen ? 'open' : ''}><summary id="daily-records-heading">日替わりチャレンジの記録${view.catalog ? `：${view.catalog.records.length}日分` : ''}</summary><p>最新60日分をこのブラウザーだけに保存します。ローカルで編集できるため、認証付きのランキングではありません。</p>${records}<button id="daily-records-reset" type="button" class="save-action">記録を初期化</button></details></section>`;
}

/** Shown above the deployment panel while a daily battlefield is being prepared. */
export function renderDailyBriefingNote(view: { conditions: DailyConditions; standard: boolean }): string {
  return `<section data-ui-copy class="daily-briefing" aria-label="日替わりチャレンジの条件"><h3>日替わりチャレンジ</h3><p><code class="daily-code">${escapeHtml(view.conditions.code)}</code></p><p>難易度・補給方式・対戦形式は固定されています。</p><p class="${view.standard ? 'daily-ok' : 'daily-warning'}">${view.standard ? '標準編成：赤軍の勝利を記録します。' : '編成が標準と異なるため、この対局は記録されません。'}</p></section>`;
}

export interface DailyResultView {
  code: string;
  /** This match's figures, present only when it qualified. */
  record?: Pick<DailyRecord, 'bestTurns' | 'bestLosses'>;
  notice: string;
  copyNotice: string;
}
/** Result-screen section: the shareable identifier with a copy button and the recording outcome. */
export function renderDailyResult(view: DailyResultView): string {
  return `<section data-ui-copy class="daily-result" aria-label="日替わりチャレンジの結果"><h3>日替わりチャレンジ</h3><p>識別子：<code id="daily-code" class="daily-code">${escapeHtml(view.code)}</code> <button id="daily-copy-id" type="button" class="save-action">識別子をコピー</button></p>${view.record ? `<p>今回：${bestText(view.record)}</p>` : ''}${view.notice ? `<p role="status">${escapeHtml(view.notice)}</p>` : ''}${view.copyNotice ? `<p role="status">${escapeHtml(view.copyNotice)}</p>` : ''}</section>`;
}
