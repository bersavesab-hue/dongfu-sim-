import {
  MAP_WIDTH,
  MAP_HEIGHT,
  BUILDABLE_MIN_X,
  BUILDABLE_MAX_X,
  BUILDABLE_MIN_Y,
  BUILDABLE_MAX_Y,
} from "./constants.js";

export function createMapGrid() {
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tiles: Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => ({
      index,
      x: index % MAP_WIDTH,
      y: Math.floor(index / MAP_WIDTH),
      terrain: "grass",
      buildingId: null,
      resourceNodeId: null,
      buildable: false,
    })),
  };
}

export function isInsideMap(x, y) {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

export function isInitialBuildable(x, y) {
  return x >= BUILDABLE_MIN_X && x <= BUILDABLE_MAX_X
    && y >= BUILDABLE_MIN_Y && y <= BUILDABLE_MAX_Y;
}

export function getTile(grid, x, y) {
  if (!isInsideMap(x, y)) return null;
  return grid.tiles[y * grid.width + x];
}
