import { log, error as reportError } from 'node:console';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';

const [beforeRoot, afterRoot, directory] = process.argv.slice(2).map((path) => resolve(path));
const revisions = { before: process.env.RESPONSE_BEFORE_SHA, after: process.env.RESPONSE_AFTER_SHA };
if (!beforeRoot || !afterRoot || !directory || Object.values(revisions).some((sha) => !/^[a-f0-9]{40}$/.test(sha ?? '')))
  throw Error('Usage: BEFORE_ROOT AFTER_ROOT OUTPUT_DIRECTORY with RESPONSE_BEFORE_SHA/RESPONSE_AFTER_SHA');
mkdirSync(directory, { recursive: true });
const roots = { before: beforeRoot, after: afterRoot },
  ports = { before: 4175, after: 4176 };
const versions = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, JSON.parse(readFileSync(join(root, 'package.json'))).version]));
const libraries = (root) => {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  delete lock.version;
  delete lock.packages[''].version;
  return JSON.stringify(lock);
};
if (libraries(beforeRoot) !== libraries(afterRoot)) throw Error('Comparison requires the same locked dependencies');
const servers = [];
const execute = (script, args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: afterRoot, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(Error('Measurement exited with code ' + code))));
  });
const distribution = (values) => {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw Error('Invalid samples');
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};
try {
  for (const name of ['before', 'after']) {
    const log = openSync(join(directory, name + '-preview.log'), 'w');
    const child = spawn(process.execPath, [join(roots[name], 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(ports[name]), '--strictPort'], {
      cwd: roots[name],
      stdio: ['ignore', log, log],
    });
    closeSync(log);
    servers.push(child);
    child.on('error', (error) => reportError(error));
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        ready = (await globalThis.fetch('http://127.0.0.1:' + ports[name], { signal: globalThis.AbortSignal.timeout(1000) })).ok;
      } catch {
        /* startup */
      }
      if (ready) break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    }
    if (!ready) throw Error(name + ' preview did not start');
  }
  const documents = [];
  for (const engine of ['chromium', 'firefox', 'webkit'])
    for (let pair = 0; pair < 3; pair++) {
      for (const variant of pair % 2 ? ['after', 'before'] : ['before', 'after']) {
        const output = join(directory, engine + '-' + pair + '-' + variant + '.json');
        await execute(join(afterRoot, 'scripts/browser-response-v156.mjs'), ['http://127.0.0.1:' + ports[variant], output, variant, String(pair), engine, roots[variant]], {
          MINISTR_RESPONSE_SCREENSHOTS: pair === 0 ? '1' : '0',
        });
        const document = JSON.parse(readFileSync(output));
        if (
          document.samples.length !== 6 ||
          document.samples.some((sample) => !sample.build.includes('v' + versions[variant]) || !sample.build.includes(revisions[variant].slice(0, 12)))
        )
          throw Error('Served build identity does not match the pinned source');
        documents.push(document);
      }
    }
  if (new Set(documents.map((document) => document.harnessSha256)).size !== 1) throw Error('Mixed measurement harnesses');
  const rows = [];
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const first = documents.find((document) => document.engine === engine);
    for (const reference of first.samples) {
      const row = { engine, width: reference.width, size: reference.size, locale: reference.locale, requestedZoom: reference.requestedZoom };
      for (const variant of ['before', 'after']) {
        const group = documents.filter((document) => document.engine === engine && document.variant === variant);
        const samples = group.flatMap((document) =>
          document.samples.filter((sample) => sample.width === row.width && sample.size === row.size && sample.locale === row.locale && sample.requestedZoom === row.requestedZoom),
        );
        if (samples.length !== 3 || samples.some((sample) => sample.selections.length !== 25 || sample.keyboard.length !== 20 || sample.roster.length !== 20))
          throw Error('Incomplete comparison');
        const stats = (values) => Object.fromEntries(['handlerMs', 'firstFrameMs', 'paintMs'].map((key) => [key, distribution(values.map((value) => value[key]))]));
        row[variant] = {
          source: revisions[variant],
          uiSourceSha256: group[0].uiSourceSha256,
          browser: group[0].browser,
          host: group[0].host,
          first: stats(samples.map((sample) => sample.selections[0])),
          warm: stats(samples.flatMap((sample) => sample.selections.slice(1))),
          keyboard: stats(samples.flatMap((sample) => sample.keyboard)),
          roster: stats(samples.flatMap((sample) => sample.roster)),
          resume: stats(samples.map((sample) => sample.resume)),
          scrolledResume: stats(samples.map((sample) => sample.scrolledResume)),
          rosterOpen: stats(samples.map((sample) => sample.rosterOpen)),
          rosterResume: stats(samples.map((sample) => sample.rosterResume)),
          filterHandlerMs: distribution(samples.map((sample) => sample.filterHandlerMs)),
          retainedRosters: samples.filter((sample) => sample.rosterRetained).length,
        };
      }
      rows.push(row);
      log('MINISTR_RESPONSE_COMPARISON ' + JSON.stringify(row));
    }
  }
  writeFileSync(
    join(directory, 'summary.json'),
    JSON.stringify(
      {
        format: 'response-v156-paired',
        revisions,
        versions,
        harnessSha256: documents[0].harnessSha256,
        rows,
        note: 'Three alternating A/B pairs per engine, sequential on one host. No CPU games or other browser suites during measurement. Frame proxies include scheduling; samples are correlated and do not establish physical-mobile p95 or GPU presentation. All outcomes retained; no timing threshold.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  for (const child of servers) child.kill('SIGTERM');
}
