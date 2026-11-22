import { Container, Graphics } from 'pixi.js';
import { WorldState } from '../core/state/WorldState';
import { isoToScreen, ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from '../core/utils/math';
import { WorldTile } from '../core/types';

export class IsometricGrid {
  public container: Container;
  private tileGraphics: Map<string, { graphics: Graphics; discovered: boolean }> = new Map();
  private waterTiles: Array<{ key: string; graphics: Graphics; tile: WorldTile }> = [];
  private time = 0;
  private waterUpdateAccumulator = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'IsometricGrid';
  }

  public init(worldState: WorldState): void {
    this.container.removeChildren();
    this.tileGraphics.clear();
    this.waterTiles = [];

    const tiles = Array.from(worldState.tileMap.values()).sort(
      (a, b) => a.x + a.y - (b.x + b.y)
    );

    for (const tile of tiles) {
      const g = new Graphics();
      const isDiscovered = tile.discovered !== false;
      this.drawTile(g, tile, 0, isDiscovered);

      const screenPos = isoToScreen(tile.x, tile.y);
      g.position.set(screenPos.x, screenPos.y);

      this.container.addChild(g);
      const key = `${tile.x},${tile.y}`;
      this.tileGraphics.set(key, { graphics: g, discovered: isDiscovered });

      if (tile.type === 'water') {
        this.waterTiles.push({ key, graphics: g, tile });
      }
    }
  }

  /**
   * Selectively redraws only tiles whose Fog of War discovery state has changed.
   */
  public syncDiscovery(worldState: WorldState): void {
    for (const [key, tile] of worldState.tileMap.entries()) {
      const entry = this.tileGraphics.get(key);
      if (!entry) continue;
      const isDiscovered = tile.discovered !== false;
      if (entry.discovered !== isDiscovered) {
        entry.discovered = isDiscovered;
        entry.graphics.clear();
        this.drawTile(entry.graphics, tile, this.time, isDiscovered);
      }
    }
  }

  public update(deltaTime: number): void {
    this.time += deltaTime * 2.5;
    this.waterUpdateAccumulator += deltaTime;

    // Throttle water surface shimmer redraw to ~6 FPS for high performance
    if (this.waterUpdateAccumulator >= 0.16) {
      this.waterUpdateAccumulator = 0;
      for (const { key, graphics, tile } of this.waterTiles) {
        const entry = this.tileGraphics.get(key);
        const isDiscovered = entry ? entry.discovered : true;
        graphics.clear();
        this.drawTile(graphics, tile, this.time, isDiscovered);
      }
    }
  }

  private drawTile(g: Graphics, tile: WorldTile, animTime = 0, isDiscovered = true): void {
    const halfW = ISO_TILE_WIDTH / 2;
    const halfH = ISO_TILE_HEIGHT / 2;

    let topColor = 0x3d7e4b;
    let edgeColor = 0x245431;

    switch (tile.type) {
      case 'grass':
        topColor =
          tile.variation === 0 ? 0x489656 : tile.variation === 1 ? 0x41894e : 0x3b7d46;
        edgeColor = 0x224f2e;
        break;

      case 'dirt':
        topColor = 0x8a623f;
        edgeColor = 0x5b3f27;
        break;

      case 'water': {
        const wave = Math.sin(animTime + tile.x * 0.8 + tile.y * 0.6) * 0.08;
        topColor = wave > 0 ? 0x38bdf8 : 0x0284c7;
        edgeColor = 0x0369a1;
        break;
      }

      case 'road':
        topColor = 0x78716c;
        edgeColor = 0x44403c;
        break;

      case 'plaza':
        topColor = 0xa8a29e;
        edgeColor = 0x57534e;
        break;
    }

    g.poly([0, -halfH, halfW, 0, 0, halfH, -halfW, 0]);
    g.fill({ color: topColor });
    g.stroke({ width: 0.5, color: 0x000000, alpha: 0.15 });

    const depth = tile.type === 'water' ? 2 : 5;
    g.poly([-halfW, 0, 0, halfH, 0, halfH + depth, -halfW, depth]);
    g.fill({ color: edgeColor });

    g.poly([halfW, 0, 0, halfH, 0, halfH + depth, halfW, depth]);
    g.fill({ color: edgeColor, alpha: 0.82 });

    if (tile.type === 'road' || tile.type === 'plaza') {
      g.moveTo(-halfW * 0.3, 0);
      g.lineTo(halfW * 0.3, 0);
      g.stroke({ width: 0.5, color: 0xffffff, alpha: 0.12 });
    } else if (tile.type === 'grass' && tile.variation === 2 && isDiscovered) {
      // Cozy grass tuft accent
      g.moveTo(-2, 0);
      g.lineTo(-4, -4);
      g.moveTo(1, 1);
      g.lineTo(3, -3);
      g.stroke({ width: 1, color: 0x86efac, alpha: 0.35 });
    }

    // Fog of War overlay for undiscovered frontier tiles
    if (!isDiscovered) {
      g.poly([0, -halfH, halfW, 0, 0, halfH, -halfW, 0]);
      g.fill({ color: 0x090d16, alpha: 0.62 });
    }
  }
}
