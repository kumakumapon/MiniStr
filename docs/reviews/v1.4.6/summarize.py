"""Verify paired v1.4.6 raw results and summarize without combining correlated legs into win probabilities."""
import hashlib
import json
from pathlib import Path
import statistics

HERE = Path(__file__).resolve().parent
GROUPS = ['train-generated', 'train-wide', 'hold-generated', 'hold-wide', 'final-generated', 'final-wide', 'final-classic']
KEYS = ['matchup', 'secondPlayerBonus', 'profile', 'initiative', 'plainCover', 'layout', 'cpu', 'size', 'height', 'mapId', 'sea', 'seed', 'damageSeed', 'weatherSeed', 'policy', 'redPolicy', 'bluePolicy', 'leg', 'orientation', 'tacticalOptions', 'openingDistance']


def load(name):
    content = (HERE / name).read_bytes()
    records = [json.loads(line) for line in content.decode().splitlines()]
    header, completion = records[0], records[-1]
    rows = [record['result'] for record in records if 'result' in record]
    assert completion['complete'] and completion['completed'] == header['requested'] == len(rows), name
    return rows, {'file': name, 'sha256': hashlib.sha256(content).hexdigest(), 'header': header, 'complete': completion}


def stats(rows):
    logistics = {key: sum(sum(row['metrics']['logistics'][key].values()) for row in rows) for key in rows[0]['metrics']['logistics']}
    return {
        'games': len(rows),
        'winners': {key: sum(row['winner'] == key for row in rows) for key in ['red', 'blue', 'draw', 'undecided']},
        'defensiveWins': sum(row['winner'] in ['red', 'blue'] and row[row['winner'] + 'Policy'] == 'defensive' for row in rows),
        'defensiveGames': sum('defensive' in [row['redPolicy'], row['bluePolicy']] for row in rows),
        'turnsMedian': statistics.median(row['turns'] for row in rows),
        'turnsTotal': sum(row['turns'] for row in rows),
        'commandsTotal': sum(row['commands'] for row in rows),
        'maxCommands': max(row['commands'] for row in rows),
        'maxGameCpuP95Ms': max(row['cpuP95Ms'] for row in rows),
        'logisticsBothArmies': logistics,
        'logisticsDefensiveArmy': {key: sum(row['metrics']['logistics'][key][side] for row in rows for side in ['red', 'blue'] if row[side + 'Policy'] == 'defensive') for key in logistics},
    }


def summarize():
    files, comparisons = [], []
    for group in GROUPS:
        before, before_file = load('before-' + group + '.jsonl')
        after, after_file = load('after-a-' + group + '.jsonl')
        files += [before_file, after_file]
        assert len(before) == len(after)
        for old, new in zip(before, after):
            assert {key: old.get(key) for key in KEYS} == {key: new.get(key) for key in KEYS}, group
        comparisons.append({
            'group': group, 'before': stats(before), 'after': stats(after),
            'changedWinners': sum(old['winner'] != new['winner'] for old, new in zip(before, after)),
            'identicalCommands': sum(old['commandDigest'] == new['commandDigest'] for old, new in zip(before, after)),
            'pairs': [{'size': a['size'], 'sea': a['sea'], 'policy': a['policy'], 'leg': a['leg'], 'matchup': a['matchup'], 'damageSeed': a['damageSeed'], 'secondPlayerBonus': a['secondPlayerBonus'], 'beforeWinner': a['winner'], 'afterWinner': b['winner'], 'beforeTurns': a['turns'], 'afterTurns': b['turns']} for a, b in zip(before, after)],
        })
    ablations = []
    for variant in ['route-only', 'delivery-only']:
        for group in ['hold-generated', 'final-generated']:
            before, _ = load('before-' + group + '.jsonl')
            rows, item = load(variant + '-' + group + '.jsonl')
            assert len(before) == len(rows)
            for old, new in zip(before, rows):
                assert {key: old.get(key) for key in KEYS} == {key: new.get(key) for key in KEYS}
            files.append(item)
            ablations.append({'variant': variant, 'group': group, 'stats': stats(rows), 'note': 'Diagnostic runs shared the host with other local tests. Latencies are not used for acceptance.'})
    assert len({f['header']['harness'] for f in files}) == 1
    assert len({f['header']['source'] for f in files if f['file'].startswith('before-')}) == 1
    assert len({f['header']['source'] for f in files if f['file'].startswith('after-')}) == 1
    main_games = sum(x['before']['games'] + x['after']['games'] for x in comparisons)
    result = {'note': 'Red always starts. Return legs exchange policies/difficulty and rotate the map. Counts are correlated fixed conditions, not independent win probabilities. HP, supplies and dry starts depend on duration and surviving units. cpuP95 is a separate per-game latency statistic, not pooled p95.', 'mainGames': main_games, 'totalGames': main_games + sum(a['stats']['games'] for a in ablations), 'files': files, 'comparisons': comparisons, 'ablations': ablations}
    (HERE / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    for c in comparisons:
        a, b = c['before'], c['after']
        print(c['group'], 'R/B', a['winners'], '->', b['winners'], 'def', a['defensiveWins'], '->', b['defensiveWins'], 'HP', a['logisticsBothArmies']['restoredHP'], '->', b['logisticsBothArmies']['restoredHP'], 'dry', a['logisticsBothArmies']['dryGroundStarts'], '->', b['logisticsBothArmies']['dryGroundStarts'])


if __name__ == '__main__':
    summarize()
