export function ddaLine(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
  if (steps === 0) return [{ x: Math.round(start.x), y: Math.round(start.y) }];
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push({ x: Math.round(start.x + (index * dx) / steps), y: Math.round(start.y + (index * dy) / steps) });
  }
  return points;
}

// Bresenham advances the dominant axis and uses an integer error term to choose the next pixel.
export function bresenhamLine(start, end) {
  let x = Math.round(start.x);
  let y = Math.round(start.y);
  const xEnd = Math.round(end.x);
  const yEnd = Math.round(end.y);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const stepX = x < xEnd ? 1 : -1;
  const stepY = y < yEnd ? 1 : -1;
  let error = dx - dy;
  const points = [];
  while (true) {
    points.push({ x, y });
    if (x === xEnd && y === yEnd) break;
    const doubledError = 2 * error;
    if (doubledError > -dy) { error -= dy; x += stepX; }
    if (doubledError < dx) { error += dx; y += stepY; }
  }
  return points;
}

export function bresenhamTrace(start, end) {
  let x = Math.round(start.x);
  let y = Math.round(start.y);
  const xEnd = Math.round(end.x);
  const yEnd = Math.round(end.y);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const stepX = x < xEnd ? 1 : -1;
  const stepY = y < yEnd ? 1 : -1;
  let error = dx - dy;
  const steps = [];
  while (true) {
    steps.push({ x, y, error });
    if (x === xEnd && y === yEnd) return steps;
    const doubledError = 2 * error;
    if (doubledError > -dy) { error -= dy; x += stepX; }
    if (doubledError < dx) { error += dx; y += stepY; }
  }
}

// Midpoint circle tests the decision value at each octant step and mirrors pixels eight ways.
export function midpointCircle(center, radius) {
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  const r = Math.max(0, Math.round(radius));
  let x = 0;
  let y = r;
  let decision = 1 - r;
  const pixels = new Map();
  while (x <= y) {
    for (const [px, py] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) {
      pixels.set(`${cx + px},${cy + py}`, { x: cx + px, y: cy + py });
    }
    x += 1;
    if (decision < 0) decision += 2 * x + 1;
    else { y -= 1; decision += 2 * (x - y) + 1; }
  }
  return [...pixels.values()];
}

export function midpointCircleTrace(center, radius) {
  let x = 0;
  let y = Math.max(0, Math.round(radius));
  let decision = 1 - y;
  const steps = [];
  while (x <= y) {
    steps.push({ x, y, decision });
    x += 1;
    if (decision < 0) decision += 2 * x + 1;
    else { y -= 1; decision += 2 * (x - y) + 1; }
  }
  return steps;
}

// Scanline fill pairs sorted edge intersections using the even-odd rule.
export function scanlineFill(vertices) {
  const lines = [];
  if (vertices.length < 3) return lines;
  const minY = Math.ceil(Math.min(...vertices.map((point) => point.y)));
  const maxY = Math.floor(Math.max(...vertices.map((point) => point.y)));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < vertices.length; index += 1) {
      const a = vertices[index];
      const b = vertices[(index + 1) % vertices.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) intersections.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) lines.push({ y, xStart: Math.ceil(intersections[index]), xEnd: Math.floor(intersections[index + 1]) });
  }
  return lines;
}