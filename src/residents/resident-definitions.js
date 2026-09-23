export const RESIDENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "resident-1",
    name: "青禾",
    title: "农务仙",
    job: "farmer",
    color: "#9bd178",
  }),
  Object.freeze({
    id: "resident-2",
    name: "玄铸",
    title: "器作仙",
    job: "artisan",
    color: "#8bb8e8",
  }),
  Object.freeze({
    id: "resident-3",
    name: "云衡",
    title: "执事仙",
    job: "steward",
    color: "#d2a8e8",
  }),
]);

export const JOB_DEFINITIONS = Object.freeze({
  farmer: Object.freeze({ id: "farmer", name: "农务", output: "food", amountPerHour: 6 }),
  artisan: Object.freeze({ id: "artisan", name: "器作", output: "materials", amountPerHour: 4 }),
  steward: Object.freeze({ id: "steward", name: "执事", output: "incense", amountPerHour: 2 }),
});

export function createInitialResidents() {
  return RESIDENT_DEFINITIONS.map((resident) => ({
    ...resident,
    level: 1,
    energy: 100,
    mood: 80,
    assignedBuildingId: null,
  }));
}
