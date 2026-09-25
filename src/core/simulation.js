import { getBuildingDefinition } from "../building/building-definitions.js";
import { clearIncompatibleWorkplace, ensureResidentWorkState, getActiveWorkers, updateResidentWork } from "./resident-work.js";
import { JOB_DEFINITIONS, createInitialResidents } from "../residents/resident-definitions.js";
import { ECONOMY_RULES } from "./economy-rules.js";

const MINUTES_PER_DAY = 24 * 60;
const BASE_RESOURCE_LIMITS = ECONOMY_RULES.storage;

function roundResource(value) {
  return Math.round(value * 100) / 100;
}

export function ensureSimulationState(state) {
  state.day ??= 1;
  state.timeMinutes ??= 360;
  state.paused ??= false;
  state.lastRescueAt ??= null;
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
  const staffedCanteens = getActiveWorkers(state, "steward")
    .filter((resident) => state.buildings.some((building) => (
      building.id === resident.workplaceBuildingId && building.typeId === "canteen"
    ))).length;
  const definition = getBuildingDefinition("canteen");
  const reductionPerBuilding = definition?.effects?.foodConsumptionReduction ?? 0;
  const moodPerBuilding = definition?.effects?.moodPerTick ?? 0;
  const foodConsumptionReduction = Math.min(0.5, staffedCanteens * reductionPerBuilding);
  return {
    canteens,
    staffedCanteens,
    foodConsumptionReduction,
    foodConsumptionMultiplier: 1 - foodConsumptionReduction,
    moodBonusPerTick: Math.min(0.2, staffedCanteens * moodPerBuilding),
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

export function getRescueStatus(state) {
  const now = (state.day - 1) * MINUTES_PER_DAY + state.timeMinutes;
  const elapsed = state.lastRescueAt === null || state.lastRescueAt === undefined
    ? Infinity : now - state.lastRescueAt;
  const remainingMinutes = Math.max(0, ECONOMY_RULES.rescue.cooldownMinutes - elapsed);
  return { available: remainingMinutes === 0, remainingMinutes };
}

export function collectSupplies(state) {
  ensureSimulationState(state);
  const status = getRescueStatus(state);
  if (!status.available) return { ok: false, reason: "rescue_cooldown", ...status };
  const resident = [...state.residents].sort((a, b) => b.energy - a.energy)[0];
  if (!resident || resident.energy < ECONOMY_RULES.rescue.energyCost) {
    return { ok: false, reason: "rescue_exhausted" };
  }
  const limits = getResourceLimits(state);
  if (state.resources.food >= limits.food && state.resources.materials >= limits.materials) {
    return { ok: false, reason: "rescue_full" };
  }

  const wasPaused = state.paused;
  state.paused = false;
  for (let elapsed = 0; elapsed < ECONOMY_RULES.rescue.durationMinutes; elapsed += 10) {
    advanceSimulation(state, 10);
  }
  state.paused = wasPaused;
  resident.energy = Math.max(0, resident.energy - ECONOMY_RULES.rescue.energyCost);
  resident.mood = Math.max(0, resident.mood - ECONOMY_RULES.rescue.moodCost);
  const beforeFood = state.resources.food;
  const beforeMaterials = state.resources.materials;
  state.resources.food += ECONOMY_RULES.rescue.food;
  state.resources.materials += ECONOMY_RULES.rescue.materials;
  enforceResourceLimits(state);
  state.lastRescueAt = (state.day - 1) * MINUTES_PER_DAY + state.timeMinutes;
  return { ok: true, resident,
    food: roundResource(state.resources.food - beforeFood),
    materials: roundResource(state.resources.materials - beforeMaterials) };
}

export function advanceSimulation(state, minutes = 10) {
  ensureSimulationState(state);
  if (state.paused || minutes <= 0) return { food: 0, materials: 0, incense: 0 };

  updateResidentWork(state, minutes);
  const hours = minutes / 60;
  const workingAt = (job, type) => getActiveWorkers(state, job).filter((resident) => (
    state.buildings.some((building) => building.id === resident.workplaceBuildingId && building.typeId === type)
  ));
  const farmers = workingAt("farmer", "farm");
  const artisans = workingAt("artisan", "workshop");
  const stewards = workingAt("steward", "warehouse");
  const effects = getSettlementEffects(state);

  const produced = {
    food: farmers.reduce((sum, resident) => sum + workerEfficiency(resident), 0)
      * JOB_DEFINITIONS.farmer.amountPerHour * hours,
    materials: artisans.reduce((sum, resident) => sum + workerEfficiency(resident), 0)
      * JOB_DEFINITIONS.artisan.amountPerHour * hours,
    incense: stewards.reduce((sum, resident) => sum + workerEfficiency(resident), 0)
      * JOB_DEFINITIONS.steward.amountPerHour * hours,
  };
  const foodConsumed = state.residents.length * ECONOMY_RULES.foodPerResidentHour
    * hours * effects.foodConsumptionMultiplier;
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
    } else if (resident.activity === "waiting_home" || resident.activity === "exhausted") {
      resident.energy = Math.min(100, resident.energy + minutes * 0.03);
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

function workerEfficiency(resident) {
  return (0.5 + resident.energy / 200) * (0.5 + resident.mood / 200);
}
