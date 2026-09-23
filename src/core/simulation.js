import { JOB_DEFINITIONS, createInitialResidents } from "../residents/resident-definitions.js";

const MINUTES_PER_DAY = 24 * 60;

export function ensureSimulationState(state) {
  state.day ??= 1;
  state.timeMinutes ??= 360;
  state.paused ??= false;
  if (!Array.isArray(state.residents) || state.residents.length === 0) {
    state.residents = createInitialResidents();
  }
  return state;
}

export function formatGameTime(state) {
  const minutes = state.timeMinutes % MINUTES_PER_DAY;
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `第 ${state.day} 天 ${hour}:${minute}`;
}

export function setResidentJob(state, residentId, jobId) {
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident || !JOB_DEFINITIONS[jobId]) return { ok: false, reason: "resident_or_job_not_found" };
  resident.job = jobId;
  resident.mood = Math.min(100, resident.mood + 2);
  return { ok: true, resident };
}

function countWorkingResidents(state, jobId) {
  return state.residents.filter((resident) => resident.job === jobId && resident.energy > 0).length;
}

function countBuildings(state, typeId) {
  return state.buildings.filter((building) => building.typeId === typeId).length;
}

export function advanceSimulation(state, minutes = 10) {
  ensureSimulationState(state);
  if (state.paused || minutes <= 0) return { food: 0, materials: 0, incense: 0 };

  const hours = minutes / 60;
  const farms = countBuildings(state, "farm");
  const workshops = countBuildings(state, "workshop");
  const farmers = Math.min(countWorkingResidents(state, "farmer"), farms);
  const artisans = Math.min(countWorkingResidents(state, "artisan"), workshops);
  const stewards = countWorkingResidents(state, "steward");

  const produced = {
    food: Math.floor(farmers * JOB_DEFINITIONS.farmer.amountPerHour * hours),
    materials: Math.floor(artisans * JOB_DEFINITIONS.artisan.amountPerHour * hours),
    incense: Math.floor(stewards * JOB_DEFINITIONS.steward.amountPerHour * hours),
  };
  const foodConsumed = Math.floor(state.residents.length * hours);
  state.resources.food = Math.max(0, state.resources.food + produced.food - foodConsumed);
  state.resources.materials += produced.materials;
  state.resources.incense += produced.incense;

  for (const resident of state.residents) {
    resident.energy = Math.max(0, resident.energy - minutes * 0.04);
    resident.mood = state.resources.food > 0
      ? Math.min(100, resident.mood + 0.1)
      : Math.max(0, resident.mood - 0.5);
  }

  state.timeMinutes += minutes;
  while (state.timeMinutes >= MINUTES_PER_DAY) {
    state.timeMinutes -= MINUTES_PER_DAY;
    state.day += 1;
    for (const resident of state.residents) resident.energy = Math.min(100, resident.energy + 35);
  }
  return produced;
}
