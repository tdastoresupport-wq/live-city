export interface RateLimitResult {
  allowed: boolean;
  remainingMs: number;
}

export class RateLimiter {
  private lastActionTimes: Map<string, number> = new Map();
  private cooldownMs: number;

  constructor(cooldownMs = 1500) {
    this.cooldownMs = cooldownMs;
  }

  /**
   * Check if user is within rate limit and record timestamp if allowed.
   */
  public checkAndRecord(userId: string, now = Date.now()): RateLimitResult {
    const lastTime = this.lastActionTimes.get(userId) || 0;
    const diff = now - lastTime;

    if (diff < this.cooldownMs) {
      return {
        allowed: false,
        remainingMs: this.cooldownMs - diff,
      };
    }

    this.lastActionTimes.set(userId, now);
    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  /**
   * Peak check without recording.
   */
  public check(userId: string, now = Date.now()): RateLimitResult {
    const lastTime = this.lastActionTimes.get(userId) || 0;
    const diff = now - lastTime;

    if (diff < this.cooldownMs) {
      return {
        allowed: false,
        remainingMs: this.cooldownMs - diff,
      };
    }

    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  public resetUser(userId: string): void {
    this.lastActionTimes.delete(userId);
  }

  public clear(): void {
    this.lastActionTimes.clear();
  }

  public setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }

  public getCooldown(): number {
    return this.cooldownMs;
  }
}
