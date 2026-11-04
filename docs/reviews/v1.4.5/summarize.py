import json,math,pathlib,statistics,sys
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).parent
out={}
def stats(xs):
 s=sorted(xs)
 return {'n':len(s),'median':statistics.median(s),'p95':s[math.ceil(len(s)*.95)-1],'max':max(s),'over50':sum(x>50 for x in s)}
for v in ['before','after']:
 runs=[json.loads((root/f'final-{v}-{i}.json').read_text()) for i in [1,2,3]]
 assert all(len(r['samples'])==8 and r['variant']==v and r['pair']==str(i+1) for i,r in enumerate(runs))
 assert len(set(r['harnessSha256'] for r in runs))==1
 assert len(set(r['browser'] for r in runs))==1
 assert all(len(s['selections'])==25 for r in runs for s in r['samples'])
 groups={}
 for width in [1280,390]:
  for size in [16,32]:
   g=[s for r in runs for s in r['samples'] if s['width']==width and s['size']==size]
   warm=[p for s in g for p in s['selections'][1:]]
   assert len(g)==6 and len(warm)==144
   groups[f'{width}x{size}']={
    'handler':stats([p['handlerMs'] for p in warm]),'paint':stats([p['paintMs'] for p in warm]),
    'firstHandler':stats([s['selections'][0]['handlerMs'] for s in g]),
    'firstPaint':stats([s['selections'][0]['paintMs'] for s in g]),
    **{k:stats([s[k] for s in g]) for k in ['coldTitleMs','startHandlerMs','startPaintMs','resumePaintMs']},
    'layoutCount':sum(s['metrics']['LayoutCount'] for s in g),
    'layoutDurationMs':sum(s['metrics']['LayoutDuration'] for s in g)*1000,
    'recalcStyleDurationMs':sum(s['metrics']['RecalcStyleDuration'] for s in g)*1000,
    'longTasks':sum(len(s['longTasks']) for s in g),
    'pairs':[{ 'pair':i, 'handlerP95': stats([p['handlerMs'] for s in runs[i-1]['samples'] if s['width']==width and s['size']==size for p in s['selections'][1:]])['p95']} for i in [1,2,3]]
   }
 out[v]={'browser':sorted(set(r['browser'] for r in runs)), 'build':sorted(set(s['build'] for r in runs for s in r['samples'])), 'harnessSha256':sorted(set(r['harnessSha256'] for r in runs)), 'groups':groups}
(root/'summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
for cond in out['before']['groups']:
 a=out['before']['groups'][cond];b=out['after']['groups'][cond]
 print(cond, *(f'{k} {a[k]["p95"]:.1f}->{b[k]["p95"]:.1f}' for k in ['handler','paint','firstHandler','startPaintMs','resumePaintMs']),f'layout {a["layoutDurationMs"]:.0f}->{b["layoutDurationMs"]:.0f}',f'long {a["longTasks"]}->{b["longTasks"]}')
