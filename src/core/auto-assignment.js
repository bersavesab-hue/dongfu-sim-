import { getHousingSummary, assignResidentHome } from "./simulation.js";
import { assignResidentWorkplace, getCompatibleWorkplaces } from "./resident-work.js";
import { getBuildingDefinition } from "../building/building-definitions.js";

export function autoAssignResidents(state) {
  let housed = 0;
  let staffed = 0;
  for (const resident of state.residents) {
    if (resident.homeBuildingId) continue;
    for (const home of getHousingSummary(state).residences) {
      if (assignResidentHome(state, resident.id, home.id).ok) {
        housed += 1;
        break;
      }
    }
  }
  for (const resident of state.residents) {
    if (resident.workplaceBuildingId) continue;
    for (const workplace of getCompatibleWorkplaces(state, resident)) {
      const capacity = getBuildingDefinition(workplace.typeId)?.workerCapacity ?? 0;
      const occupied = state.residents.filter((person) => person.workplaceBuildingId === workplace.id).length;
      if (occupied >= capacity) continue;
      if (assignResidentWorkplace(state, resident.id, workplace.id).ok) {
        staffed += 1;
        break;
      }
    }
  }
  return { housed, staffed };
}
