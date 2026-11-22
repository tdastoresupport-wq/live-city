import { WorldTile } from '../types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Finds shortest walkable path on the tile grid using Breadth-First Search (BFS) / A*.
 */
export function findPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  tileMap: Map<string, WorldTile>,
  gridWidth: number,
  gridHeight: number
): Point[] {
  const startIntX = Math.round(startX);
  const startIntY = Math.round(startY);
  const targetIntX = Math.round(targetX);
  const targetIntY = Math.round(targetY);

  if (startIntX === targetIntX && startIntY === targetIntY) {
    return [{ x: targetIntX, y: targetIntY }];
  }

  const key = (x: number, y: number) => `${x},${y}`;

  const isWalkable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return false;
    const tile = tileMap.get(key(x, y));
    return tile ? tile.walkable : true;
  };

  // If target tile itself is not walkable (e.g. Tree or Rock), find nearest adjacent walkable tile
  let effectiveTarget = { x: targetIntX, y: targetIntY };
  if (!isWalkable(targetIntX, targetIntY)) {
    const neighbors = [
      { x: targetIntX + 1, y: targetIntY },
      { x: targetIntX - 1, y: targetIntY },
      { x: targetIntX, y: targetIntY + 1 },
      { x: targetIntX, y: targetIntY - 1 },
    ];
    const walkableNeighbor = neighbors.find((n) => isWalkable(n.x, n.y));
    if (walkableNeighbor) {
      effectiveTarget = walkableNeighbor;
    } else {
      // Direct straight line fallback if surrounded
      return [{ x: targetIntX, y: targetIntY }];
    }
  }

  // A* Search
  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    parent?: Node;
  }

  const openList: Node[] = [];
  const closedSet = new Set<string>();

  const startNode: Node = {
    x: startIntX,
    y: startIntY,
    g: 0,
    f: Math.abs(effectiveTarget.x - startIntX) + Math.abs(effectiveTarget.y - startIntY),
  };

  openList.push(startNode);

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    // Diagonal movement for smoother movement
    { x: 1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
  ];

  let iterations = 0;
  const maxIterations = 500;

  while (openList.length > 0 && iterations++ < maxIterations) {
    // Find node with lowest f
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openList.splice(lowestIdx, 1)[0];
    const currentKey = key(current.x, current.y);
    closedSet.add(currentKey);

    if (current.x === effectiveTarget.x && current.y === effectiveTarget.y) {
      // Reconstruct path
      const path: Point[] = [];
      let temp: Node | undefined = current;
      while (temp) {
        path.unshift({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
      // Remove starting tile from waypoints
      if (path.length > 1) {
        path.shift();
      }
      return path;
    }

    for (const dir of directions) {
      const neighborX = current.x + dir.x;
      const neighborY = current.y + dir.y;
      const neighborKey = key(neighborX, neighborY);

      if (closedSet.has(neighborKey)) continue;
      if (!isWalkable(neighborX, neighborY)) continue;

      // Diagonal safety: don't cut corners through obstacles
      if (dir.x !== 0 && dir.y !== 0) {
        if (!isWalkable(current.x + dir.x, current.y) || !isWalkable(current.x, current.y + dir.y)) {
          continue;
        }
      }

      const moveCost = dir.x !== 0 && dir.y !== 0 ? 1.414 : 1.0;
      const g = current.g + moveCost;
      const h = Math.abs(effectiveTarget.x - neighborX) + Math.abs(effectiveTarget.y - neighborY);
      const f = g + h;

      const existingOpen = openList.find((n) => n.x === neighborX && n.y === neighborY);
      if (existingOpen) {
        if (g < existingOpen.g) {
          existingOpen.g = g;
          existingOpen.f = f;
          existingOpen.parent = current;
        }
      } else {
        openList.push({
          x: neighborX,
          y: neighborY,
          g,
          f,
          parent: current,
        });
      }
    }
  }

  // Fallback: direct line to target
  return [{ x: effectiveTarget.x, y: effectiveTarget.y }];
}
