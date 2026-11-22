import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Building } from '../core/types';
import { isoToScreen } from '../core/utils/math';

export class StructureRenderer {
  public container: Container;
  private buildingViews: Map<string, { container: Container; graphics: Graphics; progressBar: Graphics; label: Text; building: Building }> = new Map();

  constructor() {
    this.container = new Container();
    this.container.label = 'StructureRenderer';
  }

  public syncBuildings(buildings: Iterable<Building>): void {
    const activeIds = new Set<string>();

    for (const bld of buildings) {
      activeIds.add(bld.id);
      let view = this.buildingViews.get(bld.id);

      if (!view) {
        const bldContainer = new Container();
        const graphics = new Graphics();
        const progressBar = new Graphics();
        bldContainer.addChild(graphics);
        bldContainer.addChild(progressBar);

        const style = new TextStyle({
          fontFamily: 'Outfit, sans-serif',
          fontSize: 11,
          fontWeight: '700',
          fill: '#ffffff',
          stroke: { color: '#090d16', width: 2.5 },
        });
        const label = new Text({ text: bld.name, style });
        label.anchor.set(0.5, 1);
        bldContainer.addChild(label);

        this.container.addChild(bldContainer);
        view = { container: bldContainer, graphics, progressBar, label, building: bld };
        this.buildingViews.set(bld.id, view);
      }

      // Isometric center coordinate for multi-tile structures
      const centerX = bld.x + (bld.width - 1) / 2;
      const centerY = bld.y + (bld.height - 1) / 2;
      const screenPos = isoToScreen(centerX, centerY);

      view.container.position.set(screenPos.x, screenPos.y);
      view.container.zIndex = centerX + centerY + 0.1;
      view.building = bld;

      this.drawBuilding(view.graphics, bld);
      this.drawProgress(view.progressBar, view.label, bld);
    }

    // Clean up
    for (const [id, view] of this.buildingViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        this.buildingViews.delete(id);
      }
    }

    this.container.sortChildren();
  }

  private drawProgress(pg: Graphics, label: Text, bld: Building): void {
    pg.clear();

    const bannerY = bld.type === 'town_hall' ? -95 : -70;
    label.position.set(0, bannerY - 14);

    if (bld.status === 'constructing') {
      const pct = Math.min(1, bld.progress / bld.requiredProgress);
      label.text = `${bld.name} (${Math.round(pct * 100)}%)`;

      const barWidth = 64;
      const barHeight = 8;
      const startX = -barWidth / 2;
      const startY = bannerY - 8;

      // Background
      pg.roundRect(startX - 1, startY - 1, barWidth + 2, barHeight + 2, 4);
      pg.fill({ color: 0x0f172a, alpha: 0.85 });
      pg.stroke({ width: 1, color: 0x475569 });

      // Progress fill
      if (pct > 0) {
        pg.roundRect(startX, startY, barWidth * pct, barHeight, 3);
        pg.fill({ color: 0xf59e0b });
      }
    } else {
      label.text = bld.name;
    }
  }

  private drawBuilding(g: Graphics, bld: Building): void {
    g.clear();

    // Base ground shadow
    const shadowW = bld.width * 28;
    const shadowH = bld.height * 14;
    g.ellipse(0, 4, shadowW, shadowH);
    g.fill({ color: 0x000000, alpha: 0.3 });

    if (bld.status === 'constructing') {
      // Scaffolding & Timber construction site
      // Timber posts
      const posts = [
        { x: -28, y: 0 },
        { x: 28, y: 0 },
        { x: 0, y: -16 },
        { x: 0, y: 16 },
      ];

      posts.forEach((p) => {
        g.rect(p.x - 2, p.y - 50, 4, 50);
        g.fill({ color: 0x854d0e });
        g.stroke({ width: 0.5, color: 0x451a03 });
      });

      // Horizontal scaffolding boards
      [-15, -32, -45].forEach((h) => {
        g.moveTo(-32, h);
        g.lineTo(32, h);
        g.stroke({ width: 3, color: 0xa16207 });

        // Cross braces
        g.moveTo(-28, h + 10);
        g.lineTo(28, h - 5);
        g.stroke({ width: 1, color: 0x78350f, alpha: 0.6 });
      });

      // Yellow/Black construction warning cloth
      g.rect(-18, -38, 36, 10);
      g.fill({ color: 0xfacc15 });
      g.stroke({ width: 1, color: 0x000000 });

      // Central masonry base rising up
      const currentHeight = Math.min(30, (bld.progress / bld.requiredProgress) * 30);
      if (currentHeight > 5) {
        g.poly([
          0, -currentHeight,
          20, 10 - currentHeight,
          0, 20 - currentHeight,
          -20, 10 - currentHeight,
        ]);
        g.fill({ color: 0x64748b });
        g.stroke({ width: 0.8, color: 0x334155 });
      }

      return;
    }

    if (bld.type === 'town_hall') {
      // Grand Castle / Town Hall
      // Lower Stone Base
      const baseHeight = 40;

      // Left Wall
      g.poly([
        -44, 0,
        0, 22,
        0, 22 - baseHeight,
        -44, -baseHeight,
      ]);
      g.fill({ color: 0x475569 });
      g.stroke({ width: 1, color: 0x1e293b });

      // Right Wall
      g.poly([
        44, 0,
        0, 22,
        0, 22 - baseHeight,
        44, -baseHeight,
      ]);
      g.fill({ color: 0x64748b });
      g.stroke({ width: 1, color: 0x1e293b });

      // Wooden Arch Portal (Door)
      g.poly([
        -8, 18,
        0, 22,
        8, 18,
        8, 4,
        0, 8,
        -8, 4,
      ]);
      g.fill({ color: 0x3e2723 });

      // Center Roof / Keep
      g.poly([
        0, -baseHeight - 35,
        48, -baseHeight + 4,
        0, -baseHeight + 26,
        -48, -baseHeight + 4,
      ]);
      g.fill({ color: 0x991b1b }); // Majestic Crimson Roof
      g.stroke({ width: 1, color: 0x450a0a });

      // Central Tower Spire
      g.rect(-10, -baseHeight - 55, 20, 24);
      g.fill({ color: 0x64748b });

      // Tower Cone Roof
      g.poly([
        0, -baseHeight - 75,
        14, -baseHeight - 55,
        -14, -baseHeight - 55,
      ]);
      g.fill({ color: 0xb91c1c });

      // Flag banner
      g.rect(-1, -baseHeight - 88, 2, 14);
      g.fill({ color: 0xd97706 });
      g.poly([
        1, -baseHeight - 88,
        18, -baseHeight - 83,
        1, -baseHeight - 78,
      ]);
      g.fill({ color: 0x38bdf8 }); // Cyan City Banner

      // Glowing warm stained-glass windows
      g.rect(-24, -baseHeight + 6, 8, 12);
      g.fill({ color: 0xfef08a });
      g.rect(16, -baseHeight + 6, 8, 12);
      g.fill({ color: 0xfef08a });
    } else if (bld.type === 'storage_barn') {
      // Storage Barn
      const h = 26;
      g.poly([-26, 0, 0, 13, 0, 13 - h, -26, -h]);
      g.fill({ color: 0x78350f });

      g.poly([26, 0, 0, 13, 0, 13 - h, 26, -h]);
      g.fill({ color: 0x92400e });

      // Roof
      g.poly([
        0, -h - 20,
        30, -h + 2,
        0, -h + 16,
        -30, -h + 2,
      ]);
      g.fill({ color: 0xd97706 }); // Thatch / Cedar roof

      // Grain / Wood stack barrels outside
      g.ellipse(-20, 8, 6, 4);
      g.fill({ color: 0xb45309 });
    } else {
      // Default Cozy House / Watchtower
      const h = 32;
      g.poly([-22, 0, 0, 11, 0, 11 - h, -22, -h]);
      g.fill({ color: 0x475569 });

      g.poly([22, 0, 0, 11, 0, 11 - h, 22, -h]);
      g.fill({ color: 0x64748b });

      // Roof
      g.poly([
        0, -h - 22,
        26, -h + 2,
        0, -h + 14,
        -26, -h + 2,
      ]);
      g.fill({ color: 0x0284c7 });
    }
  }
}
