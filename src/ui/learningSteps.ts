import { operationScenarios, scenarioForState, type GameState, type PlayerId } from '../game';
import type { LearningProgress } from '../game/learningLog';
import { operationRevision } from '../game/operationRecords';
import { tacticalScenario } from '../game/tacticalMaps';
import { getLocale } from './locale';
const localized = (ja: string, en: string): string => (getLocale() === 'en' ? en : ja);

export interface LearningStep {
  title: string;
  text: string;
  done: boolean;
}
const step = (title: string, englishTitle: string, text: string, englishText: string, done: boolean): LearningStep => ({
  title: localized(title, englishTitle),
  text: localized(text, englishText),
  done,
});

export function isLearningOperation(state: GameState): boolean {
  if (state.scenarioId !== 'tactics-supply' && state.scenarioId !== 'tactics-crossing') return false;
  const actual = scenarioForState(state),
    canonical = operationScenarios.find((map) => map.id === state.scenarioId);
  return !!actual && !!canonical && [canonical, tacticalScenario(canonical)].some((map) => operationRevision(map) === operationRevision(actual));
}

/** Instructions describe the known exercise; progress comes only from the viewer's legal history. */
export function learningSteps(state: GameState, viewer: PlayerId, p: LearningProgress): LearningStep[] | undefined {
  if (viewer !== 'red') return;
  if (state.scenarioId === 'training')
    return [
      step(
        '移動',
        'Move',
        '歩兵 (1,2) を選び、下の都市 (1,3) を選びます。矢印キーとEnterでも操作できます。',
        'Select the infantry at (1,2), then the city at (1,3). Arrow keys and Enter also work.',
        p.move,
      ),
      step(
        '攻撃',
        'Attack',
        '戦車 (4,2) から隣の敵歩兵を攻撃します。予測で反撃と損害の幅も確認しましょう。',
        'Attack the adjacent enemy infantry with the tank at (4,2). Check counterfire and the damage range in the forecast.',
        p.attack,
      ),
      step(
        '占領完了',
        'Complete a capture',
        '都市の歩兵で「占領」。開始しただけでは完了せず、次の自軍ターンにも繰り返します。',
        'Use Capture with the infantry on the city. Starting a capture is not completion; continue on your next turn.',
        p.capture,
      ),
      step(
        'ターン終了・補給',
        'End turn and supply',
        '自軍拠点は収入源です。対応施設や補給車の隣で補給し、自軍ターンを終了します。',
        'Properties provide income. Use compatible facilities or a supply vehicle, then end your turn.',
        p.endTurn,
      ),
      step(
        '生産',
        'Produce',
        '空いている自軍工場 (2,1) で歩兵を生産します。施設上の部隊は先に動かします。',
        'Produce infantry at the empty factory at (2,1). Move any unit occupying it first.',
        p.produce,
      ),
      step(
        '搭載から降車まで',
        'Load and unload',
        '歩兵を輸送車の隣へ移動して搭載します。輸送車を進めるのは次の自軍手番です。空いている隣接陸地へ降車します。移動後に降車できない旧ルールでは次のターンを待ちます。',
        'Load infantry from beside a transport. Move the transport on your next turn, then unload onto adjacent empty land. Under older rules, wait until the next turn after moving the transport.',
        p.disembark,
      ),
    ];
  if (!isLearningOperation(state)) return;
  if (state.scenarioId === 'tactics-supply')
    return [
      step(
        '前進と護衛',
        'Advance with support',
        '歩兵を中央の都市 (5,4) へ進め、戦車・砲兵で進路を守ります。',
        'Advance infantry to the central city at (5,4), supported by armour and artillery.',
        p.move,
      ),
      step(
        '戦闘予測を使う',
        'Use combat forecasts',
        '射程・反撃・地形を予測で確認してから攻撃します。砲兵は移動したターンに撃てません。',
        'Check range, counterfire and cover before attacking. Artillery cannot fire after moving.',
        p.attack,
      ),
      step(
        '占領を完了する',
        'Finish the capture',
        '都市で占領を繰り返し、所有色が自軍へ変わるまで歩兵を守ります。',
        'Repeat Capture on the city and protect the infantry until ownership changes.',
        p.capture,
      ),
      step(
        '増援を生産する',
        'Produce reinforcements',
        '自軍工場 (1,4) を空け、歩兵などを生産して前線へ送ります。',
        'Clear the factory at (1,4), produce a unit and send it forward.',
        p.produce,
      ),
      step(
        '実際に補給を受ける',
        'Receive supplies',
        '弾薬や燃料を使った部隊を補給車の隣か対応する自軍施設へ置き、次の自軍手番の補給を確認します。',
        'After using ammunition or fuel, position the unit beside a supply vehicle or on a compatible owned facility. Confirm replenishment at your next turn.',
        p.resupply,
      ),
      step(
        '都市を保持して勝利',
        'Hold the city to win',
        '中央都市を地上部隊で3回連続、自軍ターン終了まで保持します。学習課題は勝利の追加条件ではありません。',
        'Keep a ground unit on the owned central city for three consecutive own turn endings. Learning tasks are optional, not extra victory conditions.',
        state.winner === viewer,
      ),
    ];
  return [
    step(
      '対岸を偵察する',
      'Scout the far bank',
      '広域偵察は各軍2回です。対岸の出口と敵が近づきそうな場所を確認します。',
      'Each army has two area scans. Scout the exit and likely enemy approaches on the far bank.',
      p.recon,
    ),
    step(
      '仮設橋を架ける',
      'Build a temporary bridge',
      '工兵 (5,4) から川 (6,4) に架橋します。1000G、未移動・未行動が必要。上下端の迂回路も使えます。',
      'Build from the engineer at (5,4) onto the river at (6,4). It costs 1000G and requires an unmoved, unacted engineer. Roads at both edges offer detours.',
      p.bridge,
    ),
    step(
      '指定歩兵を搭載する',
      'Load the mission infantry',
      '指定歩兵 r2 を隣接する輸送車へ搭載します。対象を失うと敗北するので護衛します。',
      'Load mission infantry r2 into the adjacent transport and protect it; losing the target means defeat.',
      p.missionEmbark,
    ),
    step(
      '対岸へ運び降車する',
      'Carry and unload',
      '次の自軍手番に工兵を動かして橋の進入口を空け、輸送車で渡ります。歩兵は空いた隣接陸地へ降車します。移動後に降車できない旧ルールでは次のターンを待ちます。',
      'On your next turn, move the engineer off the approach, cross with the transport and unload onto adjacent empty land. Under older rules, wait until the next turn after moving the transport.',
      p.missionUnload,
    ),
    step(
      '出口から撤退する',
      'Evacuate from the exit',
      '歩兵 r2 を出口 (9,4) へ進め、未行動の状態で「撤退」を実行します。',
      'Move infantry r2 to the exit at (9,4) and use Evacuate before acting.',
      p.missionEvacuate,
    ),
    step(
      '作戦を完了する',
      'Complete the operation',
      '指定歩兵の脱出で勝利です。迂回や徒歩でも攻略でき、学習課題は勝利の追加条件ではありません。',
      'Evacuate the mission infantry to win. Walking or taking a detour is also valid; learning tasks are not extra victory conditions.',
      state.winner === viewer,
    ),
  ];
}
