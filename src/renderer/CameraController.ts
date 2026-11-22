import { Container } from 'pixi.js';

export class CameraController {
  public worldContainer: Container;
  public zoom = 1.0;
  public targetX = 0;
  public targetY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private startCamX = 0;
  private startCamY = 0;

  constructor(worldContainer: Container) {
    this.worldContainer = worldContainer;
  }

  public init(viewportWidth: number, viewportHeight: number): void {
    // Default camera center (centered on City Hall at x: 10, y: 10)
    this.targetX = viewportWidth / 2;
    this.targetY = viewportHeight * 0.42;
    this.zoom = 1.15;

    this.worldContainer.position.set(this.targetX, this.targetY);
    this.worldContainer.scale.set(this.zoom);
  }

  public update(_deltaTime: number): void {
    if (!this.isDragging) {
      // Smooth lerp towards target
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
    this.worldContainer.x = this.startCamX + dx;
    this.worldContainer.y = this.startCamY + dy;
    this.targetX = this.worldContainer.x;
    this.targetY = this.worldContainer.y;
  }

  public endDrag(): void {
    this.isDragging = false;
  }

  public adjustZoom(delta: number, centerX: number, centerY: number): void {
    const oldZoom = this.zoom;
    const newZoom = Math.max(0.6, Math.min(2.5, oldZoom * (delta > 0 ? 0.9 : 1.1)));
    if (newZoom === oldZoom) return;

    // Zoom towards center
    const worldPos = {
      x: (centerX - this.worldContainer.x) / oldZoom,
      y: (centerY - this.worldContainer.y) / oldZoom,
    };

    this.zoom = newZoom;
    this.worldContainer.scale.set(this.zoom);

    this.targetX = centerX - worldPos.x * this.zoom;
    this.targetY = centerY - worldPos.y * this.zoom;
    this.worldContainer.position.set(this.targetX, this.targetY);
  }

  public focusCenter(viewportWidth: number, viewportHeight: number): void {
    this.targetX = viewportWidth / 2;
    this.targetY = viewportHeight * 0.42;
    this.zoom = 1.15;
    this.worldContainer.scale.set(this.zoom);
  }
}
