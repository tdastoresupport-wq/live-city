export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;

/**
 * Convert isometric grid coordinate (x, y) to 2D screen coordinate.
 */
export function isoToScreen(
  gridX: number,
  gridY: number,
  tileWidth = ISO_TILE_WIDTH,
  tileHeight = ISO_TILE_HEIGHT
): { x: number; y: number } {
  return {
    x: (gridX - gridY) * (tileWidth / 2),
    y: (gridX + gridY) * (tileHeight / 2),
  };
}

/**
 * Convert 2D screen coordinate back to isometric grid coordinate.
 */
export function screenToIso(
  screenX: number,
  screenY: number,
  tileWidth = ISO_TILE_WIDTH,
  tileHeight = ISO_TILE_HEIGHT
): { x: number; y: number } {
  return {
    x: (screenX / (tileWidth / 2) + screenY / (tileHeight / 2)) / 2,
    y: (screenY / (tileHeight / 2) - screenX / (tileWidth / 2)) / 2,
  };
}

/**
 * Calculate Euclidean distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Linear interpolation between a and b by t (0..1).
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Clamp a number between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Get random integer in range [min, max].
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random element from array.
 */
export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
