import { BUILDING_MODEL_FRAMES, MODEL_ATLAS_URL, MODEL_CELL_SIZE, RESIDENT_MODEL_FRAMES } from "./model-atlas.js";
import { KAIRO_VISUAL_SCALE, getBuildingRenderProfile } from "./visual-scale.js";

const COLORS = Object.freeze({
  background: "#13202a",
  grass: "#36584a",
  grassAlt: "#3c6252",
  buildable: "#8e7a48",
  buildableAlt: "#9d8750",
  selected: "#ffd96a",
  preview: "#9ee493",
  previewInvalid: "#ef756f",
  border: "rgba(236,244,228,0.08)",
  text: "#f4f3df",
});

export class MapRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.camera = camera;
    this.map = null;
    this.gameState = null;
    this.selectedTile = null;
    this.previewTile = null;
    this.previewDefinition = null;
    this.previewRotation = 0;
    this.roadPreview = [];
    this.roadPreviewValid = true;
    this.modelAtlas = new Image();
    this.modelAtlasReady = false;
    this.modelAtlas.addEventListener("load", () => {
      this.modelAtlasReady = true;
    });
    this.modelAtlas.src = MODEL_ATLAS_URL;
  }

  setMap(map) {
    this.map = map;
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setSelectedTile(tile) {
    this.selectedTile = tile;
  }

  setBuildPreview(tile, definition, rotation = 0) {
    this.previewTile = tile;
    this.previewDefinition = definition;
    this.previewRotation = rotation;
  }

  setRoadPreview(cells = [], valid = true) {
    this.roadPreview = cells;
    this.roadPreviewValid = valid;
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
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))) - 3);
    const maxX = Math.min(this.map.width - 1, Math.ceil(Math.max(...corners.map((point) => point.x))) + 3);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))) - 3);
    const maxY = Math.min(this.map.height - 1, Math.ceil(Math.max(...corners.map((point) => point.y))) + 3);

    for (let sum = minX + minY; sum <= maxX + maxY; sum += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const y = sum - x;
        if (y < minY || y > maxY) continue;
        this.drawTile(ctx, this.map.tiles[y * this.map.width + x]);
      }
    }

    this.drawRoads(ctx);
    this.drawWorldObjects(ctx);
    this.drawPreview(ctx);
    this.drawRoadPreview(ctx);
  }

  tileDiamond(x, y, width = 1, height = 1) {
    return [
      this.camera.worldToScreen(x, y),
      this.camera.worldToScreen(x + width, y),
      this.camera.worldToScreen(x + width, y + height),
      this.camera.worldToScreen(x, y + height),
    ];
  }

  traceDiamond(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }

  drawTile(ctx, tile) {
    const points = this.tileDiamond(tile.x, tile.y);
    this.traceDiamond(ctx, points);
    ctx.fillStyle = tile.buildable
      ? ((tile.x + tile.y) % 2 ? COLORS.buildable : COLORS.buildableAlt)
      : ((tile.x + tile.y) % 2 ? COLORS.grass : COLORS.grassAlt);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = Math.max(0.45, this.camera.zoom * 0.55);
    ctx.stroke();

    if (this.selectedTile?.x === tile.x && this.selectedTile?.y === tile.y) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = Math.max(1.5, this.camera.zoom * 2);
      ctx.stroke();
    }
  }

  drawRoads(ctx) {
    if (!this.gameState) return;
    const roads = this.gameState.buildings
      .filter((building) => building.typeId === "road")
      .sort((a, b) => a.x + a.y - b.x - b.y);
    const roadKeys = new Set(roads.map((road) => `${road.x},${road.y}`));

    for (const road of roads) {
      const points = this.tileDiamond(road.x, road.y);
      this.traceDiamond(ctx, points);
      ctx.fillStyle = "#a79b7d";
      ctx.fill();
      ctx.strokeStyle = "#6f6857";
      ctx.lineWidth = Math.max(0.8, this.camera.zoom);
      ctx.stroke();

      const center = this.camera.worldToScreen(road.x + 0.5, road.y + 0.5);
      for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        if (!roadKeys.has(`${road.x + direction.x},${road.y + direction.y}`)) continue;
        const neighbor = this.camera.worldToScreen(
          road.x + 0.5 + direction.x * 0.5,
          road.y + 0.5 + direction.y * 0.5,
        );
        ctx.strokeStyle = "#d0c5a2";
        ctx.lineWidth = Math.max(2, 5 * this.camera.zoom);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(neighbor.x, neighbor.y);
        ctx.stroke();
      }
      ctx.fillStyle = "#d8ccaa";
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, Math.max(2, 4 * this.camera.zoom), Math.max(1, 2 * this.camera.zoom), 0, 0, Math.PI * 2);
      ctx.fill();

      if (this.selectedTile?.buildingId === road.id) {
        this.traceDiamond(ctx, points);
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = Math.max(1.5, this.camera.zoom * 2);
        ctx.stroke();
      }
    }
  }

  drawWorldObjects(ctx) {
    if (!this.gameState) return;
    const objects = [
      ...this.gameState.buildings.filter((building) => building.typeId !== "road").map((building) => ({
        kind: "building",
        depth: building.x + building.y + (building.width + building.height) / 2 + 0.25,
        value: building,
      })),
      ...this.gameState.residents.map((resident, index) => ({
        kind: "resident",
        depth: (resident.position?.x ?? 64) + (resident.position?.y ?? 64) + 0.35,
        value: resident,
        index,
      })),
    ].sort((a, b) => a.depth - b.depth);

    for (const object of objects) {
      if (object.kind === "building") this.drawBuilding(ctx, object.value);
      else this.drawResident(ctx, object.value, object.index);
    }
  }

  getBuildingPlacement(typeId, x, y, width, height) {
    const profile = getBuildingRenderProfile(typeId);
    const size = profile.spriteSize * this.camera.zoom;
    const center = this.camera.worldToScreen(x + width / 2, y + height / 2);
    const footprintBottom = this.camera.worldToScreen(x + width, y + height);
    return {
      profile,
      size,
      center,
      drawX: center.x - size / 2,
      drawY: footprintBottom.y - size * profile.footRatio,
    };
  }

  drawBuilding(ctx, building) {
    const definition = building.definition ?? building;
    const placement = this.getBuildingPlacement(
      building.typeId,
      building.x,
      building.y,
      building.width,
      building.height,
    );
    const frame = BUILDING_MODEL_FRAMES[building.typeId];

    if (this.modelAtlasReady && frame !== undefined) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        this.modelAtlas,
        frame * MODEL_CELL_SIZE,
        0,
        MODEL_CELL_SIZE,
        MODEL_CELL_SIZE,
        placement.drawX,
        placement.drawY,
        placement.size,
        placement.size,
      );
    } else {
      const points = this.tileDiamond(building.x, building.y, building.width, building.height);
      this.traceDiamond(ctx, points);
      ctx.fillStyle = definition.color ?? "#8398a8";
      ctx.fill();
    }

    const selected = this.selectedTile?.buildingId === building.id;
    if (selected) {
      const points = this.tileDiamond(building.x, building.y, building.width, building.height);
      this.traceDiamond(ctx, points);
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = Math.max(2, this.camera.zoom * 2.5);
      ctx.stroke();
    }

    if (this.camera.zoom >= KAIRO_VISUAL_SCALE.buildingLabelMinZoom || selected) {
      const labelY = placement.drawY + placement.size * placement.profile.labelRatio;
      ctx.save();
      ctx.fillStyle = COLORS.text;
      ctx.strokeStyle = "rgba(16,24,25,0.92)";
      ctx.lineWidth = Math.max(2, 2.5 * this.camera.zoom);
      ctx.font = `600 ${Math.max(9, 10 * this.camera.zoom)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.strokeText(definition.name ?? building.typeId, placement.center.x, labelY);
      ctx.fillText(definition.name ?? building.typeId, placement.center.x, labelY);
      ctx.restore();
    }
  }

  drawResident(ctx, resident, index) {
    if (!this.modelAtlasReady) return;
    const position = resident.position ?? { x: 63.5 + index * 0.65, y: 65.2 };
    const point = this.camera.worldToScreen(position.x, position.y);
    const frame = RESIDENT_MODEL_FRAMES[resident.id];
    if (frame === undefined) return;

    const size = KAIRO_VISUAL_SCALE.residentSpriteSize * this.camera.zoom;
    const walking = resident.activity?.startsWith("walking");
    const bob = walking ? Math.sin(Date.now() / 130 + index) * 1.6 * this.camera.zoom : 0;

    ctx.save();
    ctx.fillStyle = "rgba(4,10,12,0.3)";
    ctx.beginPath();
    ctx.ellipse(
      point.x,
      point.y + 1.5 * this.camera.zoom,
      Math.max(4, 8 * this.camera.zoom),
      Math.max(2, 3.2 * this.camera.zoom),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    const drawY = point.y - size * KAIRO_VISUAL_SCALE.residentFootRatio + bob;
    ctx.save();
    if (resident.facing === "left") {
      ctx.translate(point.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.modelAtlas,
        frame * MODEL_CELL_SIZE,
        0,
        MODEL_CELL_SIZE,
        MODEL_CELL_SIZE,
        -size / 2,
        drawY,
        size,
        size,
      );
    } else {
      ctx.drawImage(
        this.modelAtlas,
        frame * MODEL_CELL_SIZE,
        0,
        MODEL_CELL_SIZE,
        MODEL_CELL_SIZE,
        point.x - size / 2,
        drawY,
        size,
        size,
      );
    }
    ctx.restore();

    const importantState = ["waiting_home", "waiting_workplace", "exhausted"].includes(resident.activity);
    if (this.camera.zoom >= KAIRO_VISUAL_SCALE.residentLabelMinZoom || importantState) {
      const labelY = point.y - size * 0.83 + bob;
      ctx.save();
      ctx.fillStyle = importantState ? "#ffd96a" : COLORS.text;
      ctx.strokeStyle = "rgba(8,14,22,0.92)";
      ctx.lineWidth = Math.max(2, 2.2 * this.camera.zoom);
      ctx.font = `600 ${Math.max(8, 9 * this.camera.zoom)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.strokeText(resident.name, point.x, labelY);
      ctx.fillText(resident.name, point.x, labelY);
      ctx.restore();
    }

    if (resident.activity === "working") {
      ctx.fillStyle = "#ffd96a";
      ctx.beginPath();
      ctx.arc(
        point.x + size * 0.19,
        point.y - size * 0.58 + bob,
        Math.max(1.8, 2.6 * this.camera.zoom),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  drawPreview(ctx) {
    if (!this.previewTile || !this.previewDefinition) return;
    const width = this.previewRotation % 2 === 0
      ? this.previewDefinition.width
      : this.previewDefinition.height;
    const height = this.previewRotation % 2 === 0
      ? this.previewDefinition.height
      : this.previewDefinition.width;
    const points = this.tileDiamond(this.previewTile.x, this.previewTile.y, width, height);

    this.traceDiamond(ctx, points);
    ctx.fillStyle = COLORS.preview;
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.preview;
    ctx.lineWidth = Math.max(1.5, 2 * this.camera.zoom);
    ctx.stroke();

    const frame = BUILDING_MODEL_FRAMES[this.previewDefinition.id];
    if (!this.modelAtlasReady || frame === undefined) return;
    const placement = this.getBuildingPlacement(
      this.previewDefinition.id,
      this.previewTile.x,
      this.previewTile.y,
      width,
      height,
    );
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.drawImage(
      this.modelAtlas,
      frame * MODEL_CELL_SIZE,
      0,
      MODEL_CELL_SIZE,
      MODEL_CELL_SIZE,
      placement.drawX,
      placement.drawY,
      placement.size,
      placement.size,
    );
    ctx.restore();
  }


  drawRoadPreview(ctx) {
    if (!this.roadPreview.length) return;
    const color = this.roadPreviewValid ? COLORS.preview : COLORS.previewInvalid;
    ctx.save();
    for (const cell of this.roadPreview) {
      const points = this.tileDiamond(cell.x, cell.y);
      this.traceDiamond(ctx, points);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.42;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, 2 * this.camera.zoom);
      ctx.stroke();
    }
    ctx.restore();
  }
}
