import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../core/commands/RateLimiter';

describe('Rate Limiter & Spam Prevention', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(1000); // 1000ms cooldown
  });

  it('should allow first command from user', () => {
    const res = rateLimiter.checkAndRecord('user_spammer', 10000);
    expect(res.allowed).toBe(true);
    expect(res.remainingMs).toBe(0);
  });

  it('should reject rapid consecutive commands within cooldown window', () => {
    rateLimiter.checkAndRecord('user_spammer', 10000);

    // Sent 200ms later -> should be rejected
    const spamRes1 = rateLimiter.checkAndRecord('user_spammer', 10200);
    expect(spamRes1.allowed).toBe(false);
    expect(spamRes1.remainingMs).toBe(800);

    // Sent 900ms later -> still rejected
    const spamRes2 = rateLimiter.checkAndRecord('user_spammer', 10900);
    expect(spamRes2.allowed).toBe(false);
    expect(spamRes2.remainingMs).toBe(100);
  });

  it('should allow command after cooldown period has elapsed', () => {
    rateLimiter.checkAndRecord('user_spammer', 10000);

    // Sent 1001ms later -> allowed
    const okRes = rateLimiter.checkAndRecord('user_spammer', 11001);
    expect(okRes.allowed).toBe(true);
  });

  it('should track cooldowns independently per user', () => {
    rateLimiter.checkAndRecord('user_1', 10000);

    // user_2 should be allowed immediately
    const user2Res = rateLimiter.checkAndRecord('user_2', 10050);
    expect(user2Res.allowed).toBe(true);
  });
});
