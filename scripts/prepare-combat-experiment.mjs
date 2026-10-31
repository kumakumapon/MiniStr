/* global process, console */
/** Create an isolated, reproducible evaluation checkout. Never edits the source checkout. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const [directory, profile] = process.argv.slice(2);
if (!directory || !['classic', 'simultaneous', 'ambush', 'terrain', 'combined'].includes(profile))
  throw Error('Usage: node scripts/prepare-combat-experiment.mjs NEW_DIRECTORY PROFILE');
const target = resolve(directory);
execFileSync('git', ['worktree', 'add', '--detach', target, 'a273a8962099a581ccabbe859d13cb0bbf4ea616']);
copyFileSync('scripts/combatExperiment.ts', `${target}/scripts/combatExperiment.ts`);
symlinkSync(resolve('node_modules'), `${target}/node_modules`, 'dir');
const combatPath = `${target}/src/game/combat.ts`;
let combat = readFileSync(combatPath, 'utf8');
combat = `import { experimentalForecast } from '../../scripts/combatExperiment';\n${combat}`.replace('export function forecastCombat(', 'export function forecastClassicCombat(');
combat += `\nexport function forecastCombat(state: GameState, attacker: Unit, defender: Unit, requested?: WeaponSlot): GameResult<CombatForecast> { return experimentalForecast(state, attacker, defender, forecastClassicCombat(state, attacker, defender, requested), '${profile}'); }\n`;
writeFileSync(combatPath, combat);
if (profile === 'simultaneous' || profile === 'combined') {
  const path = `${target}/src/game/commands.ts`;
  let commands = readFileSync(path, 'utf8');
  const old = 'const counterForecast = forecast.value.counterWeapon !== undefined && defender.hp > damageToDefender';
  if (!commands.includes(old)) throw Error('Baseline counterattack implementation changed');
  commands = commands
    .replace(
      old,
      'const simultaneous = manhattanDistance(attacker.position, defender.position) === 1;\n  const counterForecast = forecast.value.counterWeapon !== undefined && (simultaneous || defender.hp > damageToDefender)',
    )
    .replace('hp: defender.hp - damageToDefender, hasMoved: false', 'hp: simultaneous ? defender.hp : defender.hp - damageToDefender, hasMoved: false')
    .replace(
      'applyDamageVariance(counterForecast.value.damageToDefender, counterRoll.value)',
      'applyDamageVariance(simultaneous ? forecast.value.damageToAttacker : counterForecast.value.damageToDefender, counterRoll.value)',
    );
  commands = commands.replace('unitMovementCost, positionKey,', 'manhattanDistance, unitMovementCost, positionKey,');
  writeFileSync(path, commands);
}
console.log(
  JSON.stringify({
    directory: target,
    profile,
    baseline: 'a273a8962099a581ccabbe859d13cb0bbf4ea616',
    experiment: 'working-tree',
    attackInitiative: 1.05,
    extraGroundCover: { plain: 1, mountain: 1 },
    ambush: 'visibility-before-attack; no automatic movement reaction',
  }),
);
