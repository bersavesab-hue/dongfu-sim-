import { getBuildingDefinition } from "../building/building-definitions.js";
import { clearIncompatibleWorkplace, ensureResidentWorkState, getActiveWorkers, updateResidentWork } from "./resident-work.js";
import { JOB_DEFINITIONS, createInitialResidents } from "../residents/resident-definitions.js";

const MINUTES_PER_DAY = 24 * 60;
const BASE_RESOURCE_LIMITS = Object.freeze({ food: 240, materials: 160, incense: 100 });

function roundResource(value) {
  return Math.round(value * 100) / 100;
}

export function ensureSimulationState(state) {
  state.day ??= 1;
  state.timeMinutes ??= 360;
  state.paused ??= false;
  state.buildings ??= [];
  if (!Array.isArray(state.residents) || state.residents.length === 0) {
    state.residents = createInitialResidents();
  }
  for (const resident of state.residents) {
    if (resident.homeBuildingId === undefined) {
      resident.homeBuildingId = resident.assignedBuildingId ?? null;
    }
    delete resident.assignedBuildingId;
    resident.energy ??= 100;
    resident.mood ??= 80;
  }
  ensureResidentWorkState(state);
  return state;
}

export function formatGameTime(state) {
  const minutes = state.timeMinutes % MINUTES_PER_DAY;
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `第 ${state.day} 天 ${hour}:${minute}`;
}

export function getResourceLimits(state) {
  const limits = { ...BASE_RESOURCE_LIMITS };
  for (const building of state.buildings ?? []) {
    const storage = getBuildingDefinition(building.typeId)?.storage;
    if (!storage) continue;
    for (const resource of Object.keys(limits)) limits[resource] += storage[resource] ?? 0;
  }
  return limits;
}

export function enforceResourceLimits(state) {
  const limits = getResourceLimits(state);
  for (const resource of Object.keys(limits)) {
    state.resources[resource] = roundResource(Math.max(0, Math.min(state.resources[resource] ?? 0, limits[resource])));
  }
  return limits;
}

export function getSettlementEffects(state) {
  const canteens = (state.buildings ?? []).filter((building) => building.typeId === "canteen").length;
  const definition = getBuildingDefinition("canteen");
  const reductionPerBuilding = definition?.effects?.foodConsumptionReduction ?? 0;
  const moodPerBuilding = definition?.effects?.moodPerTick ?? 0;
  const foodConsumptionReduction = Math.min(0.5, canteens * reductionPerBuilding);
  return {
    canteens,
    foodConsumptionReduction,
    foodConsumptionMultiplier: 1 - foodConsumptionReduction,
    moodBonusPerTick: Math.min(0.2, canteens * moodPerBuilding),
  };
}

export function getHousingSummary(state) {
  ensureSimulationState(state);
  const residences = state.buildings.filter((building) => building.typeId === "residence");
  const capacity = residences.reduce((sum, building) => sum + (getBuildingDefinition(building.typeId)?.capacity ?? 0), 0);
  const validHomes = new Set(residences.map((building) => building.id));
  const occupied = state.residents.filter((resident) => validHomes.has(resident.homeBuildingId)).length;
  return { occupied, capacity, residences };
}

export function assignResidentHome(state, residentId, buildingId) {
  ensureSimulationState(state);
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident) return { ok: false, reason: "resident_not_found" };
  if (!buildingId) {
    resident.homeBuildingId = null;
    resident.route = [];
    resident.routeIndex = 0;
    resident.routeTargetBuildingId = null;
    return { ok: true, resident, building: null };
  }
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return { ok: false, reason: "home_not_found" };
  if (building.typeId !== "residence") return { ok: false, reason: "home_not_residence" };
  const capacity = getBuildingDefinition(building.typeId)?.capacity ?? 0;
  const occupied = state.residents.filter((item) => item.homeBuildingId === buildingId && item.id !== residentId).length;
  if (occupied >= capacity) return { ok: false, reason: "home_full" };
  resident.homeBuildingId = buildingId;
  resident.route = [];
  resident.routeIndex = 0;
  resident.routeTargetBuildingId = null;
  if (["idle", "waiting_home", "waiting_workplace", "resting"].includes(resident.activity)) {
    const index = state.residents.indexOf(resident);
    resident.position = {
      x: building.x + building.width / 2 + (index % 3 - 1) * 0.14,
      y: building.y + building.height / 2 + 0.28,
    };
  }
  resident.mood = Math.min(100, resident.mood + 3);
  return { ok: true, resident, building };
}

export function setResidentJob(state, residentId, jobId) {
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident || !JOB_DEFINITIONS[jobId]) return { ok: false, reason: "resident_or_job_not_found" };
  resident.job = jobId;
  clearIncompatibleWorkplace(state, resident);
  resident.mood = Math.min(100, resident.mood + 2);
  return { ok: true, resident };
}

function countBuildings(state, typeId) {
  return state.buildings.filter((building) => building.typeId === typeId).length;
}

export function advanceSimulation(state, minutes = 10) {
  ensureSimulationState(state);
  if (state.paused || minutes <= 0) return { food: 0, materials: 0, incense: 0 };

  updateResidentWork(state, minutes);
  const hours = minutes / 60;
  const farmers = Math.min(getActiveWorkers(state, "farmer").length, countBuildings(state, "farm"));
  const artisans = Math.min(getActiveWorkers(state, "artisan").length, countBuildings(state, "workshop"));
  const stewards = getActiveWorkers(state, "steward").length;
  const effects = getSettlementEffects(state);

  const produced = {
    food: farmers * JOB_DEFINITIONS.farmer.amountPerHour * hours,
    materials: artisans * JOB_DEFINITIONS.artisan.amountPerHour * hours,
    incense: stewards * JOB_DEFINITIONS.steward.amountPerHour * hours,
  };
  const foodConsumed = state.residents.length * hours * effects.foodConsumptionMultiplier;
  state.resources.food = roundResource(state.resources.food + produced.food - foodConsumed);
  state.resources.materials = roundResource(state.resources.materials + produced.materials);
  state.resources.incense = roundResource(state.resources.incense + produced.incense);
  enforceResourceLimits(state);

  const validHomes = new Set(getHousingSummary(state).residences.map((building) => building.id));
  for (const resident of state.residents) {
    if (resident.activity === "working") {
      resident.energy = Math.max(0, resident.energy - minutes * 0.055);
    } else if (resident.activity === "resting") {
      resident.energy = Math.min(100, resident.energy + minutes * 0.08);
    } else if (resident.activity.startsWith("walking")) {
      resident.energy = Math.max(0, resident.energy - minutes * 0.025);
    }
    const housed = validHomes.has(resident.homeBuildingId);
    if (!housed) {
      resident.mood = Math.max(0, resident.mood - 0.35);
    } else if (state.resources.food > 0) {
      resident.mood = Math.min(100, resident.mood + 0.1 + effects.moodBonusPerTick);
    } else {
      resident.mood = Math.max(0, resident.mood - 0.5);
    }
  }

  state.timeMinutes += minutes;
  while (state.timeMinutes >= MINUTES_PER_DAY) {
    state.timeMinutes -= MINUTES_PER_DAY;
    state.day += 1;
  }
  return { ...produced, foodConsumed };
}
