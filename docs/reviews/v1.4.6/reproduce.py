"""Verify the v1.4.5 baseline, CPU patches and all archived paired results."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def source_digest(root):
    digest = hashlib.sha256()
    for directory in ['src/game', 'src/ai']:
        for path in sorted((root / directory).glob('*.ts')):
            if path.name.endswith(('.test.ts', '.fixture.ts')):
                continue
            digest.update((str(path.relative_to(root)) + '\0').encode())
            digest.update(path.read_bytes())
    digest.update((root / 'scripts/generatedBalance.ts').read_bytes())
    return digest.hexdigest()


def verify(baseline):
    summary = json.loads((HERE / 'summary.json').read_text())
    before = {f['header']['source'] for f in summary['files'] if f['file'].startswith('before-')}
    after = {f['header']['source'] for f in summary['files'] if f['file'].startswith('after-a-')}
    assert before == {source_digest(baseline)}
    assert after == {source_digest(ROOT)}
    for item in summary['files']:
        content = (HERE / item['file']).read_bytes()
        assert hashlib.sha256(content).hexdigest() == item['sha256']
        records = [json.loads(line) for line in content.decode().splitlines()]
        assert records[0] == item['header'] and records[-1] == item['complete']
        assert records[-1]['complete'] and sum('result' in r for r in records) == records[0]['requested']
    harness = hashlib.sha256(b''.join((ROOT / ('scripts/' + p)).read_bytes() for p in ['tactical-balance.ts', 'tacticalMetrics.ts', 'tacticalScenarios.ts'])).hexdigest()
    assert {f['header']['harness'] for f in summary['files']} == {harness}
    patches = []
    for variant, prefix in [('cpu-a', 'after-a-'), ('route-only', 'route-only-'), ('delivery-only', 'delivery-only-')]:
        patch = (HERE / (variant + '.patch')).read_bytes()
        expected = {f['header']['source'] for f in summary['files'] if f['file'].startswith(prefix)}
        with tempfile.TemporaryDirectory(prefix='v146-source-') as directory:
            tree = Path(directory)
            for name in ['src/game', 'src/ai']:
                shutil.copytree(baseline / name, tree / name)
            (tree / 'scripts').mkdir()
            shutil.copyfile(baseline / 'scripts/generatedBalance.ts', tree / 'scripts/generatedBalance.ts')
            subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=tree, check=True)
            subprocess.run(['git', 'apply', '-'], input=patch, cwd=tree, check=True)
            actual = source_digest(tree)
            assert expected == {actual}
            patches.append({'variant': variant, 'source': actual, 'reproduced': True})
    proof = {'baselineSource': next(iter(before)), 'candidateSource': next(iter(after)), 'harness': harness, 'rawFilesVerified': len(summary['files']), 'totalGames': summary['totalGames'], 'patches': patches}
    (HERE / 'reproduction-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    verify(parser.parse_args().baseline.resolve())
