import { getBuildingDefinition } from "../building/building-definitions.js";

export const ACTIVITY_LABELS = Object.freeze({
  idle: "空闲",
  waiting_home: "暂无居所",
  waiting_workplace: "等待分配工作地",
  walking_to_work: "前往工作",
  working: "工作中",
  walking_home: "返回居所",
  resting: "休息中",
  exhausted: "精力不足",
});

function getBuildingCenter(building, residentIndex = 0) {
  const offset = (residentIndex % 3 - 1) * 0.18;
  return {
    x: building.x + building.width / 2 + offset,
    y: building.y + building.height / 2 + 0.42,
  };
}

function isCompatible(building, jobId) {
  const jobs = getBuildingDefinition(building?.typeId)?.workerJobs ?? [];
  return jobs.includes(jobId);
}

export function ensureResidentWorkState(state) {
  state.residents.forEach((resident, index) => {
    resident.workplaceBuildingId ??= null;
    resident.activity ??= "idle";
    resident.position ??= { x: 63.5 + index * 0.65, y: 65.2 };
    resident.facing ??= "right";
    const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);
    if (resident.workplaceBuildingId && (!workplace || !isCompatible(workplace, resident.job))) {
      resident.workplaceBuildingId = null;
      resident.activity = "waiting_workplace";
    }
  });
}

export function getCompatibleWorkplaces(state, resident) {
  return state.buildings.filter((building) => isCompatible(building, resident.job));
}

export function assignResidentWorkplace(state, residentId, buildingId) {
  ensureResidentWorkState(state);
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident) return { ok: false, reason: "resident_not_found" };
  if (!buildingId) {
    resident.workplaceBuildingId = null;
    resident.activity = "waiting_workplace";
    return { ok: true, resident, building: null };
  }
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return { ok: false, reason: "workplace_not_found" };
  if (!isCompatible(building, resident.job)) return { ok: false, reason: "workplace_incompatible" };
  const capacity = getBuildingDefinition(building.typeId)?.workerCapacity ?? 0;
  const occupied = state.residents.filter((item) => item.id !== residentId && item.workplaceBuildingId === buildingId).length;
  if (occupied >= capacity) return { ok: false, reason: "workplace_full" };
  resident.workplaceBuildingId = buildingId;
  resident.activity = "walking_to_work";
  return { ok: true, resident, building };
}

export function clearIncompatibleWorkplace(state, resident) {
  const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);
  if (!workplace || !isCompatible(workplace, resident.job)) {
    resident.workplaceBuildingId = null;
    resident.activity = "waiting_workplace";
  }
}

function moveResidentToward(resident, target, distance) {
  const position = resident.position;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const length = Math.hypot(dx, dy);
  const arrived = length <= distance || length < 0.001;
  const nextPosition = arrived
    ? { ...target }
    : {
        x: position.x + dx / length * distance,
        y: position.y + dy / length * distance,
      };
  const screenDeltaX = (nextPosition.x - position.x) - (nextPosition.y - position.y);
  if (Math.abs(screenDeltaX) > 0.001) resident.facing = screenDeltaX < 0 ? "left" : "right";
  resident.position = nextPosition;
  return { position: nextPosition, arrived };
}

export function updateResidentWork(state, minutes) {
  ensureResidentWorkState(state);
  const minuteOfDay = state.timeMinutes % (24 * 60);
  const onDuty = minuteOfDay >= 360 && minuteOfDay < 1080;
  const stepDistance = Math.max(0, minutes) * 0.08;

  state.residents.forEach((resident, index) => {
    const home = state.buildings.find((building) => building.id === resident.homeBuildingId && building.typeId === "residence");
    const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);

    if (resident.energy <= 0) {
      resident.activity = "exhausted";
      if (!home) return;
      const movement = moveResidentToward(resident, getBuildingCenter(home, index), stepDistance);
      if (movement.arrived) resident.activity = "resting";
      return;
    }

    if (onDuty) {
      if (!workplace || !isCompatible(workplace, resident.job)) {
        resident.workplaceBuildingId = null;
        resident.activity = "waiting_workplace";
        return;
      }
      const movement = moveResidentToward(resident, getBuildingCenter(workplace, index), stepDistance);
      resident.activity = movement.arrived ? "working" : "walking_to_work";
      return;
    }

    if (!home) {
      resident.activity = "waiting_home";
      return;
    }
    const movement = moveResidentToward(resident, getBuildingCenter(home, index), stepDistance);
    resident.position = movement.position;
    resident.activity = movement.arrived ? "resting" : "walking_home";
  });
}

export function getActiveWorkers(state, jobId) {
  return state.residents.filter((resident) => resident.job === jobId && resident.activity === "working" && resident.energy > 0);
}
