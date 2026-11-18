import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { formatAuditEvidence, parseAuditReport } from './dependencyAudit';
import { evaluateAuditReport } from './dependencyAuditException';

const lock: unknown = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const capturedAt = new Date().toISOString();
const evidence: { auditScope: string; report: ReturnType<typeof parseAuditReport>; decision: ReturnType<typeof evaluateAuditReport> }[] = [];
for (const production of [false, true]) {
  const result = spawnSync('npm', ['audit', '--json', ...(production ? ['--omit=dev'] : [])], { encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });
  if (result.error || result.signal) throw new Error('Dependency audit could not be completed.');
  const report = parseAuditReport(result.stdout, result.status);
  const auditScope = production ? 'production' : 'all';
  const decision = evaluateAuditReport(report, auditScope, lock, Date.parse(capturedAt));
  evidence.push({ auditScope, report, decision });
  console.log(JSON.stringify({ auditScope, metadata: report.metadata, vulnerabilities: report.vulnerabilities, decision }));
  if (decision.exception)
    console.warn(`Temporary dev-only risk acceptance: ${decision.exception.advisory}; expires ${decision.exception.expiresAt}. This is not a vulnerability fix.`);
}

// Preserve both scopes before failing; an npm/service error is never a zero report.
if (process.env.DEPENDENCY_AUDIT_PATH) writeFileSync(process.env.DEPENDENCY_AUDIT_PATH, await formatAuditEvidence({ capturedAt, evidence }));
if (evidence.some(({ decision }) => decision.blocking))
  throw new Error('Dependency audit found high or critical vulnerabilities. Review the saved evidence before updating dependencies.');
