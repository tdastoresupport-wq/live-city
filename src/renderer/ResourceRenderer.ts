import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ResourceNode } from '../core/types';
import { isoToScreen } from '../core/utils/math';

const SHARED_NODE_LABEL_STYLE = new TextStyle({
  fontFamily: 'Outfit, sans-serif',
  fontSize: 10,
  fontWeight: '700',
  fill: '#f8fafc',
  stroke: { color: '#0f172a', width: 2.5 },
});

interface NodeView {
  container: Container;
  graphics: Graphics;
  label: Text;
  node: ResourceNode;
  lastDepleted: boolean;
  lastAmount: number;
  hitShakeTimer: number;
}

export class ResourceRenderer {
  public container: Container;
  private nodeViews: Map<string, NodeView> = new Map();
  private time = 0;

  constructor(sharedSceneContainer?: Container) {
    this.container = sharedSceneContainer || new Container();
  }

  public syncNodes(nodes: Iterable<ResourceNode>): void {
    const activeIds = new Set<string>();

    for (const node of nodes) {
      activeIds.add(node.id);
      let view = this.nodeViews.get(node.id);

      if (!view) {
        const nodeContainer = new Container();
        const graphics = new Graphics();
        nodeContainer.addChild(graphics);

        const label = new Text({
          text: `${Math.round(node.currentAmount)}`,
          style: SHARED_NODE_LABEL_STYLE.clone(),
        });
        label.anchor.set(0.5, 1);
        label.position.set(0, -44);
        nodeContainer.addChild(label);

        this.container.addChild(nodeContainer);
        view = {
          container: nodeContainer,
          graphics,
          label,
          node,
          lastDepleted: !node.depleted, // force initial draw
          lastAmount: node.currentAmount,
          hitShakeTimer: 0,
        };
        this.nodeViews.set(node.id, view);
      }

      // Hide undiscovered nodes under Fog of War
      const isDiscovered = node.discovered !== false;
      view.container.visible = isDiscovered;
      if (!isDiscovered) continue;

      const screenPos = isoToScreen(node.x, node.y);
      view.container.position.set(screenPos.x, screenPos.y);
      // Unified isometric depth sorting key
      view.container.zIndex = (node.x + node.y) * 100 + 10;

      // Trigger harvest hit shake if amount dropped
      if (node.currentAmount < view.lastAmount) {
        view.hitShakeTimer = 0.25;
      }
      view.lastAmount = node.currentAmount;
      view.node = node;

      const nextText = node.depleted
        ? `🌱 ${Math.ceil(node.depletedTimer)}s`
        : `${Math.round(node.currentAmount)}/${node.maxAmount}`;

      if (view.label.text !== nextText) {
        view.label.text = nextText;
        view.label.style.fill = node.depleted
          ? '#facc15'
          : node.resourceType === 'wood'
          ? '#86efac'
          : node.resourceType === 'stone'
          ? '#93c5fd'
          : node.resourceType === 'food'
          ? '#fda4af'
          : '#fde047';
      }

      // Dirty check: only rebuild Graphics geometry when depleted state changes
      if (view.lastDepleted !== node.depleted) {
        view.lastDepleted = node.depleted;
        this.drawNode(view.graphics, node);
      }
    }

    for (const [id, view] of this.nodeViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        view.container.destroy({ children: true });
        this.nodeViews.delete(id);
      }
    }
  }

  public update(deltaTime: number): void {
    this.time += deltaTime;

    for (const view of this.nodeViews.values()) {
      if (!view.container.visible) continue;

      if (view.hitShakeTimer > 0) {
        view.hitShakeTimer = Math.max(0, view.hitShakeTimer - deltaTime);
        view.graphics.x = Math.sin(this.time * 45) * 2.5;
      } else {
        view.graphics.x = 0;
      }

      if (view.node.type === 'tree' && !view.node.depleted) {
        view.graphics.skew.x = Math.sin(this.time * 2 + view.node.x) * 0.035;
      }
    }
  }

  private drawNode(g: Graphics, node: ResourceNode): void {
    g.clear();

    g.ellipse(0, 4, 18, 9);
    g.fill({ color: 0x000000, alpha: 0.24 });

    if (node.depleted) {
      if (node.type === 'tree' || node.type === 'berry_bush') {
        g.rect(-5, -6, 10, 8);
        g.fill({ color: 0x5c4033 });
        g.ellipse(0, -6, 5, 2.5);
        g.fill({ color: 0x8b5a2b });
      } else {
        g.poly([-6, -2, -2, -6, 4, -4, 8, -1, 3, 3, -4, 2]);
        g.fill({ color: 0x64748b });
      }
      return;
    }

    if (node.type === 'tree') {
      g.rect(-4, -14, 8, 16);
      g.fill({ color: 0x5c3822 });
      g.stroke({ width: 0.8, color: 0x3d2314 });

      g.poly([0, -42, 20, -18, 0, -12, -20, -18]);
      g.fill({ color: 0x15803d });
      g.stroke({ width: 0.8, color: 0x166534 });

      g.poly([0, -52, 16, -30, 0, -24, -16, -30]);
      g.fill({ color: 0x16a34a });
      g.stroke({ width: 0.8, color: 0x15803d });

      g.poly([0, -62, 11, -44, 0, -40, -11, -44]);
      g.fill({ color: 0x22c55e });
      g.stroke({ width: 0.8, color: 0x16a34a });
    } else if (node.type === 'berry_bush') {
      // Cozy Berry Orchard Bush
      g.circle(-7, -10, 9);
      g.circle(7, -10, 9);
      g.circle(0, -16, 10);
      g.fill({ color: 0x15803d });
      g.stroke({ width: 0.8, color: 0x14532d });

      // Red/Pink ripe berries
      const berries = [
        { x: -6, y: -12 },
        { x: 5, y: -11 },
        { x: 0, y: -18 },
        { x: -2, y: -8 },
        { x: 3, y: -15 },
      ];
      berries.forEach((b) => {
        g.circle(b.x, b.y, 2.2);
        g.fill({ color: 0xf43f5e });
      });
    } else if (node.type === 'gold_vein') {
      // Sparkling Gold Ore Vein
      g.poly([0, -30, -15, -10, -11, 4, 0, 6]);
      g.fill({ color: 0x78350f });
      g.poly([0, -30, 0, 6, 14, 2, 15, -12]);
      g.fill({ color: 0xb45309 });

      // Gold Crystal Spikes
      g.poly([-4, -22, 0, -34, 4, -22]);
      g.poly([4, -16, 10, -26, 11, -14]);
      g.fill({ color: 0xfacc15 });
      g.stroke({ width: 0.8, color: 0xfef08a });
    } else {
      // Granite / Crystal Rock
      g.poly([0, -32, -16, -10, -12, 4, 0, 6]);
      g.fill({ color: 0x475569 });

      g.poly([0, -32, 0, 6, 14, 2, 16, -12]);
      g.fill({ color: 0x94a3b8 });

      g.poly([0, -32, 6, -18, 0, -14, -6, -18]);
      g.fill({ color: 0xcfd8dc });
      g.stroke({ width: 0.8, color: 0x334155 });

      g.poly([2, -22, 5, -16, 3, -13]);
      g.fill({ color: 0x38bdf8 });
    }
  }
}
