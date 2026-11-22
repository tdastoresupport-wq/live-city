import { describe, it, expect } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';

describe('World State Persistence & Recovery', () => {
  it('should take a snapshot and restore state accurately', () => {
    const originalState = new WorldState();
    const citizenSystem = new CitizenSystem(originalState);

    // Create citizens and modify resources
    citizenSystem.getOrCreateCitizen('user_hero', 'Hero');
    originalState.addResource('wood', 75, 'Hero');
    originalState.addResource('stone', 45, 'Hero');

    const activeProject = originalState.getActiveUnderConstruction();
    if (activeProject) {
      originalState.applyBuildProgress(activeProject.id, 20, 'user_hero', 'Hero');
    }

    // Export snapshot
    const snapshot = originalState.toSnapshot();

    expect(snapshot.resources.wood).toBe(originalState.resources.wood);
    expect(snapshot.resources.stone).toBe(originalState.resources.stone);
    expect(snapshot.citizens.length).toBe(1);

    // Create fresh world state and load snapshot
    const recoveredState = new WorldState();
    const success = recoveredState.loadSnapshot(snapshot);

    expect(success).toBe(true);
    expect(recoveredState.resources.wood).toBe(originalState.resources.wood);
    expect(recoveredState.resources.stone).toBe(originalState.resources.stone);
    expect(recoveredState.citizens.size).toBe(1);

    const recoveredCitizen = recoveredState.getCitizenByUserId('user_hero');
    expect(recoveredCitizen).toBeDefined();
    expect(recoveredCitizen?.userName).toBe('Hero');
  });
});
