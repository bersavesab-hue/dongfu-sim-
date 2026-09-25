const DIRECTIONS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const key = (x, y) => `${x},${y}`;

function passable(state, x, y) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return false;
  const tile = state.map.tiles[y * state.map.width + x];
  if (!tile?.buildable) return false;
  const building = state.buildings.find((item) => item.id === tile.buildingId);
  return !building || building.typeId === "road";
}

function roadAt(state, x, y) {
  const tile = state.map.tiles[y * state.map.width + x];
  return state.buildings.some((item) => item.id === tile?.buildingId && item.typeId === "road");
}

export function getBuildingEntrances(state, building) {
  if (!building || building.typeId === "road") return [];
  const entries = new Map();
  for (let x = building.x; x < building.x + building.width; x += 1) {
    for (const y of [building.y - 1, building.y + building.height]) {
      if (passable(state, x, y)) entries.set(key(x, y), { x, y });
    }
  }
  for (let y = building.y; y < building.y + building.height; y += 1) {
    for (const x of [building.x - 1, building.x + building.width]) {
      if (passable(state, x, y)) entries.set(key(x, y), { x, y });
    }
  }
  return [...entries.values()];
}

const heuristic = (point, goals) => Math.min(...goals.map((goal) => Math.abs(goal.x - point.x) + Math.abs(goal.y - point.y)));

export function findTravelRoute(state, fromBuilding, toBuilding, currentPosition = null) {
  const goals = getBuildingEntrances(state, toBuilding);
  if (!goals.length) return null;
  const currentTile = currentPosition && { x: Math.floor(currentPosition.x), y: Math.floor(currentPosition.y) };
  const onGround = currentTile && passable(state, currentTile.x, currentTile.y)
    && Math.hypot(currentTile.x + 0.5 - currentPosition.x, currentTile.y + 0.5 - currentPosition.y) < 0.5;
  const starts = onGround ? [currentTile] : getBuildingEntrances(state, fromBuilding);
  if (!starts.length) return null;
  const goalKeys = new Set(goals.map((point) => key(point.x, point.y)));
  const open = starts.map((point) => ({ point, score: heuristic(point, goals) }));
  const costs = new Map(starts.map((point) => [key(point.x, point.y), 0]));
  const previous = new Map();
  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const { point } = open.shift();
    const here = key(point.x, point.y);
    if (goalKeys.has(here)) {
      const path = [point];
      let cursor = here;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor);
        const [x, y] = cursor.split(",").map(Number);
        path.push({ x, y });
      }
      return path.reverse().map(({ x, y }) => ({ x: x + 0.5, y: y + 0.5, road: roadAt(state, x, y), ground: true }));
    }
    for (const direction of DIRECTIONS) {
      const next = { x: point.x + direction.x, y: point.y + direction.y };
      if (!passable(state, next.x, next.y)) continue;
      const nextKey = key(next.x, next.y);
      const cost = costs.get(here) + (roadAt(state, next.x, next.y) ? 1 : 1.6);
      if (cost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, cost);
      previous.set(nextKey, here);
      open.push({ point: next, score: cost + heuristic(next, goals) });
    }
  }
  return null;
}

export function isTravelRouteValid(state, route, routeIndex = 0) {
  if (!Array.isArray(route) || !route.length) return false;
  return route.slice(routeIndex).every((point, offset) =>
    routeIndex + offset === route.length - 1 || passable(state, Math.floor(point.x), Math.floor(point.y)));
}
