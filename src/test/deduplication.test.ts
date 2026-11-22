import { describe, it, expect, beforeEach } from 'vitest';
import { Deduplicator } from '../core/commands/Deduplicator';

describe('Event Deduplication', () => {
  let deduplicator: Deduplicator;

  beforeEach(() => {
    deduplicator = new Deduplicator(5000); // 5 sec TTL
  });

  it('should accept unique events', () => {
    expect(deduplicator.isUnique('event_001', 1000)).toBe(true);
    expect(deduplicator.isUnique('event_002', 1000)).toBe(true);
  });

  it('should reject replayed or duplicated event IDs', () => {
    expect(deduplicator.isUnique('event_dup', 1000)).toBe(true);
    // Duplicate arrival
    expect(deduplicator.isUnique('event_dup', 1500)).toBe(false);
    expect(deduplicator.isUnique('event_dup', 2000)).toBe(false);
  });

  it('should allow event ID again after TTL expiration', () => {
    expect(deduplicator.isUnique('event_ttl', 1000)).toBe(true);
    expect(deduplicator.isUnique('event_ttl', 2000)).toBe(false);

    // Arrives after TTL (5000ms later)
    expect(deduplicator.isUnique('event_ttl', 7000)).toBe(true);
  });
});
