import { describe, it, expect } from 'vitest';
import { GameEngine } from '../core/engine/GameEngine';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';

describe('Engine Performance & Load Budgets (60 Active Citizens)', () => {
  it('ticks 60 active moving/harvesting/building citizens within 25ms p95 budget and dispatches 200 viewer commands rapidly', async () => {
    const engine = new GameEngine({
      persistence: new LocalStoragePersistence(),
      headless: true,
    });
    await engine.init();
    engine.worldState.stats.activeCitizensCap = 80;

    // Seed 60 viewer citizens across 3 realistic 1.2s waves (respecting 40/sec global flood cap)
    const baseTs = Date.now();
    const cmdStart = performance.now();
    const commands = ['go', 'da', 'luong thuc', 'xay', 'kham pha'];
    for (let i = 0; i < 60; i++) {
      engine.commandDispatcher.processComment({
        id: `load_join_${i}`,
        userId: `viewer_load_${i}`,
        userName: `Viewer_${i}`,
        comment: commands[i % commands.length],
        timestamp: baseTs + Math.floor(i / 25) * 1200 + (i % 25),
      });
    }
    const afterJoinMs = performance.now() - cmdStart;

    const tickDurationsMs: number[] = [];
    for (let t = 0; t < 200; t++) {
      const t0 = performance.now();
      engine.tick(0.05);
      tickDurationsMs.push(performance.now() - t0);

      // Re-assign idle citizens periodically during load run
      if (t % 25 === 0) {
        for (let i = 0; i < 15; i++) {
          const idx = (t + i) % 60;
          engine.commandDispatcher.processComment({
            id: `load_tick_${t}_${idx}`,
            userId: `viewer_load_${idx}`,
            userName: `Viewer_${idx}`,
            comment: commands[(t + i) % commands.length],
            timestamp: baseTs + 5000 + t * 50 + idx,
          });
        }
      }
    }

    const sorted = [...tickDurationsMs].sort((a, b) => a - b);
    const p95TickMs = sorted[Math.floor(sorted.length * 0.95)];
    const maxTickMs = sorted[sorted.length - 1];

    const snap0 = performance.now();
    const snapshot = engine.worldState.toSnapshot();
    const serialized = JSON.stringify(snapshot);
    const snapshotMs = performance.now() - snap0;

    expect(engine.worldState.citizens.size).toBe(60);
    expect(p95TickMs).toBeLessThan(25);
    expect(maxTickMs).toBeLessThan(100);
    expect(afterJoinMs).toBeLessThan(500);
    expect(snapshotMs).toBeLessThan(50);
    expect(Buffer.byteLength(serialized, 'utf-8')).toBeLessThan(1024 * 1024);

    engine.destroy();
  });
});
