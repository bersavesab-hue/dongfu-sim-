import { SAVE_VERSION } from "./save-schema.js";
import { createBuildingState } from "./building-state.js";
import { ensureSimulationState } from "./simulation.js";

const SAVE_KEY = "dongfu-sim-save";

export function serializeGameState(state) {
  return JSON.stringify({
    saveVersion: SAVE_VERSION,
    day: state.day,
    timeMinutes: state.timeMinutes,
    paused: state.paused,
    resources: state.resources,
    buildings: state.buildings,
    residents: state.residents,
    nextBuildingNumber: state.nextBuildingNumber,
  });
}

export function saveGameState(state, storage) {
  if (!storage) return false;
  storage.setItem(SAVE_KEY, serializeGameState(state));
  return true;
}

export function loadGameState(map, storage) {
  const state = createBuildingState(map);
  if (!storage) return ensureSimulationState(state);

  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return ensureSimulationState(state);
    const saved = JSON.parse(raw);
    if (saved.saveVersion !== SAVE_VERSION || !Array.isArray(saved.buildings)) return ensureSimulationState(state);

    const occupied = new Set();
    for (const building of saved.buildings) {
      if (!building || typeof building.id !== "string"
        || !Number.isInteger(building.x) || !Number.isInteger(building.y)
        || !Number.isInteger(building.width) || !Number.isInteger(building.height)
        || building.width < 1 || building.height < 1
        || building.x < 0 || building.y < 0
        || building.x + building.width > map.width || building.y + building.height > map.height) {
        return ensureSimulationState(state);
      }
      for (let row = 0; row < building.height; row += 1) {
        for (let column = 0; column < building.width; column += 1) {
          const key = `${building.x + column},${building.y + row}`;
          if (occupied.has(key)) return ensureSimulationState(state);
          occupied.add(key);
        }
      }
    }

    state.resources = {
      ...state.resources,
      ...(saved.resources ?? {}),
    };
    state.buildings = saved.buildings;
    state.residents = saved.residents;
    state.day = Number.isInteger(saved.day) && saved.day > 0 ? saved.day : 1;
    state.timeMinutes = Number.isFinite(saved.timeMinutes) && saved.timeMinutes >= 0
      ? saved.timeMinutes % 1440 : 360;
    state.paused = saved.paused === true;
    state.nextBuildingNumber = Math.max(
      Number(saved.nextBuildingNumber) || 1,
      ...state.buildings.map((building) => Number(building.id?.split("-").pop()) + 1 || 1),
    );

    for (const building of state.buildings) {
      for (let row = 0; row < building.height; row += 1) {
        for (let column = 0; column < building.width; column += 1) {
          const tile = state.map.tiles[(building.y + row) * state.map.width + (building.x + column)];
          if (tile) tile.buildingId = building.id;
        }
      }
    }
  } catch {
    return ensureSimulationState(createBuildingState(map));
  }
  return ensureSimulationState(state);
}

export function clearGameSave(storage) {
  if (!storage) return false;
  storage.removeItem(SAVE_KEY);
  return true;
}
