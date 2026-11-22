import { Application, Container, Graphics } from 'pixi.js';
import { WorldState } from '../core/state/WorldState';
import { IsometricGrid } from './IsometricGrid';
import { ResourceRenderer } from './ResourceRenderer';
import { StructureRenderer } from './StructureRenderer';
import { EntityRenderer } from './EntityRenderer';
import { CameraController } from './CameraController';

export class PixiWorldRenderer {
  public app: Application;
  public worldContainer: Container;
  public camera: CameraController;

  private grid: IsometricGrid;
  private resources: ResourceRenderer;
  private structures: StructureRenderer;
  private entities: EntityRenderer;
  private ambientOverlay: Graphics;
  private initialized = false;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
    this.camera = new CameraController(this.worldContainer);

    this.grid = new IsometricGrid();
    this.resources = new ResourceRenderer();
    this.structures = new StructureRenderer();
    this.entities = new EntityRenderer();
    this.ambientOverlay = new Graphics();
  }

  public async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    if (this.initialized) return;

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x090d16, // Dark slate cozy stream canvas
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.addChild(this.worldContainer);

    // Layer stack inside worldContainer
    this.worldContainer.addChild(this.grid.container);
    this.worldContainer.addChild(this.resources.container);
    this.worldContainer.addChild(this.structures.container);
    this.worldContainer.addChild(this.entities.container);

    // Ambient overlay on top of world
    this.app.stage.addChild(this.ambientOverlay);

    this.camera.init(width, height);
    this.setupInteractions(canvas);

    this.initialized = true;
  }

  public initWorldState(worldState: WorldState): void {
    this.grid.init(worldState);
    this.sync(worldState);
  }

  public sync(worldState: WorldState): void {
    this.resources.syncNodes(worldState.resourceNodes.values());
    this.structures.syncBuildings(worldState.buildings.values());
    this.entities.syncCitizens(worldState.citizens.values());
    this.drawAmbient(worldState.stats.dayTime);
  }

  public update(deltaTime: number): void {
    this.grid.update(deltaTime);
    this.resources.update(deltaTime);
    this.entities.update(deltaTime);
    this.camera.update(deltaTime);
  }

  public resize(width: number, height: number): void {
    if (!this.initialized) return;
    this.app.renderer.resize(width, height);
    this.camera.targetX = width / 2;
    this.camera.targetY = height * 0.42;
  }

  private drawAmbient(dayTime: number): void {
    this.ambientOverlay.clear();

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Day cycle: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    // Cozy warm tint in morning/afternoon, soft dusk in evening
    let alpha = 0;
    let color = 0x000000;

    if (dayTime < 0.2 || dayTime > 0.8) {
      // Night / Dusk
      alpha = 0.25;
      color = 0x0f172a; // Deep slate blue
    } else if (dayTime > 0.65 && dayTime <= 0.8) {
      // Golden Hour Sunset
      alpha = 0.12;
      color = 0xf59e0b; // Warm Amber
    }

    if (alpha > 0) {
      this.ambientOverlay.rect(0, 0, w, h);
      this.ambientOverlay.fill({ color, alpha });
    }
  }

  private setupInteractions(canvas: HTMLCanvasElement): void {
    // Mouse drag for pan
    canvas.addEventListener('mousedown', (e) => {
      this.camera.startDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      this.camera.onDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      this.camera.endDrag();
    });

    // Wheel zoom
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.camera.adjustZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false }
    );

    // Touch support for mobile / touch devices
    let touchStartDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.camera.startDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        this.camera.onDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = touchStartDist - dist;
        this.camera.adjustZoom(delta * 0.05, this.app.screen.width / 2, this.app.screen.height / 2);
        touchStartDist = dist;
      }
    });

    canvas.addEventListener('touchend', () => {
      this.camera.endDrag();
    });
  }

  public destroy(): void {
    if (this.initialized) {
      this.app.destroy(true, { children: true });
      this.initialized = false;
    }
  }
}
