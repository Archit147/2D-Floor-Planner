import { playIntro } from '../core/IntroLoader.js';

playIntro();

const canvas = document.querySelector('#lab-canvas');
const context = canvas.getContext('2d');
const algorithmSelect = document.querySelector('#algorithm');
let latest = null;

function number(id) { return Number(document.querySelector(`#${id}`).value); }
function requestData(algorithm) {
  const data = {
    start: [number('x0'), number('y0')], end: [number('x1'), number('y1')],
    rect: [number('xmin'), number('ymin'), number('xmax'), number('ymax')],
  };
  if (algorithm === 'midpoint-circle') { data.center = [number('cx'), number('cy')]; data.radius = number('radius'); }
  if (algorithm === 'scanline') data.polygon = JSON.parse(document.querySelector('#polygon-input').value);
  if (algorithm === 'sutherland-hodgman') {
    data.subject = JSON.parse(document.querySelector('#polygon-input').value);
    data.clip = JSON.parse(document.querySelector('#clip-input').value);
  }
  if (algorithm === 'matrix') {
    data.tx = number('tx'); data.ty = number('ty'); data.rotation = number('rotation');
    data.sx = number('scale') / 100; data.sy = data.sx; data.point = [1, 1];
  }
  return data;
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * ratio); canvas.height = Math.round(bounds.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function draw() {
  const width = canvas.clientWidth; const height = canvas.clientHeight;
  context.fillStyle = '#283230'; context.fillRect(0, 0, width, height);
  const step = 23; const origin = { x: 55, y: height - 48 };
  const toScreen = ([x, y]) => ({ x: origin.x + x * step, y: origin.y - y * step });
  context.strokeStyle = '#35403d'; context.lineWidth = 1;
  for (let x = origin.x % step; x < width; x += step) { context.beginPath(); context.moveTo(x + .5, 0); context.lineTo(x + .5, height); context.stroke(); }
  for (let y = origin.y % step; y > 0; y -= step) { context.beginPath(); context.moveTo(0, y + .5); context.lineTo(width, y + .5); context.stroke(); }
  context.strokeStyle = '#617069'; context.beginPath(); context.moveTo(origin.x, 0); context.lineTo(origin.x, height); context.moveTo(0, origin.y); context.lineTo(width, origin.y); context.stroke();
  context.fillStyle = '#82918a'; context.font = '10px monospace';
  for (let value = -2; value <= 25; value += 2) context.fillText(String(value), origin.x + value * step - 4, origin.y + 16);
  if (!latest) return;

  const result = latest.data; const algorithm = latest.algorithm; const request = latest.request;
  const drawSegment = (first, second, color = '#d7ed58', lineWidth = 2) => {
    const a = toScreen(first); const b = toScreen(second);
    context.strokeStyle = color; context.lineWidth = lineWidth; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  };
  const drawPolygon = (points, color, fill = false) => {
    if (!points?.length) return;
    context.beginPath(); points.forEach((point, index) => { const mapped = toScreen(point); index ? context.lineTo(mapped.x, mapped.y) : context.moveTo(mapped.x, mapped.y); }); context.closePath();
    if (fill) { context.fillStyle = `${color}33`; context.fill(); }
    context.strokeStyle = color; context.lineWidth = 2; context.stroke();
  };
  if (algorithm === 'bresenham' || algorithm === 'dda') {
    const pixels = result.steps || result.pixels;
    context.fillStyle = '#d7ed58';
    for (const pixel of pixels) { const point = toScreen([pixel.x, pixel.y]); context.fillRect(point.x - 5, point.y - 5, 10, 10); }
    drawSegment(request.start, request.end, '#7d8d86', 1);
  } else if (algorithm === 'midpoint-circle') {
    context.fillStyle = '#d7ed58';
    for (const pixel of result.pixels) {
      const point = toScreen([pixel.x, pixel.y]);
      context.fillRect(point.x - 3, point.y - 3, 6, 6);
    }
    const center = toScreen(result.center);
    context.fillStyle = '#f1f3f2'; context.fillRect(center.x - 3, center.y - 3, 6, 6);
  } else if (algorithm === 'cohen-sutherland' || algorithm === 'liang-barsky') {
    const [xmin, ymin, xmax, ymax] = request.rect;
    drawPolygon([[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]], '#6ca6a1');
    drawSegment(request.start, request.end, '#73827c', 1);
    if (result.segment) drawSegment(result.segment[0], result.segment[1], '#d7ed58', 3);
  } else if (algorithm === 'sutherland-hodgman') {
    drawPolygon(request.subject, '#71817b'); drawPolygon(request.clip, '#6ca6a1'); drawPolygon(result.polygon, '#d7ed58', true);
  } else if (algorithm === 'scanline') {
    context.fillStyle = '#d7ed58';
    for (const [y, xStart, xEnd] of result.spans) { const left = toScreen([xStart, y]); const right = toScreen([xEnd, y]); context.fillRect(left.x, left.y - 2, Math.max(2, right.x - left.x), 4); }
    drawPolygon(request.polygon, '#a5b3ad');
  } else if (algorithm === 'matrix') {
    const original = [[-5, -4], [5, -4], [5, 4], [-5, 4]];
    drawPolygon(original, '#6d7d76');
    const matrix = result.matrix;
    drawPolygon(original.map(([x, y]) => [matrix[0][0] * x + matrix[0][1] * y + matrix[0][2], matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]]), '#d7ed58', true);
    document.querySelector('#matrix-value').textContent = matrix.map((row) => row.map((value) => Number(value).toFixed(3).padStart(7)).join(' ')).join('\n');
  }
}

function renderTrace(data) {
  const list = document.querySelector('#trace-list'); list.replaceChildren();
  const steps = data.steps || data.pixels || data.spans || data.polygon || [];
  steps.slice(0, 160).forEach((step, index) => {
    const row = document.createElement('div'); row.className = 'trace-row';
    const stepNumber = document.createElement('span'); stepNumber.textContent = String(index + 1).padStart(2, '0');
    const detail = document.createElement('strong');
    detail.textContent = Array.isArray(step) ? step.join(', ') : Object.entries(step).map(([key, value]) => `${key}:${Array.isArray(value) ? JSON.stringify(value) : value}`).join('  ');
    row.append(stepNumber, detail); list.append(row);
  });
  if (!steps.length) { const note = document.createElement('p'); note.textContent = 'No discrete steps returned for this result.'; list.append(note); }
  document.querySelector('#trace-count').textContent = String(steps.length);
  document.querySelector('#step-count').textContent = `${steps.length} steps`;
}

function summary(algorithm, data) {
  if (algorithm.includes('cohen') || algorithm.includes('liang')) return data.accepted ? 'Segment accepted and clipped to the viewport.' : 'Segment rejected: it does not intersect the clipping window.';
  if (algorithm === 'sutherland-hodgman') return `Clipped polygon contains ${data.polygon.length} vertices.`;
  if (algorithm === 'matrix') return `Point (${data.point.join(', ')}) transforms to (${data.transformed.map((value) => value.toFixed(2)).join(', ')}).`;
  if (algorithm === 'scanline') return `Even-odd scan conversion generated ${data.spans.length} horizontal spans.`;
  return `${(data.steps || data.pixels || []).length} plotted algorithm steps.`;
}

async function run() {
  const algorithm = algorithmSelect.value;
  try {
    const request = requestData(algorithm);
    const pythonStart = performance.now();
    const response = await fetch(`/api/lab/${algorithm}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Algorithm request failed');
    document.querySelector('#python-time').textContent = `${(performance.now() - pythonStart).toFixed(1)} ms`;
    document.querySelector('#js-time').textContent = 'Rendering';
    latest = { algorithm, data, request };
    draw(); renderTrace(data);
    document.querySelector('#algorithm-title').textContent = algorithmSelect.selectedOptions[0].textContent;
    const compare = document.querySelector('#comparison-status');
    compare.textContent = 'Computed by Python';
    compare.dataset.match = 'true';
    document.querySelector('#lab-summary').textContent = `${summary(algorithm, data)} Computed by Python; Canvas is used only for rendering.`;
  } catch (error) { document.querySelector('#lab-summary').textContent = error.message; }
}

function updateControls() {
  const algorithm = algorithmSelect.value;
  document.querySelector('#line-fields').classList.toggle('hidden-fields', !['bresenham', 'dda', 'cohen-sutherland', 'liang-barsky'].includes(algorithm));
  document.querySelector('#circle-fields').classList.toggle('active-fields', algorithm === 'midpoint-circle');
  document.querySelector('#clip-fields').classList.toggle('hidden-fields', !['cohen-sutherland', 'liang-barsky'].includes(algorithm));
  document.querySelector('#polygon-fields').classList.toggle('active-fields', ['scanline', 'sutherland-hodgman'].includes(algorithm));
  document.querySelector('#clip-input').parentElement.style.display = algorithm === 'sutherland-hodgman' ? '' : 'none';
  document.querySelector('#matrix-fields').classList.toggle('active-fields', algorithm === 'matrix');
  document.querySelector('#algorithm-title').textContent = algorithmSelect.selectedOptions[0].textContent;
  run();
}

algorithmSelect.addEventListener('change', updateControls);
document.querySelector('#run-algorithm').addEventListener('click', run);
document.querySelectorAll('.range-field input').forEach((input) => input.addEventListener('input', () => {
  const output = input.parentElement.querySelector('output');
  output.value = input.id === 'scale' ? (number('scale') / 100).toFixed(2) : `${input.value}${input.id === 'rotation' ? '°' : ''}`;
  output.textContent = output.value;
  if (algorithmSelect.value === 'matrix') run();
}));
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
updateControls();