import { createDeploymentScenario, deploymentSlots } from './deployment';
import { parseBoundedJson } from './jsonBoundary';
import { scenarioDefinitionToData, type ScenarioDefinition } from './maps';
import type { StorageLike } from './session';
import type { GameResult, PlayerId, UnitKind } from './types';
import { unitKindSet } from './units';

export const DEPLOYMENT_PRESETS_KEY = 'ministr.deployment.presets';
export const MAX_PRESET_BYTES = 256_000;
export const MAX_DEPLOYMENT_PRESETS = 192;
export interface DeploymentPreset {
  scenarioId: string;
  player: PlayerId;
  slot: number;
  name: string;
  fingerprint: string;
  kinds: UnitKind[];
}
export interface DeploymentPresetCatalog {
  schemaVersion: 1;
  presets: DeploymentPreset[];
}
const empty = (): DeploymentPresetCatalog => ({ schemaVersion: 1, presets: [] });
const hasControlCharacters = (name: string) => [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const fail = <T>(error: string): GameResult<T> => ({ ok: false, error });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** A revision hint; every application also runs the full current deployment validation. */
export function deploymentFingerprint(scenario: ScenarioDefinition): string {
  const source = scenarioDefinitionToData(scenario);
  const text = JSON.stringify({
    board: source.board,
    red: deploymentSlots(scenario, 'red'),
    blue: deploymentSlots(scenario, 'blue'),
    victory: source.victoryConditions,
    defeat: source.defeatConditions,
    production: source.productionRules,
  });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseDeploymentPresets(text: string): GameResult<DeploymentPresetCatalog> {
  const parsed = parseBoundedJson(text, MAX_PRESET_BYTES);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (!isRecord(data) || Object.keys(data).length !== 2 || data.schemaVersion !== 1 || !Array.isArray(data.presets) || data.presets.length > MAX_DEPLOYMENT_PRESETS)
    return fail('編成プリセットの形式が不正です。');
  const seen = new Set<string>();
  for (const entry of data.presets) {
    if (
      !isRecord(entry) ||
      Object.keys(entry).length !== 6 ||
      typeof entry.scenarioId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(entry.scenarioId) ||
      (entry.player !== 'red' && entry.player !== 'blue') ||
      !Number.isInteger(entry.slot) ||
      (entry.slot as number) < 0 ||
      (entry.slot as number) > 2 ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      entry.name.length > 24 ||
      hasControlCharacters(entry.name) ||
      typeof entry.fingerprint !== 'string' ||
      !/^[0-9a-f]{8}$/.test(entry.fingerprint) ||
      !Array.isArray(entry.kinds) ||
      entry.kinds.length > 128 ||
      entry.kinds.some((kind) => typeof kind !== 'string' || !unitKindSet.has(kind))
    )
      return fail('編成プリセットの内容が不正です。');
    const key = `${entry.scenarioId}/${entry.player}/${entry.slot}`;
    if (seen.has(key)) return fail('編成プリセットが重複しています。');
    seen.add(key);
  }
  return { ok: true, value: structuredClone(data) as unknown as DeploymentPresetCatalog };
}

export function loadDeploymentPresets(storage: StorageLike): GameResult<DeploymentPresetCatalog> {
  try {
    const text = storage.getItem(DEPLOYMENT_PRESETS_KEY);
    return text === null ? { ok: true, value: empty() } : parseDeploymentPresets(text);
  } catch {
    return fail('編成プリセットを読み込めませんでした。');
  }
}

function persist(storage: StorageLike, catalog: DeploymentPresetCatalog): GameResult<DeploymentPresetCatalog> {
  const text = JSON.stringify(catalog);
  const validated = parseDeploymentPresets(text);
  if (!validated.ok) return validated;
  try {
    storage.setItem(DEPLOYMENT_PRESETS_KEY, text);
    return validated;
  } catch {
    return fail('編成プリセットを保存できませんでした。バックアップ後に保存容量を確認してください。');
  }
}

export function saveDeploymentPreset(
  storage: StorageLike,
  scenario: ScenarioDefinition,
  player: PlayerId,
  slot: number,
  name: string,
  kinds: readonly UnitKind[],
): GameResult<DeploymentPresetCatalog> {
  if (typeof name !== 'string' || hasControlCharacters(name)) return fail('プリセット名は制御文字を含めず指定してください。');
  const loaded = loadDeploymentPresets(storage);
  if (!loaded.ok) return loaded;
  const deployment = createDeploymentScenario(scenario, kinds, player);
  if (!deployment.ok) return deployment;
  const preset: DeploymentPreset = { scenarioId: scenario.id, player, slot, name: name.trim(), fingerprint: deploymentFingerprint(scenario), kinds: [...kinds] };
  return persist(storage, {
    schemaVersion: 1,
    presets: [...loaded.value.presets.filter((entry) => entry.scenarioId !== scenario.id || entry.player !== player || entry.slot !== slot), preset],
  });
}

export function applyDeploymentPreset(scenario: ScenarioDefinition, player: PlayerId, preset: DeploymentPreset): GameResult<UnitKind[]> {
  if (preset.scenarioId !== scenario.id || preset.player !== player) return fail('この作戦・陣営のプリセットではありません。');
  if (preset.fingerprint !== deploymentFingerprint(scenario)) return fail('作戦の配置・地形・目標が変更されています。現在の条件で編成し直してください。');
  const result = createDeploymentScenario(scenario, preset.kinds, player);
  return result.ok ? { ok: true, value: [...preset.kinds] } : result;
}

export function deleteDeploymentPreset(storage: StorageLike, scenarioId: string, player: PlayerId, slot: number): GameResult<DeploymentPresetCatalog> {
  const loaded = loadDeploymentPresets(storage);
  return loaded.ok
    ? persist(storage, { schemaVersion: 1, presets: loaded.value.presets.filter((entry) => entry.scenarioId !== scenarioId || entry.player !== player || entry.slot !== slot) })
    : loaded;
}

export function resetDeploymentPresets(storage: StorageLike): GameResult<DeploymentPresetCatalog> {
  try {
    storage.removeItem(DEPLOYMENT_PRESETS_KEY);
    return { ok: true, value: empty() };
  } catch {
    return fail('編成プリセットを初期化できませんでした。');
  }
}
