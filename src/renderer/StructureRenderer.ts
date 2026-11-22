import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Building } from '../core/types';
import { isoToScreen } from '../core/utils/math';

const SHARED_BUILDING_LABEL_STYLE = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 11,
  fontWeight: '700',
  fill: '#ffffff',
  stroke: { color: '#090d16', width: 2.5 },
});

interface BuildingView {
  container: Container;
  graphics: Graphics;
  progressBar: Graphics;
  label: Text;
  building: Building;
  lastStatus: string;
  lastProgress: number;
  lastLevel: number;
}

export class StructureRenderer {
  public container: Container;
  private buildingViews: Map<string, BuildingView> = new Map();

  constructor(sharedSceneContainer?: Container) {
    this.container = sharedSceneContainer || new Container();
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

        const label = new Text({
          text: bld.name,
          style: SHARED_BUILDING_LABEL_STYLE,
        });
        label.anchor.set(0.5, 1);
        bldContainer.addChild(label);

        this.container.addChild(bldContainer);
        view = {
          container: bldContainer,
          graphics,
          progressBar,
          label,
          building: bld,
          lastStatus: '',
          lastProgress: -1,
          lastLevel: -1,
        };
        this.buildingViews.set(bld.id, view);
      }

      const centerX = bld.x + (bld.width - 1) / 2;
      const centerY = bld.y + (bld.height - 1) / 2;
      const screenPos = isoToScreen(centerX, centerY);

      view.container.position.set(screenPos.x, screenPos.y);
      view.container.zIndex = (centerX + centerY) * 100 + 15;
      view.building = bld;

      // Dirty check: only redraw building geometry when status, progress, or level changed
      if (
        view.lastStatus !== bld.status ||
        view.lastProgress !== bld.progress ||
        view.lastLevel !== bld.level
      ) {
        view.lastStatus = bld.status;
        view.lastProgress = bld.progress;
        view.lastLevel = bld.level;
        this.drawBuilding(view.graphics, bld);
        this.drawProgress(view.progressBar, view.label, bld);
      }
    }

    for (const [id, view] of this.buildingViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        view.container.destroy({ children: true });
        this.buildingViews.delete(id);
      }
    }
  }

  private drawProgress(pg: Graphics, label: Text, bld: Building): void {
    pg.clear();

    const bannerY = bld.type === 'town_hall' ? -98 : bld.type === 'watchtower' ? -84 : -72;
    label.position.set(0, bannerY - 14);

    if (bld.status === 'constructing') {
      const pct = Math.min(1, bld.progress / bld.requiredProgress);
      label.text = `${bld.name} (${Math.round(pct * 100)}%)`;

      const barWidth = 64;
      const barHeight = 8;
      const startX = -barWidth / 2;
      const startY = bannerY - 8;

      pg.roundRect(startX - 1, startY - 1, barWidth + 2, barHeight + 2, 4);
      pg.fill({ color: 0x0f172a, alpha: 0.85 });
      pg.stroke({ width: 1, color: 0x475569 });

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

    const shadowW = bld.width * 28;
    const shadowH = bld.height * 14;
    g.ellipse(0, 4, shadowW, shadowH);
    g.fill({ color: 0x000000, alpha: 0.3 });

    if (bld.status === 'constructing') {
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

      [-15, -32, -45].forEach((h) => {
        g.moveTo(-32, h);
        g.lineTo(32, h);
        g.stroke({ width: 3, color: 0xa16207 });

        g.moveTo(-28, h + 10);
        g.lineTo(28, h - 5);
        g.stroke({ width: 1, color: 0x78350f, alpha: 0.6 });
      });

      g.rect(-18, -38, 36, 10);
      g.fill({ color: 0xfacc15 });
      g.stroke({ width: 1, color: 0x000000 });

      const currentHeight = Math.min(32, (bld.progress / bld.requiredProgress) * 32);
      if (currentHeight > 4) {
        g.poly([
          0,
          -currentHeight,
          20,
          10 - currentHeight,
          0,
          20 - currentHeight,
          -20,
          10 - currentHeight,
        ]);
        g.fill({ color: 0x64748b });
        g.stroke({ width: 0.8, color: 0x334155 });
      }
      return;
    }

    if (bld.type === 'town_hall') {
      const baseHeight = 40;
      g.poly([-44, 0, 0, 22, 0, 22 - baseHeight, -44, -baseHeight]);
      g.fill({ color: 0x475569 });
      g.stroke({ width: 1, color: 0x1e293b });

      g.poly([44, 0, 0, 22, 0, 22 - baseHeight, 44, -baseHeight]);
      g.fill({ color: 0x64748b });
      g.stroke({ width: 1, color: 0x1e293b });

      g.poly([-8, 18, 0, 22, 8, 18, 8, 4, 0, 8, -8, 4]);
      g.fill({ color: 0x3e2723 });

      g.poly([
        0,
        -baseHeight - 35,
        48,
        -baseHeight + 4,
        0,
        -baseHeight + 26,
        -48,
        -baseHeight + 4,
      ]);
      g.fill({ color: 0x991b1b });
      g.stroke({ width: 1, color: 0x450a0a });

      g.rect(-10, -baseHeight - 55, 20, 24);
      g.fill({ color: 0x64748b });

      g.poly([0, -baseHeight - 75, 14, -baseHeight - 55, -14, -baseHeight - 55]);
      g.fill({ color: 0xb91c1c });

      g.rect(-1, -baseHeight - 88, 2, 14);
      g.fill({ color: 0xd97706 });
      g.poly([1, -baseHeight - 88, 18, -baseHeight - 83, 1, -baseHeight - 78]);
      g.fill({ color: 0x38bdf8 });

      g.rect(-24, -baseHeight + 6, 8, 12);
      g.fill({ color: 0xfef08a });
      g.rect(16, -baseHeight + 6, 8, 12);
      g.fill({ color: 0xfef08a });
    } else if (bld.type === 'storage_barn') {
      const h = 26;
      g.poly([-26, 0, 0, 13, 0, 13 - h, -26, -h]);
      g.fill({ color: 0x78350f });

      g.poly([26, 0, 0, 13, 0, 13 - h, 26, -h]);
      g.fill({ color: 0x92400e });

      g.poly([0, -h - 20, 30, -h + 2, 0, -h + 16, -30, -h + 2]);
      g.fill({ color: 0xd97706 });

      g.ellipse(-20, 8, 6, 4);
      g.fill({ color: 0xb45309 });
    } else if (bld.type === 'watchtower') {
      // Tall Stone & Timber Watchtower with beacon
      const h = 52;
      g.poly([-16, 0, 0, 8, 0, 8 - h, -16, -h]);
      g.fill({ color: 0x475569 });
      g.poly([16, 0, 0, 8, 0, 8 - h, 16, -h]);
      g.fill({ color: 0x64748b });

      // Lookout platform & pointed blue spire
      g.rect(-20, -h - 6, 40, 6);
      g.fill({ color: 0x78350f });
      g.poly([0, -h - 30, 22, -h - 6, -22, -h - 6]);
      g.fill({ color: 0x0284c7 });

      // Glowing beacon window
      g.circle(0, -h + 12, 4.5);
      g.fill({ color: 0xfef08a });
    } else if (bld.type === 'lumber_mill') {
      // Sawmill with timber deck & circular saw blade
      const h = 28;
      g.poly([-24, 0, 0, 12, 0, 12 - h, -24, -h]);
      g.fill({ color: 0x713f12 });
      g.poly([24, 0, 0, 12, 0, 12 - h, 24, -h]);
      g.fill({ color: 0x854d0e });

      g.poly([0, -h - 18, 28, -h + 2, 0, -h + 14, -28, -h + 2]);
      g.fill({ color: 0x15803d });

      // Saw blade wheel on side
      g.circle(14, -10, 8);
      g.fill({ color: 0xcbd5e1 });
      g.circle(14, -10, 2.5);
      g.fill({ color: 0x334155 });
    } else if (bld.type === 'market_hall') {
      // Festive Striped Market Pavilion
      const h = 26;
      g.poly([-24, 0, 0, 12, 0, 12 - h, -24, -h]);
      g.fill({ color: 0x9a3412 });
      g.poly([24, 0, 0, 12, 0, 12 - h, 24, -h]);
      g.fill({ color: 0xc2410c });

      // Golden canopy roof
      g.poly([0, -h - 20, 28, -h + 2, 0, -h + 15, -28, -h + 2]);
      g.fill({ color: 0xeab308 });
      g.stroke({ width: 1, color: 0xca8a04 });
    } else if (bld.type === 'bakery_farm') {
      // Cozy Bakery & Windmill
      const h = 30;
      g.poly([-22, 0, 0, 11, 0, 11 - h, -22, -h]);
      g.fill({ color: 0x92400e });
      g.poly([22, 0, 0, 11, 0, 11 - h, 22, -h]);
      g.fill({ color: 0xb45309 });
      g.poly([0, -h - 20, 25, -h + 2, 0, -h + 13, -25, -h + 2]);
      g.fill({ color: 0xf59e0b });

      // Windmill vanes
      g.moveTo(-16, -h - 22);
      g.lineTo(16, -h + 4);
      g.moveTo(16, -h - 22);
      g.lineTo(-16, -h + 4);
      g.stroke({ width: 2.5, color: 0xfef08a });
    } else {
      // Cozy House / Quarry Mason
      const h = 30;
      g.poly([-22, 0, 0, 11, 0, 11 - h, -22, -h]);
      g.fill({ color: 0x475569 });

      g.poly([22, 0, 0, 11, 0, 11 - h, 22, -h]);
      g.fill({ color: 0x64748b });

      g.poly([0, -h - 22, 26, -h + 2, 0, -h + 14, -26, -h + 2]);
      g.fill({ color: 0x0284c7 });

      // Warm glowing cottage window
      g.rect(6, -16, 7, 8);
      g.fill({ color: 0xfef08a });
    }
  }
}
