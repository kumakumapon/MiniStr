import { describe, expect, it } from "vitest";
import {
  CUSTOM_SCENARIOS_KEY,
  availableScenarios,
  countProductionFacilities,
  createBuiltInScenarioCatalog,
  createScenarioEditor,
  createScenarioInitialState,
  deleteCustomScenario,
  idleProductionFacilities,
  importScenarioEditorJson,
  loadCustomScenarios,
  loadScenarioDefinitions,
  maps,
  saveCustomScenario,
  scenarioById,
  scenarioDefinitionToData,
  scenarioHistory,
  scenarioThemes,
  unitStats,
  type ScenarioData,
  type ScenarioStorageLike,
} from "./index";

class MemoryStorage implements ScenarioStorageLike {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const customScenario: ScenarioData = {
  id: "test-custom-persistence",
  name: "保存テスト",
  briefing: "検証済みのカスタム作戦。",
  startingGold: 1234,
  board: {
    width: 2,
    height: 1,
    cells: [
      [0, 0, "capital", "red"],
      [1, 0, "capital", "blue"],
    ],
  },
  initialUnits: [
    { kind: "infantry", owner: "red", x: 0, y: 0 },
    { kind: "infantry", owner: "blue", x: 1, y: 0 },
  ],
  victoryConditions: [{ type: "captureCapital" }],
  defeatConditions: [{ type: "captureCapital" }],
};

describe("expanded map roster", () => {
  it("falls back to a playable emergency scenario when the built-in catalog is invalid", () => {
    const catalog = createBuiltInScenarioCatalog([{ id: "broken" }]);
    expect(catalog.error).toBeDefined();
    expect(catalog.scenarios.map((scenario) => scenario.id)).toEqual([
      "emergency-skirmish",
    ]);
    expect(
      createScenarioInitialState(catalog.scenarios[0]!).units,
    ).toHaveLength(2);
  });

  it("offers eleven distinct scenarios with map-owned starting forces", () => {
    expect(maps.map((map) => map.id)).toEqual([
      "skirmish",
      "islands",
      "landing",
      "canyon",
      "siege",
      "river",
      "industrial",
      "tundra",
      "outpost",
      "marsh",
      "admiralty",
    ]);
    for (const map of maps) {
      expect(map.initialUnits.some((unit) => unit.owner === "red")).toBe(true);
      expect(map.initialUnits.some((unit) => unit.owner === "blue")).toBe(true);
      for (const unit of map.initialUnits) {
        expect(unit.x).toBeGreaterThanOrEqual(0);
        expect(unit.y).toBeGreaterThanOrEqual(0);
        expect(unit.x).toBeLessThan(map.board.width);
        expect(unit.y).toBeLessThan(map.board.height);
      }
    }
  });

  it("resolves a valid theme for every built-in scenario and rejects an unknown theme", () => {
    for (const map of maps) expect(scenarioThemes).toContain(map.theme);
    const source = { ...scenarioDefinitionToData(maps[0]!), id: "theme-check" };
    expect(loadScenarioDefinitions([{ ...source, theme: "volcanic" }])).toEqual(
      { ok: false, error: "シナリオ「theme-check」のテーマが不正です。" },
    );
    // An omitted theme is not an error: it resolves to the default.
    expect(
      loadScenarioDefinitions([{ ...source, theme: undefined }]),
    ).toMatchObject({ ok: true, value: [{ theme: "temperate" }] });
  });

  it("round-trips theme through scenarioDefinitionToData and reload", () => {
    for (const map of maps) {
      const data = scenarioDefinitionToData(map);
      expect(data.theme).toBe(map.theme);
      const reloaded = loadScenarioDefinitions([
        { ...data, id: `${map.id}-reload` },
      ]);
      expect(reloaded.ok && reloaded.value[0]!.theme).toBe(map.theme);
    }
  });

  it("round-trips generated board dimensions at and around parser boundaries", () => {
    for (let seed = 1; seed <= 64; seed++) {
      const width = seed % 8 === 0 ? 257 : ((seed * 37) % 256) + 1;
      const height = seed % 11 === 0 ? 257 : ((seed * 53) % 256) + 1;
      const input = {
        ...customScenario,
        id: `dimension-${seed}`,
        board: { width, height, fill: "plain" as const, cells: [] as const },
        initialUnits: [
          { kind: "infantry" as const, owner: "red" as const, x: 0, y: 0 },
        ],
        victoryConditions: [{ type: "eliminate" as const }],
        defeatConditions: [{ type: "eliminate" as const }],
      };
      const loaded = loadScenarioDefinitions([input]);
      if (width > 256 || height > 256) {
        expect(loaded.ok).toBe(false);
        continue;
      }
      expect(loaded.ok).toBe(true);
      if (loaded.ok)
        expect(
          loadScenarioDefinitions([
            {
              ...scenarioDefinitionToData(loaded.value[0]!),
              id: `roundtrip-${seed}`,
            },
          ]).ok,
        ).toBe(true);
    }
  });

  it("gives both players at least one owned production facility at turn one, and at least four production tiles total", () => {
    for (const map of maps) {
      const state = createScenarioInitialState(map);
      expect(countProductionFacilities(state, "red")).toBeGreaterThan(0);
      expect(countProductionFacilities(state, "blue")).toBeGreaterThan(0);
      // No built-in scenario deploys a starting unit on top of a facility, so at
      // turn one every owned facility is still idle.
      expect(idleProductionFacilities(state, "red")).toHaveLength(
        countProductionFacilities(state, "red"),
      );
      expect(idleProductionFacilities(state, "blue")).toHaveLength(
        countProductionFacilities(state, "blue"),
      );
      const totalProductionTiles = map.board.terrain
        .flat()
        .filter(
          (tile) => tile.kind === "factory" || tile.kind === "port",
        ).length;
      expect(totalProductionTiles).toBeGreaterThanOrEqual(4);
    }
  });

  it("gives tundra a survive victory condition for red and industrial a score condition", () => {
    const tundra = maps.find((map) => map.id === "tundra")!;
    expect(
      tundra.victoryConditions.some(
        (condition) => condition.type === "survive",
      ),
    ).toBe(true);
    const industrial = maps.find((map) => map.id === "industrial")!;
    expect(
      industrial.victoryConditions.some(
        (condition) => condition.type === "score",
      ),
    ).toBe(true);
  });

  it("adds reconnaissance cars and self-propelled rocket artillery", () => {
    expect(unitStats.recon).toMatchObject({ movement: 7, vision: 5 });
    expect(unitStats.rocket).toMatchObject({ range: [3, 5], attack: 90 });
    expect(
      maps.some((map) =>
        map.initialUnits.some((unit) => unit.kind === "recon"),
      ),
    ).toBe(true);
    expect(
      maps.some((map) =>
        map.initialUnits.some((unit) => unit.kind === "rocket"),
      ),
    ).toBe(true);
  });

  it("adds a swamp-focused map with APCs for both armies", () => {
    const marsh = maps.find((map) => map.id === "marsh")!;
    expect(
      marsh.board.terrain.flat().some((tile) => tile.kind === "swamp"),
    ).toBe(true);
    expect(
      marsh.initialUnits
        .filter((unit) => unit.kind === "apc")
        .map((unit) => unit.owner)
        .sort(),
    ).toEqual(["blue", "red"]);
  });

  it("persists custom scenarios, restores them into the selectable catalog, and creates canonical initial state", () => {
    const storage = new MemoryStorage();
    const saved = saveCustomScenario(storage, customScenario);
    expect(saved.ok).toBe(true);
    expect(scenarioById(customScenario.id)?.name).toBe(customScenario.name);
    expect(
      availableScenarios().some(
        (scenario) => scenario.id === customScenario.id,
      ),
    ).toBe(true);
    if (saved.ok)
      expect(createScenarioInitialState(saved.value)).toMatchObject({
        scenarioId: customScenario.id,
        players: { red: { gold: 2234 }, blue: { gold: 1234 } },
        units: [{ id: "r1" }, { id: "b1" }],
      });

    loadCustomScenarios(new MemoryStorage());
    expect(scenarioById(customScenario.id)).toBeUndefined();
    expect(loadCustomScenarios(storage).ok).toBe(true);
    expect(scenarioById(customScenario.id)?.board.width).toBe(2);
  });

  it("rejects aggregate board-work expansion before allocation and preserves the live catalog on failure", () => {
    const storage = new MemoryStorage();
    loadCustomScenarios(storage);
    expect(saveCustomScenario(storage, customScenario).ok).toBe(true);
    const oversizedHistory = Array.from({ length: 16 }, (_, index) => ({
      ...customScenario,
      id: `large-history-${index}`,
      board: { width: 256, height: 256, cells: [] },
      initialUnits: [],
    }));
    storage.setItem(
      CUSTOM_SCENARIOS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        scenarios: [customScenario],
        history: oversizedHistory,
      }),
    );
    expect(loadCustomScenarios(storage)).toMatchObject({
      ok: false,
      error: expect.stringContaining("展開上限"),
    });
    expect(scenarioById(customScenario.id)?.name).toBe(customScenario.name);
  });

  it("does not consume revision history for identical saves and can still delete the map", () => {
    const storage = new MemoryStorage();
    loadCustomScenarios(storage);
    expect(saveCustomScenario(storage, customScenario).ok).toBe(true);
    for (let index = 0; index < 300; index++)
      expect(saveCustomScenario(storage, customScenario).ok).toBe(true);
    expect(scenarioHistory(customScenario.id)).toHaveLength(0);
    expect(deleteCustomScenario(storage, customScenario.id).ok).toBe(true);
  });

  it("preserves legacy-referenced history at the cap and compacts it after the save is removed", () => {
    const storage = new MemoryStorage();
    loadCustomScenarios(storage);
    const id = "legacy-history-budget";
    let current = { ...customScenario, id };
    expect(saveCustomScenario(storage, current).ok).toBe(true);
    storage.setItem(
      "ministr.save.manual",
      JSON.stringify({ mapId: id, initialState: { scenarioId: id } }),
    );
    for (let index = 0; index < 256; index++) {
      current = { ...current, name: `Revision ${index}` };
      expect(saveCustomScenario(storage, current).ok).toBe(true);
    }
    expect(scenarioHistory(id)).toHaveLength(256);
    expect(
      saveCustomScenario(storage, { ...current, name: "Revision beyond cap" }),
    ).toMatchObject({ ok: false });
    storage.removeItem("ministr.save.manual");
    expect(saveCustomScenario(storage, current).ok).toBe(true);
    expect(scenarioHistory(id)).toHaveLength(0);
    expect(
      saveCustomScenario(storage, { ...current, name: "Recovered revision" })
        .ok,
    ).toBe(true);
  });

  it("rejects unsafe scenario IDs from JSON imports and saved custom scenario data", () => {
    for (const id of ['unsafe"quote', "unsafe<angle", "unsafe'apostrophe"]) {
      const source = { ...customScenario, id };
      expect(loadScenarioDefinitions([source]).ok).toBe(false);
      expect(
        importScenarioEditorJson(JSON.stringify(source), createScenarioEditor())
          .ok,
      ).toBe(false);
    }

    const storage = new MemoryStorage();
    storage.setItem(
      CUSTOM_SCENARIOS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        scenarios: [{ ...customScenario, id: 'unsafe"persisted' }],
      }),
    );
    expect(loadCustomScenarios(storage).ok).toBe(false);
    expect(scenarioById('unsafe"persisted')).toBeUndefined();
  });
});
