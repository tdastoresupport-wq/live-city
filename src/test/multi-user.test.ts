import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';
import { CitizenSystem } from '../core/systems/CitizenSystem';
import { CommandDispatcher } from '../core/commands/CommandDispatcher';
import { RawLiveComment } from '../core/types/adapter';

describe('Multi-user Concurrent Contributions', () => {
  let worldState: WorldState;
  let citizenSystem: CitizenSystem;
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    worldState = new WorldState();
    citizenSystem = new CitizenSystem(worldState);
    dispatcher = new CommandDispatcher(worldState, citizenSystem);
  });

  it('should support multiple concurrent citizens acting simultaneously', () => {
    const commentUser1: RawLiveComment = {
      id: 'evt_u1',
      userId: 'u1',
      userName: 'WoodCutter',
      comment: 'GỖ',
      timestamp: Date.now(),
    };
    const commentUser2: RawLiveComment = {
      id: 'evt_u2',
      userId: 'u2',
      userName: 'StoneMiner',
      comment: 'ĐÁ',
      timestamp: Date.now() + 10,
    };
    const commentUser3: RawLiveComment = {
      id: 'evt_u3',
      userId: 'u3',
      userName: 'Builder',
      comment: 'XÂY',
      timestamp: Date.now() + 20,
    };

    dispatcher.processComment(commentUser1);
    dispatcher.processComment(commentUser2);
    dispatcher.processComment(commentUser3);

    expect(worldState.citizens.size).toBe(3);

    const c1 = worldState.getCitizenByUserId('u1')!;
    const c2 = worldState.getCitizenByUserId('u2')!;
    const c3 = worldState.getCitizenByUserId('u3')!;

    expect(c1.state).toBe('moving_to_harvest');
    expect(c2.state).toBe('moving_to_harvest');
    expect(c3.state).toBe('moving_to_build');
  });
});
