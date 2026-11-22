import { WorldState, WorldSnapshot } from '../state/WorldState';
import { CitizenSystem } from '../systems/CitizenSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { BuildingSystem } from '../systems/BuildingSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { CommandDispatcher } from '../commands/CommandDispatcher';
import { MockLiveAdapter } from '../adapters/MockLiveAdapter';
import { LocalStoragePersistence } from '../adapters/LocalStoragePersistence';
import { RawLiveComment } from '../types/adapter';

export class GameEngine {
  public worldState: WorldState;
  public citizenSystem: CitizenSystem;
  public resourceSystem: ResourceSystem;
  public buildingSystem: BuildingSystem;
  public audioSystem: AudioSystem;
  public commandDispatcher: CommandDispatcher;
  public liveAdapter: MockLiveAdapter;
  public persistence: LocalStoragePersistence;

  private isRunning = false;
  private lastTimestamp = 0;
  private animFrameId: number | null = null;
  private unsubscribeLiveComment: (() => void) | null = null;
  private autoSaveTimer = 0;

  constructor() {
    this.worldState = new WorldState();
    this.audioSystem = new AudioSystem();
    this.citizenSystem = new CitizenSystem(this.worldState, this.audioSystem);
    this.resourceSystem = new ResourceSystem(this.worldState);
    this.buildingSystem = new BuildingSystem(this.worldState);
    this.commandDispatcher = new CommandDispatcher(this.worldState, this.citizenSystem);
    this.liveAdapter = new MockLiveAdapter();
    this.persistence = new LocalStoragePersistence();

    this.setupListeners();
  }

  private setupListeners(): void {
    // Connect live comments to command dispatcher
    this.unsubscribeLiveComment = this.liveAdapter.onComment((comment: RawLiveComment) => {
      this.commandDispatcher.processComment(comment);
    });
  }

  public async init(): Promise<void> {
    await this.liveAdapter.connect();

    // Check if previous state exists in persistence
    const savedSnapshot = await this.persistence.load<WorldSnapshot | null>('world_save', null);
    if (savedSnapshot) {
      this.worldState.loadSnapshot(savedSnapshot);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public isEngineRunning(): boolean {
    return this.isRunning;
  }

  private loop = (currentTimestamp: number): void => {
    if (!this.isRunning) return;

    const rawDelta = (currentTimestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = currentTimestamp;

    // Clamp delta time to avoid large jumps when tab is inactive
    const deltaTime = Math.min(rawDelta, 0.1);

    this.tick(deltaTime);

    this.animFrameId = requestAnimationFrame(this.loop);
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
      this.saveState();
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
    this.liveAdapter.disconnect();
    if (this.unsubscribeLiveComment) {
      this.unsubscribeLiveComment();
    }
  }
}
