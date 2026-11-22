import { Citizen, ResourceNode, ResourceType } from '../types';
import { WorldState } from '../state/WorldState';
import { findPath } from '../utils/pathfinding';
import { distance, randomInt } from '../utils/math';
import { generateId, getAvatarColor } from '../utils/id';
import { IAudioSystem } from '../types/adapter';

export const INACTIVITY_REST_TIMEOUT_MS = 180_000; // 3 minutes

export class CitizenSystem {
  private worldState: WorldState;
  private audioSystem?: IAudioSystem;

  constructor(worldState: WorldState, audioSystem?: IAudioSystem) {
    this.worldState = worldState;
    this.audioSystem = audioSystem;
  }

  public setAudioSystem(audioSystem: IAudioSystem): void {
    this.audioSystem = audioSystem;
  }

  /**
   * Returns count of currently active (non-resting) citizens.
   */
  public getActiveCitizensCount(): number {
    let count = 0;
    for (const c of this.worldState.citizens.values()) {
      if (!c.isResting) count++;
    }
    return count;
  }

  /**
   * Enforces the active citizen cap by resting the oldest idle citizens if capacity is exceeded.
   */
  private enforceActiveCap(excludeCitizenId?: string): void {
    const cap = this.worldState.stats.activeCitizensCap || 40;
    const activeCitizens = Array.from(this.worldState.citizens.values()).filter(
      (c) => !c.isResting && c.id !== excludeCitizenId
    );

    if (activeCitizens.length < cap) return;

    // Sort idle citizens by oldest lastActiveTime first
    const idleCandidates = activeCitizens
      .filter((c) => c.state === 'idle' && !c.carriedResource)
      .sort((a, b) => a.lastActiveTime - b.lastActiveTime);

    let toRest = activeCitizens.length - cap + 1;
    for (const candidate of idleCandidates) {
      if (toRest <= 0) break;
      candidate.isResting = true;
      candidate.path = [];
      toRest--;
    }
  }

  /**
   * Spawns or retrieves existing citizen for a viewer.
   */
  public getOrCreateCitizen(userId: string, userName: string): { citizen: Citizen; isNew: boolean } {
    let citizen = this.worldState.getCitizenByUserId(userId);
    if (citizen) {
      citizen.lastActiveTime = Date.now();
      if (citizen.isResting) {
        this.enforceActiveCap(citizen.id);
        citizen.isResting = false;
      }
      return { citizen, isNew: false };
    }

    this.enforceActiveCap();

    // Spawn at walkable Central Plaza (x: 10, y: 10)
    const spawnX = 10;
    const spawnY = 10;
    const now = Date.now();

    citizen = {
      id: generateId('ctz'),
      userId,
      userName,
      color: getAvatarColor(userId),
      x: spawnX,
      y: spawnY,
      path: [],
      state: 'idle',
      carryCapacity: 10,
      speed: 2.2,
      actionTimer: 0,
      stats: {
        woodHarvested: 0,
        stoneHarvested: 0,
        foodHarvested: 0,
        goldEarned: 0,
        buildingsContributed: 0,
        explorationPoints: 0,
        totalCommands: 1,
      },
      joinedAt: now,
      lastActiveTime: now,
      isResting: false,
      floatingText: {
        text: 'Vừa gia nhập!',
        color: '#34d399',
        timer: 3.0,
      },
    };

    this.worldState.batch(() => {
      this.worldState.registerCitizen(citizen!);
      this.audioSystem?.playJoinSound();
      this.worldState.pushEvent(
        'citizen_joined',
        `🌟 Chào mừng [${userName}] đã trở thành cư dân của Live City!`,
        userName
      );
    });

    return { citizen, isNew: true };
  }

  /**
   * Finds nearest reachable discovered resource node of a given type.
   */
  private findReachableResourceNode(
    citizen: Citizen,
    type: ResourceType
  ): { node: ResourceNode; path: Array<{ x: number; y: number }> } | null {
    const { width, height } = this.worldState.getGridDimensions();
    const candidates: ResourceNode[] = [];

    for (const node of this.worldState.resourceNodes.values()) {
      if (
        node.resourceType === type &&
        !node.depleted &&
        node.currentAmount > 0 &&
        node.discovered !== false
      ) {
        candidates.push(node);
      }
    }

    candidates.sort(
      (a, b) =>
        distance(citizen.x, citizen.y, a.x, a.y) -
        distance(citizen.x, citizen.y, b.x, b.y)
    );

    for (const node of candidates) {
      const path = findPath(
        citizen.x,
        citizen.y,
        node.x,
        node.y,
        this.worldState.tileMap,
        width,
        height
      );
      if (path.length > 0) {
        return { node, path };
      }
    }

    return null;
  }

  /**
   * Assign citizen to harvest a specific resource type.
   * If citizen is currently carrying cargo, queues the task so cargo is NEVER lost.
   */
  public assignHarvest(citizen: Citizen, type: ResourceType, fromQueue = false): boolean {
    if (!fromQueue) {
      citizen.stats.totalCommands += 1;
      citizen.lastActiveTime = Date.now();
      citizen.isResting = false;
    }

    // CRITICAL INVARIANT: Never drop carriedResource!
    if (citizen.state === 'carrying_resource' || citizen.carriedResource) {
      citizen.queuedTask = { type: 'harvest', resourceType: type };
      this.ensureReturnToDepositPath(citizen);
      citizen.floatingText = {
        text: 'Cất hàng xong sẽ đi khai thác! 📦',
        color: '#fbbf24',
        timer: 2.2,
      };
      this.worldState.notify();
      return true;
    }

    const found = this.findReachableResourceNode(citizen, type);
    const labelMap: Record<ResourceType, string> = {
      wood: 'gỗ',
      stone: 'đá',
      food: 'thực phẩm',
      gold: 'vàng',
    };

    if (!found) {
      citizen.state = 'idle';
      citizen.path = [];
      citizen.targetNodeId = undefined;
      citizen.floatingText = {
        text: `Hết mỏ ${labelMap[type]}!`,
        color: '#f87171',
        timer: 2.5,
      };
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Cư dân [${citizen.userName}] không tìm thấy mỏ ${labelMap[type]} nào khả dụng!`,
        citizen.userName
      );
      return false;
    }

    citizen.targetNodeId = found.node.id;
    citizen.targetBuildingId = undefined;
    citizen.targetX = found.node.x;
    citizen.targetY = found.node.y;
    citizen.path = found.path;
    citizen.state = 'moving_to_harvest';
    citizen.actionTimer = 0;
    citizen.floatingText = {
      text:
        type === 'wood'
          ? 'Đi đốn củi 🪓'
          : type === 'stone'
          ? 'Đi đập đá ⛏️'
          : type === 'food'
          ? 'Đi thu hoạch 🌾'
          : 'Đi đào vàng 🪙',
      color: '#38bdf8',
      timer: 2.0,
    };

    this.worldState.notify();
    return true;
  }

  /**
   * Assign citizen to build active construction site.
   * Preserves cargo if currently carrying resources.
   */
  public assignBuild(citizen: Citizen, fromQueue = false): boolean {
    if (!fromQueue) {
      citizen.stats.totalCommands += 1;
      citizen.lastActiveTime = Date.now();
      citizen.isResting = false;
    }

    // CRITICAL INVARIANT: Never drop carriedResource!
    if (citizen.state === 'carrying_resource' || citizen.carriedResource) {
      citizen.queuedTask = { type: 'build' };
      this.ensureReturnToDepositPath(citizen);
      citizen.floatingText = {
        text: 'Cất hàng xong sẽ đi xây! 📦',
        color: '#fbbf24',
        timer: 2.2,
      };
      this.worldState.notify();
      return true;
    }

    const activeProject = this.worldState.getActiveUnderConstruction();
    if (!activeProject) {
      citizen.state = 'idle';
      citizen.path = [];
      citizen.targetBuildingId = undefined;
      citizen.floatingText = {
        text: 'Chưa có công trình cần xây!',
        color: '#fbbf24',
        timer: 2.5,
      };
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Hiện tại thành phố chưa có công trình nào đang mở dự án xây dựng!`,
        citizen.userName
      );
      return false;
    }

    const { width, height } = this.worldState.getGridDimensions();
    const path = findPath(
      citizen.x,
      citizen.y,
      activeProject.x,
      activeProject.y,
      this.worldState.tileMap,
      width,
      height
    );

    if (path.length === 0) {
      citizen.state = 'idle';
      citizen.path = [];
      citizen.targetBuildingId = undefined;
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Không tìm thấy đường đi tới công trường [${activeProject.name}]!`,
        citizen.userName
      );
      return false;
    }

    citizen.targetBuildingId = activeProject.id;
    citizen.targetNodeId = undefined;
    citizen.targetX = activeProject.x;
    citizen.targetY = activeProject.y;
    citizen.path = path;
    citizen.state = 'moving_to_build';
    citizen.actionTimer = 0;
    citizen.floatingText = {
      text: 'Đến công trường 🔨',
      color: '#f59e0b',
      timer: 2.0,
    };

    this.worldState.notify();
    return true;
  }

  /**
   * Assign citizen to explore uncharted Fog of War territory.
   * Preserves cargo if currently carrying resources.
   */
  public assignExplore(citizen: Citizen, fromQueue = false): boolean {
    if (!fromQueue) {
      citizen.stats.totalCommands += 1;
      citizen.lastActiveTime = Date.now();
      citizen.isResting = false;
    }

    // CRITICAL INVARIANT: Never drop carriedResource!
    if (citizen.state === 'carrying_resource' || citizen.carriedResource) {
      citizen.queuedTask = { type: 'explore' };
      this.ensureReturnToDepositPath(citizen);
      citizen.floatingText = {
        text: 'Cất hàng xong sẽ đi thám hiểm! 📦',
        color: '#fbbf24',
        timer: 2.2,
      };
      this.worldState.notify();
      return true;
    }

    const { width, height } = this.worldState.getGridDimensions();

    // Prioritize undiscovered walkable tiles closest to current discovered frontier
    const undiscoveredWalkable: Array<{ x: number; y: number; dist: number }> = [];
    for (const tile of this.worldState.tileMap.values()) {
      if (tile.walkable && tile.discovered === false) {
        undiscoveredWalkable.push({
          x: tile.x,
          y: tile.y,
          dist: distance(citizen.x, citizen.y, tile.x, tile.y),
        });
      }
    }

    undiscoveredWalkable.sort((a, b) => a.dist - b.dist);

    let chosenPath: Array<{ x: number; y: number }> = [];
    let chosenTarget = { x: 10, y: 10 };

    // Try up to 8 candidate undiscovered frontier tiles
    const pool = undiscoveredWalkable.slice(0, 8);
    if (pool.length > 0) {
      // Pick one from closest frontier tiles
      const idx = Math.floor(Math.random() * pool.length);
      const orderedTry = [pool[idx], ...pool.filter((_, i) => i !== idx)];
      for (const candidate of orderedTry) {
        const p = findPath(
          citizen.x,
          citizen.y,
          candidate.x,
          candidate.y,
          this.worldState.tileMap,
          width,
          height
        );
        if (p.length > 0) {
          chosenPath = p;
          chosenTarget = { x: candidate.x, y: candidate.y };
          break;
        }
      }
    }

    // Fallback if entire map is discovered: patrol outer walkable perimeter
    if (chosenPath.length === 0) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const tx = Math.random() > 0.5 ? randomInt(1, 5) : randomInt(width - 6, width - 2);
        const ty = Math.random() > 0.5 ? randomInt(1, 5) : randomInt(height - 6, height - 2);
        const p = findPath(citizen.x, citizen.y, tx, ty, this.worldState.tileMap, width, height);
        if (p.length > 0) {
          chosenPath = p;
          chosenTarget = { x: tx, y: ty };
          break;
        }
      }
    }

    if (chosenPath.length === 0) {
      citizen.state = 'idle';
      citizen.path = [];
      return false;
    }

    citizen.targetX = chosenTarget.x;
    citizen.targetY = chosenTarget.y;
    citizen.targetNodeId = undefined;
    citizen.targetBuildingId = undefined;
    citizen.path = chosenPath;
    citizen.state = 'exploring';
    citizen.actionTimer = 0;
    citizen.floatingText = {
      text: 'Khám phá vùng mù 🧭',
      color: '#a78bfa',
      timer: 2.0,
    };

    this.audioSystem?.playExploreSound();
    this.worldState.notify();
    return true;
  }

  private ensureReturnToDepositPath(citizen: Citizen): void {
    citizen.state = 'carrying_resource';
    if (citizen.path.length === 0) {
      const { width, height } = this.worldState.getGridDimensions();
      citizen.path = findPath(
        citizen.x,
        citizen.y,
        10,
        10,
        this.worldState.tileMap,
        width,
        height
      );
    }
  }

  private executeQueuedTaskIfAny(citizen: Citizen): boolean {
    if (!citizen.queuedTask) return false;
    const next = citizen.queuedTask;
    citizen.queuedTask = undefined;

    if (next.type === 'harvest' && next.resourceType) {
      return this.assignHarvest(citizen, next.resourceType, true);
    }
    if (next.type === 'build') {
      return this.assignBuild(citizen, true);
    }
    if (next.type === 'explore') {
      return this.assignExplore(citizen, true);
    }
    return false;
  }

  /**
   * Main game tick update loop for citizens.
   */
  public update(deltaTime: number): void {
    const now = Date.now();
    const speedMultiplier = this.worldState.getSpeedMultiplier();

    for (const citizen of this.worldState.citizens.values()) {
      if (citizen.isResting) continue;

      // Update floating text timer
      if (citizen.floatingText) {
        citizen.floatingText.timer -= deltaTime;
        if (citizen.floatingText.timer <= 0) {
          citizen.floatingText = undefined;
        }
      }

      // Check mid-flight invalidations before moving
      if (citizen.state === 'moving_to_build') {
        const bld = citizen.targetBuildingId
          ? this.worldState.buildings.get(citizen.targetBuildingId)
          : undefined;
        if (!bld || bld.status !== 'constructing') {
          // Target project finished while citizen was walking!
          const nextActive = this.worldState.getActiveUnderConstruction();
          if (nextActive) {
            this.assignBuild(citizen, true);
          } else {
            citizen.path = [];
            citizen.targetBuildingId = undefined;
            citizen.state = 'idle';
            citizen.floatingText = {
              text: 'Công trình đã hoàn tất! 🎉',
              color: '#eab308',
              timer: 2.5,
            };
            this.executeQueuedTaskIfAny(citizen);
            this.worldState.notify();
          }
          continue;
        }
      } else if (citizen.state === 'moving_to_harvest') {
        const node = citizen.targetNodeId
          ? this.worldState.resourceNodes.get(citizen.targetNodeId)
          : undefined;
        if (!node || node.depleted || node.currentAmount <= 0) {
          // Node depleted mid-walk -> retarget another node of same type
          const fallbackType = node?.resourceType || 'wood';
          const reassigned = this.assignHarvest(citizen, fallbackType, true);
          if (!reassigned) {
            citizen.path = [];
            citizen.targetNodeId = undefined;
            citizen.state = 'idle';
          }
          continue;
        }
      }

      // Movement step if path has waypoints
      if (citizen.path.length > 0) {
        const nextWaypoint = citizen.path[0];
        const dist = distance(citizen.x, citizen.y, nextWaypoint.x, nextWaypoint.y);
        const step = citizen.speed * speedMultiplier * deltaTime;

        if (dist <= step) {
          citizen.x = nextWaypoint.x;
          citizen.y = nextWaypoint.y;
          citizen.path.shift();

          // While exploring, reveal nearby Fog of War tiles along the journey
          if (citizen.state === 'exploring') {
            this.worldState.revealArea(citizen.x, citizen.y, 2.5, citizen.userName);
          }
        } else {
          const ratio = step / dist;
          citizen.x += (nextWaypoint.x - citizen.x) * ratio;
          citizen.y += (nextWaypoint.y - citizen.y) * ratio;
        }
      } else {
        // Reached destination or idle
        this.handleArrivedAtDestination(citizen, deltaTime, now);
      }
    }
  }

  private handleArrivedAtDestination(citizen: Citizen, deltaTime: number, now: number): void {
    switch (citizen.state) {
      case 'moving_to_harvest': {
        const node = citizen.targetNodeId
          ? this.worldState.resourceNodes.get(citizen.targetNodeId)
          : null;
        if (node && !node.depleted && node.currentAmount > 0) {
          citizen.state = 'harvesting';
          citizen.actionTimer = node.harvestSpeed;
          citizen.floatingText = {
            text:
              node.resourceType === 'wood'
                ? 'Đang chặt... 🪓'
                : node.resourceType === 'stone'
                ? 'Đang đào... ⛏️'
                : 'Đang thu hoạch...',
            color: '#fbbf24',
            timer: node.harvestSpeed,
          };
          this.worldState.notify();
        } else {
          citizen.state = 'idle';
          this.executeQueuedTaskIfAny(citizen);
          this.worldState.notify();
        }
        break;
      }

      case 'harvesting': {
        citizen.actionTimer -= deltaTime;
        if (citizen.actionTimer <= 0) {
          const node = citizen.targetNodeId
            ? this.worldState.resourceNodes.get(citizen.targetNodeId)
            : null;
          if (node && !node.depleted && node.currentAmount > 0) {
            const mult = this.worldState.getGatherMultiplier(node.resourceType);
            const rawCapacity = Math.round(citizen.carryCapacity * mult);
            const gatherAmount = Math.min(node.currentAmount, Math.max(1, rawCapacity));

            node.currentAmount -= gatherAmount;
            if (node.currentAmount <= 0) {
              node.currentAmount = 0;
              node.depleted = true;
              node.depletedTimer = 45;
            }

            citizen.carriedResource = {
              type: node.resourceType,
              amount: gatherAmount,
            };

            if (node.resourceType === 'wood' || node.resourceType === 'stone') {
              this.audioSystem?.playHarvestSound(node.resourceType);
            }

            const depositX = 10;
            const depositY = 10;
            const { width, height } = this.worldState.getGridDimensions();
            citizen.path = findPath(
              citizen.x,
              citizen.y,
              depositX,
              depositY,
              this.worldState.tileMap,
              width,
              height
            );
            citizen.state = 'carrying_resource';
            citizen.floatingText = {
              text: `+${gatherAmount} ${
                node.resourceType === 'wood'
                  ? 'Gỗ 🪵'
                  : node.resourceType === 'stone'
                  ? 'Đá 🪨'
                  : node.resourceType === 'food'
                  ? 'Lương thực 🌾'
                  : 'Vàng 🪙'
              }`,
              color: '#34d399',
              timer: 2.0,
            };
            this.worldState.notify();
          } else {
            citizen.state = 'idle';
            this.executeQueuedTaskIfAny(citizen);
            this.worldState.notify();
          }
        }
        break;
      }

      case 'carrying_resource': {
        if (citizen.carriedResource) {
          const { type, amount } = citizen.carriedResource;
          this.worldState.batch(() => {
            this.worldState.addResource(type, amount, citizen.userName);

            if (type === 'wood') citizen.stats.woodHarvested += amount;
            else if (type === 'stone') citizen.stats.stoneHarvested += amount;
            else if (type === 'food') {
              citizen.stats.foodHarvested = (citizen.stats.foodHarvested || 0) + amount;
            } else if (type === 'gold') {
              citizen.stats.goldEarned = (citizen.stats.goldEarned || 0) + amount;
            }

            const label =
              type === 'wood'
                ? 'gỗ'
                : type === 'stone'
                ? 'đá'
                : type === 'food'
                ? 'thực phẩm'
                : 'vàng';

            this.worldState.pushEvent(
              'resource_deposited',
              `📦 ${citizen.userName} đã vận chuyển ${amount} ${label} về kho thành phố!`,
              citizen.userName
            );

            citizen.carriedResource = undefined;
            citizen.state = 'idle';
            citizen.floatingText = {
              text: 'Đã nhập kho! ✨',
              color: '#10b981',
              timer: 2.0,
            };
          });

          // Immediately execute queued task if viewer sent a command while carrying
          this.executeQueuedTaskIfAny(citizen);
        } else {
          citizen.state = 'idle';
          this.executeQueuedTaskIfAny(citizen);
        }
        break;
      }

      case 'moving_to_build': {
        const bld = citizen.targetBuildingId
          ? this.worldState.buildings.get(citizen.targetBuildingId)
          : null;
        if (bld && bld.status === 'constructing') {
          citizen.state = 'building';
          citizen.actionTimer = 2.0;
          citizen.floatingText = {
            text: 'Đang thi công... 🔨',
            color: '#f59e0b',
            timer: 2.0,
          };
          this.worldState.notify();
        } else {
          citizen.state = 'idle';
          citizen.targetBuildingId = undefined;
          this.executeQueuedTaskIfAny(citizen);
          this.worldState.notify();
        }
        break;
      }

      case 'building': {
        citizen.actionTimer -= deltaTime;
        if (citizen.actionTimer <= 0) {
          const bld = citizen.targetBuildingId
            ? this.worldState.buildings.get(citizen.targetBuildingId)
            : null;
          if (bld && bld.status === 'constructing') {
            const buildPoints = Math.max(1, Math.round(5 * this.worldState.getBuildMultiplier()));
            this.audioSystem?.playBuildSound();
            const result = this.worldState.applyBuildProgress(
              bld.id,
              buildPoints,
              citizen.userId,
              citizen.userName
            );

            citizen.stats.buildingsContributed += buildPoints;

            if (result && result.completed) {
              this.audioSystem?.playCompleteSound();
              citizen.state = 'idle';
              citizen.targetBuildingId = undefined;
              citizen.floatingText = {
                text: '🎉 Công trình hoàn tất!',
                color: '#eab308',
                timer: 3.0,
              };
              this.executeQueuedTaskIfAny(citizen);
              this.worldState.notify();
            } else {
              citizen.actionTimer = 2.0;
              citizen.floatingText = {
                text: `+${buildPoints} Điểm xây!`,
                color: '#f59e0b',
                timer: 1.5,
              };
            }
          } else {
            citizen.state = 'idle';
            citizen.targetBuildingId = undefined;
            this.executeQueuedTaskIfAny(citizen);
            this.worldState.notify();
          }
        }
        break;
      }

      case 'exploring': {
        this.worldState.batch(() => {
          const { newlyDiscoveredTiles, newlyDiscoveredNodes } = this.worldState.revealArea(
            citizen.x,
            citizen.y,
            4.2,
            citizen.userName
          );

          citizen.stats.explorationPoints += 10 + newlyDiscoveredTiles;
          const expGain = newlyDiscoveredTiles > 0 ? 15 + newlyDiscoveredTiles : 10;
          this.worldState.addCityExp(expGain);

          // Small bounded gold reward if discovering new tiles/nodes
          if (newlyDiscoveredNodes.length > 0 || newlyDiscoveredTiles >= 3) {
            const goldReward = newlyDiscoveredNodes.length > 0 ? 10 : 3;
            this.worldState.addResource('gold', goldReward, citizen.userName);
            citizen.stats.goldEarned = (citizen.stats.goldEarned || 0) + goldReward;
          }

          this.worldState.pushEvent(
            'exploration_reward',
            newlyDiscoveredTiles > 0
              ? `🧭 ${citizen.userName} đã khai phá ${newlyDiscoveredTiles} vùng đất mới (+${expGain} EXP)!`
              : `🧭 ${citizen.userName} đã tuần tra biên giới thành phố (+${expGain} EXP)!`,
            citizen.userName
          );

          citizen.state = 'idle';
          citizen.floatingText = {
            text:
              newlyDiscoveredTiles > 0
                ? `Mở +${newlyDiscoveredTiles} ô đất! 🗺️`
                : 'Tuần tra hoàn tất! 🧭',
            color: '#a78bfa',
            timer: 2.5,
          };
        });

        this.executeQueuedTaskIfAny(citizen);
        break;
      }

      case 'idle': {
        if (this.executeQueuedTaskIfAny(citizen)) {
          break;
        }

        // Check inactivity timeout
        if (now - citizen.lastActiveTime > INACTIVITY_REST_TIMEOUT_MS) {
          citizen.isResting = true;
          this.worldState.notify();
          break;
        }

        // Subtle plaza wandering
        if (Math.random() < 0.004) {
          const wanderX = 10 + randomInt(-2, 2);
          const wanderY = 10 + randomInt(-2, 2);
          const { width, height } = this.worldState.getGridDimensions();
          citizen.path = findPath(
            citizen.x,
            citizen.y,
            wanderX,
            wanderY,
            this.worldState.tileMap,
            width,
            height
          );
        }
        break;
      }
    }
  }
}
