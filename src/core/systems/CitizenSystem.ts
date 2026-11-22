import { Citizen, ResourceType } from '../types';
import { WorldState } from '../state/WorldState';
import { findPath } from '../utils/pathfinding';
import { distance, randomInt } from '../utils/math';
import { generateId, getAvatarColor } from '../utils/id';
import { IAudioSystem } from '../types/adapter';

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
   * Spawns or retrieves existing citizen for a viewer.
   */
  public getOrCreateCitizen(userId: string, userName: string): { citizen: Citizen; isNew: boolean } {
    let citizen = this.worldState.getCitizenByUserId(userId);
    if (citizen) {
      citizen.lastActiveTime = Date.now();
      return { citizen, isNew: false };
    }

    // Spawn at Central Plaza (around x: 10, y: 10)
    const spawnX = 10 + (Math.random() * 2 - 1);
    const spawnY = 10 + (Math.random() * 2 - 1);

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
      speed: 2.2, // tiles per second
      actionTimer: 0,
      stats: {
        woodHarvested: 0,
        stoneHarvested: 0,
        buildingsContributed: 0,
        explorationPoints: 0,
        totalCommands: 1,
      },
      lastActiveTime: Date.now(),
      floatingText: {
        text: 'Vừa gia nhập!',
        color: '#34d399',
        timer: 3.0,
      },
    };

    this.worldState.registerCitizen(citizen);
    this.audioSystem?.playJoinSound();
    this.worldState.pushEvent(
      'citizen_joined',
      `🌟 Chào mừng [${userName}] đã trở thành cư dân của Live City!`,
      userName
    );

    return { citizen, isNew: true };
  }

  /**
   * Assign citizen to harvest a specific resource type (wood or stone).
   */
  public assignHarvest(citizen: Citizen, type: ResourceType): boolean {
    citizen.stats.totalCommands += 1;
    citizen.lastActiveTime = Date.now();

    // Find nearest non-depleted resource node of type
    let targetNode = null;
    let shortestDist = Infinity;

    for (const node of this.worldState.resourceNodes.values()) {
      if (node.resourceType === type && !node.depleted && node.currentAmount > 0) {
        const d = distance(citizen.x, citizen.y, node.x, node.y);
        if (d < shortestDist) {
          shortestDist = d;
          targetNode = node;
        }
      }
    }

    if (!targetNode) {
      citizen.floatingText = {
        text: `Hết mỏ ${type === 'wood' ? 'gỗ' : 'đá'}!`,
        color: '#f87171',
        timer: 2.5,
      };
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Cư dân [${citizen.userName}] không tìm thấy mỏ ${type === 'wood' ? 'gỗ' : 'đá'} nào còn tài nguyên!`,
        citizen.userName
      );
      return false;
    }

    // Calculate path
    const { width, height } = this.worldState.getGridDimensions();
    const path = findPath(citizen.x, citizen.y, targetNode.x, targetNode.y, this.worldState.tileMap, width, height);

    citizen.targetNodeId = targetNode.id;
    citizen.targetBuildingId = undefined;
    citizen.targetX = targetNode.x;
    citizen.targetY = targetNode.y;
    citizen.path = path;
    citizen.state = 'moving_to_harvest';
    citizen.floatingText = {
      text: type === 'wood' ? 'Đi đốn củi 🪓' : 'Đi đập đá ⛏️',
      color: '#38bdf8',
      timer: 2.0,
    };

    return true;
  }

  /**
   * Assign citizen to build active construction site.
   */
  public assignBuild(citizen: Citizen): boolean {
    citizen.stats.totalCommands += 1;
    citizen.lastActiveTime = Date.now();

    const activeProject = this.worldState.getActiveUnderConstruction();
    if (!activeProject) {
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
    const path = findPath(citizen.x, citizen.y, activeProject.x, activeProject.y, this.worldState.tileMap, width, height);

    citizen.targetBuildingId = activeProject.id;
    citizen.targetNodeId = undefined;
    citizen.targetX = activeProject.x;
    citizen.targetY = activeProject.y;
    citizen.path = path;
    citizen.state = 'moving_to_build';
    citizen.floatingText = {
      text: 'Đến công trường 🔨',
      color: '#f59e0b',
      timer: 2.0,
    };

    return true;
  }

  /**
   * Assign citizen to explore territory.
   */
  public assignExplore(citizen: Citizen): boolean {
    citizen.stats.totalCommands += 1;
    citizen.lastActiveTime = Date.now();

    // Pick a random uncharted boundary point
    const { width, height } = this.worldState.getGridDimensions();
    const targetX = Math.random() > 0.5 ? randomInt(1, 4) : randomInt(width - 5, width - 2);
    const targetY = Math.random() > 0.5 ? randomInt(1, 4) : randomInt(height - 5, height - 2);

    const path = findPath(citizen.x, citizen.y, targetX, targetY, this.worldState.tileMap, width, height);

    citizen.targetX = targetX;
    citizen.targetY = targetY;
    citizen.path = path;
    citizen.state = 'exploring';
    citizen.floatingText = {
      text: 'Khám phá 🧭',
      color: '#a78bfa',
      timer: 2.0,
    };

    this.audioSystem?.playExploreSound();
    return true;
  }

  /**
   * Main game tick update loop for citizens.
   */
  public update(deltaTime: number): void {
    // Process each citizen
    for (const citizen of this.worldState.citizens.values()) {
      // Update floating text timer
      if (citizen.floatingText) {
        citizen.floatingText.timer -= deltaTime;
        if (citizen.floatingText.timer <= 0) {
          citizen.floatingText = undefined;
        }
      }

      // Movement step if path has waypoints
      if (citizen.path.length > 0) {
        const nextWaypoint = citizen.path[0];
        const dist = distance(citizen.x, citizen.y, nextWaypoint.x, nextWaypoint.y);
        const step = citizen.speed * deltaTime;

        if (dist <= step) {
          citizen.x = nextWaypoint.x;
          citizen.y = nextWaypoint.y;
          citizen.path.shift();
        } else {
          const ratio = step / dist;
          citizen.x += (nextWaypoint.x - citizen.x) * ratio;
          citizen.y += (nextWaypoint.y - citizen.y) * ratio;
        }
      } else {
        // Path is empty: reached destination or idle
        this.handleArrivedAtDestination(citizen, deltaTime);
      }
    }
  }

  private handleArrivedAtDestination(citizen: Citizen, deltaTime: number): void {
    switch (citizen.state) {
      case 'moving_to_harvest': {
        const node = citizen.targetNodeId ? this.worldState.resourceNodes.get(citizen.targetNodeId) : null;
        if (node && !node.depleted && node.currentAmount > 0) {
          citizen.state = 'harvesting';
          citizen.actionTimer = node.harvestSpeed;
          citizen.floatingText = {
            text: node.resourceType === 'wood' ? 'Đang chặt... 🪓' : 'Đang đào... ⛏️',
            color: '#fbbf24',
            timer: node.harvestSpeed,
          };
        } else {
          citizen.state = 'idle';
        }
        break;
      }

      case 'harvesting': {
        citizen.actionTimer -= deltaTime;
        if (citizen.actionTimer <= 0) {
          const node = citizen.targetNodeId ? this.worldState.resourceNodes.get(citizen.targetNodeId) : null;
          if (node && node.currentAmount > 0) {
            const gatherAmount = Math.min(node.currentAmount, citizen.carryCapacity);
            node.currentAmount -= gatherAmount;
            if (node.currentAmount <= 0) {
              node.depleted = true;
              node.depletedTimer = 45; // 45 seconds regeneration
            }

            citizen.carriedResource = {
              type: node.resourceType,
              amount: gatherAmount,
            };

            // Play harvest sound
            if (node.resourceType === 'wood' || node.resourceType === 'stone') {
              this.audioSystem?.playHarvestSound(node.resourceType);
            }

            // Path back to Town Hall (x: 10, y: 10) or Storage Barn (x: 13, y: 9)
            const depositX = 10;
            const depositY = 10;
            const { width, height } = this.worldState.getGridDimensions();
            citizen.path = findPath(citizen.x, citizen.y, depositX, depositY, this.worldState.tileMap, width, height);
            citizen.state = 'carrying_resource';
            citizen.floatingText = {
              text: `+${gatherAmount} ${node.resourceType === 'wood' ? 'Gỗ 🪵' : 'Đá 🪨'}`,
              color: '#34d399',
              timer: 2.0,
            };
          } else {
            citizen.state = 'idle';
          }
        }
        break;
      }

      case 'carrying_resource': {
        // Deposited at city storage
        if (citizen.carriedResource) {
          const { type, amount } = citizen.carriedResource;
          this.worldState.addResource(type, amount, citizen.userName);

          if (type === 'wood') citizen.stats.woodHarvested += amount;
          if (type === 'stone') citizen.stats.stoneHarvested += amount;

          this.worldState.pushEvent(
            'resource_deposited',
            `📦 ${citizen.userName} đã vận chuyển ${amount} ${type === 'wood' ? 'gỗ' : 'đá'} về kho thành phố!`,
            citizen.userName
          );

          citizen.carriedResource = undefined;
          citizen.state = 'idle';
          citizen.floatingText = {
            text: 'Đã nhập kho! ✨',
            color: '#10b981',
            timer: 2.0,
          };
        }
        break;
      }

      case 'moving_to_build': {
        const bld = citizen.targetBuildingId ? this.worldState.buildings.get(citizen.targetBuildingId) : null;
        if (bld && bld.status === 'constructing') {
          citizen.state = 'building';
          citizen.actionTimer = 2.0; // build cycle
          citizen.floatingText = {
            text: 'Đang thi công... 🔨',
            color: '#f59e0b',
            timer: 2.0,
          };
        } else {
          citizen.state = 'idle';
        }
        break;
      }

      case 'building': {
        citizen.actionTimer -= deltaTime;
        if (citizen.actionTimer <= 0) {
          const bld = citizen.targetBuildingId ? this.worldState.buildings.get(citizen.targetBuildingId) : null;
          if (bld && bld.status === 'constructing') {
            const buildPoints = 5;
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
              citizen.floatingText = {
                text: '🎉 Công trình hoàn tất!',
                color: '#eab308',
                timer: 3.0,
              };
            } else {
              // Continue building if still constructing
              citizen.actionTimer = 2.0;
              citizen.floatingText = {
                text: `+${buildPoints} Điểm xây!`,
                color: '#f59e0b',
                timer: 1.5,
              };
            }
          } else {
            citizen.state = 'idle';
          }
        }
        break;
      }

      case 'exploring': {
        citizen.stats.explorationPoints += 10;
        this.worldState.stats.exploredPercentage = Math.min(
          100,
          this.worldState.stats.exploredPercentage + 2
        );
        this.worldState.addCityExp(15);
        this.worldState.pushEvent(
          'exploration_reward',
          `🧭 ${citizen.userName} đã mở mang thêm lãnh thổ thành phố (+15 EXP)!`,
          citizen.userName
        );

        citizen.state = 'idle';
        citizen.floatingText = {
          text: 'Phát hiện vùng đất mới! 🗺️',
          color: '#a78bfa',
          timer: 2.5,
        };
        break;
      }

      case 'idle': {
        // Wandering around plaza occasionally
        if (Math.random() < 0.005) {
          const wanderX = 10 + (Math.random() * 4 - 2);
          const wanderY = 10 + (Math.random() * 4 - 2);
          const { width, height } = this.worldState.getGridDimensions();
          citizen.path = findPath(citizen.x, citizen.y, wanderX, wanderY, this.worldState.tileMap, width, height);
        }
        break;
      }
    }
  }
}
