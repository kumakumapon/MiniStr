import { spawnSync } from 'node:child_process';
import { log, error as reportError } from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const executeDefault = (args, options) => spawnSync(process.execPath, [cli, ...args], options);
const output = (text) => process.stdout.write(text);

/** Keep custom/local invocations unchanged; distribute the existing plain CI shard per engine. */
export function parseEngineShard(args) {
  const rest = [],
    shards = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--shard') shards.push(args[++i]);
    else if (args[i].startsWith('--shard=')) shards.push(args[i].slice(8));
    else rest.push(args[i]);
  }
  if (!shards.length) return;
  if (shards.length !== 1 || !/^\d+\/\d+$/.test(shards[0] ?? '')) throw Error('Expected one valid --shard=current/total');
  const [current, total] = shards[0].split('/').map(Number);
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(total) || current < 1 || current > total || total < 1) throw Error('Invalid shard bounds');
  if (rest.some((arg) => !['--list', '--reporter=json'].includes(arg)) || (rest.includes('--reporter=json') && !rest.includes('--list'))) return;
  return { current, total, list: rest.includes('--list'), json: rest.includes('--reporter=json') };
}

export function selectedProjects(report) {
  const selected = new Set();
  const walk = (suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) {
        if (typeof test.projectName !== 'string' || !test.projectName) throw Error('Missing test project');
        selected.add(test.projectName);
      }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  const names = (report.config?.projects ?? []).map((p) => p.name).filter((name) => selected.has(name));
  if (!names.length || names.length !== selected.size || new Set(names).size !== names.length) throw Error('Incomplete browser discovery');
  return names;
}

export function engineCommands(shard, projects) {
  if (!projects.length || new Set(projects).size !== projects.length) throw Error('Invalid browser projects');
  return projects.map((project) => {
    const directory = encodeURIComponent(project).replaceAll('.', '%2E');
    return {
      project,
      args: [
        'test',
        `--project=${project}`,
        `--shard=${shard.current}/${shard.total}`,
        `--output=${resolve('test-results', `shard-${shard.current}-of-${shard.total}`, directory)}`,
        ...(shard.list ? ['--list'] : []),
        ...(shard.json ? ['--reporter=json'] : []),
      ],
    };
  });
}

export function runBrowserTests(args, execute = executeDefault, write = output, announce = log) {
  const shard = parseEngineShard(args);
  if (!shard) {
    const result = execute(['test', ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status === 0 ? 0 : 1;
  }
  const capture = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] };
  const discovery = execute(['test', '--list', '--reporter=json'], capture);
  if (discovery.error) throw discovery.error;
  if (discovery.status !== 0) {
    if (discovery.stdout) write(discovery.stdout);
    return 1;
  }
  const all = JSON.parse(discovery.stdout),
    reports = [];
  let failed = false;
  for (const command of engineCommands(shard, selectedProjects(all))) {
    if (!shard.json) announce(`Browser ${command.project}: shard ${shard.current}/${shard.total}`);
    const result = execute(command.args, shard.json ? capture : { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) failed = true;
    if (shard.json) reports.push(JSON.parse(result.stdout));
  }
  if (shard.json) {
    const stats = { ...(reports[0]?.stats ?? {}) };
    for (const key of ['duration', 'expected', 'unexpected', 'flaky', 'skipped']) stats[key] = reports.reduce((sum, r) => sum + (r.stats?.[key] ?? 0), 0);
    write(
      JSON.stringify({
        ...all,
        config: { ...all.config, shard: { current: shard.current, total: shard.total } },
        suites: reports.flatMap((r) => r.suites ?? []),
        errors: reports.flatMap((r) => r.errors ?? []),
        stats,
      }) + '\n',
    );
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runBrowserTests(process.argv.slice(2));
  } catch (error) {
    reportError(error);
    process.exitCode = 1;
  }
}
