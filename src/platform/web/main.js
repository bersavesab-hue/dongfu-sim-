import { getBuildingDefinition } from "../../building/building-definitions.js";
import { createBuildingState, canPlaceBuilding } from "../../core/building-state.js";
import { executeBuildingCommand } from "../../core/building-commands.js";
import { createMapGrid } from "../../core/map-grid.js";
import { clearGameSave, loadGameState, saveGameState } from "../../core/save-manager.js";
import { ACTIVITY_LABELS, assignResidentWorkplace, getCompatibleWorkplaces } from "../../core/resident-work.js";
import { advanceSimulation, assignResidentHome, enforceResourceLimits, formatGameTime, getHousingSummary, getResourceLimits, getSettlementEffects, setResidentJob } from "../../core/simulation.js";
import { JOB_DEFINITIONS } from "../../residents/resident-definitions.js";
import { IsoCamera } from "../../render/iso-camera.js";
import { MapRenderer } from "../../render/map-renderer.js";

const canvas = document.querySelector("#game-canvas");
const status = document.querySelector("#status");
const resources = document.querySelector("#resources");
const timeDisplay = document.querySelector("#time-display");
const residentPanel = document.querySelector("#resident-panel");
const pauseButton = document.querySelector("#pause-button");
const camera = new IsoCamera();
const renderer = new MapRenderer(canvas, camera);
const map = createMapGrid();
const gameState = loadGameState(map, window.localStorage);

let viewport = { width: window.innerWidth, height: window.innerHeight };
let pointer = { active: false, moved: false, x: 0, y: 0 };
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
  saveGameState(gameState, window.localStorage);
  status.textContent = message;
}

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
  const housing = getHousingSummary(gameState);
  const effects = getSettlementEffects(gameState);
  const saving = Math.round(effects.foodConsumptionReduction * 100);
  residentPanel.innerHTML = `<div class="resident-summary">居所 ${housing.occupied}/${housing.capacity} · 膳堂 ${effects.canteens} · 节粮 ${saving}%</div>` + gameState.residents.map((resident) => {
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
  renderer.setBuildPreview(mode === "build" ? tile : null, definition, rotation);
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
  status.textContent = nextMode === "build"
    ? `选择地图位置放置 ${getBuildingDefinition(typeId).name}`
    : nextMode === "demolish"
      ? "选择要拆除的建筑"
      : "点击地图查看格子";
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
  pointer = { active: true, moved: false, x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.active) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) pointer.moved = true;
  camera.panBy(dx, dy);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  refreshPreview(event.clientX, event.clientY);
});

canvas.addEventListener("pointerup", (event) => {
  if (!pointer.moved) handleMapClick(pickTile(event.clientX, event.clientY));
  pointer.active = false;
});

canvas.addEventListener("pointercancel", () => {
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
