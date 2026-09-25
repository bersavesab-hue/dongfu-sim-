export const KAIRO_VISUAL_SCALE = Object.freeze({
  tileWidth: 48,
  tileHeight: 24,
  defaultZoom: 0.82,
  minZoom: 0.42,
  maxZoom: 1.85,
  residentSpriteSize: 104,
  residentFootRatio: 0.95,
  buildingLabelMinZoom: 1.02,
  residentLabelMinZoom: 1.18,
});

export const BUILDING_RENDER_PROFILES = Object.freeze({
  residence: Object.freeze({ spriteSize: 132, footRatio: 0.93, labelRatio: 0.22 }),
  farm: Object.freeze({ spriteSize: 126, footRatio: 0.91, labelRatio: 0.2 }),
  workshop: Object.freeze({ spriteSize: 136, footRatio: 0.93, labelRatio: 0.2 }),
  canteen: Object.freeze({ spriteSize: 132, footRatio: 0.93, labelRatio: 0.2 }),
  warehouse: Object.freeze({ spriteSize: 136, footRatio: 0.93, labelRatio: 0.2 }),
});

const DEFAULT_PROFILE = Object.freeze({ spriteSize: 128, footRatio: 0.93, labelRatio: 0.2 });

export function getBuildingRenderProfile(typeId) {
  return BUILDING_RENDER_PROFILES[typeId] ?? DEFAULT_PROFILE;
}
