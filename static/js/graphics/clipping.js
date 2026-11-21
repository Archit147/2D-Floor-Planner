const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

export function regionCode(point, rect) {
  const [xmin, ymin, xmax, ymax] = rect;
  let code = INSIDE;
  if (point.x < xmin) code |= LEFT;
  else if (point.x > xmax) code |= RIGHT;
  if (point.y < ymin) code |= BOTTOM;
  else if (point.y > ymax) code |= TOP;
  return code;
}

// Cohen-Sutherland rejects shared outside regions and clips against one coded edge at a time.
export function cohenSutherlandTrace(start, end, rect) {
  let first = { ...start };
  let second = { ...end };
  let firstCode = regionCode(first, rect);
  let secondCode = regionCode(second, rect);
  const steps = [];
  while (true) {
    steps.push({ start: { ...first }, end: { ...second }, codeStart: firstCode, codeEnd: secondCode });
    if (!(firstCode | secondCode)) return { accepted: true, segment: [first, second], steps };
    if (firstCode & secondCode) return { accepted: false, segment: null, steps };
    const outside = firstCode || secondCode;
    const [xmin, ymin, xmax, ymax] = rect;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    let point;
    if (outside & TOP) point = { x: first.x + dx * (ymax - first.y) / dy, y: ymax };
    else if (outside & BOTTOM) point = { x: first.x + dx * (ymin - first.y) / dy, y: ymin };
    else if (outside & RIGHT) point = { x: xmax, y: first.y + dy * (xmax - first.x) / dx };
    else point = { x: xmin, y: first.y + dy * (xmin - first.x) / dx };
    if (outside === firstCode) { first = point; firstCode = regionCode(first, rect); }
    else { second = point; secondCode = regionCode(second, rect); }
  }
}

export function liangBarskyClip(start, end, rect) {
  const [xmin, ymin, xmax, ymax] = rect;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const pValues = [-dx, dx, -dy, dy];
  const qValues = [start.x - xmin, xmax - start.x, start.y - ymin, ymax - start.y];
  let lower = 0;
  let upper = 1;
  for (let index = 0; index < 4; index += 1) {
    if (pValues[index] === 0) { if (qValues[index] < 0) return null; continue; }
    const ratio = qValues[index] / pValues[index];
    if (pValues[index] < 0) lower = Math.max(lower, ratio);
    else upper = Math.min(upper, ratio);
    if (lower > upper) return null;
  }
  return [
    { x: start.x + lower * dx, y: start.y + lower * dy },
    { x: start.x + upper * dx, y: start.y + upper * dy },
  ];
}

export function polygonArea(vertices) {
  return vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function intersect(start, end, clipStart, clipEnd) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const clipDx = clipEnd.x - clipStart.x;
  const clipDy = clipEnd.y - clipStart.y;
  const denominator = dx * clipDy - dy * clipDx;
  if (Math.abs(denominator) < 1e-12) return end;
  const t = ((clipStart.x - start.x) * clipDy - (clipStart.y - start.y) * clipDx) / denominator;
  return { x: start.x + t * dx, y: start.y + t * dy };
}

// Sutherland-Hodgman carries each intermediate polygon through every convex clip edge.
export function sutherlandHodgmanClip(subject, clipPolygon) {
  let output = [...subject];
  if (output.length < 3 || clipPolygon.length < 3) return [];
  const orientation = polygonArea(clipPolygon) >= 0 ? 1 : -1;
  for (let edge = 0; edge < clipPolygon.length; edge += 1) {
    const clipStart = clipPolygon[edge];
    const clipEnd = clipPolygon[(edge + 1) % clipPolygon.length];
    const input = output;
    output = [];
    if (!input.length) break;
    const inside = (point) => orientation * ((clipEnd.x - clipStart.x) * (point.y - clipStart.y) - (clipEnd.y - clipStart.y) * (point.x - clipStart.x)) >= -1e-9;
    let previous = input.at(-1);
    for (const current of input) {
      const previousInside = inside(previous);
      const currentInside = inside(current);
      if (currentInside) {
        if (!previousInside) output.push(intersect(previous, current, clipStart, clipEnd));
        output.push(current);
      } else if (previousInside) output.push(intersect(previous, current, clipStart, clipEnd));
      previous = current;
    }
  }
  return output;
}