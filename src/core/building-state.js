import { getBuildingDefinition, getFootprint } from "../building/building-definitions.js";
import { isInsideMap } from "./map-grid.js";

export function createBuildingState(map) {
  return {
    map,
    buildings: [],
    resources: {
      food: 120,
      materials: 80,
      incense: 0,
    },
    nextBuildingNumber: 1,
  };
}

function hasResources(resources, cost) {
  return Object.entries(cost).every(([type, amount]) => (resources[type] ?? 0) >= amount);
}

function reserveResources(resources, cost) {
  for (const [type, amount] of Object.entries(cost)) {
    resources[type] = (resources[type] ?? 0) - amount;
  }
}

function releaseResources(resources, cost) {
  for (const [type, amount] of Object.entries(cost)) {
    resources[type] = (resources[type] ?? 0) + Math.floor(amount * 0.5);
  }
}

export function canPlaceBuilding(state, typeId, x, y, rotation = 0) {
  const definition = getBuildingDefinition(typeId);
  if (!definition) return { ok: false, reason: "building_not_found" };
  const footprint = getFootprint(definition, rotation);

  for (let row = 0; row < footprint.height; row += 1) {
    for (let column = 0; column < footprint.width; column += 1) {
      const tileX = x + column;
      const tileY = y + row;
      if (!isInsideMap(tileX, tileY)) return { ok: false, reason: "outside_map" };
      const tile = state.map.tiles[tileY * state.map.width + tileX];
      if (!tile.buildable) return { ok: false, reason: "not_buildable" };
      if (tile.buildingId) return { ok: false, reason: "occupied" };
    }
  }

  if (!hasResources(state.resources, definition.cost)) {
    return { ok: false, reason: "insufficient_resources" };
  }
  return { ok: true, definition, footprint };
}

export function placeBuilding(state, typeId, x, y, rotation = 0) {
  const check = canPlaceBuilding(state, typeId, x, y, rotation);
  if (!check.ok) return check;

  const id = `building-${state.nextBuildingNumber}`;
  state.nextBuildingNumber += 1;
  reserveResources(state.resources, check.definition.cost);
  const building = {
    id,
    typeId,
    name: check.definition.name,
    color: check.definition.color,
    x,
    y,
    rotation: rotation % 4,
    width: check.footprint.width,
    height: check.footprint.height,
  };
  state.buildings.push(building);

  for (let row = 0; row < building.height; row += 1) {
    for (let column = 0; column < building.width; column += 1) {
      state.map.tiles[(y + row) * state.map.width + (x + column)].buildingId = id;
    }
  }
  return { ok: true, building };
}

export function canPlaceRoadBatch(state, cells) {
  const definition = getBuildingDefinition("road");
  const uniqueCells = [];
  const seen = new Set();

  for (const cell of cells ?? []) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isInsideMap(cell.x, cell.y)) return { ok: false, reason: "outside_map" };
    const tile = state.map.tiles[cell.y * state.map.width + cell.x];
    if (!tile.buildable) return { ok: false, reason: "not_buildable" };
    if (tile.buildingId) {
      const existing = state.buildings.find((building) => building.id === tile.buildingId);
      if (existing?.typeId === "road") continue;
      return { ok: false, reason: "occupied" };
    }
    uniqueCells.push({ x: cell.x, y: cell.y });
  }

  if (uniqueCells.length === 0) return { ok: false, reason: "no_new_road" };
  const cost = uniqueCells.length * (definition.cost.materials ?? 0);
  if ((state.resources.materials ?? 0) < cost) {
    return { ok: false, reason: "insufficient_resources", cells: uniqueCells, cost };
  }
  return { ok: true, cells: uniqueCells, cost, definition };
}

export function placeRoadBatch(state, cells) {
  const check = canPlaceRoadBatch(state, cells);
  if (!check.ok) return check;
  const roads = [];
  state.resources.materials -= check.cost;

  for (const cell of check.cells) {
    const id = `building-${state.nextBuildingNumber}`;
    state.nextBuildingNumber += 1;
    const road = {
      id,
      typeId: "road",
      name: check.definition.name,
      color: check.definition.color,
      x: cell.x,
      y: cell.y,
      rotation: 0,
      width: 1,
      height: 1,
    };
    state.buildings.push(road);
    state.map.tiles[cell.y * state.map.width + cell.x].buildingId = id;
    roads.push(road);
  }
  return { ok: true, roads, cost: check.cost };
}

export function demolishBuilding(state, buildingId) {
  const index = state.buildings.findIndex((building) => building.id === buildingId);
  if (index < 0) return { ok: false, reason: "building_not_found" };
  const building = state.buildings[index];
  const definition = getBuildingDefinition(building.typeId);

  for (let row = 0; row < building.height; row += 1) {
    for (let column = 0; column < building.width; column += 1) {
      const tile = state.map.tiles[(building.y + row) * state.map.width + (building.x + column)];
      if (tile?.buildingId === building.id) tile.buildingId = null;
    }
  }
  state.buildings.splice(index, 1);
  releaseResources(state.resources, definition.cost);
  return { ok: true, building };
}

export function demolishRoadBatch(state, buildingIds) {
  const uniqueIds = [...new Set(buildingIds ?? [])];
  const roads = uniqueIds
    .map((id) => state.buildings.find((building) => building.id === id))
    .filter((building) => building?.typeId === "road");
  if (roads.length === 0) return { ok: false, reason: "road_not_found" };

  const definition = getBuildingDefinition("road");
  const refunded = Math.floor(roads.length * (definition.cost.materials ?? 0) * 0.5);
  for (const road of roads) {
    const tile = state.map.tiles[road.y * state.map.width + road.x];
    if (tile?.buildingId === road.id) tile.buildingId = null;
  }
  const removedIds = new Set(roads.map((road) => road.id));
  state.buildings = state.buildings.filter((building) => !removedIds.has(building.id));
  state.resources.materials += refunded;
  return { ok: true, roads, refunded };
}
