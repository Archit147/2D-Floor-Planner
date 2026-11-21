import { Matrix3 } from './Matrix3.js';

export class Camera {
  constructor() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minScale = 0.12;
    this.maxScale = 8;
  }

  worldToScreen(point) {
    return Matrix3.translate(this.offsetX, this.offsetY)
      .compose(Matrix3.scale(this.scale, -this.scale))
      .transformPoint(point.x, point.y);
  }

  screenToWorld(point) {
    return Matrix3.translate(this.offsetX, this.offsetY)
      .compose(Matrix3.scale(this.scale, -this.scale))
      .inverse()
      .transformPoint(point.x, point.y);
  }

  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  // Keep the world point beneath the cursor fixed while changing camera scale.
  zoomAt(screenPoint, factor) {
    const anchor = this.screenToWorld(screenPoint);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.offsetX = screenPoint.x - anchor.x * this.scale;
    this.offsetY = screenPoint.y + anchor.y * this.scale;
  }

  reset(width, height) {
    this.scale = 1;
    this.offsetX = width / 2;
    this.offsetY = height / 2;
  }
}