"""Verify archived source patches and harnesses against a v1.4.3 worktree."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def source_digest(tree: Path, map_override: bytes | None = None) -> str:
    digest = hashlib.sha256()
    for directory in ['src/game', 'src/ai']:
        for path in sorted((tree / directory).glob('*.ts')):
            if path.name.endswith(('.test.ts', '.fixture.ts')):
                continue
            relative = str(path.relative_to(tree))
            digest.update((relative + '\0').encode())
            content = map_override if map_override is not None and relative == 'src/game/tacticalMaps.ts' else path.read_bytes()
            digest.update(content)
    digest.update((tree / 'scripts/generatedBalance.ts').read_bytes())
    return digest.hexdigest()


def verify(baseline: Path) -> None:
    root = Path(__file__).resolve().parents[3]
    archive = root / 'docs/reviews/v1.4.4'
    summary = json.loads((archive / 'summary.json').read_text())
    for item in summary['files']:
        content = (archive / item['file']).read_bytes()
        if hashlib.sha256(content).hexdigest() != item['sha256']:
            raise ValueError(f"{item['file']}: raw file checksum mismatch")
        records = [json.loads(line) for line in content.decode().splitlines()]
        if records[0] != item['header'] or records[-1] != item['complete']:
            raise ValueError(f"{item['file']}: header or completion mismatch")
        if sum('result' in record for record in records) != item['header']['requested']:
            raise ValueError(f"{item['file']}: incomplete result count")
    proof = []
    with tempfile.TemporaryDirectory(prefix='v144-source-') as directory:
        tree = Path(directory)
        for name in ['src/game', 'src/ai', 'scripts']:
            (tree / name).mkdir(parents=True)
        for name in ['src/game', 'src/ai']:
            for path in (baseline / name).glob('*.ts'):
                shutil.copy2(path, tree / name / path.name)
        shutil.copy2(baseline / 'scripts/generatedBalance.ts', tree / 'scripts/generatedBalance.ts')
        for candidate in ['cpu-a', 'cpu-b', 'map-b', 'map-c', 'map-d']:
            patch = (archive / (candidate + '.patch')).read_bytes()
            subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=tree, check=True)
            subprocess.run(['git', 'apply', '-'], input=patch, cwd=tree, check=True)
            actual = source_digest(tree)
            expected = {item['header']['source'] for item in summary['files'] if item['file'].startswith(candidate + '-')}
            if expected != {actual}:
                raise ValueError(f'{candidate}: source digest does not match {expected}')
            proof.append({'candidate': candidate, 'sourceDigest': actual, 'matches': True})
            subprocess.run(['git', 'apply', '-R', '-'], input=patch, cwd=tree, check=True)
        for candidate, override in [('map-a', (archive / 'map-a-source.txt').read_bytes()), ('baseline', None)]:
            actual = source_digest(tree, override)
            prefix = 'before-' if candidate == 'baseline' else 'map-a-'
            expected = {item['header']['source'] for item in summary['files'] if item['file'].startswith(prefix)}
            if expected != {actual}:
                raise ValueError(f'{candidate}: source digest does not match {expected}')
            proof.append({'candidate': candidate, 'sourceDigest': actual, 'matches': True})

    harnesses = []
    for cli, metrics in [('original-harness.txt', 'original-metrics.txt'), ('expanded-harness.txt', 'original-metrics.txt'), ('expanded-harness.txt', None)]:
        digest = hashlib.sha256()
        digest.update((archive / cli).read_bytes())
        digest.update((archive / metrics).read_bytes() if metrics else (root / 'scripts/tacticalMetrics.ts').read_bytes())
        digest.update((root / 'scripts/tacticalScenarios.ts').read_bytes())
        harnesses.append({'cli': cli, 'metrics': metrics or 'scripts/tacticalMetrics.ts', 'digest': digest.hexdigest()})
    if {item['digest'] for item in harnesses} != {item['header']['harness'] for item in summary['files']}:
        raise ValueError('Harness digests do not match archived results')
    (archive / 'reproduction-proof.json').write_text(json.dumps({'sources': proof, 'harnesses': harnesses}, indent=2) + '\n')
    print('All 7 source states and 3 harnesses reproduced exactly.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path, help='Path to the v1.4.3 baseline worktree')
    verify(parser.parse_args().baseline.resolve())
