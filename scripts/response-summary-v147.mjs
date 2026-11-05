import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const [directory, output] = process.argv.slice(2);
if (!directory || !output || process.argv.length !== 4) throw Error('Usage: node scripts/response-summary-v147.mjs RAW_DIRECTORY SUMMARY.json');
const documents = readdirSync(directory)
  .filter((name) => /^(chromium|firefox|webkit)-[012]-(before|after)\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')));
if (!documents.length) throw Error('No response samples');
const hashes = [...new Set(documents.map((document) => document.harnessSha256))];
if (hashes.length !== 1) throw Error('Mixed harnesses');
const distribution = (values) => {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw Error('Invalid distribution');
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};
const engines = [];
for (const engine of [...new Set(documents.map((document) => document.engine))]) {
  const group = documents.filter((document) => document.engine === engine);
  if (group.length !== 6 || new Set(group.map((document) => `${document.variant}/${document.pair}`)).size !== 6) throw Error('Incomplete pairs');
  const rows = [];
  for (const [width, size] of [
    [1280, 32],
    [390, 32],
    [390, 16],
  ]) {
    const row = { width, size };
    for (const variant of ['before', 'after']) {
      const samples = group
        .filter((document) => document.variant === variant)
        .flatMap((document) => document.samples.filter((sample) => sample.width === width && sample.size === size));
      if (samples.length !== 3 || samples.some((sample) => sample.selections.length !== 25 || !sample.guideClosed)) throw Error('Invalid samples');
      const report = {
        samples: samples.length,
        coldTitleMs: distribution(samples.map((sample) => sample.coldTitleMs)),
        coldVisiblePreviewMs: distribution(samples.map((sample) => sample.coldVisiblePreviewMs)),
        titleElements: samples.map((sample) => sample.titleDOM.elements),
        titlePreviews: samples.map((sample) => sample.titleDOM.previews),
        titleCards: samples.map((sample) => sample.titleDOM.cards),
        hiddenReferenceRows: samples.map((sample) => sample.hiddenReferenceRows),
        zoom: samples.map((sample) => sample.zoom),
        hasLongTasks: samples.every((sample) => sample.hasLongTasks),
        longTasks: samples.flatMap((sample) => sample.longTasks),
      };
      for (const action of ['start', 'title', 'resume'])
        for (const metric of ['handlerMs', 'paintMs']) report[`${action}.${metric}`] = distribution(samples.map((sample) => sample[action][metric]));
      for (const metric of ['handlerMs', 'paintMs']) {
        report[`firstSelection.${metric}`] = distribution(samples.map((sample) => sample.selections[0][metric]));
        const warm = samples.flatMap((sample) => sample.selections.slice(1).map((selection) => selection[metric]));
        report[`warmSelection.${metric}`] = { ...distribution(warm), above50ms: warm.filter((value) => value > 50).length };
      }
      row[variant] = report;
    }
    rows.push(row);
  }
  engines.push({
    engine,
    browserVersions: [...new Set(group.map((document) => document.browser))],
    builds: Object.fromEntries(
      ['before', 'after'].map((variant) => [
        variant,
        [...new Set(group.filter((document) => document.variant === variant).flatMap((document) => document.samples.map((sample) => sample.build)))],
      ]),
    ),
    rows,
  });
}
writeFileSync(
  output,
  JSON.stringify(
    {
      format: 'response-summary-v147',
      harnessSha256: hashes[0],
      note: 'Median and nearest-rank p95; three fresh contexts per variant/condition, 72 warm selections. p95 of three cold/start samples is the maximum, not a stable tail estimate. Keep hosts, browser engines and local/CI measurements separate.',
      engines,
    },
    null,
    2,
  ) + '\n',
);
