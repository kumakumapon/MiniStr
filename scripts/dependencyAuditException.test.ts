import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAuditReport } from './dependencyAudit';
import { evaluateAuditReport, PICOMATCH_EXCEPTION_EXPIRES } from './dependencyAuditException';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/picomatch-audit.json', import.meta.url), 'utf8'));
const locked = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const acceptedAt = Date.parse('2026-11-18T15:00:00Z');
const rawReport = () => structuredClone({ metadata: fixture.metadata, vulnerabilities: fixture.vulnerabilities });
const parsed = () => parseAuditReport(JSON.stringify(rawReport()), 1);

describe('v1.5.23 temporary dev-only picomatch risk acceptance', () => {
  it('accepts the real 13-node report including the vitest peer cycle without changing its evidence', () => {
    const report = parsed();
    const before = structuredClone(report);
    const decision = evaluateAuditReport(report, 'all', locked, acceptedAt);
    expect(decision.blocking).toBe(false);
    expect(decision.exception).toEqual({
      advisory: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
      expiresAt: PICOMATCH_EXCEPTION_EXPIRES,
      packages: Object.keys(report.vulnerabilities).sort(),
    });
    expect(report).toEqual(before);
  });

  it.each(['production', 'dev', 'unknown'])('never applies to scope %s', (scope) => {
    expect(evaluateAuditReport(parsed(), scope, locked, acceptedAt)).toEqual({ blocking: true, exception: null });
  });

  it.each([Date.parse('2026-11-17T23:59:59Z'), Date.parse(PICOMATCH_EXCEPTION_EXPIRES), Date.parse('2027-01-01T00:00:00Z'), NaN])(
    'fails closed outside the accepted interval: %s',
    (now) => {
      expect(evaluateAuditReport(parsed(), 'all', locked, now)).toEqual({ blocking: true, exception: null });
    },
  );

  it('accepts the last instant before expiry and keeps clean audits working after expiry', () => {
    expect(evaluateAuditReport(parsed(), 'all', locked, Date.parse(PICOMATCH_EXCEPTION_EXPIRES) - 1).exception).not.toBeNull();
    const clean = parseAuditReport(JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }, vulnerabilities: {} }), 0);
    expect(evaluateAuditReport(clean, 'all', locked, Date.parse('2027-01-01'))).toEqual({ blocking: false, exception: null });
  });

  it.each([
    ['another advisory on picomatch', (r: any): any => (r.vulnerabilities.picomatch.via[0].url = 'https://github.com/advisories/GHSA-other')],
    ['another advisory source', (r: any): any => (r.vulnerabilities.picomatch.via[0].source = 999)],
    ['a changed affected range', (r: any): any => (r.vulnerabilities.picomatch.via[0].range = '*')],
    ['a second advisory on picomatch', (r: any): any => r.vulnerabilities.picomatch.via.push({ ...r.vulnerabilities.picomatch.via[0], source: 999 })],
    ['a direct advisory on an ancestor', (r: any): any => r.vulnerabilities.vite.via.push(r.vulnerabilities.picomatch.via[0])],
    [
      'a critical finding',
      (r: any): any => {
        r.vulnerabilities.picomatch.severity = 'critical';
        r.metadata.vulnerabilities.high--;
        r.metadata.vulnerabilities.critical++;
      },
    ],
    ['an unknown dependency', (r: any): any => r.vulnerabilities.vite.via.push('unknown')],
    ['a known package on an unverified edge', (r: any): any => r.vulnerabilities.vite.via.push('fdir')],
    ['an empty cause', (r: any): any => (r.vulnerabilities.vite.via = [])],
    ['a malformed cause', (r: any): any => (r.vulnerabilities.picomatch.via = [null])],
    ['a string root', (r: any): any => (r.vulnerabilities.picomatch.via = ['picomatch'])],
    [
      'a disconnected peer cycle',
      (r: any): any => {
        r.vulnerabilities.vitest.via = ['@vitest/coverage-v8'];
        r.vulnerabilities['@vitest/coverage-v8'].via = ['vitest'];
      },
    ],
    ['an unreviewed nested installation', (r: any): any => r.vulnerabilities.vite.nodes.push('node_modules/other/node_modules/vite')],
    ['a mismatched finding name', (r: any): any => (r.vulnerabilities.vite.name = 'unknown')],
    [
      'a missing root',
      (r: any): any => {
        delete r.vulnerabilities.picomatch;
        r.metadata.vulnerabilities.high--;
        r.metadata.vulnerabilities.total--;
      },
    ],
    [
      'hidden findings',
      (r: any): any => {
        r.metadata.vulnerabilities.high++;
        r.metadata.vulnerabilities.total++;
      },
    ],
    [
      'incorrect severity totals',
      (r: any): any => {
        r.metadata.vulnerabilities.high--;
        r.metadata.vulnerabilities.moderate++;
      },
    ],
    [
      'a package outside the reviewed set',
      (r: any): any => {
        r.vulnerabilities.unknown = { ...r.vulnerabilities.fdir, name: 'unknown', nodes: ['node_modules/unknown'] };
        r.metadata.vulnerabilities.high++;
        r.metadata.vulnerabilities.total++;
      },
    ],
  ] as const)('blocks %s', (_, mutate) => {
    const report = rawReport();
    mutate(report);
    expect(evaluateAuditReport(parseAuditReport(JSON.stringify(report), 1), 'all', locked, acceptedAt)).toEqual({ blocking: true, exception: null });
  });

  it.each(['picomatch', 'vite', '@vitest/coverage-v8'])('requires %s to remain dev-only at the reviewed version', (name) => {
    for (const change of [{ dev: false }, { dev: undefined }, { version: '99.0.0' }]) {
      const lock = structuredClone(locked);
      Object.assign(lock.packages[`node_modules/${name}`], change);
      expect(evaluateAuditReport(parsed(), 'all', lock, acceptedAt)).toEqual({ blocking: true, exception: null });
    }
  });

  it.each([null, {}, { lockfileVersion: 3, packages: {} }, { lockfileVersion: 2, packages: locked.packages }])('rejects unverified lock metadata', (lock) => {
    expect(evaluateAuditReport(parsed(), 'all', lock, acceptedAt)).toEqual({ blocking: true, exception: null });
  });
});
