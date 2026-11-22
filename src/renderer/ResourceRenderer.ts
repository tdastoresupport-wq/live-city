import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ResourceNode } from '../core/types';
import { isoToScreen } from '../core/utils/math';

export class ResourceRenderer {
  public container: Container;
  private nodeViews: Map<string, { container: Container; graphics: Graphics; label: Text; node: ResourceNode }> = new Map();
  private time = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'ResourceRenderer';
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

        // Simple text badge for remaining amount
        const style = new TextStyle({
          fontFamily: 'Outfit, sans-serif',
          fontSize: 10,
          fontWeight: '600',
          fill: '#f8fafc',
          stroke: { color: '#0f172a', width: 2 },
        });
        const label = new Text({ text: `${node.currentAmount}`, style });
        label.anchor.set(0.5, 1);
        label.position.set(0, -42);
        nodeContainer.addChild(label);

        this.container.addChild(nodeContainer);
        view = { container: nodeContainer, graphics, label, node };
        this.nodeViews.set(node.id, view);
      }

      // Update position and depth sorting
      const screenPos = isoToScreen(node.x, node.y);
      view.container.position.set(screenPos.x, screenPos.y);
      view.container.zIndex = node.x + node.y;
      view.node = node;

      // Update badge
      if (node.depleted) {
        view.label.text = `🌱 ${Math.ceil(node.depletedTimer)}s`;
        view.label.style.fill = '#facc15';
      } else {
        view.label.text = `${node.currentAmount}/${node.maxAmount}`;
        view.label.style.fill = node.resourceType === 'wood' ? '#86efac' : '#93c5fd';
      }

      this.drawNode(view.graphics, node);
    }

    // Clean up removed nodes
    for (const [id, view] of this.nodeViews.entries()) {
      if (!activeIds.has(id)) {
        this.container.removeChild(view.container);
        this.nodeViews.delete(id);
      }
    }

    this.container.sortChildren();
  }

  public update(deltaTime: number): void {
    this.time += deltaTime;

    // Gentle wind sway on trees
    for (const view of this.nodeViews.values()) {
      if (view.node.type === 'tree' && !view.node.depleted) {
        const sway = Math.sin(this.time * 2 + view.node.x) * 0.04;
        view.graphics.skew.x = sway;
      }
    }
  }

  private drawNode(g: Graphics, node: ResourceNode): void {
    g.clear();

    // Ground shadow
    g.ellipse(0, 4, 18, 9);
    g.fill({ color: 0x000000, alpha: 0.22 });

    if (node.depleted) {
      // Depleted stump or rubble
      if (node.type === 'tree') {
        g.rect(-5, -6, 10, 8);
        g.fill({ color: 0x5c4033 });
        g.ellipse(0, -6, 5, 2.5);
        g.fill({ color: 0x8b5a2b });
      } else {
        // Rock rubble
        g.poly([-6, -2, -2, -6, 4, -4, 8, -1, 3, 3, -4, 2]);
        g.fill({ color: 0x64748b });
      }
      return;
    }

    if (node.type === 'tree') {
      // Stylized Isometric Oak / Pine Tree
      // Trunk
      g.rect(-4, -14, 8, 16);
      g.fill({ color: 0x5c3822 });
      g.stroke({ width: 0.8, color: 0x3d2314 });

      // Bottom Foliage layer
      g.poly([
        0, -42,
        20, -18,
        0, -12,
        -20, -18,
      ]);
      g.fill({ color: 0x15803d });
      g.stroke({ width: 0.8, color: 0x166534 });

      // Mid Foliage layer
      g.poly([
        0, -52,
        16, -30,
        0, -24,
        -16, -30,
      ]);
      g.fill({ color: 0x16a34a });
      g.stroke({ width: 0.8, color: 0x15803d });

      // Top Crown
      g.poly([
        0, -62,
        11, -44,
        0, -40,
        -11, -44,
      ]);
      g.fill({ color: 0x22c55e });
      g.stroke({ width: 0.8, color: 0x16a34a });
    } else {
      // Stylized Faceted Granite / Crystal Rock
      // Left Facet (dark)
      g.poly([
        0, -32,
        -16, -10,
        -12, 4,
        0, 6,
      ]);
      g.fill({ color: 0x475569 });

      // Right Facet (light)
      g.poly([
        0, -32,
        0, 6,
        14, 2,
        16, -12,
      ]);
      g.fill({ color: 0x94a3b8 });

      // Top highlight
      g.poly([
        0, -32,
        6, -18,
        0, -14,
        -6, -18,
      ]);
      g.fill({ color: 0xcfd8dc });
      g.stroke({ width: 0.8, color: 0x334155 });

      // Crystal vein spark
      g.poly([
        2, -22,
        5, -16,
        3, -13,
      ]);
      g.fill({ color: 0x38bdf8 });
    }
  }
}
