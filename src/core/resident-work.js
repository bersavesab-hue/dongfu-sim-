import { getBuildingDefinition } from "../building/building-definitions.js";
import { findRoadRoute, isRoadRouteValid } from "./road-pathfinding.js";
import { ECONOMY_RULES } from "./economy-rules.js";

export const ACTIVITY_LABELS = Object.freeze({
  idle: "空闲",
  waiting_home: "暂无居所",
  waiting_workplace: "等待分配工作地",
  waiting_route: "道路未连通",
  walking_to_work: "沿路前往工作",
  working: "工作中",
  walking_home: "沿路返回居所",
  resting: "休息中",
  exhausted: "精力不足",
});

function getBuildingCenter(building, residentIndex = 0) {
  const offset = (residentIndex % 3 - 1) * 0.14;
  return {
    x: building.x + building.width / 2 + offset,
    y: building.y + building.height / 2 + 0.28,
  };
}

function isCompatible(building, jobId) {
  const jobs = getBuildingDefinition(building?.typeId)?.workerJobs ?? [];
  return jobs.includes(jobId);
}

function clearRoute(resident) {
  resident.route = [];
  resident.routeIndex = 0;
  resident.routeTargetBuildingId = null;
}

export function ensureResidentWorkState(state) {
  state.residents.forEach((resident, index) => {
    resident.workplaceBuildingId ??= null;
    resident.activity ??= "idle";
    resident.position ??= { x: 63.5 + index * 0.65, y: 65.2 };
    resident.facing ??= "right";
    resident.route = Array.isArray(resident.route) ? resident.route : [];
    resident.routeIndex = Number.isInteger(resident.routeIndex) ? resident.routeIndex : 0;
    resident.routeTargetBuildingId ??= null;
    resident.routeVerifiedRevision ??= -1;
    const home = state.buildings.find((building) => building.id === resident.homeBuildingId && building.typeId === "residence");
    if (home && resident.activity === "idle") resident.position = getBuildingCenter(home, index);
    const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);
    if (resident.workplaceBuildingId && (!workplace || !isCompatible(workplace, resident.job))) {
      resident.workplaceBuildingId = null;
      resident.activity = "waiting_workplace";
      clearRoute(resident);
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
    clearRoute(resident);
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
  clearRoute(resident);
  return { ok: true, resident, building };
}

export function clearIncompatibleWorkplace(state, resident) {
  const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);
  if (!workplace || !isCompatible(workplace, resident.job)) {
    resident.workplaceBuildingId = null;
    resident.activity = "waiting_workplace";
    clearRoute(resident);
  }
}

function moveResidentToward(resident, target, distance) {
  const position = resident.position;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const length = Math.hypot(dx, dy);
  const arrived = length <= distance || length < 0.001;
  const nextPosition = arrived
    ? { x: target.x, y: target.y }
    : {
        x: position.x + dx / length * distance,
        y: position.y + dy / length * distance,
      };
  const screenDeltaX = (nextPosition.x - position.x) - (nextPosition.y - position.y);
  if (Math.abs(screenDeltaX) > 0.001) resident.facing = screenDeltaX < 0 ? "left" : "right";
  resident.position = nextPosition;
  return { arrived, distanceUsed: arrived ? length : distance };
}

function buildRoute(state, resident, fromBuilding, targetBuilding, residentIndex) {
  const roadRoute = findRoadRoute(state, fromBuilding, targetBuilding, resident.position);
  if (!roadRoute) {
    clearRoute(resident);
    resident.routeTargetBuildingId = targetBuilding.id;
    return false;
  }
  resident.route = [
    ...roadRoute,
    { ...getBuildingCenter(targetBuilding, residentIndex), road: false },
  ];
  resident.routeIndex = 0;
  resident.routeTargetBuildingId = targetBuilding.id;
  return true;
}

function travelToBuilding(state, resident, fromBuilding, targetBuilding, residentIndex, distance) {
  const destination = getBuildingCenter(targetBuilding, residentIndex);
  if (Math.hypot(resident.position.x - destination.x, resident.position.y - destination.y) < 0.04) {
    if (resident.routeVerifiedRevision !== state.mapRevision) {
      if (!findRoadRoute(state, fromBuilding, targetBuilding, null)) {
        clearRoute(resident);
        return "no_route";
      }
      resident.routeVerifiedRevision = state.mapRevision;
    }
    resident.position = destination;
    clearRoute(resident);
    return "arrived";
  }

  const routeNeedsRefresh = resident.routeTargetBuildingId !== targetBuilding.id
    || !isRoadRouteValid(state, resident.route, resident.routeIndex);
  if (routeNeedsRefresh && !buildRoute(state, resident, fromBuilding, targetBuilding, residentIndex)) {
    return "no_route";
  }

  let remaining = distance;
  while (remaining > 0 && resident.routeIndex < resident.route.length) {
    const movement = moveResidentToward(resident, resident.route[resident.routeIndex], remaining);
    remaining -= movement.distanceUsed;
    if (!movement.arrived) break;
    resident.routeIndex += 1;
  }
  if (resident.routeIndex >= resident.route.length) {
    resident.position = destination;
    resident.routeVerifiedRevision = state.mapRevision;
    clearRoute(resident);
    return "arrived";
  }
  return "walking";
}

export function updateResidentWork(state, minutes) {
  ensureResidentWorkState(state);
  const minuteOfDay = state.timeMinutes % (24 * 60);
  const onDuty = minuteOfDay >= ECONOMY_RULES.shiftStart && minuteOfDay < ECONOMY_RULES.shiftEnd;
  const stepDistance = Math.max(0, minutes) * 0.08;

  state.residents.forEach((resident, index) => {
    const home = state.buildings.find((building) => building.id === resident.homeBuildingId && building.typeId === "residence");
    const workplace = state.buildings.find((building) => building.id === resident.workplaceBuildingId);

    if (resident.energy <= 0) {
      if (!home) {
        resident.activity = "exhausted";
        return;
      }
      const result = travelToBuilding(state, resident, workplace, home, index, stepDistance);
      resident.activity = result === "arrived" ? "resting" : result === "no_route" ? "waiting_route" : "walking_home";
      return;
    }

    if (onDuty) {
      if (!workplace || !isCompatible(workplace, resident.job)) {
        resident.workplaceBuildingId = null;
        resident.activity = "waiting_workplace";
        clearRoute(resident);
        return;
      }
      if (!home) {
        resident.activity = "waiting_home";
        clearRoute(resident);
        return;
      }
      const result = travelToBuilding(state, resident, home, workplace, index, stepDistance);
      resident.activity = result === "arrived" ? "working" : result === "no_route" ? "waiting_route" : "walking_to_work";
      return;
    }

    if (!home) {
      resident.activity = "waiting_home";
      clearRoute(resident);
      return;
    }
    if (!workplace) {
      if (resident.activity !== "resting" || resident.route.length) {
        resident.position = getBuildingCenter(home, index);
      }
      resident.activity = "resting";
      clearRoute(resident);
      return;
    }
    const result = travelToBuilding(state, resident, workplace, home, index, stepDistance);
    resident.activity = result === "arrived" ? "resting" : result === "no_route" ? "waiting_route" : "walking_home";
  });
}

export function getActiveWorkers(state, jobId) {
  return state.residents.filter((resident) => resident.job === jobId && resident.activity === "working" && resident.energy > 0);
}
