import {
  WorldTile,
  ResourceNode,
  Building,
  Citizen,
  CityResources,
  CityStats,
  GameEvent,
  GameEventType,
  BuildingBlueprint,
  ResourceType,
} from '../types';
import {
  createInitialTileMap,
  createInitialResourceNodes,
  createInitialBuildings,
  createInitialResources,
  createInitialStats,
  INITIAL_BLUEPRINTS,
  MAP_WIDTH,
  MAP_HEIGHT,
} from './initialWorld';
import { generateId } from '../utils/id';

export interface WorldSnapshot {
  version: number;
  timestamp: number;
  resources: CityResources;
  stats: CityStats;
  citizens: Citizen[];
  buildings: Building[];
  resourceNodes: ResourceNode[];
}

export type StateListener = () => void;

export class WorldState {
  public tileMap: Map<string, WorldTile>;
  public resourceNodes: Map<string, ResourceNode>;
  public buildings: Map<string, Building>;
  public citizens: Map<string, Citizen>;
  public userCitizenMap: Map<string, string>; // userId -> citizenId
  public resources: CityResources;
  public stats: CityStats;
  public blueprints: BuildingBlueprint[];
  public eventLog: GameEvent[];

  private maxEventLogSize = 100;
  private listeners: Set<StateListener> = new Set();
  private maxStorage: CityResources = {
    wood: 1000,
    stone: 1000,
    food: 1000,
    gold: 500,
  };

  constructor() {
    this.tileMap = createInitialTileMap();
    this.resourceNodes = new Map();
    this.buildings = new Map();
    this.citizens = new Map();
    this.userCitizenMap = new Map();
    this.resources = createInitialResources();
    this.stats = createInitialStats();
    this.blueprints = [...INITIAL_BLUEPRINTS];
    this.eventLog = [];

    this.resetToInitial();
  }

  public resetToInitial(): void {
    this.tileMap = createInitialTileMap();
    this.resourceNodes.clear();
    createInitialResourceNodes().forEach((node) => this.resourceNodes.set(node.id, node));

    this.buildings.clear();
    createInitialBuildings().forEach((bld) => this.buildings.set(bld.id, bld));

    this.citizens.clear();
    this.userCitizenMap.clear();

    this.resources = createInitialResources();
    this.stats = createInitialStats();
    this.eventLog = [];

    this.pushEvent(
      'system_info',
      'Thành phố Live City đã khởi động. Sẵn sàng đón cư dân mới!'
    );

    this.notify();
  }

  // --- Observability & Subscriptions ---
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }

  // --- Events ---
  public pushEvent(
    type: GameEventType,
    message: string,
    author?: string,
    data?: Record<string, unknown>
  ): GameEvent {
    const event: GameEvent = {
      id: generateId('evt'),
      timestamp: Date.now(),
      type,
      message,
      author,
      data,
    };

    this.eventLog.unshift(event);
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog.pop();
    }

    return event;
  }

  // --- Invariant Guarded Resource Management ---
  public addResource(type: ResourceType, amount: number, _contributorName?: string): boolean {
    if (amount <= 0) return false;

    const current = this.resources[type];
    const cap = this.maxStorage[type];
    const actualAdd = Math.min(amount, Math.max(0, cap - current));

    if (actualAdd <= 0) {
      return false;
    }

    this.resources[type] += actualAdd;

    // Award city exp
    this.addCityExp(Math.max(1, Math.round(actualAdd / 5)));

    this.notify();
    return true;
  }

  public consumeResource(type: ResourceType, amount: number): boolean {
    if (amount <= 0) return false;
    if (this.resources[type] < amount) {
      return false; // Invariant: no negative resources
    }

    this.resources[type] -= amount;
    this.notify();
    return true;
  }

  public addCityExp(amount: number): void {
    this.stats.exp += amount;
    while (this.stats.exp >= this.stats.expToNextLevel) {
      this.stats.exp -= this.stats.expToNextLevel;
      this.stats.level += 1;
      this.stats.expToNextLevel = Math.round(this.stats.expToNextLevel * 1.5);

      this.pushEvent(
        'city_leveled_up',
        `🎉 Chúc mừng! Live City vừa thăng cấp lên Cấp ${this.stats.level}!`
      );
    }
  }

  // --- Citizens ---
  public getCitizenByUserId(userId: string): Citizen | undefined {
    const id = this.userCitizenMap.get(userId);
    return id ? this.citizens.get(id) : undefined;
  }

  public registerCitizen(citizen: Citizen): void {
    this.citizens.set(citizen.id, citizen);
    this.userCitizenMap.set(citizen.userId, citizen.id);
    this.stats.citizensCount = this.citizens.size;
    this.notify();
  }

  // --- Buildings ---
  public getActiveUnderConstruction(): Building | undefined {
    for (const bld of this.buildings.values()) {
      if (bld.status === 'constructing') {
        return bld;
      }
    }
    return undefined;
  }

  public applyBuildProgress(
    buildingId: string,
    progressAmount: number,
    userId: string,
    userName: string
  ): { completed: boolean; currentProgress: number; requiredProgress: number } | null {
    const building = this.buildings.get(buildingId);
    if (!building || building.status !== 'constructing') {
      return null;
    }

    building.progress = Math.min(building.requiredProgress, building.progress + progressAmount);
    building.contributions[userId] = (building.contributions[userId] || 0) + progressAmount;

    let completed = false;
    if (building.progress >= building.requiredProgress) {
      building.status = 'active';
      building.completedAt = Date.now();
      completed = true;

      // Apply storage bonus if applicable
      const blueprint = this.blueprints.find((b) => b.type === building.type);
      if (blueprint?.storageBonus) {
        if (blueprint.storageBonus.wood) this.maxStorage.wood += blueprint.storageBonus.wood;
        if (blueprint.storageBonus.stone) this.maxStorage.stone += blueprint.storageBonus.stone;
      }

      this.pushEvent(
        'building_completed',
        `🏛️ Công trình [${building.name}] đã hoàn thành xuất sắc! Cảm ơn mọi cư dân!`,
        userName,
        { buildingId: building.id, buildingType: building.type }
      );
      this.addCityExp(50);
    } else {
      this.pushEvent(
        'building_progress',
        `🔨 ${userName} đã góp sức xây [${building.name}] (${building.progress}/${building.requiredProgress})`,
        userName
      );
    }

    this.notify();
    return {
      completed,
      currentProgress: building.progress,
      requiredProgress: building.requiredProgress,
    };
  }

  // --- Snapshot Serialization / Persistence ---
  public toSnapshot(): WorldSnapshot {
    return {
      version: 1,
      timestamp: Date.now(),
      resources: { ...this.resources },
      stats: { ...this.stats },
      citizens: Array.from(this.citizens.values()),
      buildings: Array.from(this.buildings.values()),
      resourceNodes: Array.from(this.resourceNodes.values()),
    };
  }

  public loadSnapshot(snapshot: WorldSnapshot): boolean {
    try {
      if (!snapshot || snapshot.version !== 1) return false;

      this.resources = { ...snapshot.resources };
      this.stats = { ...snapshot.stats };

      this.citizens.clear();
      this.userCitizenMap.clear();
      if (Array.isArray(snapshot.citizens)) {
        snapshot.citizens.forEach((c) => {
          this.citizens.set(c.id, c);
          this.userCitizenMap.set(c.userId, c.id);
        });
      }

      this.buildings.clear();
      if (Array.isArray(snapshot.buildings)) {
        snapshot.buildings.forEach((b) => this.buildings.set(b.id, b));
      }

      this.resourceNodes.clear();
      if (Array.isArray(snapshot.resourceNodes)) {
        snapshot.resourceNodes.forEach((n) => this.resourceNodes.set(n.id, n));
      }

      this.pushEvent('system_info', 'Trạng thái thành phố đã được khôi phục thành công.');
      this.notify();
      return true;
    } catch (e) {
      console.error('Failed to load snapshot:', e);
      return false;
    }
  }

  public getGridDimensions(): { width: number; height: number } {
    return { width: MAP_WIDTH, height: MAP_HEIGHT };
  }
}
