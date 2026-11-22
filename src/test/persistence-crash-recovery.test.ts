import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilePersistenceAdapter } from '../core/adapters/FilePersistenceAdapter';
import { GameEngine } from '../core/engine/GameEngine';

function isSnapshotLike(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    obj.resources !== null &&
    typeof obj.resources === 'object' &&
    Array.isArray(obj.citizens) &&
    Array.isArray(obj.buildings)
  );
}

describe('FilePersistenceAdapter Atomic Saves & Crash Recovery', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-city-persist-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('serializes concurrent save bursts cleanly without race failures or leftover temp files', async () => {
    const dir = await makeTempDir();
    const adapter = new FilePersistenceAdapter(dir);

    // Fire 20 concurrent saves for the same key
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        adapter.save('world_save', { seq: i + 1, marker: `tick_${i + 1}` })
      )
    );

    const loaded = await adapter.load<{ seq: number; marker: string } | null>('world_save', null);
    expect(loaded).not.toBeNull();
    expect(loaded!.seq).toBe(20);
    expect(loaded!.marker).toBe('tick_20');

    // Backup must reflect seq 19
    const backup = await adapter.loadBackup<{ seq: number; marker: string } | null>('world_save', null);
    expect(backup).not.toBeNull();
    expect(backup!.seq).toBe(19);

    // Zero stray .tmp.json files
    const entries = await fs.readdir(dir);
    const tmpLeftovers = entries.filter((f) => f.includes('.tmp.'));
    expect(tmpLeftovers).toHaveLength(0);
  });

  it('protects healthy backup from corrupt primary JSON and recovers via backup fallback', async () => {
    const dir = await makeTempDir();
    const adapter = new FilePersistenceAdapter(dir, isSnapshotLike);

    const goodSnapV1 = {
      version: 2,
      resources: { wood: 100, stone: 80, food: 60, gold: 25 },
      citizens: [],
      buildings: [],
    };
    const goodSnapV2 = {
      version: 2,
      resources: { wood: 250, stone: 140, food: 90, gold: 50 },
      citizens: [],
      buildings: [],
    };

    await adapter.save('world_save', goodSnapV1);
    await adapter.save('world_save', goodSnapV2);

    // Simulate torn crash corrupting primary world_save.json while backup still holds V1
    await fs.writeFile(path.join(dir, 'world_save.json'), '{"version": 2, "resources": {', 'utf-8');

    // Saving a new valid snapshot when primary is ALREADY corrupted must NOT overwrite backup with corrupt primary
    const goodSnapV3 = {
      version: 2,
      resources: { wood: 300, stone: 160, food: 95, gold: 60 },
      citizens: [],
      buildings: [],
    };
    await adapter.save('world_save', goodSnapV3);

    const backupBeforeCorrupt = await adapter.loadBackup<typeof goodSnapV1 | null>('world_save', null);
    expect(backupBeforeCorrupt).toEqual(goodSnapV1);

    // Corrupt primary again -> load() automatically falls back to healthy backup (goodSnapV1)
    await fs.writeFile(path.join(dir, 'world_save.json'), 'CORRUPT_TRUNCATED', 'utf-8');
    const recovered = await adapter.load<typeof goodSnapV1 | null>('world_save', null);
    expect(recovered).toEqual(goodSnapV1);
  });

  it('rejects schema-invalid primary JSON even if syntactically valid and falls back to valid backup', async () => {
    const dir = await makeTempDir();
    const adapter = new FilePersistenceAdapter(dir, isSnapshotLike);

    const healthySnapshot = {
      version: 2,
      resources: { wood: 444, stone: 333, food: 222, gold: 111 },
      citizens: [],
      buildings: [],
    };
    await adapter.save('world_save', healthySnapshot);
    await adapter.save('world_save', {
      ...healthySnapshot,
      resources: { wood: 555, stone: 333, food: 222, gold: 111 },
    });

    // Replace primary with syntactically valid JSON that fails snapshot schema
    await fs.writeFile(path.join(dir, 'world_save.json'), JSON.stringify({ rogue: true }), 'utf-8');

    const loaded = await adapter.load<typeof healthySnapshot | null>('world_save', null);
    expect(loaded).not.toBeNull();
    expect(loaded!.resources.wood).toBe(444);

    // If BOTH primary and backup fail/corrupt, returns fallback cleanly
    await fs.writeFile(path.join(dir, 'world_save.backup.json'), '{"bad":true}', 'utf-8');
    const fallbackRes = await adapter.load<null>('world_save', null);
    expect(fallbackRes).toBeNull();
  });

  it('recovers full GameEngine city state across disk save -> simulated crash -> reboot', async () => {
    const dir = await makeTempDir();
    const persistence1 = new FilePersistenceAdapter(dir, isSnapshotLike);
    const engine1 = new GameEngine({ persistence: persistence1, headless: true });
    await engine1.init();

    // Viewer joins, harvests wood, contributes to active construction
    engine1.commandDispatcher.processComment({
      id: 'crash_cmd_1',
      userId: 'u_crash_tester',
      userName: 'CrashSurvivor',
      comment: 'go',
      timestamp: Date.now(),
    });
    engine1.worldState.addResource('wood', 180, 'CrashSurvivor');
    const c = engine1.worldState.getCitizenByUserId('u_crash_tester');
    expect(c).toBeDefined();
    engine1.citizenSystem.updateCitizenProgression(c!, 250);
    await engine1.saveState();
    engine1.destroy();

    // Boot fresh engine over same temp dir
    const persistence2 = new FilePersistenceAdapter(dir, isSnapshotLike);
    const engine2 = new GameEngine({ persistence: persistence2, headless: true });
    await engine2.init();

    expect(engine2.worldState.resources.wood).toBe(300); // 120 initial + 180
    const restoredCitizen = engine2.worldState.getCitizenByUserId('u_crash_tester');
    expect(restoredCitizen?.userName).toBe('CrashSurvivor');
    expect(restoredCitizen?.level).toBe(3);
    expect(restoredCitizen?.title).toBe('Thợ Lành Nghề');
    engine2.destroy();
  });
});
