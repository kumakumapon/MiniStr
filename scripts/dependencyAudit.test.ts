import { describe, expect, it } from 'vitest';
import { hasBlockingFindings, parseAuditReport } from './dependencyAudit';

function report(counts: Record<string, unknown> = {}) {
  return { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } }, vulnerabilities: {} };
}

describe('dependency audit evidence and gate', () => {
  it('accepts a usable zero-finding report', () => {
    expect(hasBlockingFindings(parseAuditReport(JSON.stringify(report()), 0))).toBe(false);
  });

  it.each(['high', 'critical'])('blocks %s findings even if npm reports exit zero', (severity) => {
    expect(hasBlockingFindings(parseAuditReport(JSON.stringify(report({ [severity]: 1, total: 1 })), 0))).toBe(true);
  });

  it('retains nonblocking findings for review without discarding the evidence', () => {
    const evidence = report({ moderate: 1, total: 1 });
    expect(parseAuditReport(JSON.stringify(evidence), 1)).toEqual(evidence);
    expect(hasBlockingFindings(parseAuditReport(JSON.stringify(evidence), 1))).toBe(false);
  });

  it.each([null, 2, 124])('fails closed on audit process status %s', (status) => {
    expect(() => parseAuditReport(JSON.stringify(report()), status)).toThrow();
  });

  it.each(['not json', '{}', 'null', '[]', JSON.stringify({ error: { code: 'ENOAUDIT' }, ...report() }), JSON.stringify({ ...report(), vulnerabilities: [] })])(
    'rejects unusable evidence %s',
    (value) => {
      expect(() => parseAuditReport(value, 0)).toThrow();
    },
  );

  it.each([-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid counts %s', (high) => {
    expect(() => parseAuditReport(JSON.stringify(report({ high })), 0)).toThrow();
  });

  it('rejects missing and inconsistent counts', () => {
    const missing = { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} };
    expect(() => parseAuditReport(JSON.stringify(missing), 0)).toThrow();
    expect(() => parseAuditReport(JSON.stringify(report({ high: 1, total: 0 })), 1)).toThrow();
  });
});
