const severities = ['info', 'low', 'moderate', 'high', 'critical'] as const;
type Severity = (typeof severities)[number];

export interface AuditReport {
  metadata: { vulnerabilities: Record<Severity | 'total', number>; [key: string]: unknown };
  vulnerabilities: Record<string, unknown>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseAuditReport(stdout: string, status: number | null): AuditReport {
  if (status !== 0 && status !== 1) throw new Error('Dependency audit could not be completed.');
  const report: unknown = JSON.parse(stdout);
  if (!record(report) || report.error || !record(report.metadata) || !record(report.metadata.vulnerabilities) || !record(report.vulnerabilities)) {
    throw new Error('Dependency audit returned no usable report.');
  }
  const counts = report.metadata.vulnerabilities;
  for (const severity of [...severities, 'total']) {
    if (typeof counts[severity] !== 'number' || !Number.isSafeInteger(counts[severity]) || counts[severity] < 0) throw new Error('Dependency audit returned invalid counts.');
  }
  if (severities.reduce((sum, severity) => sum + (counts[severity] as number), 0) !== counts.total) throw new Error('Dependency audit returned inconsistent counts.');
  return report as unknown as AuditReport;
}

export function hasBlockingFindings(report: AuditReport): boolean {
  return report.metadata.vulnerabilities.high > 0 || report.metadata.vulnerabilities.critical > 0;
}
