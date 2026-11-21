export function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if ((currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x) inside = !inside;
  }
  return inside;
}

export function lineIntersection(a, b, c, d, segments = true) {
  const dx1 = b.x - a.x;
  const dy1 = b.y - a.y;
  const dx2 = d.x - c.x;
  const dy2 = d.y - c.y;
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-12) return null;
  const deltaX = c.x - a.x;
  const deltaY = c.y - a.y;
  const firstT = (deltaX * dy2 - deltaY * dx2) / denominator;
  const secondT = (deltaX * dy1 - deltaY * dx1) / denominator;
  if (segments && (firstT < 0 || firstT > 1 || secondT < 0 || secondT > 1)) return null;
  return { x: a.x + firstT * dx1, y: a.y + firstT * dy1 };
}

export function boundingBox(points) {
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)), maxY: Math.max(...points.map((point) => point.y)),
  };
}