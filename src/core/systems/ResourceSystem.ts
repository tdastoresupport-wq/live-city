import { WorldState } from '../state/WorldState';
import { CityActiveEvent, CityEventType, ResourceType } from '../types';
import { generateId } from '../utils/id';

export class ResourceSystem {
  private worldState: WorldState;
  private economyTimer = 0;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
  }

  public update(deltaTime: number): void {
    // 1. Regenerate depleted resource nodes
    for (const node of this.worldState.resourceNodes.values()) {
      if (node.depleted) {
        node.depletedTimer -= deltaTime;
        if (node.depletedTimer <= 0) {
          node.depleted = false;
          node.depletedTimer = 0;
          node.currentAmount = Math.round(node.maxAmount * 0.5);
          this.worldState.pushEvent(
            'system_info',
            `🌱 ${node.name} đã sinh sôi trở lại!`
          );
        }
      } else if (node.currentAmount < node.maxAmount) {
        const regenAmount = (node.regenerationRate / 60) * deltaTime;
        node.currentAmount = Math.min(
          node.maxAmount,
          Math.round((node.currentAmount + regenAmount) * 10) / 10
        );
      }
    }

    // 2. Check active city event expiration
    if (this.worldState.activeEvent && Date.now() >= this.worldState.activeEvent.endsAt) {
      const ended = this.worldState.activeEvent;
      this.worldState.activeEvent = null;
      this.worldState.pushEvent(
        'city_event',
        `🌤️ Sự kiện [${ended.name}] đã kết thúc. Thành phố trở lại nhịp sống thường nhật.`
      );
    }

    // 3. Economy tick every 15 seconds (passive building production & citizen food upkeep)
    this.economyTimer += deltaTime;
    if (this.economyTimer >= 15) {
      this.economyTimer = 0;
      this.processEconomyCycle();
    }
  }

  private processEconomyCycle(): void {
    let passiveFood = 0;
    let passiveGold = 0;

    for (const bld of this.worldState.buildings.values()) {
      if (bld.status === 'active') {
        const bp = this.worldState.blueprints.find((b) => b.type === bld.type);
        if (bp?.passiveFoodPerMin) {
          passiveFood += Math.round(bp.passiveFoodPerMin / 4);
        }
        if (bp?.passiveGoldPerMin) {
          passiveGold += Math.round(bp.passiveGoldPerMin / 4);
        }
      }
    }

    this.worldState.batch(() => {
      if (passiveFood > 0) {
        this.worldState.addResource('food', passiveFood);
      }
      if (passiveGold > 0) {
        this.worldState.addResource('gold', passiveGold);
      }

      // Active working citizens consume a small amount of food for energy
      let workingCount = 0;
      for (const c of this.worldState.citizens.values()) {
        if (!c.isResting && c.state !== 'idle') {
          workingCount++;
        }
      }

      if (workingCount > 0 && this.worldState.resources.food > 0) {
        const foodUpkeep = Math.min(
          this.worldState.resources.food,
          Math.max(1, Math.floor(workingCount / 2))
        );
        this.worldState.consumeResource('food', foodUpkeep);
      }
    });
  }

  /**
   * Trade wood/stone/food for gold, or spend gold to host a City Festival.
   */
  public tradeForGold(
    resourceType: 'wood' | 'stone' | 'food',
    amount = 20,
    traderName = 'Thương nhân'
  ): { success: boolean; goldGained: number } {
    if (amount <= 0 || this.worldState.resources[resourceType] < amount) {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Không đủ ${resourceType} trong kho để giao thương đổi Vàng!`,
        traderName
      );
      return { success: false, goldGained: 0 };
    }

    let hasMarket = false;
    for (const bld of this.worldState.buildings.values()) {
      if (bld.status === 'active' && bld.type === 'market_hall') {
        hasMarket = true;
        break;
      }
    }

    const baseGold = Math.max(1, Math.round(amount * 0.5));
    const goldGained = hasMarket ? Math.round(baseGold * 1.25) : baseGold;

    this.worldState.batch(() => {
      this.worldState.consumeResource(resourceType, amount);
      this.worldState.addResource('gold', goldGained, traderName);
      this.worldState.pushEvent(
        'resource_deposited',
        `⚖️ [${traderName}] đã giao thương ${amount} ${resourceType} thu về +${goldGained} Vàng 🪙!`,
        traderName
      );
    });

    return { success: true, goldGained };
  }

  /**
   * Trigger a community city event (P2.5).
   */
  public startCityEvent(
    type: CityEventType,
    durationSeconds = 60,
    costGold = 0
  ): CityActiveEvent | null {
    if (costGold > 0 && !this.worldState.consumeResource('gold', costGold)) {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Cần ${costGold} Vàng trong ngân khố để tổ chức lễ hội thành phố!`
      );
      return null;
    }

    const now = Date.now();
    const configs: Record<
      CityEventType,
      {
        name: string;
        description: string;
        modifiers: CityActiveEvent['modifiers'];
        instantBonus?: () => void;
      }
    > = {
      harvest_festival: {
        name: 'Lễ Hội Mùa Gặt',
        description: 'Sản lượng khai thác Gỗ, Đá, Thực phẩm tăng +50% và tốc độ cư dân +20%!',
        modifiers: { speedMultiplier: 1.2, harvestMultiplier: 1.5, buildMultiplier: 1.1 },
      },
      rain_storm: {
        name: 'Cơn Mưa Rào Mùa Hạ',
        description: 'Di chuyển chậm hơn 15% nhưng cây cối hồi phục nhanh và sản lượng gỗ +30%!',
        modifiers: { speedMultiplier: 0.85, harvestMultiplier: 1.3, buildMultiplier: 1.0 },
      },
      builders_day: {
        name: 'Ngày Hội Kiến Thiết',
        description: 'Tốc độ thi công mọi công trình tăng gấp đôi (+100%)!',
        modifiers: { speedMultiplier: 1.15, harvestMultiplier: 1.0, buildMultiplier: 2.0 },
      },
      treasure_hunt: {
        name: 'Khám Phá Kho Báu Cổ',
        description: 'Đoàn thám hiểm phát hiện rương báu (+30 Vàng, +40 EXP cho thành phố)!',
        modifiers: { speedMultiplier: 1.25, harvestMultiplier: 1.2, buildMultiplier: 1.2 },
        instantBonus: () => {
          this.worldState.addResource('gold', 30);
          this.worldState.addCityExp(40);
        },
      },
      resource_boom: {
        name: 'Mạch Khoáng Sản Trù Phú',
        description: 'Tất cả các mỏ tài nguyên được hồi phục 100% trữ lượng!',
        modifiers: { speedMultiplier: 1.1, harvestMultiplier: 1.35, buildMultiplier: 1.1 },
        instantBonus: () => {
          for (const node of this.worldState.resourceNodes.values()) {
            node.depleted = false;
            node.depletedTimer = 0;
            node.currentAmount = node.maxAmount;
          }
        },
      },
    };

    const cfg = configs[type];
    const activeEvent: CityActiveEvent = {
      id: generateId('cevt'),
      type,
      name: cfg.name,
      description: cfg.description,
      startedAt: now,
      endsAt: now + Math.max(5, durationSeconds) * 1000,
      modifiers: { ...cfg.modifiers },
    };

    this.worldState.batch(() => {
      this.worldState.activeEvent = activeEvent;
      if (cfg.instantBonus) {
        cfg.instantBonus();
      }
      this.worldState.pushEvent(
        'city_event',
        `🎊 SỰ KIỆN THÀNH PHỐ: [${cfg.name}] — ${cfg.description}`
      );
      this.worldState.notify();
    });

    return activeEvent;
  }

  public getTotalAvailable(type: ResourceType): number {
    let total = 0;
    for (const node of this.worldState.resourceNodes.values()) {
      if (node.resourceType === type && !node.depleted && node.discovered !== false) {
        total += node.currentAmount;
      }
    }
    return total;
  }
}
