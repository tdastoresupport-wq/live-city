export class Deduplicator {
  private seenEvents: Map<string, number> = new Map();
  private ttlMs: number;
  private maxSize: number;

  constructor(ttlMs = 60000, maxSize = 2000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Check if event has already been processed. If not, mark as seen.
   * Returns true if event is NEW (not duplicate), false if DUPLICATE.
   */
  public isUnique(eventId: string, now = Date.now()): boolean {
    if (!eventId) return false;

    this.cleanup(now);

    if (this.seenEvents.has(eventId)) {
      return false; // Duplicate!
    }

    // Mark as seen
    this.seenEvents.set(eventId, now);

    // Safeguard max size
    if (this.seenEvents.size > this.maxSize) {
      const oldestKey = this.seenEvents.keys().next().value;
      if (oldestKey) {
        this.seenEvents.delete(oldestKey);
      }
    }

    return true;
  }

  /**
   * Evict expired records.
   */
  private cleanup(now: number): void {
    for (const [id, timestamp] of this.seenEvents.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.seenEvents.delete(id);
      } else {
        // Since Map maintains insertion order, earlier entries expire first
        break;
      }
    }
  }

  public clear(): void {
    this.seenEvents.clear();
  }

  public size(): number {
    return this.seenEvents.size;
  }
}
