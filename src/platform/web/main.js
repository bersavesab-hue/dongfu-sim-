import { getBuildingDefinition } from "../../building/building-definitions.js";
import { createBuildingState, canPlaceBuilding, canPlaceRoadBatch } from "../../core/building-state.js";
import { executeBuildingCommand } from "../../core/building-commands.js";
import { createMapGrid } from "../../core/map-grid.js";
import { clearGameSave, loadGameState, saveGameState } from "../../core/save-manager.js";
import { ACTIVITY_LABELS, assignResidentWorkplace, getCompatibleWorkplaces } from "../../core/resident-work.js";
import { advanceSimulation, assignResidentHome, collectSupplies, enforceResourceLimits, formatGameTime, getHousingSummary, getRescueStatus, getResourceLimits, getSettlementEffects, setResidentJob } from "../../core/simulation.js";
import { JOB_DEFINITIONS } from "../../residents/resident-definitions.js";
import { IsoCamera } from "../../render/iso-camera.js";
import { MapRenderer } from "../../render/map-renderer.js";

const canvas = document.querySelector("#game-canvas");
const status = document.querySelector("#status");
const resources = document.querySelector("#resources");
const timeDisplay = document.querySelector("#time-display");
const residentPanel = document.querySelector("#resident-panel");
const residentToggle = document.querySelector("#resident-toggle");
const pauseButton = document.querySelector("#pause-button");
const rescueButton = document.querySelector("#rescue-button");
const camera = new IsoCamera();
const renderer = new MapRenderer(canvas, camera);
const map = createMapGrid();
const gameState = loadGameState(map, window.localStorage);

let viewport = { width: window.innerWidth, height: window.innerHeight };
let pointer = { active: false, moved: false, id: null, x: 0, y: 0, startX: 0, startY: 0 };
const activePointers = new Map();
let pinchDistance = null;
let roadGesture = { active: false, cells: [] };
let demolishGesture = { active: false, cells: [], buildingIds: [] };
let mode = "inspect";
let selectedBuildingType = null;
let rotation = 0;

const REASONS = Object.freeze({
  building_not_found: "建筑不存在",
  outside_map: "超出地图",
  not_buildable: "该区域尚未开放",
  occupied: "这里已有建筑",
  insufficient_resources: "材料不足",
  unknown_command: "未知指令",
  resident_not_found: "仙人不存在",
  home_not_found: "居所不存在",
  home_not_residence: "该建筑不是居所",
  home_full: "该居所已满",
  workplace_not_found: "工作建筑不存在",
  workplace_incompatible: "该建筑不适合当前职业",
  workplace_full: "该工作建筑已满员",
  no_new_road: "拖动范围内没有新道路",
  road_not_found: "拖动范围内没有道路",
  rescue_cooldown: "需要等采集地点恢复",
  rescue_exhausted: "仙人精力不足，先让他们休息",
  rescue_full: "粮食和材料仓储已满",
});

function resize() {
  viewport = { width: window.innerWidth, height: window.innerHeight };
  renderer.resize(viewport.width, viewport.height, window.devicePixelRatio || 1);
  if (!resize.didCenter) {
    camera.setViewport(viewport.width, viewport.height);
    resize.didCenter = true;
  }
  renderer.render(viewport.width, viewport.height);
}

function persistGame(message = "已保存") {
  try {
    status.textContent = saveGameState(gameState, window.localStorage) ? message : "存档不可用";
  } catch {
    status.textContent = "保存失败，请检查设备存储空间";
  }
}

residentToggle.addEventListener("click", () => {
  residentPanel.hidden = !residentPanel.hidden;
  residentToggle.setAttribute("aria-expanded", String(!residentPanel.hidden));
  residentToggle.textContent = residentPanel.hidden ? "仙人 ▾" : "收起仙人 ▴";
});

function updateResources() {
  const limits = getResourceLimits(gameState);
  resources.textContent = `粮食 ${Math.floor(gameState.resources.food)}/${limits.food} · 材料 ${Math.floor(gameState.resources.materials)}/${limits.materials} · 香火 ${Math.floor(gameState.resources.incense)}/${limits.incense}`;
}

function homeOptions(resident) {
  const housing = getHousingSummary(gameState);
  return [`<option value="">未安排居所</option>`, ...housing.residences.map((building) => {
    const occupied = gameState.residents.filter((item) => item.homeBuildingId === building.id).length;
    const otherOccupants = gameState.residents.filter((item) => item.homeBuildingId === building.id && item.id !== resident.id).length;
    const capacity = getBuildingDefinition(building.typeId)?.capacity ?? 0;
    const disabled = otherOccupants >= capacity && resident.homeBuildingId !== building.id ? " disabled" : "";
    return `<option value="${building.id}"${resident.homeBuildingId === building.id ? " selected" : ""}${disabled}>${building.name} · ${occupied}/${capacity}</option>`;
  })].join("");
}

function workplaceOptions(resident) {
  const workplaces = getCompatibleWorkplaces(gameState, resident);
  return [`<option value="">未安排工作地</option>`, ...workplaces.map((building) => {
    const definition = getBuildingDefinition(building.typeId);
    const occupied = gameState.residents.filter((item) => item.workplaceBuildingId === building.id).length;
    const otherWorkers = gameState.residents.filter((item) => item.id !== resident.id && item.workplaceBuildingId === building.id).length;
    const capacity = definition?.workerCapacity ?? 0;
    const disabled = otherWorkers >= capacity && resident.workplaceBuildingId !== building.id ? " disabled" : "";
    return `<option value="${building.id}"${resident.workplaceBuildingId === building.id ? " selected" : ""}${disabled}>${building.name} · ${occupied}/${capacity}</option>`;
  })].join("");
}

function updateSimulationUI() {
  timeDisplay.textContent = formatGameTime(gameState);
  pauseButton.textContent = gameState.paused ? "继续时间" : "暂停时间";
  const rescue = getRescueStatus(gameState);
  rescueButton.textContent = rescue.available
    ? "野外采集 · 粮12 材6"
    : `采集恢复中 · ${Math.ceil(rescue.remainingMinutes / 60)}时`;
  rescueButton.disabled = !rescue.available;
  const housing = getHousingSummary(gameState);
  const effects = getSettlementEffects(gameState);
  const saving = Math.round(effects.foodConsumptionReduction * 100);
  residentPanel.innerHTML = `<div class="resident-summary">居所 ${housing.occupied}/${housing.capacity} · 膳堂 ${effects.staffedCanteens}/${effects.canteens} 在岗 · 节粮 ${saving}%</div>` + gameState.residents.map((resident) => {
    const job = JOB_DEFINITIONS[resident.job];
    const housed = housing.residences.some((building) => building.id === resident.homeBuildingId);
    return `<div class="resident-card">
      <div class="resident-name"><i style="background:${resident.color}"></i>${resident.name} · ${resident.title}</div>
      <div class="resident-meta">精力 ${Math.round(resident.energy)} · 心情 ${Math.round(resident.mood)} · ${housed ? "已有居所" : "暂无居所"}</div>
      <div class="resident-jobs">
        ${Object.values(JOB_DEFINITIONS).map((item) => `<button data-resident="${resident.id}" data-job="${item.id}" class="${item.id === resident.job ? "selected" : ""}">${item.name}</button>`).join("")}
      </div>
      <select class="resident-home" data-home-resident="${resident.id}" aria-label="${resident.name}的居所">
        ${homeOptions(resident)}
      </select>
      <select class="resident-home" data-work-resident="${resident.id}" aria-label="${resident.name}的工作地">
        ${workplaceOptions(resident)}
      </select>
      <div class="resident-output">职业：${job.name} · 状态：${ACTIVITY_LABELS[resident.activity] ?? resident.activity}</div>
    </div>`;
  }).join("");
}

function updateStatus(tile, message = "") {
  if (message) {
    status.textContent = message;
    return;
  }
  if (!tile) {
    status.textContent = "点击地图查看格子";
    return;
  }
  if (mode === "build" && selectedBuildingType) {
    const check = canPlaceBuilding(gameState, selectedBuildingType, tile.x, tile.y, rotation);
    status.textContent = check.ok
      ? `放置 ${getBuildingDefinition(selectedBuildingType).name} · 点击确认`
      : REASONS[check.reason] ?? "无法建造";
    return;
  }
  if (mode === "demolish") {
    status.textContent = tile.buildingId ? "点击拆除该建筑（返还 50% 材料）" : "这里没有建筑";
    return;
  }
  status.textContent = tile.buildingId
    ? `格子 ${tile.x},${tile.y} · 已有建筑`
    : tile.buildable
      ? `格子 ${tile.x},${tile.y} · 可建造`
      : `格子 ${tile.x},${tile.y} · 未开放`;
}

function pickTile(clientX, clientY) {
  const point = camera.screenToWorld(clientX, clientY);
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
  return map.tiles[y * map.width + x];
}

function refreshPreview(clientX, clientY) {
  const tile = pickTile(clientX, clientY);
  const definition = selectedBuildingType ? getBuildingDefinition(selectedBuildingType) : null;
  renderer.setBuildPreview(mode === "build" && selectedBuildingType !== "road" ? tile : null, definition, rotation);
  updateStatus(tile);
  renderer.render(viewport.width, viewport.height);
}

function setMode(nextMode, typeId = null) {
  mode = nextMode;
  selectedBuildingType = typeId;
  document.querySelectorAll(".build-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.building === typeId && nextMode === "build");
  });
  document.querySelector("#demolish-button").classList.toggle("active", nextMode === "demolish");
  renderer.setBuildPreview(null, null);
  renderer.setRoadPreview([]);
  renderer.setDemolishPreview([]);
  roadGesture = { active: false, cells: [] };
  demolishGesture = { active: false, cells: [], buildingIds: [] };
  status.textContent = nextMode === "build"
    ? `选择地图位置放置 ${getBuildingDefinition(typeId).name}`
    : nextMode === "demolish"
      ? "选择要拆除的建筑"
      : "点击地图查看格子";
  renderer.render(viewport.width, viewport.height);
}

function appendGridSegment(cells, tile) {
  if (!tile) return;
  const last = cells[cells.length - 1];
  if (!last) {
    cells.push({ x: tile.x, y: tile.y });
    return;
  }
  let x = last.x;
  let y = last.y;
  while (x !== tile.x) {
    x += Math.sign(tile.x - x);
    if (!cells.some((cell) => cell.x === x && cell.y === y)) cells.push({ x, y });
  }
  while (y !== tile.y) {
    y += Math.sign(tile.y - y);
    if (!cells.some((cell) => cell.x === x && cell.y === y)) cells.push({ x, y });
  }
}

function appendRoadSegment(tile) {
  if (!tile) return;
  const cells = roadGesture.cells;
  appendGridSegment(cells, tile);
  const check = canPlaceRoadBatch(gameState, cells);
  renderer.setRoadPreview(cells, check.ok);
  status.textContent = check.ok
    ? `青石路 ${check.cells.length} 格 · 消耗 ${check.cost} 材料 · 松手铺设`
    : REASONS[check.reason] ?? "该路线无法铺设";
  renderer.render(viewport.width, viewport.height);
}

function appendDemolishSegment(tile) {
  if (!tile) return;
  appendGridSegment(demolishGesture.cells, tile);
  const roads = demolishGesture.cells
    .map((cell) => gameState.buildings.find((building) => (
      building.id === map.tiles[cell.y * map.width + cell.x]?.buildingId
    )))
    .filter((building) => building?.typeId === "road");
  demolishGesture.buildingIds = [...new Set(roads.map((road) => road.id))];
  const previewCells = demolishGesture.buildingIds.map((id) => {
    const road = gameState.buildings.find((building) => building.id === id);
    return { x: road.x, y: road.y };
  });
  renderer.setDemolishPreview(previewCells);
  status.textContent = previewCells.length
    ? `已选择 ${previewCells.length} 格道路 · 松手拆除`
    : "拖动经过需要拆除的道路";
  renderer.render(viewport.width, viewport.height);
}

function commitDemolishGesture() {
  const result = executeBuildingCommand(gameState, {
    type: "DemolishRoadBatch",
    buildingIds: demolishGesture.buildingIds,
  });
  renderer.setDemolishPreview([]);
  demolishGesture = { active: false, cells: [], buildingIds: [] };
  if (!result.ok) {
    status.textContent = REASONS[result.reason] ?? "道路拆除失败";
    renderer.render(viewport.width, viewport.height);
    return;
  }
  enforceResourceLimits(gameState);
  updateResources();
  persistGame(`已拆除 ${result.roads.length} 格青石路，返还 ${result.refunded} 材料 · 已自动保存`);
  renderer.render(viewport.width, viewport.height);
}

function commitRoadGesture() {
  const result = executeBuildingCommand(gameState, {
    type: "PlaceRoadBatch",
    cells: roadGesture.cells,
  });
  renderer.setRoadPreview([]);
  roadGesture = { active: false, cells: [] };
  if (!result.ok) {
    status.textContent = REASONS[result.reason] ?? "道路铺设失败";
    renderer.render(viewport.width, viewport.height);
    return;
  }
  updateResources();
  persistGame(`已铺设 ${result.roads.length} 格青石路，消耗 ${result.cost} 材料 · 已自动保存`);
  renderer.render(viewport.width, viewport.height);
}

function handleMapClick(tile) {
  if (!tile) return;
  if (mode === "build" && selectedBuildingType) {
    const result = executeBuildingCommand(gameState, {
      type: "PlaceBuilding",
      buildingType: selectedBuildingType,
      x: tile.x,
      y: tile.y,
      rotation,
    });
    if (!result.ok) {
      updateStatus(tile, REASONS[result.reason] ?? "无法建造");
      return;
    }
    renderer.setSelectedTile(tile);
    enforceResourceLimits(gameState);
    updateResources();
    updateSimulationUI();
    persistGame(`已建造 ${result.building.name} · 已自动保存`);
    renderer.render(viewport.width, viewport.height);
    return;
  }

  if (mode === "demolish") {
    if (!tile.buildingId) {
      updateStatus(tile, "这里没有建筑");
      return;
    }
    const result = executeBuildingCommand(gameState, {
      type: "DemolishBuilding",
      buildingId: tile.buildingId,
    });
    if (result.ok) {
      enforceResourceLimits(gameState);
      updateResources();
      updateSimulationUI();
      persistGame(`已拆除 ${result.building.name}，返还 50% 材料 · 已自动保存`);
      renderer.render(viewport.width, viewport.height);
    }
    return;
  }

  renderer.setSelectedTile(tile);
  updateStatus(tile);
  renderer.render(viewport.width, viewport.height);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size > 1) {
    const [a, b] = [...activePointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    pointer.moved = true;
    roadGesture = { active: false, cells: [] };
    demolishGesture = { active: false, cells: [], buildingIds: [] };
    renderer.setRoadPreview([]);
    renderer.setDemolishPreview([]);
    renderer.render(viewport.width, viewport.height);
    return;
  }
  pointer = { active: true, moved: false, id: event.pointerId,
    x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
  if (mode === "build" && selectedBuildingType === "road") {
    roadGesture = { active: true, cells: [] };
    appendRoadSegment(pickTile(event.clientX, event.clientY));
    return;
  }
  const tile = pickTile(event.clientX, event.clientY);
  const building = tile?.buildingId
    ? gameState.buildings.find((item) => item.id === tile.buildingId)
    : null;
  if (mode === "demolish" && building?.typeId === "road") {
    demolishGesture = { active: true, cells: [], buildingIds: [] };
    appendDemolishSegment(tile);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size > 1) {
    const [a, b] = [...activePointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    if (pinchDistance && distance > 0) camera.zoomAt(distance / pinchDistance, centerX, centerY);
    pinchDistance = distance;
    pointer.moved = true;
    renderer.render(viewport.width, viewport.height);
    return;
  }
  if (!pointer.active || pointer.id !== event.pointerId) return;
  if (roadGesture.active) {
    pointer.moved = true;
    appendRoadSegment(pickTile(event.clientX, event.clientY));
    return;
  }
  if (demolishGesture.active) {
    pointer.moved = true;
    appendDemolishSegment(pickTile(event.clientX, event.clientY));
    return;
  }
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 7) pointer.moved = true;
  if (pointer.moved) camera.panBy(dx, dy);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  refreshPreview(event.clientX, event.clientY);
});

canvas.addEventListener("pointerup", (event) => {
  const wasPinching = activePointers.size > 1;
  activePointers.delete(event.pointerId);
  if (wasPinching) {
    pinchDistance = null;
    pointer.active = false;
    return;
  }
  if (!pointer.active || pointer.id !== event.pointerId) return;
  if (roadGesture.active) {
    commitRoadGesture();
    pointer.active = false;
    return;
  }
  if (demolishGesture.active) {
    commitDemolishGesture();
    pointer.active = false;
    return;
  }
  if (!pointer.moved) handleMapClick(pickTile(event.clientX, event.clientY));
  pointer.active = false;
});

canvas.addEventListener("pointercancel", () => {
  activePointers.clear();
  pinchDistance = null;
  renderer.setRoadPreview([]);
  renderer.setDemolishPreview([]);
  roadGesture = { active: false, cells: [] };
  demolishGesture = { active: false, cells: [], buildingIds: [] };
  pointer.active = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  refreshPreview(event.clientX, event.clientY);
}, { passive: false });

residentPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-job]");
  if (!button) return;
  const result = setResidentJob(gameState, button.dataset.resident, button.dataset.job);
  if (result.ok) {
    updateSimulationUI();
    persistGame(`${result.resident.name} 已转为${JOB_DEFINITIONS[result.resident.job].name}`);
  }
});

residentPanel.addEventListener("change", (event) => {
  const homeSelect = event.target.closest("[data-home-resident]");
  if (homeSelect) {
    const result = assignResidentHome(gameState, homeSelect.dataset.homeResident, homeSelect.value || null);
    if (!result.ok) {
      updateSimulationUI();
      status.textContent = REASONS[result.reason] ?? "无法安排居所";
      return;
    }
    updateSimulationUI();
    persistGame(result.building ? `${result.resident.name} 已入住 ${result.building.name}` : `${result.resident.name} 暂无居所`);
    return;
  }

  const workSelect = event.target.closest("[data-work-resident]");
  if (!workSelect) return;
  const result = assignResidentWorkplace(gameState, workSelect.dataset.workResident, workSelect.value || null);
  if (!result.ok) {
    updateSimulationUI();
    status.textContent = REASONS[result.reason] ?? "无法安排工作地";
    return;
  }
  updateSimulationUI();
  persistGame(result.building ? `${result.resident.name} 已前往 ${result.building.name} 工作` : `${result.resident.name} 暂无工作地`);
});

document.querySelectorAll(".build-button").forEach((button) => {
  button.addEventListener("click", () => setMode("build", button.dataset.building));
});
document.querySelector("#demolish-button").addEventListener("click", () => setMode("demolish"));
document.querySelector("#cancel-button").addEventListener("click", () => setMode("inspect"));
document.querySelector("#save-button").addEventListener("click", () => persistGame());
document.querySelector("#reset-button").addEventListener("click", () => {
  clearGameSave(window.localStorage);
  window.location.reload();
});
document.querySelector("#pause-button").addEventListener("click", () => {
  gameState.paused = !gameState.paused;
  updateSimulationUI();
  persistGame(gameState.paused ? "时间已暂停" : "时间继续推进");
});
rescueButton.addEventListener("click", () => {
  const result = collectSupplies(gameState);
  if (!result.ok) {
    status.textContent = REASONS[result.reason] ?? "暂时无法采集";
    return;
  }
  updateResources();
  updateSimulationUI();
  persistGame(`${result.resident.name}采集完成：粮食 +${result.food}，材料 +${result.materials} · 已保存`);
  renderer.render(viewport.width, viewport.height);
});
document.querySelector("#rotate-button").addEventListener("click", () => {
  rotation = (rotation + 1) % 4;
  status.textContent = `建筑方向：${rotation % 2 === 0 ? "默认" : "旋转 90°"}`;
  renderer.render(viewport.width, viewport.height);
});

window.setInterval(() => {
  const before = gameState.timeMinutes;
  advanceSimulation(gameState, 10);
  updateResources();
  updateSimulationUI();
  if (!gameState.paused && before !== gameState.timeMinutes && gameState.timeMinutes % 60 === 0) {
    saveGameState(gameState, window.localStorage);
  }
  renderer.render(viewport.width, viewport.height);
}, 1000);

window.addEventListener("beforeunload", () => saveGameState(gameState, window.localStorage));
window.addEventListener("resize", resize);
renderer.setMap(map);
renderer.setGameState(gameState);
updateResources();
updateSimulationUI();
resize();
