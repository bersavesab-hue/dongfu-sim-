export const ECONOMY_RULES = Object.freeze({
  initialResources: Object.freeze({ food: 120, materials: 100, incense: 0 }),
  storage: Object.freeze({ food: 240, materials: 160, incense: 100 }),
  foodPerResidentHour: 1,
  shiftStart: 360,
  shiftEnd: 1080,
  rescue: Object.freeze({
    cooldownMinutes: 360,
    durationMinutes: 60,
    food: 12,
    materials: 6,
    energyCost: 12,
    moodCost: 2,
  }),
});
