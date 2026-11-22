import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Citizen } from '../core/types';
import { isoToScreen } from '../core/utils/math';

interface CitizenView {
  container: Container;
  bodyGraphics: Graphics;
  badgeGraphics: Graphics;
  nameLabel: Text;
  floatingTextLabel: Text;
  bobTime: number;
}

export class EntityRenderer {
  public container: Container;
  private citizenViews: Map<string, CitizenView> = new Map();

  constructor() {
    this.container = new Container();
    this.container.label = 'EntityRenderer';
  }

  public syncCitizens(citizens: Iterable<Citizen>): void {
    const activeIds = new Set<string>();

    for (const citizen of citizens) {
      activeIds.add(citizen.id);
      let view = this.citizenViews.get(citizen.id);

      if (!view) {
        const cContainer = new Container();
        const bodyGraphics = new Graphics();
        const badgeGraphics = new Graphics();

        const nameStyle = new TextStyle({
          fontFamily: 'Outfit, sans-serif',
          fontSize: 10,
          fontWeight: '700',
          fill: '#ffffff',
          stroke: { color: '#090d16', width: 2.5 },
        });
        const nameLabel = new Text({ text: citizen.userName, style: nameStyle });
        nameLabel.anchor.set(0.5, 1);
        nameLabel.position.set(0, -32);

        const floatStyle = new TextStyle({
          fontFamily: 'Outfit, sans-serif',
          fontSize: 11,
          fontWeight: '800',
          fill: '#38bdf8',
          stroke: { color: '#090d16', width: 2.5 },
        });
        const floatingTextLabel = new Text({ text: '', style: floatStyle });
        floatingTextLabel.anchor.set(0.5, 1);
        floatingTextLabel.position.set(0, -45);
        floatingTextLabel.visible = false;

        cContainer.addChild(bodyGraphics);
        cContainer.addChild(badgeGraphics);
        cContainer.addChild(nameLabel);
        cContainer.addChild(floatingTextLabel);

        this.container.addChild(cContainer);
        view = {
          container: cContainer,
          bodyGraphics,
          badgeGraphics,
          nameLabel,
          floatingTextLabel,
          bobTime: Math.random() * 10,
        };
        this.citizenViews.set(citizen.id, view);
      }

      // Update position
      const screenPos = isoToScreen(citizen.x, citizen.y);
      view.container.position.set(screenPos.x, screenPos.y);
      // zIndex according to isometric sorting (x + y)
      view.container.zIndex = citizen.x + citizen.y + 0.2;

      // Update floating text
      if (citizen.floatingText) {
        view.floatingTextLabel.text = citizen.floatingText.text;
        view.floatingTextLabel.style.fill = citizen.floatingText.color;
        view.floatingTextLabel.visible = true;
      } else {
        view.floatingTextLabel.visible = false;
      }

      this.drawCitizen(view, citizen);
    }

    // Clean up disconnected citizens
    for (const [id, view] of this.citizenViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        this.citizenViews.delete(id);
      }
    }

    this.container.sortChildren();
  }

  public update(deltaTime: number): void {
    for (const view of this.citizenViews.values()) {
      view.bobTime += deltaTime * 10;
    }
  }

  private drawCitizen(view: CitizenView, citizen: Citizen): void {
    const bg = view.bodyGraphics;
    const tg = view.badgeGraphics;
    bg.clear();
    tg.clear();

    const isMoving = citizen.path.length > 0;
    const bobOffset = isMoving ? Math.abs(Math.sin(view.bobTime)) * 3 : 0;

    // Ground Shadow
    bg.ellipse(0, 2, 8, 4);
    bg.fill({ color: 0x000000, alpha: 0.3 });

    const baseY = -bobOffset;

    // Legs / Feet
    bg.rect(-4, baseY - 6, 3, 6);
    bg.fill({ color: 0x1e293b });
    bg.rect(1, baseY - 6, 3, 6);
    bg.fill({ color: 0x1e293b });

    // Tunic Body with user's avatar color
    const hexColor = parseInt(citizen.color.replace('#', '0x'), 16) || 0x38bdf8;
    bg.roundRect(-6, baseY - 18, 12, 13, 3);
    bg.fill({ color: hexColor });
    bg.stroke({ width: 0.6, color: 0x0f172a });

    // Head
    bg.circle(0, baseY - 22, 5);
    bg.fill({ color: 0xfde047 }); // warm cozy skin tone
    bg.stroke({ width: 0.6, color: 0x854d0e });

    // Cap / Hat
    bg.poly([
      -6, baseY - 24,
      0, baseY - 30,
      6, baseY - 24,
    ]);
    bg.fill({ color: hexColor });

    // Status / Tool representation
    if (citizen.state === 'harvesting' || citizen.state === 'moving_to_harvest') {
      const isWood = citizen.floatingText?.text.includes('Gỗ') || citizen.floatingText?.text.includes('chặt') || citizen.floatingText?.text.includes('đốn');
      // Tool in hand
      if (isWood) {
        // Axe handle & blade
        tg.rect(6, baseY - 20, 2, 10);
        tg.fill({ color: 0x78350f });
        tg.poly([8, baseY - 22, 12, baseY - 20, 8, baseY - 18]);
        tg.fill({ color: 0x94a3b8 });
      } else {
        // Pickaxe
        tg.rect(6, baseY - 20, 2, 10);
        tg.fill({ color: 0x78350f });
        tg.poly([5, baseY - 22, 13, baseY - 22, 7, baseY - 18]);
        tg.fill({ color: 0x64748b });
      }
    } else if (citizen.state === 'carrying_resource') {
      // Backpack / sack of timber or stone on back
      tg.roundRect(-9, baseY - 20, 6, 9, 2);
      const sackColor = citizen.carriedResource?.type === 'wood' ? 0xb45309 : 0x64748b;
      tg.fill({ color: sackColor });
    } else if (citizen.state === 'building' || citizen.state === 'moving_to_build') {
      // Hammer
      tg.rect(6, baseY - 18, 2, 9);
      tg.fill({ color: 0x78350f });
      tg.rect(5, baseY - 22, 6, 4);
      tg.fill({ color: 0x475569 });
    }
  }
}
