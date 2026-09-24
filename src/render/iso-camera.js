import { KAIRO_VISUAL_SCALE } from "./visual-scale.js";

export class IsoCamera {
  constructor({
    tileWidth = KAIRO_VISUAL_SCALE.tileWidth,
    tileHeight = KAIRO_VISUAL_SCALE.tileHeight,
    zoom = KAIRO_VISUAL_SCALE.defaultZoom,
  } = {}) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.zoom = zoom;
    this.originX = 0;
    this.originY = 0;
  }

  setViewport(width, height, worldX = 64, worldY = 64) {
    const center = this.worldToScreen(worldX, worldY);
    this.originX += width * 0.45 - center.x;
    this.originY += height * 0.54 - center.y;
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
    this.zoom = Math.min(
      KAIRO_VISUAL_SCALE.maxZoom,
      Math.max(KAIRO_VISUAL_SCALE.minZoom, this.zoom * factor),
    );
    const after = this.worldToScreen(before.x, before.y);
    this.originX += screenX - after.x;
    this.originY += screenY - after.y;
  }
}
