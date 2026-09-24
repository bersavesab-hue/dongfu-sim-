export const BUILDING_DEFINITIONS = Object.freeze({
  road: Object.freeze({
    id: "road",
    name: "青石路",
    width: 1,
    height: 1,
    cost: { materials: 1 },
    color: "#a89d7f",
    isRoad: true,
  }),
  residence: Object.freeze({
    id: "residence",
    name: "居所",
    width: 2,
    height: 2,
    cost: { materials: 20 },
    color: "#8f6d4f",
    capacity: 2,
  }),
  farm: Object.freeze({
    id: "farm",
    name: "灵田",
    width: 3,
    height: 2,
    cost: { materials: 12 },
    color: "#6e9b5d",
    production: { food: 3 },
    workerCapacity: 1,
    workerJobs: Object.freeze(["farmer"]),
  }),
  workshop: Object.freeze({
    id: "workshop",
    name: "工坊",
    width: 3,
    height: 2,
    cost: { materials: 28 },
    color: "#5c7898",
    production: { materials: 2 },
    workerCapacity: 1,
    workerJobs: Object.freeze(["artisan"]),
  }),
  canteen: Object.freeze({
    id: "canteen",
    name: "膳堂",
    width: 2,
    height: 2,
    cost: { materials: 18 },
    color: "#a66f52",
    effects: Object.freeze({ foodConsumptionReduction: 0.25, moodPerTick: 0.1 }),
    workerCapacity: 1,
    workerJobs: Object.freeze(["steward"]),
  }),
  warehouse: Object.freeze({
    id: "warehouse",
    name: "仓库",
    width: 2,
    height: 2,
    cost: { materials: 24 },
    color: "#766d9b",
    storage: Object.freeze({ food: 240, materials: 160, incense: 120 }),
    workerCapacity: 1,
    workerJobs: Object.freeze(["steward"]),
  }),
});

export const BUILDING_ORDER = Object.freeze([
  "road",
  "residence",
  "farm",
  "workshop",
  "canteen",
  "warehouse",
]);

export function getBuildingDefinition(typeId) {
  return BUILDING_DEFINITIONS[typeId] ?? null;
}

export function getFootprint(definition, rotation = 0) {
  return rotation % 2 === 0
    ? { width: definition.width, height: definition.height }
    : { width: definition.height, height: definition.width };
}
