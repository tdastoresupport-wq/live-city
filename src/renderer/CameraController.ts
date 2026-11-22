import { Container } from 'pixi.js';
import { clamp } from '../core/utils/math';

export class CameraController {
  public worldContainer: Container;
  public zoom = 1.0;
  public targetX = 0;
  public targetY = 0;
  private viewportWidth = 1080;
  private viewportHeight = 1920;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private startCamX = 0;
  private startCamY = 0;

  constructor(worldContainer: Container) {
    this.worldContainer = worldContainer;
  }

  public init(viewportWidth: number, viewportHeight: number): void {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.targetX = viewportWidth / 2;
    this.targetY = viewportHeight * 0.34;
    this.zoom = viewportWidth < 600 ? 0.82 : 1.1;

    this.clampTargets();
    this.worldContainer.position.set(this.targetX, this.targetY);
    this.worldContainer.scale.set(this.zoom);
  }

  public setViewportSize(viewportWidth: number, viewportHeight: number): void {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.clampTargets();
  }

  private clampTargets(): void {
    const maxPanX = 750 * this.zoom;
    const maxPanY = 550 * this.zoom;
    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight * 0.34;

    this.targetX = clamp(this.targetX, centerX - maxPanX, centerX + maxPanX);
    this.targetY = clamp(this.targetY, centerY - maxPanY, centerY + maxPanY);
  }

  public update(_deltaTime: number): void {
    if (!this.isDragging) {
      this.worldContainer.x += (this.targetX - this.worldContainer.x) * 0.15;
      this.worldContainer.y += (this.targetY - this.worldContainer.y) * 0.15;
    }
  }

  public startDrag(screenX: number, screenY: number): void {
    this.isDragging = true;
    this.dragStartX = screenX;
    this.dragStartY = screenY;
    this.startCamX = this.worldContainer.x;
    this.startCamY = this.worldContainer.y;
  }

  public onDrag(screenX: number, screenY: number): void {
    if (!this.isDragging) return;
    const dx = screenX - this.dragStartX;
    const dy = screenY - this.dragStartY;
    this.targetX = this.startCamX + dx;
    this.targetY = this.startCamY + dy;
    this.clampTargets();
    this.worldContainer.x = this.targetX;
    this.worldContainer.y = this.targetY;
  }

  public endDrag(): void {
    this.isDragging = false;
  }

  public adjustZoom(delta: number, centerX: number, centerY: number): void {
    const oldZoom = this.zoom;
    const newZoom = clamp(oldZoom * (delta > 0 ? 0.9 : 1.1), 0.55, 2.4);
    if (newZoom === oldZoom) return;

    const worldPos = {
      x: (centerX - this.worldContainer.x) / oldZoom,
      y: (centerY - this.worldContainer.y) / oldZoom,
    };

    this.zoom = newZoom;
    this.worldContainer.scale.set(this.zoom);

    this.targetX = centerX - worldPos.x * this.zoom;
    this.targetY = centerY - worldPos.y * this.zoom;
    this.clampTargets();
    this.worldContainer.position.set(this.targetX, this.targetY);
  }

  public focusCenter(viewportWidth: number, viewportHeight: number): void {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.targetX = viewportWidth / 2;
    this.targetY = viewportHeight * 0.34;
    this.zoom = viewportWidth < 600 ? 0.82 : 1.1;
    this.clampTargets();
    this.worldContainer.scale.set(this.zoom);
  }
}
