import { getBuildingDefinition, getFootprint } from "../building/building-definitions.js";

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
      const tile = state.map.tiles[(y + row) * state.map.width + (x + column)];
      if (!tile) return { ok: false, reason: "outside_map" };
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
