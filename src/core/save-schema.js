export const SAVE_VERSION = 1;

export function createInitialSave() {
  return {
    saveVersion: SAVE_VERSION,
    seed: 20260923,
    day: 1,
    timeMinutes: 360,
    resources: {
      food: 120,
      materials: 80,
      incense: 0,
    },
    map: {
      width: 128,
      height: 128,
      buildings: [],
      residents: [],
      resourceNodes: [],
    },
    settings: {
      sound: true,
      haptics: true,
    },
  };
}
