/** Legal-command campaign reference run. Red uses hard AI; blue uses the requested difficulty.
 * No synthetic unlocks, initial-state edits or RNG substitutions are used.
 * Usage: npm run campaign:playthrough -- normal /tmp/ministr-campaign-normal
 */
import fs from 'node:fs';
import path from 'node:path';
import { campaignStages, createCampaignProgress } from '../src/game';
import { playCampaignStage } from './campaignHarness';

function main() {
  const mode = process.argv[2] ?? 'normal';
  if (mode !== 'easy' && mode !== 'normal' && mode !== 'hard' && mode !== 'compare') throw new Error('Difficulty must be easy, normal, hard or compare');
  const output = process.argv[3] ?? `/tmp/ministr-campaign-${mode}`;
  fs.mkdirSync(output, { recursive: true });
  let progress = createCampaignProgress();
  const summaries = [];
  for (const stage of campaignStages) {
    // Comparison reuses the normal campaign's earned deployment for all three
    // opponents. Only the normal result advances progress in this mode.
    if (mode === 'compare')
      for (const difficulty of ['easy', 'hard'] as const) {
        const compared = playCampaignStage(progress, stage, difficulty);
        summaries.push(compared.summary);
        console.log(JSON.stringify(compared.summary));
        fs.writeFileSync(path.join(output, `${stage.scenarioId}.${difficulty}.replay.json`), compared.replay);
      }
    const result = playCampaignStage(progress, stage, mode === 'compare' ? 'normal' : mode);
    const name = mode === 'compare' ? `${stage.scenarioId}.normal` : stage.scenarioId;
    fs.writeFileSync(path.join(output, `${name}.replay.json`), result.replay);
    fs.writeFileSync(path.join(output, `${name}.trace.json`), JSON.stringify({ ...result, replay: undefined }));
    summaries.push(result.summary);
    console.log(JSON.stringify(result.summary));
    if (result.finalState.winner !== 'red') {
      process.exitCode = 1;
      break;
    }
    progress = result.progress;
  }
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
  fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(progress, null, 2));
}

main();
