export interface RateLimitResult {
  allowed: boolean;
  remainingMs: number;
  reason?: 'user_cooldown' | 'global_rate_limit';
}

export class RateLimiter {
  private lastActionTimes: Map<string, number> = new Map();
  private cooldownMs: number;
  private globalMaxPerSecond: number;
  private globalTimestamps: number[] = [];
  private maxTrackedUsers: number;

  constructor(cooldownMs = 1500, globalMaxPerSecond = 40, maxTrackedUsers = 5000) {
    this.cooldownMs = cooldownMs;
    this.globalMaxPerSecond = globalMaxPerSecond;
    this.maxTrackedUsers = maxTrackedUsers;
  }

  /**
   * Check if user and global stream are within rate limit and record timestamp if allowed.
   */
  public checkAndRecord(userId: string, now = Date.now()): RateLimitResult {
    this.cleanup(now);

    // 1. Global rate limit check (protect against botnet/flood spikes)
    if (this.globalTimestamps.length >= this.globalMaxPerSecond) {
      const oldestInWindow = this.globalTimestamps[0];
      return {
        allowed: false,
        remainingMs: Math.max(100, 1000 - (now - oldestInWindow)),
        reason: 'global_rate_limit',
      };
    }

    // 2. Per-user cooldown check
    const lastTime = this.lastActionTimes.get(userId);
    if (lastTime !== undefined) {
      const diff = now - lastTime;
      if (diff < this.cooldownMs) {
        return {
          allowed: false,
          remainingMs: this.cooldownMs - diff,
          reason: 'user_cooldown',
        };
      }
    }

    this.lastActionTimes.set(userId, now);
    this.globalTimestamps.push(now);

    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  /**
   * Peak check without recording.
   */
  public check(userId: string, now = Date.now()): RateLimitResult {
    this.cleanup(now);

    if (this.globalTimestamps.length >= this.globalMaxPerSecond) {
      const oldestInWindow = this.globalTimestamps[0];
      return {
        allowed: false,
        remainingMs: Math.max(100, 1000 - (now - oldestInWindow)),
        reason: 'global_rate_limit',
      };
    }

    const lastTime = this.lastActionTimes.get(userId);
    if (lastTime !== undefined) {
      const diff = now - lastTime;
      if (diff < this.cooldownMs) {
        return {
          allowed: false,
          remainingMs: this.cooldownMs - diff,
          reason: 'user_cooldown',
        };
      }
    }

    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  /**
   * Automatically removes expired entries so memory never grows unboundedly.
   */
  public cleanup(now = Date.now()): void {
    // Clean global 1-second sliding window
    while (this.globalTimestamps.length > 0 && now - this.globalTimestamps[0] >= 1000) {
      this.globalTimestamps.shift();
    }

    // Clean expired user records (older than 2x cooldown)
    const expiryThreshold = Math.max(this.cooldownMs * 2, 10000);
    for (const [uid, ts] of this.lastActionTimes.entries()) {
      if (now - ts >= expiryThreshold) {
        this.lastActionTimes.delete(uid);
      } else {
        break;
      }
    }

    while (this.lastActionTimes.size > this.maxTrackedUsers) {
      const oldestKey = this.lastActionTimes.keys().next().value;
      if (oldestKey) {
        this.lastActionTimes.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  public getTrackedUserCount(): number {
    return this.lastActionTimes.size;
  }

  public resetUser(userId: string): void {
    this.lastActionTimes.delete(userId);
  }

  public clear(): void {
    this.lastActionTimes.clear();
    this.globalTimestamps = [];
  }

  public setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }

  public getCooldown(): number {
    return this.cooldownMs;
  }

  public setGlobalMaxPerSecond(max: number): void {
    this.globalMaxPerSecond = max;
  }
}
