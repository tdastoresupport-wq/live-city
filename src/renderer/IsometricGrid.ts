import { Container, Graphics } from 'pixi.js';
import { WorldState } from '../core/state/WorldState';
import { isoToScreen, ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from '../core/utils/math';
import { WorldTile } from '../core/types';

export class IsometricGrid {
  public container: Container;
  private tileGraphics: Map<string, Graphics> = new Map();
  private waterTiles: Array<{ key: string; graphics: Graphics; tile: WorldTile }> = [];
  private time = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'IsometricGrid';
  }

  public init(worldState: WorldState): void {
    this.container.removeChildren();
    this.tileGraphics.clear();
    this.waterTiles = [];

    // Sort tiles by iso depth (x + y) so proper isometric drawing order is preserved
    const tiles = Array.from(worldState.tileMap.values()).sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const tile of tiles) {
      const g = new Graphics();
      this.drawTile(g, tile);

      const screenPos = isoToScreen(tile.x, tile.y);
      g.position.set(screenPos.x, screenPos.y);

      this.container.addChild(g);
      const key = `${tile.x},${tile.y}`;
      this.tileGraphics.set(key, g);

      if (tile.type === 'water') {
        this.waterTiles.push({ key, graphics: g, tile });
      }
    }
  }

  public update(deltaTime: number): void {
    this.time += deltaTime * 2.5;

    // Subtle water surface shimmer animation
    for (const { graphics, tile } of this.waterTiles) {
      graphics.clear();
      this.drawTile(graphics, tile, this.time);
    }
  }

  private drawTile(g: Graphics, tile: WorldTile, animTime = 0): void {
    const halfW = ISO_TILE_WIDTH / 2;
    const halfH = ISO_TILE_HEIGHT / 2;

    let topColor = 0x3d7e4b; // Grass green
    let edgeColor = 0x245431;

    switch (tile.type) {
      case 'grass':
        // Mild variation
        topColor = tile.variation === 0 ? 0x489656 : tile.variation === 1 ? 0x41894e : 0x3b7d46;
        edgeColor = 0x224f2e;
        break;

      case 'dirt':
        topColor = 0x8a623f; // Earthy brown
        edgeColor = 0x5b3f27;
        break;

      case 'water': {
        const wave = Math.sin(animTime + tile.x * 0.8 + tile.y * 0.6) * 0.08;
        topColor = wave > 0 ? 0x38bdf8 : 0x0284c7; // Water blue
        edgeColor = 0x0369a1;
        break;
      }

      case 'road':
        topColor = 0x78716c; // Warm cobblestone grey
        edgeColor = 0x44403c;
        break;

      case 'plaza':
        topColor = 0xa8a29e; // Smooth stone plaza
        edgeColor = 0x57534e;
        break;
    }

    // Isometric diamond top polygon:
    // (0, -halfH), (halfW, 0), (0, halfH), (-halfW, 0)
    g.poly([
      0, -halfH,
      halfW, 0,
      0, halfH,
      -halfW, 0,
    ]);
    g.fill({ color: topColor });
    g.stroke({ width: 0.5, color: 0x000000, alpha: 0.15 });

    // 2.5D height extrusion if elevation or for road/plaza bevel
    const depth = tile.type === 'water' ? 2 : 4;
    // Left edge
    g.poly([
      -halfW, 0,
      0, halfH,
      0, halfH + depth,
      -halfW, depth,
    ]);
    g.fill({ color: edgeColor });

    // Right edge
    g.poly([
      halfW, 0,
      0, halfH,
      0, halfH + depth,
      halfW, depth,
    ]);
    g.fill({ color: edgeColor, alpha: 0.8 });

    // Tile detail accents
    if (tile.type === 'road' || tile.type === 'plaza') {
      g.moveTo(-halfW * 0.3, 0);
      g.lineTo(halfW * 0.3, 0);
      g.stroke({ width: 0.5, color: 0xffffff, alpha: 0.1 });
    }
  }
}
