import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';
import { BuildingSystem } from '../core/systems/BuildingSystem';
import { CommandParser } from '../core/commands/CommandParser';
import { RateLimiter } from '../core/commands/RateLimiter';
import { findPath } from '../core/utils/pathfinding';
import { WorldTile } from '../core/types';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';

describe('P0 Foundation Fixes Verification', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;
  let buildingSystem: BuildingSystem;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
    buildingSystem = new BuildingSystem(worldState);
  });

  describe('2.1 WorldState Notification & Batching', () => {
    it('should notify subscribers immediately when pushEvent is called standalone', () => {
      let notifyCount = 0;
      worldState.subscribe(() => {
        notifyCount++;
      });

      worldState.pushEvent('system_info', 'Test live notification');
      expect(notifyCount).toBe(1);
    });

    it('should coalesce multiple notifications inside a batch transaction into a single notify call', () => {
      let notifyCount = 0;
      worldState.subscribe(() => {
        notifyCount++;
      });

      worldState.batch(() => {
        worldState.addResource('wood', 20);
        worldState.addResource('stone', 15);
        worldState.pushEvent('system_info', 'Batched event 1');
        worldState.pushEvent('system_info', 'Batched event 2');
      });

      expect(notifyCount).toBe(1);
    });
  });

  describe('2.2 Citizen Task State Machine & Cargo Preservation', () => {
    it('should preserve carriedResource cargo when player sends a new command mid-transport and queue the new task', () => {
      const { citizen } = citizenSystem.getOrCreateCitizen('u_cargo', 'CargoCarrier');
      citizenSystem.assignHarvest(citizen, 'wood');

      // Arrive at tree and harvest wood
      const node = worldState.resourceNodes.get(citizen.targetNodeId!)!;
      citizen.x = node.x;
      citizen.y = node.y;
      citizen.path = [];
      citizenSystem.update(0.1);
      citizenSystem.update(node.harvestSpeed + 0.1);

      expect(citizen.state).toBe('carrying_resource');
      expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 10 });

      const woodBeforeDeposit = worldState.resources.wood;

      // Player sends BUILD command while citizen is carrying wood!
      citizenSystem.assignBuild(citizen);

      // Cargo MUST NOT be lost, and state must remain carrying_resource until deposited
      expect(citizen.state).toBe('carrying_resource');
      expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 10 });
      expect(citizen.queuedTask).toEqual({ type: 'build' });

      // Now citizen arrives at Town Hall storage (10, 10)
      citizen.x = 10;
      citizen.y = 10;
      citizen.path = [];
      citizenSystem.update(0.1);

      // Cargo was deposited AND citizen automatically transitioned to queued BUILD task!
      expect(worldState.resources.wood).toBe(woodBeforeDeposit + 10);
      expect(citizen.carriedResource).toBeUndefined();
      expect(citizen.state).toBe('moving_to_build');
    });

    it('should gracefully handle building completion while another citizen is walking to build it', () => {
      const { citizen } = citizenSystem.getOrCreateCitizen('u_late', 'LateBuilder');
      citizenSystem.assignBuild(citizen);
      expect(citizen.state).toBe('moving_to_build');

      const project = worldState.getActiveUnderConstruction()!;
      // Another player finishes the building before LateBuilder arrives
      worldState.applyBuildProgress(project.id, project.requiredProgress, 'u_fast', 'FastBuilder');
      expect(project.status).toBe('active');

      // Update tick should transition LateBuilder cleanly to idle instead of getting stuck
      citizenSystem.update(0.1);
      expect(citizen.state).toBe('idle');
      expect(citizen.path.length).toBe(0);
    });
  });

  describe('2.3 Pathfinding Obstacles & Unreachable Targets', () => {
    it('should never cross unwalkable water tiles or fall back to straight line through obstacles', () => {
      // Build a custom 7x7 map where target (5, 5) is completely surrounded by water
      const customMap = new Map<string, WorldTile>();
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          const isWaterRing =
            (x >= 4 && x <= 6 && (y === 4 || y === 6)) ||
            (y >= 4 && y <= 6 && (x === 4 || x === 6));
          customMap.set(`${x},${y}`, {
            x,
            y,
            type: isWaterRing ? 'water' : 'grass',
            elevation: 0,
            walkable: !isWaterRing,
            variation: 0,
          });
        }
      }

      const path = findPath(1, 1, 5, 5, customMap, 7, 7);
      expect(path).toEqual([]);
    });

    it('should reject out-of-bounds coordinates safely', () => {
      const { width, height } = worldState.getGridDimensions();
      const path = findPath(-5, -5, 10, 10, worldState.tileMap, width, height);
      expect(path).toEqual([]);
    });
  });

  describe('2.4 Command Parser False Positives & RateLimiter GC', () => {
    it('should NOT trigger false positive commands on conversational chat sentences', () => {
      const chatSentences = [
        'Đi ăn cơm đây mọi người ơi',
        'Hôm nay mình đi khám phá quán cà phê mới mở',
        'Đừng xây nhà ở chỗ đó nhé streamer ơi',
        'Chặt gỗ ngoài đời mệt lắm không như trong game đâu',
        'Đào đá quý ở đâu vậy anh em?',
      ];

      for (const text of chatSentences) {
        const parsed = CommandParser.parse({
          id: 'evt_chat',
          userId: 'u_chat',
          userName: 'Chatter',
          comment: text,
          timestamp: Date.now(),
        });
        expect(parsed).toBeNull();
      }
    });

    it('should clean up expired user entries and enforce global rate limit', () => {
      const limiter = new RateLimiter(1000, 3); // max 3 global cmds/sec

      expect(limiter.checkAndRecord('u1', 1000).allowed).toBe(true);
      expect(limiter.checkAndRecord('u2', 1100).allowed).toBe(true);
      expect(limiter.checkAndRecord('u3', 1200).allowed).toBe(true);

      // 4th command within 1 second hits global rate limit
      const fourth = limiter.checkAndRecord('u4', 1300);
      expect(fourth.allowed).toBe(false);
      expect(fourth.reason).toBe('global_rate_limit');

      // Advance time by 20 seconds -> expired records cleaned up
      expect(limiter.checkAndRecord('u5', 25000).allowed).toBe(true);
      expect(limiter.getTrackedUserCount()).toBe(1);
    });
  });

  describe('2.5 BuildingSystem Validation & Atomic Consumption', () => {
    it('should respect unlockedAtLevel and prevent building locked structures', () => {
      // finish current project first
      const active = worldState.getActiveUnderConstruction()!;
      worldState.applyBuildProgress(active.id, active.requiredProgress, 'sys', 'Sys');

      // City is level 1, quarry_mason requires level 3
      worldState.resources.wood = 500;
      worldState.resources.stone = 500;
      const started = buildingSystem.startNewProject('quarry_mason', 13, 15);
      expect(started).toBeNull();
      expect(worldState.resources.wood).toBe(500);
    });

    it('should prevent building on water or overlapping existing buildings and keep resources intact', () => {
      const active = worldState.getActiveUnderConstruction()!;
      worldState.applyBuildProgress(active.id, active.requiredProgress, 'sys', 'Sys');

      worldState.resources.wood = 200;
      worldState.resources.stone = 200;

      // Attempt to build overlapping Town Hall at (9, 9)
      const overlapAttempt = buildingSystem.startNewProject('cozy_house', 9, 9);
      expect(overlapAttempt).toBeNull();
      expect(worldState.resources.wood).toBe(200);
      expect(worldState.resources.stone).toBe(200);
    });

    it('should consume resources atomically (no partial deduction if one resource is insufficient)', () => {
      const active = worldState.getActiveUnderConstruction()!;
      worldState.applyBuildProgress(active.id, active.requiredProgress, 'sys', 'Sys');

      // cozy_house costs 60 wood, 20 stone. Give 100 wood but only 5 stone:
      worldState.resources.wood = 100;
      worldState.resources.stone = 5;

      const attempt = buildingSystem.startNewProject('cozy_house', 13, 12);
      expect(attempt).toBeNull();
      expect(worldState.resources.wood).toBe(100);
      expect(worldState.resources.stone).toBe(5);
    });
  });

  describe('2.6 Persistence v2, Upgraded Storage Cap & Corrupted Snapshot Protection', () => {
    it('should persist and restore upgraded storage capacities across reload', () => {
      const active = worldState.getActiveUnderConstruction()!;
      worldState.applyBuildProgress(active.id, active.requiredProgress, 'sys', 'Sys');

      // Level up city to level 2 and build storage_barn (+500 wood/stone cap)
      worldState.stats.level = 2;
      worldState.resources.wood = 300;
      worldState.resources.stone = 300;
      const barn = buildingSystem.startNewProject('storage_barn', 14, 12);
      expect(barn).not.toBeNull();

      worldState.applyBuildProgress(barn!.id, barn!.requiredProgress, 'u1', 'Builder');
      expect(worldState.maxStorage.wood).toBe(1500);

      // Add wood up to 1400 (above initial 1000 cap)
      worldState.addResource('wood', 1250);
      expect(worldState.resources.wood).toBeGreaterThan(1000);

      const snapshot = worldState.toSnapshot();
      expect(snapshot.version).toBe(2);

      const reloaded = new WorldState();
      expect(reloaded.loadSnapshot(snapshot)).toBe(true);
      expect(reloaded.maxStorage.wood).toBe(1500);
      expect(reloaded.resources.wood).toBe(worldState.resources.wood);
    });

    it('should reject corrupted snapshots and recover from backup in LocalStoragePersistence', async () => {
      const badSnapshot = {
        version: 2,
        resources: { wood: -50, stone: 'invalid', food: 10, gold: 0 },
      };
      expect(worldState.loadSnapshot(badSnapshot)).toBe(false);

      const persistence = new LocalStoragePersistence('test_p0_');
      const validSnap = worldState.toSnapshot();
      await persistence.save('world_save', validSnap);

      // Save a second time so backup holds validSnap
      validSnap.resources.wood = 333;
      await persistence.save('world_save', validSnap);

      const loaded = await persistence.load<typeof validSnap | null>('world_save', null);
      expect(loaded).not.toBeNull();
      expect(loaded?.resources.wood).toBe(333);
    });
  });
});
