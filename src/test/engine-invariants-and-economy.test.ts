import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';
import { BuildingSystem } from '../core/systems/BuildingSystem';
import { ResourceSystem } from '../core/systems/ResourceSystem';

describe('Engine Invariants, Citizen Progression, Voting Queue & Multi-Horizon Economy', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;
  let buildingSystem: BuildingSystem;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
    buildingSystem = new BuildingSystem(worldState);
  });

  it('tracks citizen progression (xp, level, title) and preserves cargo during cancelTask and reassignments', () => {
    const { citizen, isNew } = citizenSystem.getOrCreateCitizen('u_prog', 'MinhAnh');
    expect(isNew).toBe(true);
    expect(citizen.xp).toBe(0);
    expect(citizen.level).toBe(1);
    expect(citizen.title).toBe('Tân Binh');

    // Progression thresholds
    citizenSystem.updateCitizenProgression(citizen, 120);
    expect(citizen.xp).toBe(120);
    expect(citizen.level).toBe(2);
    expect(citizen.title).toBe('Thợ Lành Nghề');

    citizenSystem.updateCitizenProgression(citizen, 250);
    expect(citizen.xp).toBe(370);
    expect(citizen.level).toBe(4);
    expect(citizen.title).toBe('Kiến Trúc Sư');

    citizenSystem.updateCitizenProgression(citizen, 600);
    expect(citizen.level).toBe(10);
    expect(citizen.title).toBe('Huyền Thoại');

    // Cargo preservation invariant across reassignments and cancelTask
    citizen.carriedResource = { type: 'wood', amount: 12 };
    citizen.state = 'carrying_resource';

    const harvestRes = citizenSystem.assignHarvest(citizen, 'stone');
    expect(harvestRes).toBe(true);
    expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 12 });
    expect(citizen.queuedTask).toEqual({ type: 'harvest', resourceType: 'stone' });

    const buildRes = citizenSystem.assignBuild(citizen);
    expect(buildRes).toBe(true);
    expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 12 });
    expect(citizen.queuedTask).toEqual({ type: 'build' });

    const exploreRes = citizenSystem.assignExplore(citizen);
    expect(exploreRes).toBe(true);
    expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 12 });
    expect(citizen.queuedTask).toEqual({ type: 'explore' });

    citizenSystem.cancelTask(citizen);
    expect(citizen.state).toBe('idle');
    expect(citizen.path).toHaveLength(0);
    expect(citizen.queuedTask).toBeUndefined();
    expect(citizen.carriedResource).toEqual({ type: 'wood', amount: 12 });
  });

  it('recovers immediately mid-action when harvesting node depletes or building finishes externally', () => {
    const { citizen: cHarv } = citizenSystem.getOrCreateCitizen('u_harv', 'Woodcutter');
    const woodNode = Array.from(worldState.resourceNodes.values()).find(
      (n) => n.resourceType === 'wood' && n.discovered && !n.depleted
    );
    expect(woodNode).toBeDefined();

    // Put citizen mid-harvest with long remaining actionTimer
    cHarv.state = 'harvesting';
    cHarv.targetNodeId = woodNode!.id;
    cHarv.actionTimer = 5.0;
    cHarv.path = [];

    // Another worker depletes the node externally
    woodNode!.currentAmount = 0;
    woodNode!.depleted = true;

    citizenSystem.update(0.1);
    const harvStateAfter: string = cHarv.state;
    // Must not keep counting down actionTimer in 'harvesting' on depleted node
    expect(harvStateAfter !== 'harvesting' || cHarv.targetNodeId !== woodNode!.id).toBe(true);

    // Put another citizen mid-build on active watchtower
    const { citizen: cBld } = citizenSystem.getOrCreateCitizen('u_bld', 'Mason');
    const project = worldState.getActiveUnderConstruction();
    expect(project).toBeDefined();
    cBld.state = 'building';
    cBld.targetBuildingId = project!.id;
    cBld.actionTimer = 5.0;
    cBld.path = [];

    // Complete project externally
    worldState.applyBuildProgress(project!.id, 1000, 'ext', 'External');
    expect(project!.status).toBe('active');

    citizenSystem.update(0.1);
    expect(cBld.state).toBe('idle');
    expect(cBld.targetBuildingId).toBeUndefined();
    expect(cBld.actionTimer).toBe(0);
  });

  it('routes assignBuild around blocked top-left footprint tile via perimeter fallback and cleans up removeCitizen', () => {
    const project = worldState.getActiveUnderConstruction();
    expect(project).toBeDefined();

    // Block exact top-left tile (7,7) of watchtower (2x2 at 7,7) while keeping perimeter (8,7)/(7,8)/(8,8) walkable
    const topLeft = worldState.tileMap.get(`${project!.x},${project!.y}`);
    expect(topLeft).toBeDefined();
    const originalWalkable = topLeft!.walkable;
    topLeft!.walkable = false;

    const { citizen } = citizenSystem.getOrCreateCitizen('u_perim', 'BuilderPerim');
    const assigned = citizenSystem.assignBuild(citizen);
    expect(assigned).toBe(true);
    expect(citizen.state).toBe('moving_to_build');
    expect(citizen.path.length).toBeGreaterThan(0);

    // Restore tile walkability and test removeCitizen index cleanup
    topLeft!.walkable = originalWalkable;
    const removed = worldState.removeCitizen('u_perim');
    expect(removed).toBe(true);
    expect(worldState.getCitizenByUserId('u_perim')).toBeUndefined();
    expect(worldState.citizens.has(citizen.id)).toBe(false);
  });

  it('enforces voting deterministic tie-breaks, pendingVotedProject queue and milestone persistence across Snapshot v2', () => {
    // Active watchtower occupies the construction slot right now
    const active = worldState.getActiveUnderConstruction();
    expect(active).toBeDefined();

    const session = buildingSystem.openVotingSession(90, ['cozy_house', 'bakery_farm', 'market_hall']);
    expect(session).not.toBeNull();
    expect(session!.options.length).toBeGreaterThanOrEqual(2);

    // Force a tie: 1 vote for #1 (cozy_house) and 1 vote for #2
    buildingSystem.castVote('voter_a', 'Alice', 2);
    buildingSystem.castVote('voter_b', 'Bob', 1);

    const closed = buildingSystem.closeVotingSession(true);
    expect(closed).not.toBeNull();
    // Deterministic lowest index wins tie (#1)
    expect(closed!.winnerType).toBe(session!.options[0].type);
    expect(worldState.pendingVotedProject).toBe(session!.options[0].type);
    const hasTieMessage = worldState.eventLog.some(
      (e) => e.type === 'voting_update' && e.message.includes('#1')
    );
    expect(hasTieMessage).toBe(true);

    // Ensure enough resources, then finish watchtower; BuildingSystem.update() should auto-start pendingVotedProject
    worldState.resources.wood = 500;
    worldState.resources.stone = 500;
    worldState.resources.food = 500;
    worldState.resources.gold = 500;
    worldState.applyBuildProgress(active!.id, 500, 'u1', 'Finisher');
    expect(worldState.milestones.some((m) => m.id === 'first_building')).toBe(true);

    const versionBeforeTick = worldState.getStateVersion();
    buildingSystem.update(0.1);
    expect(worldState.pendingVotedProject).toBeNull();
    const newActive = worldState.getActiveUnderConstruction();
    expect(newActive).not.toBeNull();
    expect(newActive!.type).toBe(closed!.winnerType);
    expect(worldState.getStateVersion()).toBeGreaterThan(versionBeforeTick);

    // Snapshot round-trip preserves milestones, progression, and recalculated cap
    const { citizen } = citizenSystem.getOrCreateCitizen('u_snap', 'Snapper');
    citizenSystem.updateCitizenProgression(citizen, 250);
    // Mark first_building completed plus complete a cozy_house to raise cap
    worldState.applyBuildProgress(newActive!.id, 1000, 'u_snap', 'Snapper');

    const snapshot = worldState.toSnapshot();
    const restored = new WorldState();
    const loadedOk = restored.loadSnapshot(snapshot);
    expect(loadedOk).toBe(true);
    expect(restored.milestones.some((m) => m.id === 'first_building')).toBe(true);
    const restoredCitizen = restored.getCitizenByUserId('u_snap');
    expect(restoredCitizen?.level).toBe(3);
    expect(restoredCitizen?.title).toBe('Thợ Lành Nghề');
    if (newActive!.type === 'cozy_house') {
      expect(restored.stats.activeCitizensCap).toBeGreaterThan(40);
    }
  });

  it('sustains deterministic 5m, 15m, 30m, and 60m economy horizons without NaN, starvation deadlock or runaway corruption', () => {
    const horizons = [
      { label: '5m', seconds: 300 },
      { label: '15m', seconds: 900 },
      { label: '30m', seconds: 1800 },
      { label: '60m', seconds: 3600 },
    ];

    const summary: Array<{
      horizon: string;
      wood: number;
      stone: number;
      food: number;
      gold: number;
      cityLevel: number;
      completedBuildings: number;
      discoveredPct: number;
      unlockedMilestones: number;
    }> = [];

    // Simulate continuous stream session from t=0 to t=3600s with deltaTime=0.5s
    const dt = 0.5;
    const simWorld = new WorldState();
    const simCitizens = new CitizenSystem(simWorld);
    const simBuildings = new BuildingSystem(simWorld);
    const simResources = new ResourceSystem(simWorld);

    // Register 8 active viewer citizens with mixed balanced roles
    const roster = [
      { id: 'v1', name: 'LumberOne', role: 'wood' as const },
      { id: 'v2', name: 'LumberTwo', role: 'wood' as const },
      { id: 'v3', name: 'MinerOne', role: 'stone' as const },
      { id: 'v4', name: 'MinerTwo', role: 'stone' as const },
      { id: 'v5', name: 'FarmerOne', role: 'food' as const },
      { id: 'v6', name: 'FarmerTwo', role: 'food' as const },
      { id: 'v7', name: 'BuilderOne', role: 'build' as const },
      { id: 'v8', name: 'ScoutOne', role: 'explore' as const },
    ];
    for (const r of roster) {
      simCitizens.getOrCreateCitizen(r.id, r.name);
    }

    let nextHorizonIdx = 0;
    const totalSteps = 3600 / dt; // 7200 deterministic steps

    for (let step = 1; step <= totalSteps; step++) {
      const elapsedSec = step * dt;

      // Every 10 simulated seconds, issue realistic viewer commands for idle workers & queue next unlocked building
      if (step % 20 === 1) {
        for (const r of roster) {
          const c = simWorld.getCitizenByUserId(r.id)!;
          c.lastActiveTime = Date.now();
          if (c.state === 'idle' && !c.carriedResource) {
            if (r.role === 'wood' || r.role === 'stone' || r.role === 'food') {
              simCitizens.assignHarvest(c, r.role);
            } else if (r.role === 'build') {
              if (!simCitizens.assignBuild(c)) {
                simCitizens.assignHarvest(c, 'wood');
              }
            } else {
              // Explore until most tiles discovered, then help harvest/build
              if (simWorld.stats.exploredPercentage < 90) {
                simCitizens.assignExplore(c);
              } else {
                simCitizens.assignHarvest(c, 'stone');
              }
            }
          }
        }

        // Start affordable unlocked buildings sequentially when no active construction exists
        if (!simWorld.getActiveUnderConstruction()) {
          const candidates = simBuildings.getUnlockedBlueprints();
          for (const bp of candidates) {
            const builtCount = Array.from(simWorld.buildings.values()).filter(
              (b) => b.type === bp.type
            ).length;
            if (builtCount < 2 && bp.type !== 'town_hall' && bp.type !== 'storage_barn') {
              const started = simBuildings.startNewProject(bp.type);
              if (started) break;
            }
          }
        }
      }

      simWorld.stats.dayTime = (simWorld.stats.dayTime + dt * 0.005) % 1.0;
      simCitizens.update(dt);
      simResources.update(dt);
      simBuildings.update(dt);

      // Invariants verified every step
      expect(Number.isFinite(simWorld.resources.wood)).toBe(true);
      expect(Number.isFinite(simWorld.resources.stone)).toBe(true);
      expect(Number.isFinite(simWorld.resources.food)).toBe(true);
      expect(Number.isFinite(simWorld.resources.gold)).toBe(true);
      expect(simWorld.resources.wood).toBeGreaterThanOrEqual(0);
      expect(simWorld.resources.stone).toBeGreaterThanOrEqual(0);
      expect(simWorld.resources.food).toBeGreaterThanOrEqual(0);
      expect(simWorld.resources.gold).toBeGreaterThanOrEqual(0);

      if (nextHorizonIdx < horizons.length && elapsedSec >= horizons[nextHorizonIdx].seconds) {
        const completed = Array.from(simWorld.buildings.values()).filter(
          (b) => b.status === 'active'
        ).length;
        summary.push({
          horizon: horizons[nextHorizonIdx].label,
          wood: simWorld.resources.wood,
          stone: simWorld.resources.stone,
          food: simWorld.resources.food,
          gold: simWorld.resources.gold,
          cityLevel: simWorld.stats.level,
          completedBuildings: completed,
          discoveredPct: simWorld.stats.exploredPercentage,
          unlockedMilestones: simWorld.milestones.length,
        });
        nextHorizonIdx++;
      }
    }

    expect(summary).toHaveLength(4);
    const finalStats = summary[3];
    // Over 60m stream simulation: city expanded, built structures, discovered map, unlocked milestones
    expect(finalStats.completedBuildings).toBeGreaterThanOrEqual(4);
    expect(finalStats.cityLevel).toBeGreaterThanOrEqual(2);
    expect(finalStats.discoveredPct).toBeGreaterThanOrEqual(65);
    expect(finalStats.unlockedMilestones).toBeGreaterThanOrEqual(2);
    expect(finalStats.food).toBeGreaterThan(0);

    // Emit structured summary in test stdout for auditability
    console.info('[EconomySim 5m/15m/30m/60m]', JSON.stringify(summary));
  });
});
