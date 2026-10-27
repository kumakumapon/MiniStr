import { spawnSync } from 'node:child_process';

// A snapshot for release review, not a replacement for the existing quality gates.
for (const production of [false, true]) {
  const result = spawnSync('npm', ['audit', '--json', ...(production ? ['--omit=dev'] : [])], { encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });
  if (result.error || result.signal || (result.status !== 0 && result.status !== 1)) throw new Error('Dependency audit could not be completed.');
  const report = JSON.parse(result.stdout) as { error?: unknown; metadata?: { vulnerabilities?: unknown }; vulnerabilities?: unknown };
  if (report.error || !report.metadata?.vulnerabilities) throw new Error('Dependency audit returned no usable report.');
  console.log(JSON.stringify({ auditScope: production ? 'production' : 'all', metadata: report.metadata, vulnerabilities: report.vulnerabilities }));
}
