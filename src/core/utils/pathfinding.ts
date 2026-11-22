import type { WorldTile } from '../types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Admissible Octile distance heuristic for 8-directional grid movement.
 */
export function octileHeuristic(x1: number, y1: number, x2: number, y2: number): number {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Finds shortest walkable path on the tile grid using A* with Octile heuristic.
 * Returns empty array [] if target is unreachable (never falls back to walking through obstacles).
 */
export function findPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  tileMap: Map<string, WorldTile>,
  gridWidth: number,
  gridHeight: number,
  blockedTiles?: Set<string>
): Point[] {
  const startIntX = Math.round(startX);
  const startIntY = Math.round(startY);
  const targetIntX = Math.round(targetX);
  const targetIntY = Math.round(targetY);

  // Bounds check on start
  if (
    startIntX < 0 ||
    startIntY < 0 ||
    startIntX >= gridWidth ||
    startIntY >= gridHeight
  ) {
    return [];
  }

  const key = (x: number, y: number) => `${x},${y}`;

  const isWalkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return false;
    const k = key(x, y);
    if (blockedTiles && blockedTiles.has(k)) return false;
    const tile = tileMap.get(k);
    return tile ? tile.walkable : false;
  };

  // Already at target and target is walkable
  if (startIntX === targetIntX && startIntY === targetIntY) {
    return isWalkable(targetIntX, targetIntY) ? [{ x: targetIntX, y: targetIntY }] : [];
  }

  // Gather candidate goal tiles: if target is walkable, use it; otherwise check adjacent walkable tiles
  const candidateGoals: Point[] = [];
  if (isWalkable(targetIntX, targetIntY)) {
    candidateGoals.push({ x: targetIntX, y: targetIntY });
  } else {
    // Check 8 neighbors around target, sorted by closeness to start
    const neighborOffsets = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
    ];
    for (const offset of neighborOffsets) {
      const nx = targetIntX + offset.x;
      const ny = targetIntY + offset.y;
      if (isWalkable(nx, ny)) {
        candidateGoals.push({ x: nx, y: ny });
      }
    }
    candidateGoals.sort(
      (a, b) =>
        octileHeuristic(startIntX, startIntY, a.x, a.y) -
        octileHeuristic(startIntX, startIntY, b.x, b.y)
    );
  }

  if (candidateGoals.length === 0) {
    return [];
  }

  // Try candidate goals in order until a valid obstacle-free path is found
  for (const effectiveTarget of candidateGoals) {
    if (startIntX === effectiveTarget.x && startIntY === effectiveTarget.y) {
      return [{ x: effectiveTarget.x, y: effectiveTarget.y }];
    }

    const path = runAStar(
      startIntX,
      startIntY,
      effectiveTarget.x,
      effectiveTarget.y,
      isWalkable,
      gridWidth * gridHeight * 2
    );

    if (path.length > 0) {
      return path;
    }
  }

  // Explicitly return empty path when unreachable — NEVER cross water/obstacles!
  return [];
}

function runAStar(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  isWalkable: (x: number, y: number) => boolean,
  maxIterations: number
): Point[] {
  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    parent?: Node;
  }

  const key = (x: number, y: number) => `${x},${y}`;
  const openList: Node[] = [];
  const openMap = new Map<string, Node>();
  const closedSet = new Set<string>();

  const startNode: Node = {
    x: startX,
    y: startY,
    g: 0,
    f: octileHeuristic(startX, startY, goalX, goalY),
  };

  openList.push(startNode);
  openMap.set(key(startX, startY), startNode);

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
  ];

  let iterations = 0;

  while (openList.length > 0 && iterations++ < maxIterations) {
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openList.splice(lowestIdx, 1)[0];
    const currentKey = key(current.x, current.y);
    openMap.delete(currentKey);
    closedSet.add(currentKey);

    if (current.x === goalX && current.y === goalY) {
      const path: Point[] = [];
      let temp: Node | undefined = current;
      while (temp) {
        path.unshift({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
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

      // Prevent diagonal corner cutting through unwalkable tiles
      if (dir.x !== 0 && dir.y !== 0) {
        if (!isWalkable(current.x + dir.x, current.y) || !isWalkable(current.x, current.y + dir.y)) {
          continue;
        }
      }

      const moveCost = dir.x !== 0 && dir.y !== 0 ? Math.SQRT2 : 1.0;
      const g = current.g + moveCost;
      const h = octileHeuristic(neighborX, neighborY, goalX, goalY);
      const f = g + h;

      const existingOpen = openMap.get(neighborKey);
      if (existingOpen) {
        if (g < existingOpen.g) {
          existingOpen.g = g;
          existingOpen.f = f;
          existingOpen.parent = current;
        }
      } else {
        const node: Node = {
          x: neighborX,
          y: neighborY,
          g,
          f,
          parent: current,
        };
        openList.push(node);
        openMap.set(neighborKey, node);
      }
    }
  }

  return [];
}
