import { getBuildingDefinition } from "../../building/building-definitions.js";
import { createBuildingState, canPlaceBuilding } from "../../core/building-state.js";
import { executeBuildingCommand } from "../../core/building-commands.js";
import { createMapGrid } from "../../core/map-grid.js";
import { clearGameSave, loadGameState, saveGameState } from "../../core/save-manager.js";
import { advanceSimulation, formatGameTime, setResidentJob } from "../../core/simulation.js";
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
  resources.textContent = `粮食 ${gameState.resources.food} · 材料 ${gameState.resources.materials} · 香火 ${gameState.resources.incense}`;
}

function updateSimulationUI() {
  timeDisplay.textContent = formatGameTime(gameState);
  pauseButton.textContent = gameState.paused ? "继续时间" : "暂停时间";
  residentPanel.innerHTML = gameState.residents.map((resident) => {
    const job = JOB_DEFINITIONS[resident.job];
    return `<div class="resident-card">
      <div class="resident-name"><i style="background:${resident.color}"></i>${resident.name} · ${resident.title}</div>
      <div class="resident-meta">精力 ${Math.round(resident.energy)} · 心情 ${Math.round(resident.mood)}</div>
      <div class="resident-jobs">
        ${Object.values(JOB_DEFINITIONS).map((item) => `<button data-resident="${resident.id}" data-job="${item.id}" class="${item.id === resident.job ? "selected" : ""}">${item.name}</button>`).join("")}
      </div>
      <div class="resident-output">当前：${job.name}</div>
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
    updateResources();
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
      updateResources();
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
