import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem, INACTIVITY_REST_TIMEOUT_MS } from '../core/systems/CitizenSystem';
import { BuildingSystem } from '../core/systems/BuildingSystem';
import { ResourceSystem } from '../core/systems/ResourceSystem';
import { CommandDispatcher } from '../core/commands/CommandDispatcher';

describe('P2 Deep Gameplay Mechanics (Citizens, Economy, Fog of War, Voting, Events)', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;
  let buildingSystem: BuildingSystem;
  let resourceSystem: ResourceSystem;
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
    buildingSystem = new BuildingSystem(worldState);
    resourceSystem = new ResourceSystem(worldState);
    dispatcher = new CommandDispatcher(
      worldState,
      citizenSystem,
      undefined,
      undefined,
      buildingSystem,
      resourceSystem
    );
  });

  it('4.1 should cap active citizens by resting oldest idle citizens and wake them on new command', () => {
    worldState.stats.activeCitizensCap = 3;

    const c1 = citizenSystem.getOrCreateCitizen('u1', 'User1').citizen;
    c1.lastActiveTime = 1000;
    const c2 = citizenSystem.getOrCreateCitizen('u2', 'User2').citizen;
    c2.lastActiveTime = 2000;
    const c3 = citizenSystem.getOrCreateCitizen('u3', 'User3').citizen;
    c3.lastActiveTime = 3000;

    expect(citizenSystem.getActiveCitizensCount()).toBe(3);

    // 4th citizen joins -> oldest idle citizen (u1) should enter resting state
    citizenSystem.getOrCreateCitizen('u4', 'User4');
    expect(c1.isResting).toBe(true);
    expect(citizenSystem.getActiveCitizensCount()).toBe(3);

    // When u1 sends a new command, u1 wakes up and u2 rests
    citizenSystem.getOrCreateCitizen('u1', 'User1');
    expect(c1.isResting).toBe(false);
    expect(c2.isResting).toBe(true);

    // Inactivity timeout should also rest idle citizens
    c1.lastActiveTime = Date.now() - INACTIVITY_REST_TIMEOUT_MS - 5000;
    citizenSystem.update(0.1);
    expect(c1.isResting).toBe(true);
  });

  it('4.2 should support Food harvesting, Gold trading, and real building bonuses', () => {
    // Harvest food via command
    const res = dispatcher.processComment({
      id: 'cmd_food_1',
      userId: 'u_farmer',
      userName: 'Farmer',
      comment: 'LƯƠNG THỰC',
      timestamp: Date.now(),
    });
    expect(res.status).toBe('success');
    const farmer = worldState.getCitizenByUserId('u_farmer')!;
    expect(farmer.state).toBe('moving_to_harvest');

    // Trade wood for gold
    const initialWood = worldState.resources.wood;
    const initialGold = worldState.resources.gold;
    const tradeRes = resourceSystem.tradeForGold('wood', 20, 'Farmer');
    expect(tradeRes.success).toBe(true);
    expect(worldState.resources.wood).toBe(initialWood - 20);
    expect(worldState.resources.gold).toBe(initialGold + tradeRes.goldGained);

    // Lumber Mill bonus (+25% wood gather multiplier)
    expect(worldState.getGatherMultiplier('wood')).toBe(1.0);
    const active = worldState.getActiveUnderConstruction()!;
    worldState.applyBuildProgress(active.id, active.requiredProgress, 'sys', 'Sys');

    worldState.stats.level = 2;
    worldState.resources.wood = 200;
    worldState.resources.stone = 200;
    const mill = buildingSystem.startNewProject('lumber_mill');
    expect(mill).not.toBeNull();
    worldState.applyBuildProgress(mill!.id, mill!.requiredProgress, 'sys', 'Sys');

    expect(worldState.getGatherMultiplier('wood')).toBe(1.25);
  });

  it('4.3 should uncover real Fog of War tiles and hidden frontier resource nodes on KHÁM PHÁ', () => {
    const initialPct = worldState.calculateExploredPercentage();
    const hiddenNode = worldState.resourceNodes.get('tree_frontier_1')!;
    expect(hiddenNode.discovered).toBe(false);

    const { citizen } = citizenSystem.getOrCreateCitizen('u_scout', 'Scout');
    citizenSystem.assignExplore(citizen);
    expect(citizen.state).toBe('exploring');

    // Move scout to frontier near tree_frontier_1 (19, 2)
    citizen.x = 18;
    citizen.y = 3;
    citizen.path = [];
    citizenSystem.update(0.1);

    // Tile discovery percentage must increase based on real uncovered tiles
    expect(worldState.calculateExploredPercentage()).toBeGreaterThan(initialPct);
    expect(hiddenNode.discovered).toBe(true);
  });

  it('4.4 should run community construction voting with 1-vote-per-user and start winning project', () => {
    // Complete initial project first so city is ready for next project
    const initialProject = worldState.getActiveUnderConstruction()!;
    worldState.applyBuildProgress(
      initialProject.id,
      initialProject.requiredProgress,
      'sys',
      'Sys'
    );

    const session = buildingSystem.openVotingSession(60);
    expect(session).not.toBeNull();
    expect(session!.status).toBe('open');
    expect(session!.options.length).toBeGreaterThanOrEqual(2);

    // User 1 votes for option 2
    const v1 = dispatcher.processComment({
      id: 'v_1',
      userId: 'voter_1',
      userName: 'VoterOne',
      comment: 'VOTE 2',
      timestamp: 10000,
    });
    expect(v1.status).toBe('success');

    // User 1 attempts to vote again in the same session -> rejected!
    const v1Dup = dispatcher.processComment({
      id: 'v_1_dup',
      userId: 'voter_1',
      userName: 'VoterOne',
      comment: 'VOTE 1',
      timestamp: 15000,
    });
    expect(v1Dup.status).toBe('rejected_state');

    // User 2 also votes for option 2
    const v2 = dispatcher.processComment({
      id: 'v_2',
      userId: 'voter_2',
      userName: 'VoterTwo',
      comment: 'BÌNH CHỌN 2',
      timestamp: 12000,
    });
    expect(v2.status).toBe('success');

    const winningType = session!.options[1].type;
    worldState.resources.wood = 500;
    worldState.resources.stone = 500;

    // Close voting session -> winning blueprint becomes the active construction project!
    const closed = buildingSystem.closeVotingSession(true);
    expect(closed?.winnerType).toBe(winningType);
    expect(worldState.voteHistory.length).toBe(1);

    const newActiveProject = worldState.getActiveUnderConstruction();
    expect(newActiveProject).toBeDefined();
    expect(newActiveProject?.type).toBe(winningType);
  });

  it('4.5 should trigger and expire community city events with real gameplay modifiers', () => {
    expect(worldState.getBuildMultiplier()).toBe(1.0);

    const evt = resourceSystem.startCityEvent('builders_day', 10, 0);
    expect(evt).not.toBeNull();
    expect(worldState.activeEvent?.type).toBe('builders_day');
    expect(worldState.getBuildMultiplier()).toBe(2.0);

    // Expire event
    worldState.activeEvent!.endsAt = Date.now() - 100;
    resourceSystem.update(0.1);
    expect(worldState.activeEvent).toBeNull();
    expect(worldState.getBuildMultiplier()).toBe(1.0);
  });
});
