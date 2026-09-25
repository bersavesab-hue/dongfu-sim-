import assert from "node:assert/strict";
import { createMapGrid } from "../src/core/map-grid.js";
import { createBuildingState, placeBuilding, placeRoadBatch, demolishBuilding } from "../src/core/building-state.js";
import { ensureSimulationState, assignResidentHome, advanceSimulation, collectSupplies, getRescueStatus, getSettlementEffects } from "../src/core/simulation.js";
import { assignResidentWorkplace } from "../src/core/resident-work.js";
import { autoAssignResidents } from "../src/core/auto-assignment.js";
import { findTravelRoute } from "../src/core/travel-pathfinding.js";
import { loadGameState, serializeGameState } from "../src/core/save-manager.js";

function fresh() { return ensureSimulationState(createBuildingState(createMapGrid())); }
function build(state, type, x, y) {
  const result = placeBuilding(state, type, x, y);
  assert.equal(result.ok, true, `${type} at ${x},${y}: ${result.reason}`);
  return result.building;
}

const opening = fresh();
const homeA = build(opening, "residence", 58, 60);
const homeB = build(opening, "residence", 58, 64);
const farm = build(opening, "farm", 64, 60);
const workshop = build(opening, "workshop", 64, 65);
const roads = [
  ...Array.from({ length: 7 }, (_, x) => ({ x: x + 58, y: 62 })),
  { x: 58, y: 63 }, { x: 64, y: 63 }, { x: 64, y: 64 },
];
assert.equal(placeRoadBatch(opening, roads).ok, true);
assert.equal(opening.resources.materials, 10);
for (const [index, home, jobSite] of [[0, homeA, farm], [1, homeB, workshop], [2, homeB, null]]) {
  const resident = opening.residents[index];
  assert.equal(assignResidentHome(opening, resident.id, home.id).ok, true);
  if (jobSite) assert.equal(assignResidentWorkplace(opening, resident.id, jobSite.id).ok, true);
}
const initialFood = opening.resources.food;
for (let step = 0; step < 3 * 144; step += 1) advanceSimulation(opening, 10);
assert.ok(opening.resources.food > initialFood, "opening farm should sustain residents");
assert.ok(opening.resources.materials > 10, "opening workshop should replenish materials");
assert.equal(opening.day, 4);

const warehouse = build(opening, "warehouse", 69, 64);
const canteen = build(opening, "canteen", 69, 60);
assert.equal(placeRoadBatch(opening, [
  { x: 65, y: 62 }, { x: 66, y: 62 }, { x: 67, y: 62 }, { x: 68, y: 62 }, { x: 69, y: 62 },
  { x: 68, y: 63 }, { x: 68, y: 64 },
]).ok, true);
const steward = opening.residents[2];
assert.equal(assignResidentWorkplace(opening, steward.id, warehouse.id).ok, true);
const beforeIncense = opening.resources.incense;
for (let step = 0; step < 144; step += 1) advanceSimulation(opening, 10);
assert.ok(opening.resources.incense > beforeIncense, "warehouse steward should create incense");
assert.equal(assignResidentWorkplace(opening, steward.id, canteen.id).ok, true);
for (let step = 0; step < 36; step += 1) advanceSimulation(opening, 10);
assert.equal(opening.residents[2].activity, "working");
assert.equal(getSettlementEffects(opening).staffedCanteens, 1);
const farmWorker = opening.residents[0];
assert.equal(farmWorker.activity, "working");
const brokenRoad = opening.buildings.find((building) => building.typeId === "road" && building.x === 60 && building.y === 62);
assert.equal(demolishBuilding(opening, brokenRoad.id).ok, true);
advanceSimulation(opening, 10);
assert.equal(farmWorker.activity, "working", "grass remains walkable after a road is removed");
assert.equal(placeRoadBatch(opening, [{ x: 60, y: 62 }]).ok, true);
advanceSimulation(opening, 10);
assert.equal(farmWorker.activity, "working", "replacing the road keeps work active");

const walkable = fresh();
const walkHome = build(walkable, "residence", 58, 60);
const walkFarm = build(walkable, "farm", 64, 60);
const automatic = autoAssignResidents(walkable);
assert.equal(automatic.housed, 2, "new homes fill available beds");
assert.equal(automatic.staffed, 1, "compatible worker fills a new workplace");
const grassRoute = findTravelRoute(walkable, walkHome, walkFarm);
assert.ok(grassRoute?.length > 0, "walking works without roads");
const obstacle = build(walkable, "residence", 61, 60);
const detour = findTravelRoute(walkable, walkHome, walkFarm);
assert.ok(detour?.length > grassRoute.length, "route detours around a building");
assert.ok(detour.every((point) => !(point.x >= obstacle.x && point.x < obstacle.x + obstacle.width && point.y >= obstacle.y && point.y < obstacle.y + obstacle.height)));
assert.equal(loadGameState(createMapGrid(), { getItem: () => serializeGameState(walkable) }).residents.filter((person) => person.homeBuildingId).length, 2, "automatic housing survives reload");

const shortage = fresh();
shortage.resources.food = 0;
shortage.resources.materials = 0;
const rescue = collectSupplies(shortage);
assert.equal(rescue.ok, true);
assert.equal(shortage.resources.materials, 6);
assert.ok(shortage.resources.food > 0);
assert.equal(getRescueStatus(shortage).available, false);
assert.equal(collectSupplies(shortage).reason, "rescue_cooldown");
const saved = serializeGameState(shortage);
const restored = loadGameState(createMapGrid(), { getItem: () => saved });
assert.equal(getRescueStatus(restored).available, false, "cooldown must survive reload");
for (let step = 0; step < 36; step += 1) advanceSimulation(restored, 10);
assert.equal(getRescueStatus(restored).available, true);
assert.equal(collectSupplies(restored).ok, true);
console.log("opening, midgame, shortage recovery and save scenarios passed");
