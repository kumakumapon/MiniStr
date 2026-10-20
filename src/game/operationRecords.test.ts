import { describe, expect, it } from 'vitest';
import {
  operationVictory,
  saveOperationVictory,
  loadOperationRecords,
  parseOperationRecords,
  deleteOperationRecord,
  resetOperationRecords,
  isDefaultOperationRecord,
  operationRevision,
  operationTurnTarget,
  canonicalOperationValue,
  MAX_OPERATION_RECORD_BYTES,
  OPERATION_RECORDS_KEY,
} from './operationRecords';
import { createScenarioInitialState, scenarioById, scenarioDefinitionToData } from './maps';
import { applyGameCommand, type GameCommand } from './session';
import { createDeploymentScenario } from './deployment';
import { exportBackup, restoreBackup } from './backup';
import { valueOf } from './operations.fixture';

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, text: string) => {
      values.set(key, text);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function victory() {
  const initial = createScenarioInitialState(scenarioById('frontier-defense')!),
    commands: GameCommand[] = [];
  let final = initial;
  while (!final.winner && final.turn < 7) {
    commands.push({ type: 'endTurn' });
    final = valueOf(applyGameCommand(final, commands.at(-1)!));
  }
  return { initial, final, commands, record: valueOf(operationVictory(initial, final, commands, 'normal')) };
}

describe('standalone records and optional challenges', () => {
  it('derives results from legal histories and updates only the best values idempotently', () => {
    const { record } = victory(),
      store = storage();
    expect(record.bestTurns).toBe(5);
    expect(record.bestLosses).toBe(0);
    expect(record.challenges).toEqual(['swift', 'careful', 'survivors']);
    expect(isDefaultOperationRecord(record)).toBe(true);
    expect(valueOf(loadOperationRecords(store)).records).toEqual([]);
    const first = valueOf(saveOperationVictory(store, { ...record, bestTurns: 20, bestLosses: 5, challenges: [] }));
    expect(first.changed).toBe(true);
    const improved = valueOf(saveOperationVictory(store, record));
    expect(improved.changed).toBe(true);
    const snapshot = store.getItem(OPERATION_RECORDS_KEY);
    expect(valueOf(saveOperationVictory(store, { ...record, updatedAt: '2026-10-20T00:00:00.000Z' })).changed).toBe(false);
    expect(store.getItem(OPERATION_RECORDS_KEY)).toBe(snapshot);
    expect(improved.catalog.records).toHaveLength(1);
    expect(valueOf(saveOperationVictory(store, { ...record, difficulty: 'hard' })).catalog.records).toHaveLength(2);
    expect(operationTurnTarget('fighting-withdrawal')).toBe(55);
    expect(operationTurnTarget('encirclement-breakout')).toBe(10);
    expect(operationTurnTarget('control-coast')).toBe(20);
    expect(operationTurnTarget('convoy-escort')).toBe(15);
  });

  it('separates initial deployment conditions and preserves old-rule results', () => {
    const { record, initial, final, commands } = victory();
    const scenario = scenarioById('frontier-defense')!;
    const choices = scenario.initialUnits.filter((unit) => unit.owner === 'red').map((unit) => unit.kind);
    choices[2] = 'infantry';
    const changed = valueOf(createDeploymentScenario(scenario, choices));
    const deployed = createScenarioInitialState(changed);
    let result = deployed;
    for (const command of commands) result = valueOf(applyGameCommand(result, command));
    const second = valueOf(operationVictory(deployed, result, commands, 'normal'));
    expect(isDefaultOperationRecord(second)).toBe(false);
    expect(second.revision).toBe(record.revision);
    const store = storage();
    valueOf(saveOperationVictory(store, record));
    expect(valueOf(saveOperationVictory(store, second)).catalog.records).toHaveLength(2);
    const legacy = { ...initial, ruleVersion: 6 as const };
    let legacyFinal = legacy;
    for (const command of commands) legacyFinal = valueOf(applyGameCommand(legacyFinal, command)) as typeof legacy;
    expect(valueOf(operationVictory(legacy, legacyFinal, commands, 'easy')).ruleVersion).toBe(6);
    expect(operationVictory(initial, { ...final, turn: final.turn + 1 }, commands, 'normal').ok).toBe(false);
    expect(operationVictory(initial, final, [{ type: 'wait', unitId: 'missing' }], 'normal').ok).toBe(false);
    expect(operationVictory(initial, final, [{ type: 'bad' } as unknown as GameCommand], 'normal').ok).toBe(false);
    expect(operationVictory(initial, { ...final, winner: undefined }, commands, 'normal').ok).toBe(false);
    expect(operationVictory({ ...initial, scenarioId: 'not-official' }, final, commands, 'normal').ok).toBe(false);
    expect(operationRevision(changed)).toBe(record.revision);
  });

  it('rejects malformed catalogs, configurations, values, duplicate conditions and oversized data', () => {
    const { record } = victory();
    const invalid: unknown[] = [
      null,
      [],
      {},
      { schemaVersion: 2, records: [] },
      { schemaVersion: 1, records: [], extra: true },
      { schemaVersion: 1, records: [record, record] },
      { schemaVersion: 1, records: Array(129).fill(record) },
    ];
    for (const patch of [
      { unknown: true },
      { configuration: '{}' },
      { configuration: 'x'.repeat(32_001) },
      { scenarioId: 'wrong' },
      { revision: 'wrong' },
      { ruleVersion: 5 },
      { difficulty: 'invalid' },
      { bestTurns: 0 },
      { bestLosses: -1 },
      { challenges: ['bad'] },
      { challenges: ['swift', 'swift'] },
      { updatedAt: 'bad' },
    ])
      invalid.push({ schemaVersion: 1, records: [{ ...record, ...patch }] });
    for (const value of invalid) expect(parseOperationRecords(JSON.stringify(value)).ok).toBe(false);
    expect(parseOperationRecords('{').ok).toBe(false);
    expect(parseOperationRecords(' '.repeat(MAX_OPERATION_RECORD_BYTES + 1)).ok).toBe(false);
    const controlled = scenarioById('control-coast')!;
    expect(
      parseOperationRecords(
        JSON.stringify({
          schemaVersion: 1,
          records: [
            { ...record, scenarioId: controlled.id, configuration: JSON.stringify(scenarioDefinitionToData(controlled)), revision: operationRevision(controlled), ruleVersion: 6 },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(canonicalOperationValue({ z: 1, a: [2], absent: undefined })).toBe(canonicalOperationValue({ a: [2], z: 1 }));
    const store = storage();
    expect(saveOperationVictory(store, { ...record, bestTurns: -1 }).ok).toBe(false);
    expect(store.length).toBe(0);
  });

  it('keeps existing values on read, write, delete and reset failures and explicitly recovers corruption', () => {
    const { record } = victory(),
      store = storage({ [OPERATION_RECORDS_KEY]: 'corrupt' });
    expect(saveOperationVictory(store, record).ok).toBe(false);
    expect(deleteOperationRecord(store, 0).ok).toBe(false);
    expect(store.getItem(OPERATION_RECORDS_KEY)).toBe('corrupt');
    expect(valueOf(resetOperationRecords(store)).records).toEqual([]);
    valueOf(saveOperationVictory(store, record));
    const original = store.getItem(OPERATION_RECORDS_KEY);
    const blocked = {
      ...store,
      setItem: () => {
        throw Error('QuotaExceeded');
      },
      removeItem: () => {
        throw Error('Blocked');
      },
    };
    expect(saveOperationVictory(blocked, { ...record, difficulty: 'hard' }).ok).toBe(false);
    expect(deleteOperationRecord(blocked, 0).ok).toBe(false);
    expect(resetOperationRecords(blocked).ok).toBe(false);
    expect(
      loadOperationRecords({
        ...store,
        getItem: () => {
          throw Error('Denied');
        },
      }).ok,
    ).toBe(false);
    expect(store.getItem(OPERATION_RECORDS_KEY)).toBe(original);
    expect(deleteOperationRecord(store, -1).ok).toBe(false);
    expect(valueOf(deleteOperationRecord(store, 0)).records).toEqual([]);
    expect(isDefaultOperationRecord({ ...record, scenarioId: 'missing' })).toBe(false);
  });

  it('includes validated records in complete backup restore and rejects before any writes', () => {
    const { record } = victory(),
      source = storage(),
      destination = storage({ 'ministr.locale': 'ja' });
    valueOf(saveOperationVictory(source, record));
    valueOf(restoreBackup(destination, valueOf(exportBackup(source))));
    expect(valueOf(loadOperationRecords(destination)).records[0]?.bestTurns).toBe(5);
    const before = [...destination.values];
    const broken = storage({ [OPERATION_RECORDS_KEY]: JSON.stringify({ schemaVersion: 1, records: [{ ...record, bestLosses: -1 }] }) });
    expect(restoreBackup(destination, valueOf(exportBackup(broken))).ok).toBe(false);
    expect([...destination.values]).toEqual(before);
  });
});
