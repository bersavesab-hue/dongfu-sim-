const COLORS = Object.freeze({
  background: "#0c1522",
  grass: "#273e3a",
  grassAlt: "#2c4840",
  buildable: "#8f7440",
  buildableAlt: "#a6854a",
  selected: "#f8d477",
  border: "rgba(255,255,255,0.08)",
  text: "#eef3e8",
  muted: "#a8b5ae",
});

export class MapRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.camera = camera;
    this.map = null;
    this.selectedTile = null;
  }

  setMap(map) {
    this.map = map;
  }

  setSelectedTile(tile) {
    this.selectedTile = tile;
  }

  resize(width, height, pixelRatio = 1) {
    this.canvas.width = Math.floor(width * pixelRatio);
    this.canvas.height = Math.floor(height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  render(viewportWidth, viewportHeight) {
    if (!this.map) return;
    const ctx = this.context;
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    const corners = [
      this.camera.screenToWorld(0, 0),
      this.camera.screenToWorld(viewportWidth, 0),
      this.camera.screenToWorld(0, viewportHeight),
      this.camera.screenToWorld(viewportWidth, viewportHeight),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2);
    const maxX = Math.min(this.map.width - 1, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2);
    const maxY = Math.min(this.map.height - 1, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);

    for (let sum = minX + minY; sum <= maxX + maxY; sum += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const y = sum - x;
        if (y < minY || y > maxY) continue;
        this.drawTile(ctx, this.map.tiles[y * this.map.width + x]);
      }
    }

    this.drawLegend(ctx);
  }

  drawTile(ctx, tile) {
    const center = this.camera.worldToScreen(tile.x + 0.5, tile.y + 0.5);
    const halfW = (this.camera.tileWidth / 2) * this.camera.zoom;
    const halfH = (this.camera.tileHeight / 2) * this.camera.zoom;
    const points = [
      [center.x, center.y - halfH],
      [center.x + halfW, center.y],
      [center.x, center.y + halfH],
      [center.x - halfW, center.y],
    ];

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.closePath();
    ctx.fillStyle = tile.buildable
      ? ((tile.x + tile.y) % 2 ? COLORS.buildable : COLORS.buildableAlt)
      : ((tile.x + tile.y) % 2 ? COLORS.grass : COLORS.grassAlt);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = Math.max(0.5, this.camera.zoom * 0.6);
    ctx.stroke();

    if (this.selectedTile?.x === tile.x && this.selectedTile?.y === tile.y) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = Math.max(2, this.camera.zoom * 2);
      ctx.stroke();
    }
  }

  drawLegend(ctx) {
    ctx.fillStyle = "rgba(8, 14, 22, 0.86)";
    ctx.fillRect(16, 16, 258, 76);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText("洞府经营 · 地图原型", 30, 41);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("拖动移动 · 滚轮/双指缩放 · 点击格子", 30, 64);
    ctx.fillText("金色区域：初始 20×20 建造区", 30, 83);
  }
}
