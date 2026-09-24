import { demolishBuilding, placeBuilding, placeRoadBatch } from "./building-state.js";

export function executeBuildingCommand(state, command) {
  switch (command.type) {
    case "PlaceBuilding":
      return placeBuilding(
        state,
        command.buildingType,
        command.x,
        command.y,
        command.rotation ?? 0,
      );
    case "DemolishBuilding":
      return demolishBuilding(state, command.buildingId);
    case "PlaceRoadBatch":
      return placeRoadBatch(state, command.cells);
    default:
      return { ok: false, reason: "unknown_command" };
  }
}
