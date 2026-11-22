import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';

describe('Resource Harvesting Mechanics', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
  });

  it('should assign citizen to harvest wood and find a tree node', () => {
    const { citizen } = citizenSystem.getOrCreateCitizen('user_wood', 'LumberJack');
    const assigned = citizenSystem.assignHarvest(citizen, 'wood');

    expect(assigned).toBe(true);
    expect(citizen.state).toBe('moving_to_harvest');
    expect(citizen.targetNodeId).toBeDefined();
    expect(citizen.path.length).toBeGreaterThan(0);

    const node = worldState.resourceNodes.get(citizen.targetNodeId!);
    expect(node?.resourceType).toBe('wood');
  });

  it('should assign citizen to harvest stone and find a rock node', () => {
    const { citizen } = citizenSystem.getOrCreateCitizen('user_stone', 'StoneMason');
    const assigned = citizenSystem.assignHarvest(citizen, 'stone');

    expect(assigned).toBe(true);
    expect(citizen.state).toBe('moving_to_harvest');
    expect(citizen.targetNodeId).toBeDefined();

    const node = worldState.resourceNodes.get(citizen.targetNodeId!);
    expect(node?.resourceType).toBe('stone');
  });

  it('should complete harvest cycle and carry resource back', () => {
    const { citizen } = citizenSystem.getOrCreateCitizen('user_gather', 'Gatherer');
    citizenSystem.assignHarvest(citizen, 'wood');

    // Simulate instant arrival at tree node
    const node = worldState.resourceNodes.get(citizen.targetNodeId!)!;
    citizen.x = node.x;
    citizen.y = node.y;
    citizen.path = [];

    // Trigger update to transition to harvesting
    citizenSystem.update(0.1);
    expect(citizen.state).toBe('harvesting');

    // Advance time past node harvest speed
    const harvestTime = node.harvestSpeed + 0.1;
    citizenSystem.update(harvestTime);

    // Should now be carrying resource back to town hall
    expect(citizen.state).toBe('carrying_resource');
    expect(citizen.carriedResource).toBeDefined();
    expect(citizen.carriedResource?.type).toBe('wood');
    expect(citizen.carriedResource?.amount).toBeGreaterThan(0);
  });
});
