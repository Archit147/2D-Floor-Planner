export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.gridVisible = true;
    this.gridSpacing = 25;
    this.background = '#283230';
    this.minorGrid = '#35403d';
    this.majorGrid = '#404c48';
    this.entities = [];
    this.selectedId = null;
    this.preview = null;
    this.algorithm = 'native';
    this.roomLabels = [];
    this.snapMarker = null;
  }

  resize(width, height) {
    const pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.width = width;
    this.height = height;
    this.draw();
  }

  draw() {
    const context = this.context;
    context.fillStyle = this.background;
    context.fillRect(0, 0, this.width, this.height);
    if (this.gridVisible) this.drawGrid();
    this.drawOrigin();
    for (const entity of this.entities) entity.draw(context, this.camera, { selected: entity.id === this.selectedId, algorithm: this.algorithm });
    if (this.preview) this.preview.draw(context, this.camera, { algorithm: this.algorithm });
    this.drawRoomLabels();
    this.drawSnapMarker();
  }

  drawRoomLabels() {
    const context = this.context;
    for (const room of this.roomLabels) {
      const point = this.camera.worldToScreen(room.centroid);
      if (point.x < 0 || point.x > this.width || point.y < 0 || point.y > this.height) continue;
      context.save();
      context.textAlign = 'center';
      context.fillStyle = '#e1ebdf';
      context.font = '600 11px "DM Sans", sans-serif';
      context.fillText(`${room.area.toFixed(2)} m²`, point.x, point.y);
      context.fillStyle = '#a9b7ae';
      context.font = '9px "DM Mono", monospace';
      context.fillText(`${room.perimeter.toFixed(2)} m perimeter`, point.x, point.y + 14);
      context.restore();
    }
  }

  drawSnapMarker() {
    if (!this.snapMarker) return;
    const context = this.context;
    const point = this.camera.worldToScreen(this.snapMarker.point);
    const colors = { endpoint: '#65d8ca', midpoint: '#f2ce5d', center: '#d5e85c', intersection: '#f28c7c', perpendicular: '#eca96a', nearest: '#80adf0' };
    context.save();
    context.strokeStyle = colors[this.snapMarker.type] || '#ffffff';
    context.fillStyle = this.background;
    context.lineWidth = 1.5;
    context.beginPath();
    if (this.snapMarker.type === 'midpoint' || this.snapMarker.type === 'intersection') {
      context.moveTo(point.x, point.y - 5); context.lineTo(point.x + 5, point.y); context.lineTo(point.x, point.y + 5); context.lineTo(point.x - 5, point.y); context.closePath();
    } else context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fill(); context.stroke();
    context.restore();
  }

  drawGrid() {
    const context = this.context;
    const spacing = this.gridSpacing * this.camera.scale;
    if (spacing < 4) return;
    const topLeft = this.camera.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.camera.screenToWorld({ x: this.width, y: this.height });
    const startX = Math.floor(Math.min(topLeft.x, bottomRight.x) / this.gridSpacing) * this.gridSpacing;
    const endX = Math.ceil(Math.max(topLeft.x, bottomRight.x) / this.gridSpacing) * this.gridSpacing;
    const startY = Math.floor(Math.min(topLeft.y, bottomRight.y) / this.gridSpacing) * this.gridSpacing;
    const endY = Math.ceil(Math.max(topLeft.y, bottomRight.y) / this.gridSpacing) * this.gridSpacing;
    const majorEvery = this.gridSpacing * 4;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = startX; x <= endX; x += this.gridSpacing) {
      const screenX = this.camera.worldToScreen({ x, y: 0 }).x;
      context.strokeStyle = Math.abs(x % majorEvery) < 0.001 ? this.majorGrid : this.minorGrid;
      context.moveTo(Math.round(screenX) + 0.5, 0);
      context.lineTo(Math.round(screenX) + 0.5, this.height);
      context.stroke();
      context.beginPath();
    }
    for (let y = startY; y <= endY; y += this.gridSpacing) {
      const screenY = this.camera.worldToScreen({ x: 0, y }).y;
      context.strokeStyle = Math.abs(y % majorEvery) < 0.001 ? this.majorGrid : this.minorGrid;
      context.moveTo(0, Math.round(screenY) + 0.5);
      context.lineTo(this.width, Math.round(screenY) + 0.5);
      context.stroke();
      context.beginPath();
    }
  }

  drawOrigin() {
    const origin = this.camera.worldToScreen({ x: 0, y: 0 });
    if (origin.x < 0 || origin.x > this.width || origin.y < 0 || origin.y > this.height) return;
    const context = this.context;
    context.strokeStyle = '#bbd34e';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(origin.x - 6, origin.y);
    context.lineTo(origin.x + 6, origin.y);
    context.moveTo(origin.x, origin.y - 6);
    context.lineTo(origin.x, origin.y + 6);
    context.stroke();
  }
}