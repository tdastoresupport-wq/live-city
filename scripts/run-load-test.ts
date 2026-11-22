import { performance } from 'node:perf_hooks';
import { GameEngine } from '../src/core/engine/GameEngine';
import { LocalStoragePersistence } from '../src/core/adapters/LocalStoragePersistence';

async function main() {
  const heapStartMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const engine = new GameEngine({
    persistence: new LocalStoragePersistence(),
    headless: true,
  });
  await engine.init();
  engine.worldState.stats.activeCitizensCap = 100;

  const commands = ['go', 'da', 'luong thuc', 'xay', 'kham pha'] as const;

  // Phase 1: Initial 60 viewer citizens across 3 realistic 1.2s waves (respecting 40/sec global flood cap)
  const baseTs = Date.now();
  const dispatchStart = performance.now();
  for (let i = 0; i < 60; i++) {
    engine.commandDispatcher.processComment({
      id: `bench_join_${i}`,
      userId: `bench_u_${i}`,
      userName: `Viewer_${i}`,
      comment: commands[i % commands.length],
      timestamp: baseTs + Math.floor(i / 25) * 1200 + (i % 25),
    });
  }
  const initial60DispatchMs = performance.now() - dispatchStart;

  // Phase 2: 500 fixed ticks (dt = 0.05s = 25s simulated) with steady viewer traffic
  const tickLatenciesMs: number[] = [];
  let commandCounter = 60;
  const cmdStart = performance.now();

  for (let step = 0; step < 500; step++) {
    const t0 = performance.now();
    engine.tick(0.05);
    tickLatenciesMs.push(performance.now() - t0);

    if (step % 5 === 0) {
      for (let k = 0; k < 4; k++) {
        const uid = `bench_u_${(step + k) % 60}`;
        engine.commandDispatcher.processComment({
          id: `bench_cmd_${commandCounter++}`,
          userId: uid,
          userName: `Viewer_${(step + k) % 60}`,
          comment: commands[(step + k) % commands.length],
          timestamp: baseTs + 5000 + commandCounter * 50,
        });
      }
    }
  }
  const loopTotalMs = performance.now() - cmdStart;

  // Phase 3: Snapshot serialization benchmark (20 iterations)
  const snapLatenciesMs: number[] = [];
  let lastPayloadBytes = 0;
  for (let s = 0; s < 20; s++) {
    const s0 = performance.now();
    const json = JSON.stringify(engine.worldState.toSnapshot());
    snapLatenciesMs.push(performance.now() - s0);
    lastPayloadBytes = Buffer.byteLength(json, 'utf-8');
  }

  engine.destroy();

  const sortedTicks = [...tickLatenciesMs].sort((a, b) => a - b);
  const p50TickMs = sortedTicks[Math.floor(sortedTicks.length * 0.5)];
  const p95TickMs = sortedTicks[Math.floor(sortedTicks.length * 0.95)];
  const maxTickMs = sortedTicks[sortedTicks.length - 1];
  const avgTickMs = tickLatenciesMs.reduce((a, b) => a + b, 0) / tickLatenciesMs.length;
  const avgSnapMs = snapLatenciesMs.reduce((a, b) => a + b, 0) / snapLatenciesMs.length;
  const heapEndMb = process.memoryUsage().heapUsed / (1024 * 1024);

  const report = {
    citizensActive: engine.worldState.citizens.size,
    ticksMeasured: tickLatenciesMs.length,
    commandsDispatched: commandCounter,
    initial60DispatchMs: Number(initial60DispatchMs.toFixed(3)),
    loopTotalMs: Number(loopTotalMs.toFixed(3)),
    p50TickMs: Number(p50TickMs.toFixed(3)),
    avgTickMs: Number(avgTickMs.toFixed(3)),
    p95TickMs: Number(p95TickMs.toFixed(3)),
    maxTickMs: Number(maxTickMs.toFixed(3)),
    avgSnapshotJsonMs: Number(avgSnapMs.toFixed(3)),
    snapshotSizeKb: Number((lastPayloadBytes / 1024).toFixed(2)),
    heapStartMb: Number(heapStartMb.toFixed(2)),
    heapEndMb: Number(heapEndMb.toFixed(2)),
  };

  console.log('LIVE_CITY_LOAD_BENCHMARK:', JSON.stringify(report));

  if (report.p95TickMs >= 25 || report.maxTickMs >= 100) {
    console.error('LOAD_THRESHOLD_EXCEEDED', report);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('LOAD_BENCHMARK_ERROR', err);
  process.exit(1);
});
