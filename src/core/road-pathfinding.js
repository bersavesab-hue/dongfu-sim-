const DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 0, y: -1 }),
]);

function tileKey(x, y) {
  return `${x},${y}`;
}

function parseKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function getRoadMap(state) {
  return new Map(
    state.buildings
      .filter((building) => building.typeId === "road")
      .map((road) => [tileKey(road.x, road.y), road]),
  );
}

export function getBuildingRoadEntries(state, building) {
  if (!building || building.typeId === "road") return [];
  const roads = getRoadMap(state);
  const entries = new Map();

  for (let x = building.x; x < building.x + building.width; x += 1) {
    for (const y of [building.y - 1, building.y + building.height]) {
      const key = tileKey(x, y);
      if (roads.has(key)) entries.set(key, { x, y });
    }
  }
  for (let y = building.y; y < building.y + building.height; y += 1) {
    for (const x of [building.x - 1, building.x + building.width]) {
      const key = tileKey(x, y);
      if (roads.has(key)) entries.set(key, { x, y });
    }
  }
  return [...entries.values()];
}

function heuristic(point, goals) {
  let best = Number.POSITIVE_INFINITY;
  for (const goal of goals) {
    best = Math.min(best, Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y));
  }
  return best;
}

function reconstructPath(cameFrom, endKey) {
  const path = [parseKey(endKey)];
  let cursor = endKey;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor);
    path.push(parseKey(cursor));
  }
  path.reverse();
  return path;
}

function findNearestRoadStart(roads, position) {
  if (!position) return null;
  let nearest = null;
  let nearestDistance = 1.6;
  for (const key of roads.keys()) {
    const point = parseKey(key);
    const distance = Math.hypot(point.x + 0.5 - position.x, point.y + 0.5 - position.y);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function findRoadRoute(state, fromBuilding, toBuilding, currentPosition = null) {
  const roads = getRoadMap(state);
  const goals = getBuildingRoadEntries(state, toBuilding);
  if (roads.size === 0 || goals.length === 0) return null;

  const buildingStarts = getBuildingRoadEntries(state, fromBuilding);
  const nearbyStart = findNearestRoadStart(roads, currentPosition);
  // A resident already walking can resume on a road. At a building, only its
  // actual entrances are valid starts; a nearby unrelated road cannot connect it.
  const nearRoad = nearbyStart && Math.hypot(
    nearbyStart.x + 0.5 - currentPosition.x,
    nearbyStart.y + 0.5 - currentPosition.y,
  ) < 0.35;
  const starts = nearRoad ? [nearbyStart] : buildingStarts;
  if (starts.length === 0) return null;

  const goalKeys = new Set(goals.map((point) => tileKey(point.x, point.y)));
  const open = [];
  const cameFrom = new Map();
  const gScore = new Map();

  for (const start of starts) {
    const key = tileKey(start.x, start.y);
    gScore.set(key, 0);
    open.push({ key, point: start, score: heuristic(start, goals) });
  }

  while (open.length > 0) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift();
    if (goalKeys.has(current.key)) {
      return reconstructPath(cameFrom, current.key).map((point) => ({
        x: point.x + 0.5,
        y: point.y + 0.5,
        road: true,
      }));
    }

    const currentCost = gScore.get(current.key) ?? Number.POSITIVE_INFINITY;
    for (const direction of DIRECTIONS) {
      const next = { x: current.point.x + direction.x, y: current.point.y + direction.y };
      const nextKey = tileKey(next.x, next.y);
      if (!roads.has(nextKey)) continue;
      const tentative = currentCost + 1;
      if (tentative >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(nextKey, current.key);
      gScore.set(nextKey, tentative);
      open.push({ key: nextKey, point: next, score: tentative + heuristic(next, goals) });
    }
  }
  return null;
}

export function isRoadRouteValid(state, route, routeIndex = 0) {
  if (!Array.isArray(route) || route.length === 0) return false;
  const roads = getRoadMap(state);
  for (let index = routeIndex; index < route.length; index += 1) {
    const point = route[index];
    if (!point.road) continue;
    const key = tileKey(Math.floor(point.x), Math.floor(point.y));
    if (!roads.has(key)) return false;
  }
  return true;
}
