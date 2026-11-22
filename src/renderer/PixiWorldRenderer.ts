import { Application, Container, Graphics } from 'pixi.js';
import { WorldState } from '../core/state/WorldState';
import { IsometricGrid } from './IsometricGrid';
import { ResourceRenderer } from './ResourceRenderer';
import { StructureRenderer } from './StructureRenderer';
import { EntityRenderer } from './EntityRenderer';
import { CameraController } from './CameraController';

export interface PixiRendererOptions {
  transparentBackground?: boolean;
}

export class PixiWorldRenderer {
  public app: Application;
  public worldContainer: Container;
  public sceneObjectsContainer: Container;
  public camera: CameraController;

  private grid: IsometricGrid;
  private resources: ResourceRenderer;
  private structures: StructureRenderer;
  private entities: EntityRenderer;
  private ambientOverlay: Graphics;

  private initialized = false;
  private destroyed = false;
  private lastAmbientPhase = '';
  private lastSyncedVersion = -1;
  private reducedMotion = false;
  private needsSort = true;
  private cleanupListeners: Array<() => void> = [];

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.sceneObjectsContainer = new Container();
    this.sceneObjectsContainer.label = 'UnifiedDepthScene';
    this.sceneObjectsContainer.sortableChildren = true;

    this.camera = new CameraController(this.worldContainer);

    this.grid = new IsometricGrid();
    // Pass shared sceneObjectsContainer so resources, structures, and citizens depth-sort together!
    this.resources = new ResourceRenderer(this.sceneObjectsContainer);
    this.structures = new StructureRenderer(this.sceneObjectsContainer);
    this.entities = new EntityRenderer(this.sceneObjectsContainer);
    this.ambientOverlay = new Graphics();
  }

  public async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    options: PixiRendererOptions = {}
  ): Promise<void> {
    if (this.initialized || this.destroyed) return;

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x090d16,
      backgroundAlpha: options.transparentBackground ? 0 : 1,
      antialias: true,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      autoDensity: true,
    });

    // Guard against React StrictMode unmounting while async init was in flight
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }

    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.addChild(this.grid.container);
    this.worldContainer.addChild(this.sceneObjectsContainer);
    this.app.stage.addChild(this.ambientOverlay);

    this.camera.init(width, height);
    this.setupInteractions(canvas);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      const onMotionChange = (e: MediaQueryListEvent) => {
        this.reducedMotion = e.matches;
      };
      mq.addEventListener?.('change', onMotionChange);
      this.cleanupListeners.push(() => mq.removeEventListener?.('change', onMotionChange));
    }

    this.initialized = true;
  }

  public setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  public initWorldState(worldState: WorldState): void {
    if (!this.initialized || this.destroyed) return;
    this.grid.init(worldState);
    this.lastSyncedVersion = -1;
    this.sync(worldState);
  }

  /**
   * Synchronizes Pixi entities/buildings/tiles only when WorldState's monotonic version changes.
   */
  public syncIfNeeded(worldState: WorldState): boolean {
    if (!this.initialized || this.destroyed) return false;
    const version = worldState.getStateVersion();
    if (version === this.lastSyncedVersion) {
      return false;
    }
    this.sync(worldState);
    return true;
  }

  public sync(worldState: WorldState): void {
    if (!this.initialized || this.destroyed) return;
    this.lastSyncedVersion = worldState.getStateVersion();
    this.grid.syncDiscovery(worldState);
    this.resources.syncNodes(worldState.resourceNodes.values());
    this.structures.syncBuildings(worldState.buildings.values());
    this.entities.syncCitizens(worldState.citizens.values());
    this.sceneObjectsContainer.sortChildren();
    this.needsSort = false;
    this.drawAmbient(worldState.stats.dayTime);
  }

  public update(deltaTime: number): void {
    if (!this.initialized || this.destroyed) return;
    const envDelta = this.reducedMotion ? 0 : deltaTime;
    this.grid.update(envDelta);
    this.resources.update(envDelta);
    const anyMoved = this.entities.update(deltaTime, this.reducedMotion);
    if (anyMoved || this.needsSort) {
      this.sceneObjectsContainer.sortChildren();
      this.needsSort = false;
    }
    this.camera.update(deltaTime);
  }

  public resize(width: number, height: number): void {
    if (!this.initialized || this.destroyed) return;
    this.app.renderer.resize(width, height);
    this.camera.setViewportSize(width, height);
    this.lastAmbientPhase = '';
  }

  private drawAmbient(dayTime: number): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    let phase: string;
    let alpha = 0;
    let color = 0x000000;

    if (dayTime < 0.2 || dayTime > 0.8) {
      phase = `night_${w}x${h}`;
      alpha = 0.22;
      color = 0x0f172a;
    } else if (dayTime > 0.65 && dayTime <= 0.8) {
      phase = `sunset_${w}x${h}`;
      alpha = 0.12;
      color = 0xf59e0b;
    } else {
      phase = `day_${w}x${h}`;
    }

    if (this.lastAmbientPhase === phase) return;
    this.lastAmbientPhase = phase;

    this.ambientOverlay.clear();
    if (alpha > 0) {
      this.ambientOverlay.rect(0, 0, w, h);
      this.ambientOverlay.fill({ color, alpha });
    }
  }

  private setupInteractions(canvas: HTMLCanvasElement): void {
    const onMouseDown = (e: MouseEvent) => {
      this.camera.startDrag(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      this.camera.onDrag(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      this.camera.endDrag();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.camera.adjustZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    };

    let touchStartDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.camera.startDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.camera.onDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = touchStartDist - dist;
        this.camera.adjustZoom(
          delta * 0.05,
          this.app.screen.width / 2,
          this.app.screen.height / 2
        );
        touchStartDist = dist;
      }
    };
    const onTouchEnd = () => {
      this.camera.endDrag();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart);
    canvas.addEventListener('touchmove', onTouchMove);
    canvas.addEventListener('touchend', onTouchEnd);

    this.cleanupListeners.push(() => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    });
  }

  public destroy(): void {
    this.destroyed = true;
    for (const cleanup of this.cleanupListeners) {
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
    this.cleanupListeners = [];

    if (this.initialized) {
      this.initialized = false;
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // ignore
      }
    }
  }
}
