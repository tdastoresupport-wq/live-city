import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../core/state/WorldState';

describe('Building Construction & Multi-contributor Collaboration', () => {
  let worldState: WorldState;

  beforeEach(() => {
    worldState = new WorldState();
  });

  it('should have an initial under-construction building project', () => {
    const activeProject = worldState.getActiveUnderConstruction();
    expect(activeProject).toBeDefined();
    expect(activeProject?.status).toBe('constructing');
    expect(activeProject?.progress).toBeLessThan(activeProject!.requiredProgress);
  });

  it('should apply build progress correctly and accumulate contributor points', () => {
    const project = worldState.getActiveUnderConstruction()!;
    const initialProgress = project.progress;

    const res1 = worldState.applyBuildProgress(project.id, 10, 'user_a', 'Alice');
    expect(res1?.completed).toBe(false);
    expect(project.progress).toBe(initialProgress + 10);
    expect(project.contributions['user_a']).toBe(10);

    const res2 = worldState.applyBuildProgress(project.id, 15, 'user_b', 'Bob');
    expect(res2?.completed).toBe(false);
    expect(project.progress).toBe(initialProgress + 25);
    expect(project.contributions['user_b']).toBe(15);
  });

  it('should mark building active only when progress reaches required progress', () => {
    const project = worldState.getActiveUnderConstruction()!;
    const needed = project.requiredProgress - project.progress;

    // Apply partial progress
    worldState.applyBuildProgress(project.id, needed - 1, 'user_c', 'Charlie');
    expect(project.status).toBe('constructing');

    // Finish progress
    const finalRes = worldState.applyBuildProgress(project.id, 1, 'user_c', 'Charlie');
    expect(finalRes?.completed).toBe(true);
    expect(project.status).toBe('active');
    expect(project.completedAt).toBeDefined();
  });
});
