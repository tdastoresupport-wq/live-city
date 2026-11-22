import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Citizen } from '../core/types';
import { isoToScreen, lerp } from '../core/utils/math';

export const MAX_RENDERED_CITIZENS = 60;

const SHARED_NAME_STYLE = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 10,
  fontWeight: '700',
  fill: '#ffffff',
  stroke: { color: '#090d16', width: 2.5 },
});

const SHARED_FLOAT_STYLE = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 11,
  fontWeight: '800',
  fill: '#38bdf8',
  stroke: { color: '#090d16', width: 2.5 },
});

interface CitizenView {
  container: Container;
  bodyGraphics: Graphics;
  badgeGraphics: Graphics;
  nameLabel: Text;
  floatingTextLabel: Text;
  bobTime: number;
  renderX: number;
  renderY: number;
  targetX: number;
  targetY: number;
  isMoving: boolean;
  lastStateKey: string;
  citizen: Citizen;
}

export class EntityRenderer {
  public container: Container;
  private citizenViews: Map<string, CitizenView> = new Map();

  constructor(sharedSceneContainer?: Container) {
    this.container = sharedSceneContainer || new Container();
  }

  public syncCitizens(citizens: Iterable<Citizen>): void {
    const activeIds = new Set<string>();
    let renderedCount = 0;

    for (const citizen of citizens) {
      if (citizen.isResting || renderedCount >= MAX_RENDERED_CITIZENS) {
        continue;
      }
      renderedCount++;
      activeIds.add(citizen.id);

      let view = this.citizenViews.get(citizen.id);
      if (!view) {
        const cContainer = new Container();
        const bodyGraphics = new Graphics();
        const badgeGraphics = new Graphics();

        const nameLabel = new Text({
          text: citizen.userName,
          style: SHARED_NAME_STYLE,
        });
        nameLabel.anchor.set(0.5, 1);
        nameLabel.position.set(0, -33);

        const floatingTextLabel = new Text({
          text: '',
          style: SHARED_FLOAT_STYLE.clone(),
        });
        floatingTextLabel.anchor.set(0.5, 1);
        floatingTextLabel.position.set(0, -46);
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
          renderX: citizen.x,
          renderY: citizen.y,
          targetX: citizen.x,
          targetY: citizen.y,
          isMoving: false,
          lastStateKey: '',
          citizen,
        };
        this.citizenViews.set(citizen.id, view);
      }

      view.targetX = citizen.x;
      view.targetY = citizen.y;
      view.citizen = citizen;

      const distToTarget = Math.hypot(view.targetX - view.renderX, view.targetY - view.renderY);
      if (distToTarget > 3.5) {
        // Snap if teleported or newly spawned far away
        view.renderX = citizen.x;
        view.renderY = citizen.y;
      }
      view.isMoving = citizen.path.length > 0 || distToTarget > 0.04;

      const screenPos = isoToScreen(view.renderX, view.renderY);
      view.container.position.set(screenPos.x, screenPos.y);
      view.container.zIndex = (view.renderX + view.renderY) * 100 + 20;

      if (citizen.floatingText) {
        if (view.floatingTextLabel.text !== citizen.floatingText.text) {
          view.floatingTextLabel.text = citizen.floatingText.text;
          view.floatingTextLabel.style.fill = citizen.floatingText.color;
        }
        view.floatingTextLabel.visible = true;
      } else {
        view.floatingTextLabel.visible = false;
      }

      const stateKey = `${citizen.state}_${citizen.carriedResource?.type || 'none'}_${citizen.color}`;
      if (view.lastStateKey !== stateKey || view.isMoving || citizen.state === 'harvesting' || citizen.state === 'building') {
        view.lastStateKey = stateKey;
        this.drawCitizen(view, citizen);
      }
    }

    for (const [id, view] of this.citizenViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        view.container.destroy({ children: true });
        this.citizenViews.delete(id);
      }
    }
  }

  public update(deltaTime: number): void {
    for (const view of this.citizenViews.values()) {
      // Smooth 60fps position interpolation
      const dx = view.targetX - view.renderX;
      const dy = view.targetY - view.renderY;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.005) {
        const t = Math.min(1, deltaTime * 12);
        view.renderX = lerp(view.renderX, view.targetX, t);
        view.renderY = lerp(view.renderY, view.targetY, t);
        const screenPos = isoToScreen(view.renderX, view.renderY);
        view.container.position.set(screenPos.x, screenPos.y);
        view.container.zIndex = (view.renderX + view.renderY) * 100 + 20;
      }

      if (view.isMoving || view.citizen.state === 'harvesting' || view.citizen.state === 'building') {
        view.bobTime += deltaTime * 11;
        this.drawCitizen(view, view.citizen);
      }
    }
  }

  private drawCitizen(view: CitizenView, citizen: Citizen): void {
    const bg = view.bodyGraphics;
    const tg = view.badgeGraphics;
    bg.clear();
    tg.clear();

    const bobOffset = view.isMoving ? Math.abs(Math.sin(view.bobTime)) * 3 : 0;
    const toolSwing =
      citizen.state === 'harvesting' || citizen.state === 'building'
        ? Math.sin(view.bobTime * 1.4) * 3
        : 0;

    bg.ellipse(0, 2, 8, 4);
    bg.fill({ color: 0x000000, alpha: 0.3 });

    const baseY = -bobOffset;

    bg.rect(-4, baseY - 6, 3, 6);
    bg.fill({ color: 0x1e293b });
    bg.rect(1, baseY - 6, 3, 6);
    bg.fill({ color: 0x1e293b });

    const hexColor = parseInt(citizen.color.replace('#', '0x'), 16) || 0x38bdf8;
    bg.roundRect(-6, baseY - 18, 12, 13, 3);
    bg.fill({ color: hexColor });
    bg.stroke({ width: 0.6, color: 0x0f172a });

    bg.circle(0, baseY - 22, 5);
    bg.fill({ color: 0xfde047 });
    bg.stroke({ width: 0.6, color: 0x854d0e });

    bg.poly([-6, baseY - 24, 0, baseY - 30, 6, baseY - 24]);
    bg.fill({ color: hexColor });

    if (citizen.state === 'harvesting' || citizen.state === 'moving_to_harvest') {
      const isWood =
        citizen.floatingText?.text.includes('Gỗ') ||
        citizen.floatingText?.text.includes('chặt') ||
        citizen.floatingText?.text.includes('đốn');
      if (isWood) {
        tg.rect(6, baseY - 20 + toolSwing, 2, 10);
        tg.fill({ color: 0x78350f });
        tg.poly([
          8,
          baseY - 22 + toolSwing,
          12,
          baseY - 20 + toolSwing,
          8,
          baseY - 18 + toolSwing,
        ]);
        tg.fill({ color: 0x94a3b8 });
      } else {
        tg.rect(6, baseY - 20 + toolSwing, 2, 10);
        tg.fill({ color: 0x78350f });
        tg.poly([
          5,
          baseY - 22 + toolSwing,
          13,
          baseY - 22 + toolSwing,
          7,
          baseY - 18 + toolSwing,
        ]);
        tg.fill({ color: 0x64748b });
      }
    } else if (citizen.state === 'carrying_resource') {
      tg.roundRect(-10, baseY - 20, 6, 9, 2);
      const sackColor =
        citizen.carriedResource?.type === 'wood'
          ? 0xb45309
          : citizen.carriedResource?.type === 'stone'
          ? 0x64748b
          : citizen.carriedResource?.type === 'food'
          ? 0xf43f5e
          : 0xfacc15;
      tg.fill({ color: sackColor });
      tg.stroke({ width: 0.6, color: 0x0f172a });
    } else if (citizen.state === 'building' || citizen.state === 'moving_to_build') {
      tg.rect(6, baseY - 18 + toolSwing, 2, 9);
      tg.fill({ color: 0x78350f });
      tg.rect(5, baseY - 22 + toolSwing, 6, 4);
      tg.fill({ color: 0x475569 });
    }
  }
}
