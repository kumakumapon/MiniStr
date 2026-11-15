import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEngineShard, selectedProjects, engineCommands, runBrowserTests } from './playwright-shard.mjs';
const projects = ['firefox', 'chromium', 'webkit'];
const report = (names = projects) => ({
  config: { projects: names.map((name) => ({ name })) },
  suites: [{ specs: [{ tests: names.map((projectName) => ({ projectName })) }] }],
  stats: { expected: names.length },
  errors: [],
});
test('retains unsharded and custom project/config/reporter invocations', () => {
  for (const args of [[], ['--project=webkit'], ['--shard=1/2', '--grep', 'combat'], ['--shard=1/2', '--config=other.ts'], ['--shard=1/2', '--reporter=json']]) {
    const calls = [];
    assert.equal(
      runBrowserTests(args, (argv) => {
        calls.push(argv);
        return { status: 0 };
      }),
      0,
    );
    assert.deepEqual(calls, [['test', ...args]]);
  }
});
test('rejects malformed, duplicate and out-of-range shard selections', () => {
  for (const args of [['--shard'], ['--shard=0/2'], ['--shard=3/2'], ['--shard=1/0'], ['--shard=1/2', '--shard=2/2'], ['--shard=x/y']]) assert.throws(() => parseEngineShard(args));
  assert.deepEqual(parseEngineShard(['--shard', '2/2']), { current: 2, total: 2, list: false, json: false });
});
test('discovers every selected engine and refuses empty, unknown or duplicated project metadata', () => {
  assert.deepEqual(selectedProjects(report()), projects);
  assert.throws(() => selectedProjects({}));
  const wrong = report();
  wrong.config.projects.pop();
  assert.throws(() => selectedProjects(wrong));
  const duplicate = report();
  duplicate.config.projects.push({ name: 'webkit' });
  assert.throws(() => selectedProjects(duplicate));
});
test('keeps the same shard ratio, budgets and unique artifact directories for every engine', () => {
  const commands = engineCommands(parseEngineShard(['--shard=1/2']), projects);
  assert.equal(commands.length, 3);
  assert.equal(new Set(commands.map((c) => c.args.find((a) => a.startsWith('--output=')))).size, 3);
  for (const c of commands) {
    assert.ok(c.args.includes('--shard=1/2'));
    assert.ok(c.args.includes('--project=' + c.project));
    assert.ok(!c.args.some((a) => /^--(?:workers|timeout|retries|grep|pass-with-no-tests)/.test(a)));
  }
  const unsafe = engineCommands({ current: 1, total: 2 }, ['../webkit'])[0].args.find((a) => a.startsWith('--output='));
  assert.ok(unsafe.endsWith('%2E%2E%2Fwebkit'));
});
test('runs all engines and preserves a failed or terminated child as an overall failure', () => {
  for (const failure of [{ status: 1 }, { status: null, signal: 'SIGTERM' }]) {
    const calls = [];
    const code = runBrowserTests(
      ['--shard=1/2'],
      (argv) => {
        calls.push(argv);
        return calls.length === 1 ? { status: 0, stdout: JSON.stringify(report()) } : calls.length === 2 ? failure : { status: 0 };
      },
      () => {},
      () => {},
    );
    assert.equal(code, 1);
    assert.equal(calls.length, 4);
  }
});
test('fails discovery and launch errors without manufacturing a passing suite', () => {
  assert.equal(
    runBrowserTests(
      ['--shard=1/2'],
      () => ({ status: 1, stdout: 'invalid discovery' }),
      () => {},
    ),
    1,
  );
  assert.throws(() => runBrowserTests(['--shard=1/2'], () => ({ status: 0, stdout: '{}' })));
  assert.throws(() => runBrowserTests([], () => ({ error: Error('cannot launch') })));
});
test('returns a combined JSON list containing all selected per-engine shard reports', () => {
  let calls = 0,
    result = '';
  assert.equal(
    runBrowserTests(
      ['--list', '--reporter=json', '--shard=2/2'],
      () => ({ status: 0, stdout: JSON.stringify(calls++ === 0 ? report() : report([projects[calls - 2]])) }),
      (s) => {
        result += s;
      },
      () => {},
    ),
    0,
  );
  const combined = JSON.parse(result);
  assert.equal(combined.suites.length, 3);
  assert.equal(combined.stats.expected, 3);
  assert.equal(calls, 4);
  assert.deepEqual(combined.config.shard, { current: 2, total: 2 });
});
