export const BUILDING_DEFINITIONS = Object.freeze({
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
  }),
  workshop: Object.freeze({
    id: "workshop",
    name: "工坊",
    width: 3,
    height: 2,
    cost: { materials: 28 },
    color: "#5c7898",
    production: { materials: 2 },
  }),
  canteen: Object.freeze({
    id: "canteen",
    name: "膳堂",
    width: 2,
    height: 2,
    cost: { materials: 18 },
    color: "#a66f52",
  }),
  warehouse: Object.freeze({
    id: "warehouse",
    name: "仓库",
    width: 2,
    height: 2,
    cost: { materials: 24 },
    color: "#766d9b",
  }),
});

export const BUILDING_ORDER = Object.freeze([
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
