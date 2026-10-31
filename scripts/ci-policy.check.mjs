import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';
import { isCurrentMain, isPublicationContext, runPreflight } from './pages-preflight.mjs';

const sha = 'a'.repeat(40);
const context = { eventName: 'push', ref: 'refs/heads/main', sha };
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const pages = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const publicationCondition = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')";

test('only main pushes and main manual runs can publish', () => {
  assert.equal(isPublicationContext(context), true);
  assert.equal(isPublicationContext({ ...context, eventName: 'workflow_dispatch' }), true);
  for (const eventName of ['pull_request', 'pull_request_target', 'workflow_run', 'schedule', undefined]) assert.equal(isPublicationContext({ ...context, eventName }), false);
  for (const ref of ['refs/heads/feature', 'refs/pull/1/merge', 'refs/tags/main', undefined]) assert.equal(isPublicationContext({ ...context, ref }), false);
  for (const invalid of ['', 'a'.repeat(39), 'z'.repeat(40), undefined, 42]) assert.equal(isPublicationContext({ ...context, sha: invalid }), false);
});

test('PRs and feature manual runs never request the main ref', async () => {
  const forbidden = () => assert.fail('Ineligible context must not request GitHub.');
  assert.equal(await isCurrentMain({ ...context, eventName: 'pull_request' }, forbidden), false);
  assert.equal(await isCurrentMain({ ...context, eventName: 'workflow_dispatch', ref: 'refs/heads/feature' }, forbidden), false);
});

test('obsolete builds are skipped and invalid or unavailable refs fail closed', async () => {
  assert.equal(await isCurrentMain(context, async () => ({ object: { sha } })), true);
  assert.equal(await isCurrentMain(context, async () => ({ object: { sha: 'b'.repeat(40) } })), false);
  for (const value of [null, {}, { object: {} }, { object: { sha: 'not-a-commit' } }]) await assert.rejects(isCurrentMain(context, async () => value));
  await assert.rejects(
    isCurrentMain(context, async () => {
      throw new Error('Unavailable');
    }),
  );
});

test('preflight uses the repository API and emits only the deployment decision', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ministr-ci-'));
  try {
    const output = join(directory, 'output');
    const environment = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: context.ref, GITHUB_SHA: sha, GITHUB_REPOSITORY: 'owner/game', GH_TOKEN: 'fixture-token', GITHUB_OUTPUT: output };
    let requested = false;
    const request = async (url, options) => {
      requested = true;
      assert.equal(url, 'https://api.github.com/repos/owner/game/git/ref/heads/main');
      assert.equal(options.headers.authorization, 'Bearer fixture-token');
      assert.ok(options.signal);
      return { ok: true, json: async () => ({ object: { sha } }) };
    };
    assert.equal(await runPreflight(environment, request), true);
    assert.equal(requested, true);
    assert.equal(readFileSync(output, 'utf8'), 'current=true\n');
    await assert.rejects(
      runPreflight(environment, async () => ({ ok: false, status: 503 })),
      /HTTP 503/,
    );
    assert.equal(readFileSync(output, 'utf8'), 'current=true\n');
    assert.equal(await runPreflight({ ...environment, GITHUB_REF: 'refs/heads/feature' }, () => assert.fail()), false);
    assert.equal(readFileSync(output, 'utf8'), 'current=true\ncurrent=false\n');
    await assert.rejects(runPreflight({ ...environment, GH_TOKEN: '' }, request), /incomplete/);
    await assert.rejects(runPreflight({ ...environment, GITHUB_REPOSITORY: 'bad/path/extra' }, request), /incomplete/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('main has one automatic verification path and manual runs call it', () => {
  assert.match(ci, /on:\n {2}pull_request:\n {4}branches: \[main\]\n {2}push:\n {4}branches: \[main\]\n {2}workflow_call:/);
  assert.match(pages, /on:\n {2}workflow_dispatch:/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.doesNotMatch(pages, /\bpush:|\bpull_request:|\brun:|concurrency:/);
  assert.doesNotMatch(ci + pages, /pull_request_target:|workflow_run:|secrets:|\$\{\{\s*secrets\./);
  assert.match(ci, /permissions:\n {2}contents: read/);
});

test('all existing gates remain and deployment requires every verification job', () => {
  for (const command of [
    'npm ci',
    'npm ls --all',
    'npm run lint',
    'npm run format:check',
    'npm run typecheck:test',
    'npm run test:coverage',
    'npm run build',
    'npm run test:ui',
    'npm run test:e2e',
    'npm run test:ci',
  ])
    assert.ok(ci.includes(`run: ${command}`), command);
  assert.match(ci, /scripts\/check-private-links\.sh "\$\{BASE_SHA\}\.\.\$\{HEAD_SHA\}"/);
  assert.match(ci, /node-version: 22\.13\.0/);
  assert.match(ci, /node-version: 24/);
  assert.match(ci, /needs: \[commit-hygiene, test-and-build, runtime-compatibility, terrain-stability\]/);
  assert.equal(ci.split(`if: ${publicationCondition}`).length - 1, 2);
  assert.match(ci, /if: steps\.publication\.outputs\.current == 'true'/);
  assert.match(ci, /run: node scripts\/pages-preflight\.mjs/);
  assert.equal((ci.match(/pages: write/g) ?? []).length, 1);
  assert.equal((ci.match(/id-token: write/g) ?? []).length, 1);
});

test('concurrency is scoped to workflow and ref, and production deployment serializes', () => {
  const groups = [...ci.matchAll(/group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}-(hygiene|quality|runtime|terrain)\n {6}cancel-in-progress: true/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(groups.sort(), ['hygiene', 'quality', 'runtime', 'terrain']);
  assert.doesNotMatch(ci, /^concurrency:/m);
  assert.match(ci, /group: pages-production\n {6}cancel-in-progress: false/);
});

test('terrain stability is an additional parallel gate with the same read-only policy', () => {
  const terrain = ci.split('  terrain-stability:\n')[1]?.split('  deploy:\n')[0];
  assert.ok(terrain);
  assert.match(terrain, /--project=webkit --repeat-each=3 --workers=2/);
  assert.doesNotMatch(terrain, /permissions:|secrets:|pages: write|id-token: write|continue-on-error:|--retries/);
});

test('external actions remain SHA pinned and use the reviewed runtime updates', () => {
  const uses = [...(ci + pages).matchAll(/uses: (\S+)/g)].map((match) => match[1]);
  for (const action of uses) assert.match(action, /^(?:\.\/\.github\/workflows\/ci\.yml|actions\/[\w-]+@[a-f0-9]{40})$/);
  for (const action of ['checkout', 'setup-node', 'upload-artifact', 'upload-pages-artifact', 'deploy-pages'])
    assert.ok(
      uses.some((value) => value.startsWith(`actions/${action}@`)),
      action,
    );
  assert.doesNotMatch(ci, /# v[34](?:\s|$)/m);
});

test('native audio recovery has an output device and runs before the unchanged full browser gate', () => {
  assert.match(ci, /sudo apt-get install --yes --no-install-recommends pulseaudio pulseaudio-utils/);
  assert.match(ci, /pulseaudio --start --exit-idle-time=-1/);
  assert.match(ci, /pactl load-module module-null-sink sink_name=ministr_ci/);
  assert.match(ci, /pactl set-default-sink ministr_ci/);
  const audio = ci.indexOf("run: npx playwright test tests/e2e/army-music.spec.ts --grep 'background return'");
  assert.ok(audio > ci.indexOf('run: npx playwright install --with-deps chromium firefox webkit'));
  assert.ok(audio < ci.indexOf('run: npm run test:e2e'));
});
