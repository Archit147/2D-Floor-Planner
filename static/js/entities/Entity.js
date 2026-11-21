import { bresenhamLine, midpointCircle } from '../graphics/raster.js';

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

export class Entity {
  constructor(data) {
    this.id = data.id || globalThis.crypto?.randomUUID?.() || `entity-${Date.now()}-${Math.random()}`;
    this.type = data.type;
    this.points = data.points.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    this.thickness = Number(data.thickness ?? 10);
    const label = (data.label || '').toLowerCase();
    const defaultHeight = this.type === 'wall' ? 280
      : this.type === 'door' ? 210
        : this.type === 'window' ? 115
          : label.includes('wardrobe') ? 205
            : label.includes('bed') ? 42
              : label.includes('table') ? 74
                : label.includes('chair') ? 88
                  : label.includes('sofa') ? 78
                    : this.type === 'dimension' || this.type === 'line' ? 3 : 80;
    this.height = Number(data.height ?? defaultHeight);
    this.layer = data.layer || ({ wall: 'Walls', door: 'Doors & windows', window: 'Doors & windows', dimension: 'Dimensions', text: 'Text & labels' }[this.type] || 'Furniture');
    this.color = data.color || '#d4ddd7';
    this.label = data.label || '';
    this.locked = Boolean(data.locked);
    this.visible = data.visible !== false;
  }

  getBounds() {
    const [first, second] = this.points;
    if (this.type === 'circle') {
      const radius = Math.hypot(second.x - first.x, second.y - first.y);
      return { minX: first.x - radius, minY: first.y - radius, maxX: first.x + radius, maxY: first.y + radius };
    }
    return { minX: Math.min(...this.points.map((point) => point.x)), minY: Math.min(...this.points.map((point) => point.y)), maxX: Math.max(...this.points.map((point) => point.x)), maxY: Math.max(...this.points.map((point) => point.y)) };
  }

  getSnapPoints() {
    if (this.type === 'circle') return [this.points[0]];
    if (this.points.length === 2) return [this.points[0], this.points[1], { x: (this.points[0].x + this.points[1].x) / 2, y: (this.points[0].y + this.points[1].y) / 2 }];
    return this.points;
  }

  hitTest(point, tolerance = 8) {
    if (!this.visible || this.locked) return false;
    if (this.type === 'text') return Math.hypot(point.x - this.points[0].x, point.y - this.points[0].y) <= tolerance * 2;
    if (this.type === 'circle') {
      const radius = Math.hypot(this.points[1].x - this.points[0].x, this.points[1].y - this.points[0].y);
      return Math.abs(Math.hypot(point.x - this.points[0].x, point.y - this.points[0].y) - radius) <= tolerance;
    }
    if (this.type === 'rectangle') {
      const bounds = this.getBounds();
      if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) return false;
      return Math.min(Math.abs(point.x - bounds.minX), Math.abs(point.x - bounds.maxX), Math.abs(point.y - bounds.minY), Math.abs(point.y - bounds.maxY)) <= tolerance
        || (point.x > bounds.minX && point.x < bounds.maxX && point.y > bounds.minY && point.y < bounds.maxY);
    }
    for (let index = 0; index + 1 < this.points.length; index += 1) if (distanceToSegment(point, this.points[index], this.points[index + 1]) <= tolerance + this.thickness / 2) return true;
    return false;
  }

  draw(context, camera, { selected = false, algorithm = 'native' } = {}) {
    if (!this.visible || !this.points.length) return;
    const screenPoints = this.points.map((point) => camera.worldToScreen(point));
    context.save();
    context.strokeStyle = selected ? '#d8ef52' : this.color;
    context.fillStyle = selected ? '#d8ef52' : this.color;
    context.lineWidth = this.type === 'wall' ? Math.max(1, this.thickness * camera.scale) : 1.7;
    context.lineCap = this.type === 'wall' ? 'square' : 'round';
    context.lineJoin = 'miter';
    if (this.type === 'text') {
      const point = screenPoints[0];
      context.fillStyle = selected ? '#d8ef52' : this.color;
      context.font = `700 ${Math.max(13, 16 * camera.scale)}px 'DM Sans', sans-serif`;
      context.textAlign = 'center';
      context.strokeStyle = '#101716';
      context.lineWidth = Math.max(2, 3 * camera.scale);
      context.strokeText(this.label || 'Text', point.x, point.y);
      context.fillText(this.label || 'Text', point.x, point.y);
    } else if (this.type === 'dimension') {
      const [first, second] = screenPoints;
      context.strokeStyle = '#ffd166';
      context.fillStyle = '#ffd166';
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(first.x, first.y); context.lineTo(second.x, second.y); context.stroke();
      const angle = Math.atan2(second.y - first.y, second.x - first.x);
      for (const [point, direction] of [[first, angle], [second, angle + Math.PI]]) {
        context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(point.x + Math.cos(direction + .5) * 8, point.y + Math.sin(direction + .5) * 8); context.lineTo(point.x + Math.cos(direction - .5) * 8, point.y + Math.sin(direction - .5) * 8); context.closePath(); context.fill();
      }
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const length = Math.hypot(this.points[1].x - this.points[0].x, this.points[1].y - this.points[0].y) / 100;
      context.font = '700 12px "DM Mono", monospace'; context.textAlign = 'center'; context.fillText(`${length.toFixed(2)} m`, midpoint.x, midpoint.y - 7);
    } else if (this.type === 'door' || this.type === 'window') {
      const [first, second] = screenPoints;
      if (this.type === 'window') {
        context.save();
        context.strokeStyle = '#283230';
        context.lineWidth = Math.max(12, 14 * camera.scale);
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.stroke();
        context.restore();
      }
      context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(first.x, first.y); context.lineTo(second.x, second.y); context.stroke();
      if (this.type === 'window') {
        const dx = second.x - first.x; const dy = second.y - first.y; const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length * 4; const ny = dx / length * 4;
        context.beginPath(); context.moveTo(first.x + nx, first.y + ny); context.lineTo(second.x + nx, second.y + ny); context.moveTo(first.x - nx, first.y - ny); context.lineTo(second.x - nx, second.y - ny); context.stroke();
      } else {
        const radius = Math.hypot(second.x - first.x, second.y - first.y);
        const angle = Math.atan2(second.y - first.y, second.x - first.x);
        context.beginPath(); context.arc(first.x, first.y, radius, angle, angle + Math.PI / 2); context.stroke();
      }
    } else if (this.type === 'circle') {
      const radius = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y);
      if (algorithm === 'custom') for (const pixel of midpointCircle(screenPoints[0], radius)) context.fillRect(pixel.x, pixel.y, 1, 1);
      else { context.beginPath(); context.arc(screenPoints[0].x, screenPoints[0].y, radius, 0, Math.PI * 2); context.stroke(); }
    } else if (this.type === 'rectangle' || this.type === 'furniture') {
      const left = Math.min(screenPoints[0].x, screenPoints[1].x);
      const top = Math.min(screenPoints[0].y, screenPoints[1].y);
      context.strokeRect(left, top, Math.abs(screenPoints[1].x - screenPoints[0].x), Math.abs(screenPoints[1].y - screenPoints[0].y));
      if (this.type === 'furniture') {
        const width = Math.abs(screenPoints[1].x - screenPoints[0].x);
        const height = Math.abs(screenPoints[1].y - screenPoints[0].y);
        context.beginPath(); context.moveTo(left, top + height * .24); context.lineTo(left + width, top + height * .24);
        if (this.label.toLowerCase().includes('bed')) { context.moveTo(left + width * .08, top + height * .08); context.lineTo(left + width * .45, top + height * .08); context.moveTo(left + width * .55, top + height * .08); context.lineTo(left + width * .92, top + height * .08); }
        else if (this.label.toLowerCase().includes('sofa')) { context.moveTo(left + width * .1, top + height * .72); context.lineTo(left + width * .9, top + height * .72); }
        context.stroke();
        context.font = '9px "DM Sans", sans-serif'; context.textAlign = 'center'; context.fillText(this.label, left + width / 2, top + height / 2 + 3);
      }
    } else {
      for (let index = 0; index + 1 < screenPoints.length; index += 1) {
        if (algorithm === 'custom' && this.type !== 'wall') for (const pixel of bresenhamLine(screenPoints[index], screenPoints[index + 1])) context.fillRect(pixel.x, pixel.y, 1, 1);
        else { context.beginPath(); context.moveTo(screenPoints[index].x, screenPoints[index].y); context.lineTo(screenPoints[index + 1].x, screenPoints[index + 1].y); context.stroke(); }
      }
    }
    if (selected) {
      context.setLineDash([5, 4]); context.lineWidth = 1; context.strokeStyle = '#d8ef52';
      const bounds = this.getBounds();
      const topLeft = camera.worldToScreen({ x: bounds.minX, y: bounds.maxY });
      const bottomRight = camera.worldToScreen({ x: bounds.maxX, y: bounds.minY });
      context.strokeRect(topLeft.x - 4, topLeft.y - 4, bottomRight.x - topLeft.x + 8, bottomRight.y - topLeft.y + 8);
    }
    context.restore();
  }

  serialize() {
    return { id: this.id, type: this.type, points: this.points.map((point) => ({ ...point })), thickness: this.thickness, height: this.height, layer: this.layer, label: this.label, color: this.color, locked: this.locked, visible: this.visible };
  }
}