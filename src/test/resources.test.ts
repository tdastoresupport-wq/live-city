import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';

describe('Resource System Invariants', () => {
  let worldState: WorldState;

  beforeEach(() => {
    worldState = new WorldState();
  });

  it('should successfully add resources and update city totals', () => {
    const initialWood = worldState.resources.wood;
    const added = worldState.addResource('wood', 50, 'TestBuilder');

    expect(added).toBe(true);
    expect(worldState.resources.wood).toBe(initialWood + 50);
  });

  it('should respect storage capacity and not exceed max cap', () => {
    // Attempt to add massive amount
    worldState.addResource('wood', 50000, 'Whale');
    expect(worldState.resources.wood).toBeLessThanOrEqual(1000); // initial cap
  });

  it('should prevent negative resources when consuming', () => {
    worldState.resources.stone = 20;

    // Attempting to consume more than available must fail
    const consumed = worldState.consumeResource('stone', 50);
    expect(consumed).toBe(false);
    expect(worldState.resources.stone).toBe(20); // must remain unchanged
  });

  it('should allow consuming when sufficient resources exist', () => {
    worldState.resources.wood = 100;
    const consumed = worldState.consumeResource('wood', 40);

    expect(consumed).toBe(true);
    expect(worldState.resources.wood).toBe(60);
  });
});
