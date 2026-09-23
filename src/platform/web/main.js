import { createMapGrid } from "../../core/map-grid.js";
import { IsoCamera } from "../../render/iso-camera.js";
import { MapRenderer } from "../../render/map-renderer.js";

const canvas = document.querySelector("#game-canvas");
const status = document.querySelector("#status");
const camera = new IsoCamera();
const renderer = new MapRenderer(canvas, camera);
const map = createMapGrid();

let viewport = { width: window.innerWidth, height: window.innerHeight };
let pointer = { active: false, moved: false, x: 0, y: 0 };

function resize() {
  viewport = { width: window.innerWidth, height: window.innerHeight };
  renderer.resize(viewport.width, viewport.height, window.devicePixelRatio || 1);
  if (!resize.didCenter) {
    camera.setViewport(viewport.width, viewport.height);
    resize.didCenter = true;
  }
  renderer.render(viewport.width, viewport.height);
}

function updateStatus(tile) {
  if (!tile) {
    status.textContent = "点击地图查看格子";
    return;
  }
  status.textContent = tile.buildable
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
  renderer.render(viewport.width, viewport.height);
});

canvas.addEventListener("pointerup", (event) => {
  if (!pointer.moved) {
    const tile = pickTile(event.clientX, event.clientY);
    renderer.setSelectedTile(tile);
    updateStatus(tile);
    renderer.render(viewport.width, viewport.height);
  }
  pointer.active = false;
});

canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  renderer.render(viewport.width, viewport.height);
}, { passive: false });

window.addEventListener("resize", resize);
renderer.setMap(map);
resize();
