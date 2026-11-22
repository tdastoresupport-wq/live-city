import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';

describe('Citizen Creation & Management', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
  });

  it('should successfully create a new citizen when viewer joins', () => {
    const { citizen, isNew } = citizenSystem.getOrCreateCitizen('user_01', 'PlayerOne');

    expect(isNew).toBe(true);
    expect(citizen).toBeDefined();
    expect(citizen.userId).toBe('user_01');
    expect(citizen.userName).toBe('PlayerOne');
    expect(citizen.state).toBe('idle');
    expect(worldState.citizens.size).toBe(1);
    expect(worldState.stats.citizensCount).toBe(1);
  });

  it('should return existing citizen without duplication if same user rejoins', () => {
    const res1 = citizenSystem.getOrCreateCitizen('user_01', 'PlayerOne');
    const res2 = citizenSystem.getOrCreateCitizen('user_01', 'PlayerOne');

    expect(res1.isNew).toBe(true);
    expect(res2.isNew).toBe(false);
    expect(res1.citizen.id).toBe(res2.citizen.id);
    expect(worldState.citizens.size).toBe(1);
  });

  it('should correctly set initial stats and color', () => {
    const { citizen } = citizenSystem.getOrCreateCitizen('user_02', 'HeroMiner');

    expect(citizen.stats.woodHarvested).toBe(0);
    expect(citizen.stats.stoneHarvested).toBe(0);
    expect(citizen.stats.buildingsContributed).toBe(0);
    expect(citizen.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
