const DIRECTIONS = Object.freeze([
  Object.freeze({ bit: 1, name: "north", x: 0, y: -1 }),
  Object.freeze({ bit: 2, name: "east", x: 1, y: 0 }),
  Object.freeze({ bit: 4, name: "south", x: 0, y: 1 }),
  Object.freeze({ bit: 8, name: "west", x: -1, y: 0 }),
]);

export function getRoadTopology(roadKeys, x, y) {
  const connections = DIRECTIONS.filter((direction) => (
    roadKeys.has(`${x + direction.x},${y + direction.y}`)
  ));
  const mask = connections.reduce((value, direction) => value | direction.bit, 0);
  let kind = "isolated";
  if (connections.length === 1) kind = "endpoint";
  else if (connections.length === 2) kind = mask === 5 || mask === 10 ? "straight" : "corner";
  else if (connections.length === 3) kind = "tee";
  else if (connections.length === 4) kind = "cross";
  return { mask, kind, connections };
}
