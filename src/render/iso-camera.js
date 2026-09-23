export class IsoCamera {
  constructor({ tileWidth = 48, tileHeight = 24 } = {}) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.zoom = 1;
    this.originX = 0;
    this.originY = 0;
  }

  setViewport(width, height, worldX = 64, worldY = 64) {
    const center = this.worldToScreen(worldX, worldY);
    this.originX += width / 2 - center.x;
    this.originY += height / 2 - center.y;
  }

  worldToScreen(x, y) {
    return {
      x: this.originX + (x - y) * (this.tileWidth / 2) * this.zoom,
      y: this.originY + (x + y) * (this.tileHeight / 2) * this.zoom,
    };
  }

  screenToWorld(screenX, screenY) {
    const localX = (screenX - this.originX) / this.zoom;
    const localY = (screenY - this.originY) / this.zoom;
    return {
      x: (localY / (this.tileHeight / 2) + localX / (this.tileWidth / 2)) / 2,
      y: (localY / (this.tileHeight / 2) - localX / (this.tileWidth / 2)) / 2,
    };
  }

  panBy(dx, dy) {
    this.originX += dx;
    this.originY += dy;
  }

  zoomAt(factor, screenX, screenY) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(2.5, Math.max(0.35, this.zoom * factor));
    const after = this.worldToScreen(before.x, before.y);
    this.originX += screenX - after.x;
    this.originY += screenY - after.y;
  }
}
