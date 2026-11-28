import { chooseCpuAction, type CpuDifficulty } from '../src/ai/rules';
import { applyGameCommand, createScenarioInitialState, decisionStanding, isGameOver, scenarioById, tacticalScenario, victoryReason, type GameState } from '../src/game';
import { LOGISTICS_RULE_VERSION } from '../src/game/logisticsOrders';

// Run the same match initialization and CPU used for play, including the tactical map variant.
const [seedList, red = 'normal', blue = 'normal', mapId = 'highland-crossing'] = process.argv.slice(2);
const difficulty = (name: string): CpuDifficulty => {
  if (name === 'easy' || name === 'normal' || name === 'hard') return name;
  throw Error('Expected easy, normal or hard');
};
const redDifficulty = difficulty(red);
const blueDifficulty = difficulty(blue);
if (!seedList) throw Error('Usage: duel-assessment.ts seed[,seed...] [red difficulty] [blue difficulty] [map id]');
const seeds = seedList.split(',').map((input) => {
  const seed = Number(input);
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(seed) || seed > 0xffffffff) throw Error('Invalid battle seed');
  return seed;
});
const source = scenarioById(mapId);
if (!source) throw Error(`Unknown scenario: ${mapId}`);
for (const seed of seeds) {
  for (const tactics of [false, true]) {
    const scenario = tactics ? tacticalScenario(source) : source;
    let state: GameState = { ...createScenarioInitialState(scenario), ruleVersion: LOGISTICS_RULE_VERSION, rngSeed: seed };
    let commands = 0;
    const landings: Record<string, number> = {};
    while (!isGameOver(state) && state.turn <= 100 && commands < 12000) {
      const action = chooseCpuAction(state, state.activePlayer === 'red' ? redDifficulty : blueDifficulty);
      const next = applyGameCommand(state, action);
      if (!next.ok) throw Error(`Illegal CPU action at seed ${seed} round ${state.turn}: ${next.error}`);
      if (action.type === 'disembark') {
        const transport = state.units.find((unit) => unit.id === action.transportId);
        if (transport) {
          const key = `${transport.owner}:${transport.kind}`;
          landings[key] = (landings[key] ?? 0) + 1;
        }
      }
      state = next.value;
      commands++;
    }
    console.log(
      JSON.stringify({
        seed,
        redDifficulty,
        blueDifficulty,
        tactics,
        winner: state.winner ?? (state.draw ? 'draw' : 'cutoff'),
        reason: victoryReason(state, scenario) ?? (state.draw ? 'draw' : 'cutoff'),
        round: state.turn,
        commands,
        landings,
        standing: { red: decisionStanding(state, 'red'), blue: decisionStanding(state, 'blue') },
      }),
    );
  }
}
