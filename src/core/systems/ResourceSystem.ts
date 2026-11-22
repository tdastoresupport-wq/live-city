import { WorldState } from '../state/WorldState';
import { ResourceType } from '../types';

export class ResourceSystem {
  private worldState: WorldState;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
  }

  public update(deltaTime: number): void {
    // Regenerate depleted resource nodes
    for (const node of this.worldState.resourceNodes.values()) {
      if (node.depleted) {
        node.depletedTimer -= deltaTime;
        if (node.depletedTimer <= 0) {
          node.depleted = false;
          node.currentAmount = Math.round(node.maxAmount * 0.5); // restore to 50% first
          this.worldState.pushEvent(
            'system_info',
            `🌱 ${node.name} đã sinh sôi trở lại!`
          );
        }
      } else if (node.currentAmount < node.maxAmount) {
        // Subtle passive regeneration
        const regenAmount = (node.regenerationRate / 60) * deltaTime;
        node.currentAmount = Math.min(node.maxAmount, node.currentAmount + regenAmount);
      }
    }
  }

  public getTotalAvailable(type: ResourceType): number {
    let total = 0;
    for (const node of this.worldState.resourceNodes.values()) {
      if (node.resourceType === type && !node.depleted) {
        total += node.currentAmount;
      }
    }
    return total;
  }
}
