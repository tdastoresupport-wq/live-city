import type {
  WorldTile,
  ResourceNode,
  Building,
  BuildingType,
  Citizen,
  CityResources,
  CityStats,
  CityMilestone,
  GameEvent,
  GameEventType,
  BuildingBlueprint,
  ResourceType,
  VotingSession,
  CityActiveEvent,
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
import { distance } from '../utils/math';

export interface WorldSnapshot {
  version: number;
  timestamp: number;
  resources: CityResources;
  maxStorage?: CityResources;
  stats: CityStats;
  citizens: Citizen[];
  buildings: Building[];
  resourceNodes: ResourceNode[];
  discoveredTiles?: string[];
  activeVote?: VotingSession | null;
  voteHistory?: VotingSession[];
  activeEvent?: CityActiveEvent | null;
  milestones?: CityMilestone[];
  pendingVotedProject?: BuildingType | null;
  eventLog?: GameEvent[];
}

export type StateListener = () => void;

export const INITIAL_MAX_STORAGE: CityResources = {
  wood: 1000,
  stone: 1000,
  food: 1000,
  gold: 500,
};

export class WorldState {
  public tileMap: Map<string, WorldTile>;
  public resourceNodes: Map<string, ResourceNode>;
  public buildings: Map<string, Building>;
  public citizens: Map<string, Citizen>;
  public userCitizenMap: Map<string, string>; // userId -> citizenId
  public resources: CityResources;
  public maxStorage: CityResources;
  public stats: CityStats;
  public blueprints: BuildingBlueprint[];
  public eventLog: GameEvent[];
  public activeVote: VotingSession | null = null;
  public voteHistory: VotingSession[] = [];
  public activeEvent: CityActiveEvent | null = null;
  public milestones: CityMilestone[] = [];
  public pendingVotedProject: BuildingType | null = null;

  private maxEventLogSize = 100;
  private listeners: Set<StateListener> = new Set();
  private batchDepth = 0;
  private isDirty = false;
  private stateVersion = 0;
  private cachedDiscoveredTiles: string[] | null = null;

  constructor() {
    this.tileMap = createInitialTileMap();
    this.resourceNodes = new Map();
    this.buildings = new Map();
    this.citizens = new Map();
    this.userCitizenMap = new Map();
    this.resources = createInitialResources();
    this.maxStorage = { ...INITIAL_MAX_STORAGE };
    this.stats = createInitialStats();
    this.blueprints = [...INITIAL_BLUEPRINTS];
    this.eventLog = [];

    this.resetToInitial();
  }

  public resetToInitial(): void {
    this.batch(() => {
      this.tileMap = createInitialTileMap();
      this.resourceNodes.clear();
      createInitialResourceNodes().forEach((node) => this.resourceNodes.set(node.id, node));

      this.buildings.clear();
      createInitialBuildings().forEach((bld) => this.buildings.set(bld.id, bld));

      this.citizens.clear();
      this.userCitizenMap.clear();

      this.resources = createInitialResources();
      this.maxStorage = { ...INITIAL_MAX_STORAGE };
      this.stats = createInitialStats();
      this.stats.exploredPercentage = this.calculateExploredPercentage();
      this.activeVote = null;
      this.voteHistory = [];
      this.activeEvent = null;
      this.milestones = [];
      this.pendingVotedProject = null;
      this.cachedDiscoveredTiles = null;
      this.eventLog = [];

      this.pushEvent(
        'system_info',
        'Thành phố Live City đã khởi động. Sẵn sàng đón cư dân mới!'
      );
    });
  }

  public getStateVersion(): number {
    return this.stateVersion;
  }

  // --- Controlled Observability, Batching & Subscriptions ---
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Executes multiple state mutations in a transaction and notifies listeners at most once.
   */
  public batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.isDirty) {
        this.flushNotifications();
      }
    }
  }

  public notify(): void {
    if (this.batchDepth > 0) {
      this.isDirty = true;
      return;
    }
    this.flushNotifications();
  }

  private flushNotifications(): void {
    this.isDirty = false;
    this.stateVersion++;
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

    this.notify();
    return event;
  }

  // --- Invariant Guarded Resource Management ---
  public addResource(type: ResourceType, amount: number, _contributorName?: string): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;

    const current = this.resources[type];
    const cap = this.maxStorage[type];
    const actualAdd = Math.min(Math.round(amount), Math.max(0, cap - current));

    if (actualAdd <= 0) {
      return false;
    }

    return this.batch(() => {
      this.resources[type] += actualAdd;
      this.addCityExp(Math.max(1, Math.round(actualAdd / 5)));
      this.notify();
      return true;
    });
  }

  public consumeResource(type: ResourceType, amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (this.resources[type] < amount) {
      return false; // Invariant: no negative resources
    }

    this.resources[type] -= amount;
    this.notify();
    return true;
  }

  /**
   * Atomically checks and consumes multiple resources at once.
   */
  public consumeResourcesAtomic(cost: Partial<Record<ResourceType, number>>): boolean {
    const entries = Object.entries(cost) as Array<[ResourceType, number | undefined]>;
    for (const [type, amount] of entries) {
      if (amount !== undefined) {
        if (!Number.isFinite(amount) || amount < 0) return false;
        if (this.resources[type] < amount) return false;
      }
    }

    return this.batch(() => {
      for (const [type, amount] of entries) {
        if (amount && amount > 0) {
          this.resources[type] -= amount;
        }
      }
      this.notify();
      return true;
    });
  }

  public addCityExp(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;

    this.batch(() => {
      let leveledUp = false;
      this.stats.exp += Math.round(amount);
      while (this.stats.exp >= this.stats.expToNextLevel) {
        this.stats.exp -= this.stats.expToNextLevel;
        this.stats.level += 1;
        this.stats.expToNextLevel = Math.round(this.stats.expToNextLevel * 1.5);
        leveledUp = true;

        this.pushEvent(
          'city_leveled_up',
          `🎉 Chúc mừng! Live City vừa thăng cấp lên Cấp ${this.stats.level}!`
        );
      }
      if (leveledUp) {
        this.checkAndUnlockMilestones();
      }
      this.notify();
    });
  }

  // --- Economy & Building Multipliers ---
  public getGatherMultiplier(type: ResourceType): number {
    let mult = 1.0;
    for (const bld of this.buildings.values()) {
      if (bld.status === 'active') {
        const bp = this.blueprints.find((b) => b.type === bld.type);
        if (bp?.gatherBonus?.[type]) {
          mult += bp.gatherBonus[type]!;
        }
      }
    }
    if (this.activeEvent?.modifiers.harvestMultiplier) {
      mult *= this.activeEvent.modifiers.harvestMultiplier;
    }
    return mult;
  }

  public getBuildMultiplier(): number {
    let mult = 1.0;
    if (this.activeEvent?.modifiers.buildMultiplier) {
      mult *= this.activeEvent.modifiers.buildMultiplier;
    }
    return mult;
  }

  public getSpeedMultiplier(): number {
    let mult = 1.0;
    // Active cozy_house adds 10% speed
    for (const bld of this.buildings.values()) {
      if (bld.status === 'active' && bld.type === 'cozy_house') {
        mult += 0.1;
      }
    }
    if (this.activeEvent?.modifiers.speedMultiplier) {
      mult *= this.activeEvent.modifiers.speedMultiplier;
    }
    return mult;
  }

  // --- Fog of War & Real Map Exploration ---
  public calculateExploredPercentage(): number {
    if (this.tileMap.size === 0) return 0;
    let discoveredCount = 0;
    for (const tile of this.tileMap.values()) {
      if (tile.discovered !== false) {
        discoveredCount++;
      }
    }
    return Math.min(100, Math.round((discoveredCount / this.tileMap.size) * 100));
  }

  public revealArea(
    centerX: number,
    centerY: number,
    radius: number,
    explorerName?: string
  ): { newlyDiscoveredTiles: number; newlyDiscoveredNodes: ResourceNode[] } {
    let newlyDiscoveredTiles = 0;
    const newlyDiscoveredNodes: ResourceNode[] = [];

    this.batch(() => {
      for (const tile of this.tileMap.values()) {
        if (tile.discovered === false && distance(tile.x, tile.y, centerX, centerY) <= radius) {
          tile.discovered = true;
          newlyDiscoveredTiles++;
        }
      }

      for (const node of this.resourceNodes.values()) {
        if (node.discovered === false && distance(node.x, node.y, centerX, centerY) <= radius + 1.2) {
          node.discovered = true;
          newlyDiscoveredNodes.push(node);
          this.pushEvent(
            'exploration_reward',
            `🗺️ ${explorerName || 'Đoàn thám hiểm'} đã phát hiện mỏ mới: [${node.name}]!`,
            explorerName
          );
        }
      }

      this.stats.exploredPercentage = this.calculateExploredPercentage();
      if (newlyDiscoveredTiles > 0) {
        this.cachedDiscoveredTiles = null;
        this.checkAndUnlockMilestones();
      }
      this.notify();
    });

    return { newlyDiscoveredTiles, newlyDiscoveredNodes };
  }

  // --- Citizens ---
  public getCitizenByUserId(userId: string): Citizen | undefined {
    const id = this.userCitizenMap.get(userId);
    return id ? this.citizens.get(id) : undefined;
  }

  public registerCitizen(citizen: Citizen): void {
    this.batch(() => {
      this.citizens.set(citizen.id, citizen);
      this.userCitizenMap.set(citizen.userId, citizen.id);
      this.stats.citizensCount = this.citizens.size;
      this.checkAndUnlockMilestones();
      this.notify();
    });
  }

  public removeCitizen(citizenIdOrUserId: string): boolean {
    const byId = this.citizens.get(citizenIdOrUserId);
    const citizen = byId ?? this.getCitizenByUserId(citizenIdOrUserId);
    if (!citizen) return false;

    return this.batch(() => {
      this.citizens.delete(citizen.id);
      if (this.userCitizenMap.get(citizen.userId) === citizen.id) {
        this.userCitizenMap.delete(citizen.userId);
      }
      this.stats.citizensCount = this.citizens.size;
      this.notify();
      return true;
    });
  }

  // --- Placement & Collision Validation ---
  public canPlaceBuilding(
    x: number,
    y: number,
    width: number,
    height: number,
    ignoreBuildingId?: string
  ): { valid: boolean; reason?: string } {
    if (!Number.isInteger(x) || !Number.isInteger(y) || width <= 0 || height <= 0) {
      return { valid: false, reason: 'Tọa độ hoặc kích thước công trình không hợp lệ.' };
    }

    if (x < 0 || y < 0 || x + width > MAP_WIDTH || y + height > MAP_HEIGHT) {
      return { valid: false, reason: 'Vị trí đặt công trình nằm ngoài biên bản đồ.' };
    }

    // Check every footprint tile for terrain walkability (no water)
    for (let tx = x; tx < x + width; tx++) {
      for (let ty = y; ty < y + height; ty++) {
        const tile = this.tileMap.get(`${tx},${ty}`);
        if (!tile || !tile.walkable || tile.type === 'water') {
          return { valid: false, reason: `Ô (${tx}, ${ty}) là mặt nước hoặc địa hình không thể xây dựng.` };
        }
      }
    }

    // Check overlap with existing buildings
    for (const bld of this.buildings.values()) {
      if (ignoreBuildingId && bld.id === ignoreBuildingId) continue;
      const overlapX = x < bld.x + bld.width && x + width > bld.x;
      const overlapY = y < bld.y + bld.height && y + height > bld.y;
      if (overlapX && overlapY) {
        return { valid: false, reason: `Vị trí bị chồng lấn với công trình [${bld.name}].` };
      }
    }

    // Check overlap with resource nodes
    for (const node of this.resourceNodes.values()) {
      const inFootprint =
        node.x >= x && node.x < x + width && node.y >= y && node.y < y + height;
      if (inFootprint) {
        return { valid: false, reason: `Vị trí trùng với mỏ tài nguyên [${node.name}].` };
      }
    }

    return { valid: true };
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

    if (!Number.isFinite(progressAmount) || progressAmount <= 0) {
      return null;
    }

    return this.batch(() => {
      building.progress = Math.min(
        building.requiredProgress,
        building.progress + Math.round(progressAmount)
      );
      building.contributions[userId] =
        (building.contributions[userId] || 0) + Math.round(progressAmount);

      let completed = false;
      if (building.progress >= building.requiredProgress) {
        building.status = 'active';
        building.completedAt = Date.now();
        completed = true;

        this.applyCompletedBuildingBonuses(building);

        this.pushEvent(
          'building_completed',
          `🏛️ Công trình [${building.name}] đã hoàn thành xuất sắc! Cảm ơn mọi cư dân!`,
          userName,
          { buildingId: building.id, buildingType: building.type }
        );
        this.addCityExp(50);
        this.checkAndUnlockMilestones();
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
    });
  }

  public checkAndUnlockMilestones(): void {
    const unlocked = new Set(this.milestones.map((m) => m.id));
    const unlock = (
      id: string,
      title: string,
      description: string,
      rewardGold = 0,
      rewardExp = 0
    ) => {
      if (unlocked.has(id)) return;
      unlocked.add(id);
      const milestone: CityMilestone = {
        id,
        title,
        description,
        unlockedAt: Date.now(),
        rewardGold: rewardGold || undefined,
        rewardExp: rewardExp || undefined,
      };
      this.milestones.push(milestone);
      if (rewardGold > 0) this.addResource('gold', rewardGold);
      if (rewardExp > 0) this.addCityExp(rewardExp);
      this.pushEvent('city_leveled_up', `🏅 CỘT MỐC MỚI: [${title}] — ${description}`);
    };

    const completedProjectsCount = Array.from(this.buildings.values()).filter(
      (b) => b.status === 'active' && b.id !== 'bld_town_hall' && b.id !== 'bld_storage_1'
    ).length;

    if (completedProjectsCount >= 1) {
      unlock(
        'first_building',
        'Đặt Nền Móng Đầu Tiên',
        'Hoàn thành công trình cộng đồng đầu tiên (+20 Vàng, +30 EXP).',
        20,
        30
      );
    }
    if (this.stats.exploredPercentage >= 50) {
      unlock(
        'explorer_50',
        'Nhà Thám Hiểm Biên Cương',
        'Mở sáng 50% bản đồ vùng mù (+25 Vàng, +40 EXP).',
        25,
        40
      );
    }
    if (this.stats.exploredPercentage >= 80) {
      unlock(
        'explorer_80',
        'Làm Chủ Lãnh Thổ',
        'Mở sáng 80% bản đồ Live City (+50 Vàng, +80 EXP).',
        50,
        80
      );
    }
    if (this.stats.level >= 3) {
      unlock(
        'city_level_3',
        'Đô Thị Phồn Vinh Cấp 3',
        'Thành phố đạt Cấp độ 3 (+40 Vàng).',
        40,
        0
      );
    }
    if (this.citizens.size >= 10) {
      unlock(
        'master_workforce',
        'Cộng Đồng Sôi Động',
        'Quy tụ từ 10 cư dân livestream trở lên (+20 Thực phẩm, +20 Vàng).',
        20,
        0
      );
      this.addResource('food', 20);
    }
  }

  private applyCompletedBuildingBonuses(building: Building): void {
    const blueprint = this.blueprints.find((b) => b.type === building.type);
    if (!blueprint) return;

    if (blueprint.storageBonus) {
      if (blueprint.storageBonus.wood) this.maxStorage.wood += blueprint.storageBonus.wood;
      if (blueprint.storageBonus.stone) this.maxStorage.stone += blueprint.storageBonus.stone;
      if (blueprint.storageBonus.food) this.maxStorage.food += blueprint.storageBonus.food;
      if (blueprint.storageBonus.gold) this.maxStorage.gold += blueprint.storageBonus.gold;
    }

    if (blueprint.citizenCapBonus) {
      this.stats.activeCitizensCap = (this.stats.activeCitizensCap || 40) + blueprint.citizenCapBonus;
    }

    // Watchtower automatically reveals a larger area around it
    if (building.type === 'watchtower') {
      this.revealArea(building.x + 1, building.y + 1, 6.5, building.name);
    }
  }

  private cloneVoteSession(session: VotingSession): VotingSession {
    return {
      ...session,
      options: session.options.map((o) => ({ ...o, cost: { ...o.cost } })),
      voterChoices: { ...session.voterChoices },
    };
  }

  private getDiscoveredTileKeys(): string[] {
    if (!this.cachedDiscoveredTiles) {
      const keys: string[] = [];
      for (const [key, tile] of this.tileMap.entries()) {
        if (tile.discovered !== false) {
          keys.push(key);
        }
      }
      this.cachedDiscoveredTiles = keys;
    }
    return [...this.cachedDiscoveredTiles];
  }

  // --- Snapshot Serialization, Validation & Migration (v1 -> v2) ---
  public toSnapshot(): WorldSnapshot {
    return {
      version: 2,
      timestamp: Date.now(),
      resources: { ...this.resources },
      maxStorage: { ...this.maxStorage },
      stats: { ...this.stats },
      citizens: Array.from(this.citizens.values()).map((c) => ({
        ...c,
        path: [...c.path],
        stats: { ...c.stats },
        carriedResource: c.carriedResource ? { ...c.carriedResource } : undefined,
        queuedTask: c.queuedTask ? { ...c.queuedTask } : undefined,
      })),
      buildings: Array.from(this.buildings.values()).map((b) => ({
        ...b,
        contributions: { ...b.contributions },
      })),
      resourceNodes: Array.from(this.resourceNodes.values()).map((n) => ({ ...n })),
      discoveredTiles: this.getDiscoveredTileKeys(),
      activeVote: this.activeVote ? this.cloneVoteSession(this.activeVote) : null,
      voteHistory: this.voteHistory.map((v) => this.cloneVoteSession(v)),
      activeEvent: this.activeEvent
        ? { ...this.activeEvent, modifiers: { ...this.activeEvent.modifiers } }
        : null,
      milestones: this.milestones.map((m) => ({ ...m })),
      pendingVotedProject: this.pendingVotedProject,
      eventLog: this.eventLog.slice(0, 30),
    };
  }

  public static isValidSnapshot(raw: unknown): raw is WorldSnapshot {
    if (!raw || typeof raw !== 'object') return false;
    const snap = raw as Partial<WorldSnapshot>;

    if (snap.version !== 1 && snap.version !== 2) return false;
    if (!snap.resources || typeof snap.resources !== 'object') return false;

    const { wood, stone, food, gold } = snap.resources;
    if (
      typeof wood !== 'number' || !Number.isFinite(wood) || wood < 0 ||
      typeof stone !== 'number' || !Number.isFinite(stone) || stone < 0 ||
      typeof food !== 'number' || !Number.isFinite(food) || food < 0 ||
      typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0
    ) {
      return false;
    }

    if (!snap.stats || typeof snap.stats !== 'object') return false;
    if (
      typeof snap.stats.level !== 'number' || snap.stats.level < 1 ||
      typeof snap.stats.exp !== 'number' || snap.stats.exp < 0 ||
      typeof snap.stats.expToNextLevel !== 'number' || snap.stats.expToNextLevel <= 0
    ) {
      return false;
    }

    if (
      !Array.isArray(snap.citizens) ||
      !Array.isArray(snap.buildings) ||
      !Array.isArray(snap.resourceNodes)
    ) {
      return false;
    }

    // Verify building elements
    for (const b of snap.buildings) {
      if (
        !b ||
        typeof b.id !== 'string' ||
        typeof b.type !== 'string' ||
        typeof b.x !== 'number' ||
        typeof b.y !== 'number' ||
        typeof b.progress !== 'number' ||
        b.progress < 0 ||
        typeof b.requiredProgress !== 'number' ||
        b.requiredProgress <= 0
      ) {
        return false;
      }
    }

    // Verify citizen elements
    for (const c of snap.citizens) {
      if (
        !c ||
        typeof c.id !== 'string' ||
        typeof c.userId !== 'string' ||
        typeof c.userName !== 'string' ||
        typeof c.x !== 'number' ||
        typeof c.y !== 'number'
      ) {
        return false;
      }
    }

    return true;
  }

  public loadSnapshot(snapshot: unknown): boolean {
    if (!WorldState.isValidSnapshot(snapshot)) {
      return false;
    }

    try {
      return this.batch(() => {
        this.resources = { ...snapshot.resources };

        // Restore or migrate maxStorage (for v1 snapshots, recalculate from completed buildings)
        if (snapshot.version === 2 && snapshot.maxStorage) {
          this.maxStorage = {
            wood: Math.max(1000, snapshot.maxStorage.wood || 1000),
            stone: Math.max(1000, snapshot.maxStorage.stone || 1000),
            food: Math.max(1000, snapshot.maxStorage.food || 1000),
            gold: Math.max(500, snapshot.maxStorage.gold || 500),
          };
        } else {
          // Migrate from v1
          this.maxStorage = { ...INITIAL_MAX_STORAGE };
          const initialBarnIds = new Set(['bld_storage_1']);
          for (const bld of snapshot.buildings) {
            if (bld.status === 'active' && !initialBarnIds.has(bld.id)) {
              const bp = this.blueprints.find((b) => b.type === bld.type);
              if (bp?.storageBonus) {
                if (bp.storageBonus.wood) this.maxStorage.wood += bp.storageBonus.wood;
                if (bp.storageBonus.stone) this.maxStorage.stone += bp.storageBonus.stone;
                if (bp.storageBonus.food) this.maxStorage.food += bp.storageBonus.food;
                if (bp.storageBonus.gold) this.maxStorage.gold += bp.storageBonus.gold;
              }
            }
          }
        }

        this.stats = {
          ...createInitialStats(),
          ...snapshot.stats,
        };

        // Restore tile discovery if v2
        if (Array.isArray(snapshot.discoveredTiles)) {
          const discoveredSet = new Set(snapshot.discoveredTiles);
          for (const [key, tile] of this.tileMap.entries()) {
            tile.discovered = discoveredSet.has(key);
          }
          this.cachedDiscoveredTiles = [...snapshot.discoveredTiles];
        } else {
          this.cachedDiscoveredTiles = null;
        }

        this.citizens.clear();
        this.userCitizenMap.clear();
        for (const c of snapshot.citizens) {
          const citizenCopy: Citizen = {
            ...c,
            xp: typeof c.xp === 'number' ? c.xp : 0,
            level: typeof c.level === 'number' && c.level >= 1 ? c.level : 1,
            title: typeof c.title === 'string' && c.title ? c.title : 'Tân Binh',
            path: Array.isArray(c.path) ? [...c.path] : [],
            stats: {
              woodHarvested: c.stats?.woodHarvested || 0,
              stoneHarvested: c.stats?.stoneHarvested || 0,
              foodHarvested: c.stats?.foodHarvested || 0,
              goldEarned: c.stats?.goldEarned || 0,
              buildingsContributed: c.stats?.buildingsContributed || 0,
              explorationPoints: c.stats?.explorationPoints || 0,
              totalCommands: c.stats?.totalCommands || 1,
            },
          };
          this.citizens.set(citizenCopy.id, citizenCopy);
          this.userCitizenMap.set(citizenCopy.userId, citizenCopy.id);
        }
        this.stats.citizensCount = this.citizens.size;

        this.buildings.clear();
        let activeCapBonus = 0;
        for (const b of snapshot.buildings) {
          const copy: Building = {
            ...b,
            contributions: { ...(b.contributions || {}) },
          };
          this.buildings.set(copy.id, copy);
          if (copy.status === 'active') {
            const bp = this.blueprints.find((item) => item.type === copy.type);
            if (bp?.citizenCapBonus) {
              activeCapBonus += bp.citizenCapBonus;
            }
          }
        }
        this.stats.activeCitizensCap = Math.max(
          40 + activeCapBonus,
          snapshot.stats.activeCitizensCap || 40
        );

        this.resourceNodes.clear();
        for (const n of snapshot.resourceNodes) {
          this.resourceNodes.set(n.id, {
            ...n,
            discovered: n.discovered !== undefined ? n.discovered : true,
          });
        }

        if (Array.isArray(snapshot.discoveredTiles)) {
          this.stats.exploredPercentage = this.calculateExploredPercentage();
        }

        this.activeVote = snapshot.activeVote || null;
        this.voteHistory = Array.isArray(snapshot.voteHistory) ? snapshot.voteHistory : [];
        this.activeEvent = snapshot.activeEvent || null;
        this.milestones = Array.isArray(snapshot.milestones)
          ? snapshot.milestones.map((m) => ({ ...m }))
          : [];
        this.pendingVotedProject = snapshot.pendingVotedProject || null;

        if (Array.isArray(snapshot.eventLog) && snapshot.eventLog.length > 0) {
          this.eventLog = [...snapshot.eventLog];
        }

        this.pushEvent('system_info', 'Trạng thái thành phố đã được khôi phục thành công.');
        this.notify();
        return true;
      });
    } catch (e) {
      console.error('Failed to load snapshot:', e);
      return false;
    }
  }

  public getGridDimensions(): { width: number; height: number } {
    return { width: MAP_WIDTH, height: MAP_HEIGHT };
  }
}
