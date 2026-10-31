import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { formatAuditEvidence, hasBlockingFindings, parseAuditReport } from './dependencyAudit';

const evidence: { auditScope: string; report: ReturnType<typeof parseAuditReport> }[] = [];
for (const production of [false, true]) {
  const result = spawnSync('npm', ['audit', '--json', ...(production ? ['--omit=dev'] : [])], { encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });
  if (result.error || result.signal) throw new Error('Dependency audit could not be completed.');
  const report = parseAuditReport(result.stdout, result.status);
  const auditScope = production ? 'production' : 'all';
  evidence.push({ auditScope, report });
  console.log(JSON.stringify({ auditScope, metadata: report.metadata, vulnerabilities: report.vulnerabilities }));
}

// Preserve both scopes before failing; an npm/service error is never a zero report.
if (process.env.DEPENDENCY_AUDIT_PATH) writeFileSync(process.env.DEPENDENCY_AUDIT_PATH, await formatAuditEvidence({ capturedAt: new Date().toISOString(), evidence }));
if (evidence.some(({ report }) => hasBlockingFindings(report)))
  throw new Error('Dependency audit found high or critical vulnerabilities. Review the saved evidence before updating dependencies.');
