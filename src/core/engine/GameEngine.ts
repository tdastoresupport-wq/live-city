import { WorldState, WorldSnapshot } from '../state/WorldState';
import { CitizenSystem } from '../systems/CitizenSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { BuildingSystem } from '../systems/BuildingSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { CommandDispatcher } from '../commands/CommandDispatcher';
import { MockLiveAdapter } from '../adapters/MockLiveAdapter';
import { LocalStoragePersistence } from '../adapters/LocalStoragePersistence';
import {
  IAudioSystem,
  ILiveEventAdapter,
  IPersistenceAdapter,
  RawLiveComment,
  RawLiveGift,
  RawLiveLike,
} from '../types/adapter';

export interface GameEngineOptions {
  liveAdapter?: ILiveEventAdapter;
  persistence?: IPersistenceAdapter;
  audioSystem?: IAudioSystem;
  headless?: boolean;
  tickRateHz?: number;
}

export class GameEngine {
  public worldState: WorldState;
  public citizenSystem: CitizenSystem;
  public resourceSystem: ResourceSystem;
  public buildingSystem: BuildingSystem;
  public audioSystem: IAudioSystem;
  public commandDispatcher: CommandDispatcher;
  public liveAdapter: ILiveEventAdapter;
  public mockAdapter: MockLiveAdapter;
  public persistence: IPersistenceAdapter;

  private isRunning = false;
  private headless: boolean;
  private tickRateHz: number;
  private lastTimestamp = 0;
  private animFrameId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private adapterSubscriptions: Array<() => void> = [];
  private autoSaveTimer = 0;

  constructor(options: GameEngineOptions = {}) {
    this.worldState = new WorldState();
    this.audioSystem = options.audioSystem || new AudioSystem();
    this.citizenSystem = new CitizenSystem(this.worldState, this.audioSystem);
    this.resourceSystem = new ResourceSystem(this.worldState);
    this.buildingSystem = new BuildingSystem(this.worldState);
    this.commandDispatcher = new CommandDispatcher(
      this.worldState,
      this.citizenSystem,
      undefined,
      undefined,
      this.buildingSystem,
      this.resourceSystem
    );

    this.mockAdapter =
      options.liveAdapter instanceof MockLiveAdapter
        ? options.liveAdapter
        : new MockLiveAdapter();
    this.liveAdapter = options.liveAdapter || this.mockAdapter;
    this.persistence = options.persistence || new LocalStoragePersistence();
    this.headless =
      options.headless ?? typeof globalThis.requestAnimationFrame !== 'function';
    this.tickRateHz = options.tickRateHz || 30;

    this.bindAdapter(this.liveAdapter);
    if (this.liveAdapter !== this.mockAdapter) {
      this.bindAdapter(this.mockAdapter);
    }
  }

  public setLiveAdapter(newAdapter: ILiveEventAdapter): void {
    this.unbindAllAdapters();
    this.liveAdapter = newAdapter;
    this.bindAdapter(this.liveAdapter);
    if (this.liveAdapter !== this.mockAdapter) {
      this.bindAdapter(this.mockAdapter);
    }
  }

  private bindAdapter(adapter: ILiveEventAdapter): void {
    const unsubComment = adapter.onComment((comment: RawLiveComment) => {
      try {
        this.commandDispatcher.processComment(comment);
      } catch (err) {
        console.error('Error processing live comment:', err);
      }
    });
    this.adapterSubscriptions.push(unsubComment);

    if (adapter.onGift) {
      const unsubGift = adapter.onGift((gift: RawLiveGift) => {
        try {
          this.commandDispatcher.processGift(gift);
        } catch (err) {
          console.error('Error processing live gift:', err);
        }
      });
      this.adapterSubscriptions.push(unsubGift);
    }

    if (adapter.onLike) {
      const unsubLike = adapter.onLike((like: RawLiveLike) => {
        try {
          this.commandDispatcher.processLike(like);
        } catch (err) {
          console.error('Error processing live like:', err);
        }
      });
      this.adapterSubscriptions.push(unsubLike);
    }
  }

  private unbindAllAdapters(): void {
    for (const unsub of this.adapterSubscriptions) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.adapterSubscriptions = [];
  }

  public async init(): Promise<void> {
    await this.mockAdapter.connect();
    if (this.liveAdapter !== this.mockAdapter) {
      try {
        await this.liveAdapter.connect();
      } catch (err) {
        console.warn('Primary live adapter connect warning:', err);
      }
    }

    // Load saved snapshot with schema validation & backup fallback
    const savedSnapshot = await this.persistence.load<WorldSnapshot | null>('world_save', null);
    if (savedSnapshot) {
      const loaded = this.worldState.loadSnapshot(savedSnapshot);
      if (!loaded && 'loadBackup' in this.persistence) {
        const backupLoader = this.persistence as LocalStoragePersistence;
        const backupSnapshot = await backupLoader.loadBackup<WorldSnapshot | null>(
          'world_save',
          null
        );
        if (backupSnapshot) {
          this.worldState.loadSnapshot(backupSnapshot);
        }
      }
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();

    if (!this.headless && typeof globalThis.requestAnimationFrame === 'function') {
      this.animFrameId = globalThis.requestAnimationFrame(this.loop);
    } else {
      const intervalMs = Math.max(16, Math.round(1000 / this.tickRateHz));
      this.intervalId = setInterval(() => {
        if (!this.isRunning) return;
        const now = performance.now();
        const rawDelta = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;
        this.tick(Math.min(rawDelta, 0.1));
      }, intervalMs);
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public isEngineRunning(): boolean {
    return this.isRunning;
  }

  private loop = (currentTimestamp: number): void => {
    if (!this.isRunning) return;

    const rawDelta = (currentTimestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = currentTimestamp;

    const deltaTime = Math.min(rawDelta, 0.1);
    this.tick(deltaTime);

    if (typeof globalThis.requestAnimationFrame === 'function') {
      this.animFrameId = globalThis.requestAnimationFrame(this.loop);
    }
  };

  public tick(deltaTime: number): void {
    // 1. Advance daylight cycle
    this.worldState.stats.dayTime = (this.worldState.stats.dayTime + deltaTime * 0.005) % 1.0;

    // 2. Update core systems
    this.citizenSystem.update(deltaTime);
    this.resourceSystem.update(deltaTime);
    this.buildingSystem.update(deltaTime);

    // 3. Auto-save every 30 seconds
    this.autoSaveTimer += deltaTime;
    if (this.autoSaveTimer >= 30) {
      this.autoSaveTimer = 0;
      this.saveState().catch(() => {});
    }
  }

  public async saveState(): Promise<void> {
    const snapshot = this.worldState.toSnapshot();
    await this.persistence.save('world_save', snapshot);
  }

  public async resetWorld(): Promise<void> {
    await this.persistence.remove('world_save');
    this.worldState.resetToInitial();
  }

  public destroy(): void {
    this.stop();
    this.liveAdapter.disconnect().catch(() => {});
    if (this.mockAdapter !== this.liveAdapter) {
      this.mockAdapter.disconnect().catch(() => {});
    }
    this.unbindAllAdapters();
  }
}
