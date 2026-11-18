import { hasBlockingFindings, type AuditReport } from './dependencyAudit';

// Risk acceptance authorized for v1.5.23 on 2026-11-18; not an upstream fix.
// See docs/reviews/v1.5.23.md. Never extend this deadline automatically.
export const PICOMATCH_EXCEPTION_EXPIRES = '2026-11-25T00:00:00.000Z';
const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const versions: Record<string, string> = {
  '@typescript-eslint/eslint-plugin': '8.72.1',
  '@typescript-eslint/parser': '8.72.1',
  '@typescript-eslint/type-utils': '8.72.1',
  '@typescript-eslint/typescript-estree': '8.72.1',
  '@typescript-eslint/utils': '8.72.1',
  '@vitest/coverage-v8': '5.1.0',
  fdir: '6.5.0',
  picomatch: '4.0.7',
  tinyglobby: '0.2.17',
  'typescript-eslint': '8.72.1',
  vite: '8.3.5',
  'vite-node': '6.0.0',
  vitest: '5.1.0',
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface AuditDecision {
  blocking: boolean;
  exception: { advisory: string; expiresAt: string; packages: string[] } | null;
}

/** Keep the strict gate as the default. Only the known dev graph can qualify. */
export function evaluateAuditReport(report: AuditReport, scope: string, lock: unknown, now = Date.now()): AuditDecision {
  const strict = { blocking: hasBlockingFindings(report), exception: null };
  if (!strict.blocking) return strict;
  if (scope !== 'all' || !Number.isFinite(now) || now < Date.parse('2026-11-18T00:00:00Z') || now >= Date.parse(PICOMATCH_EXCEPTION_EXPIRES)) return strict;
  if (report.metadata.vulnerabilities.critical !== 0 || !record(lock) || lock.lockfileVersion !== 3 || !record(lock.packages)) return strict;

  const findings = Object.entries(report.vulnerabilities);
  const counts = report.metadata.vulnerabilities;
  // A hidden, malformed, or contradictory finding must not use the exception.
  if (
    findings.length !== counts.total ||
    Object.entries(counts).some(([severity, count]) => severity !== 'total' && findings.filter(([, v]) => record(v) && v.severity === severity).length !== count)
  )
    return strict;
  const high = findings.filter(([, value]) => record(value) && value.severity === 'high');
  const names = new Set(high.map(([name]) => name));
  const edges = new Map<string, string[]>();
  if (!names.has('picomatch')) return strict;

  for (const [name, value] of high) {
    const nodePath = `node_modules/${name}`;
    const node = lock.packages[nodePath];
    if (!Object.hasOwn(versions, name) || !record(node) || node.dev !== true || node.version !== versions[name]) return strict;
    if (
      !record(value) ||
      value.name !== name ||
      !Array.isArray(value.nodes) ||
      value.nodes.length !== 1 ||
      value.nodes[0] !== nodePath ||
      !Array.isArray(value.via) ||
      value.via.length === 0
    )
      return strict;
    const dependencies: string[] = [];
    for (const via of value.via) {
      if (typeof via === 'string') {
        if (!names.has(via) || name === 'picomatch') return strict;
        if (![node.dependencies, node.peerDependencies, node.optionalDependencies].some((dependencies) => record(dependencies) && Object.hasOwn(dependencies, via))) return strict;
        dependencies.push(via);
      } else if (
        name !== 'picomatch' ||
        value.via.length !== 1 ||
        !record(via) ||
        via.source !== 1247710 ||
        via.name !== 'picomatch' ||
        via.dependency !== 'picomatch' ||
        via.url !== advisory ||
        via.severity !== 'high' ||
        via.range !== '<=4.0.7'
      )
        return strict;
    }
    edges.set(name, dependencies);
  }

  // npm can report peer cycles (vitest <-> coverage-v8). Every node must
  // nevertheless reach the one allowed advisory; disconnected cycles fail.
  const reachesRoot = new Set(['picomatch']);
  for (let pass = 0; pass < high.length; pass++) {
    for (const [name, dependencies] of edges) if (dependencies.some((dependency) => reachesRoot.has(dependency))) reachesRoot.add(name);
  }
  if (reachesRoot.size !== high.length) return strict;
  return { blocking: false, exception: { advisory, expiresAt: PICOMATCH_EXCEPTION_EXPIRES, packages: [...names].sort() } };
}
