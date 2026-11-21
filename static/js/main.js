import { Camera } from './core/Camera.js';
import { History } from './core/History.js';
import { Renderer } from './core/Renderer.js';
import { Entity } from './entities/Entity.js';
import { ApiClient } from './core/ApiClient.js';
import { Matrix3 } from './core/Matrix3.js';
import { lineIntersection } from './graphics/geometry.js';
import { Model3D } from './core/Model3D.js';
import { playIntro } from './core/IntroLoader.js';

playIntro();

function defaultEntityColor(type) {
  return ({
    wall: '#c5d0c8',
    door: '#c2a277',
    window: '#77beca',
    furniture: '#aebed0',
    rectangle: '#aebed0',
  })[type] || '#d4ddd7';
}

function normalizeLoadedEntity(data) {
  const isLegacyPreviewColor = data.color?.toLowerCase() === '#b9cb58';
  const entity = new Entity({
    ...data,
    color: isLegacyPreviewColor ? defaultEntityColor(data.type) : data.color,
  });
  return entity.type === 'wall' && !hasUsableGeometry(entity) ? null : entity;
}

function hasUsableGeometry(entity) {
  if (entity.type === 'text') return entity.points.length > 0;
  if (entity.points.length < 2) return false;
  if (entity.type === 'circle') return Math.hypot(
    entity.points[1].x - entity.points[0].x,
    entity.points[1].y - entity.points[0].y,
  ) > 1;
  if (['wall', 'line', 'door', 'window', 'dimension'].includes(entity.type)) {
    return entity.points.some((point, index) => index > 0 && Math.hypot(
      point.x - entity.points[index - 1].x,
      point.y - entity.points[index - 1].y,
    ) > 1);
  }
  const bounds = entity.getBounds();
  return bounds.maxX - bounds.minX > 1 && bounds.maxY - bounds.minY > 1;
}

const canvas = document.querySelector('#plan-canvas');
const canvasWrap = document.querySelector('#canvas-wrap');
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const api = new ApiClient();
let savedPlan = null;
try { savedPlan = JSON.parse(localStorage.getItem('planform-autosave') || 'null'); } catch { localStorage.removeItem('planform-autosave'); }
const entities = (savedPlan?.entities || []).map(normalizeLoadedEntity).filter(Boolean);
const history = new History(entities.map((entity) => entity.serialize()));
const coordinateReadout = document.querySelector('#coordinates');
const zoomReadout = document.querySelector('#zoom-level');
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');
const titleInput = document.querySelector('#document-title');
let projectId = savedPlan?.projectId || null;
let documentTitle = savedPlan?.title || 'Untitled plan';
let activeTool = 'select';
let selectedId = null;
let isPanning = false;
let isDrawing = false;
let isMoving = false;
let spacePressed = false;
let startPoint = null;
let previousPointer = null;
let moveOrigin = null;
let moveSnapshot = null;
let lastPoint = null;
let is3DView = false;
let model3DReady = false;
let model3D = null;

model3D = new Model3D(document.querySelector('#three-inset-mount'), {
  onSelect: (id) => {
    selectedId = id;
    renderer.selectedId = id;
    renderer.draw();
    syncSelectionProperties();
  },
  onMove: (id, dx, dz, basePoints) => {
    const entity = entities.find((item) => item.id === id);
    if (!entity || entity.locked) return false;
    const candidate = new Entity({
      ...entity.serialize(),
      points: basePoints.map((point) => ({ x: point.x + dx, y: point.y + dz })),
    });
    if (candidate.type === 'furniture' && furnitureTouchesWall(candidate, id)) {
      setSaveState('Furniture cannot touch a wall', true);
      return false;
    }
    if (candidate.type === 'wall' && wallTouchesFurniture(candidate, id)) {
      setSaveState('Wall cannot be placed through furniture', true);
      return false;
    }
    if (furnitureOverlapsFurniture(candidate, id)) {
      setSaveState('Furniture overlaps another object', true);
      return false;
    }
    entity.points = candidate.points;
    renderer.draw();
    return true;
  },
  onCommit: (id) => {
    selectedId = id;
    commit();
  },
});

function resizeCanvas() {
  const bounds = canvasWrap.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height);
}

function localPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function worldPoint(screenPoint) {
  const point = camera.screenToWorld(screenPoint);
  const candidate = objectSnap(point, isMoving);
  if (candidate && Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) * camera.scale <= 10) {
    renderer.snapMarker = candidate;
    return candidate.point;
  }
  renderer.snapMarker = null;
  if (!document.querySelector('#snap-toggle').checked) return point;
  const step = renderer.gridSpacing;
  return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
}

function objectSnap(point, excludeSelected = false) {
  const mode = document.querySelector('#snap-mode').value;
  const candidates = [];
  const segments = [];
  for (const entity of entities) {
    if (!entity.visible || (excludeSelected && entity.id === selectedId)) continue;
    const points = entity.points;
    if (mode === 'endpoint') for (const candidate of [points[0], points.at(-1)]) candidates.push({ point: candidate, type: 'endpoint' });
    if (mode === 'midpoint') for (let index = 0; index + 1 < points.length; index += 1) candidates.push({ point: { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 }, type: 'midpoint' });
    if (mode === 'center') {
      const bounds = entity.getBounds();
      candidates.push({ point: entity.type === 'circle' ? points[0] : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, type: 'center' });
    }
    for (let index = 0; index + 1 < points.length; index += 1) segments.push([points[index], points[index + 1]]);
  }
  if (mode === 'nearest' || mode === 'perpendicular') {
    for (const [start, end] of segments) {
      const dx = end.x - start.x; const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
      candidates.push({ point: { x: start.x + dx * t, y: start.y + dy * t }, type: mode });
    }
  }
  if (mode === 'intersection') {
    for (let first = 0; first < segments.length; first += 1) {
      for (let second = first + 1; second < segments.length; second += 1) {
        const intersection = lineIntersection(segments[first][0], segments[first][1], segments[second][0], segments[second][1]);
        if (intersection) candidates.push({ point: intersection, type: 'intersection' });
      }
    }
  }
  candidates.sort((first, second) => Math.hypot(first.point.x - point.x, first.point.y - point.y) - Math.hypot(second.point.x - point.x, second.point.y - point.y));
  return candidates[0] || null;
}

function updateCoordinates(point) {
  const world = camera.screenToWorld(point);
  coordinateReadout.textContent = `X ${(world.x / 100).toFixed(2)} m   Y ${(world.y / 100).toFixed(2)} m`;
}

function updateToolbar() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    const active = button.dataset.tool === activeTool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const names = { select: 'Select', wall: 'Wall', room: 'Room', line: 'Line', rectangle: 'Rectangle', circle: 'Circle', door: 'Door', window: 'Window', furniture: 'Furniture', dimension: 'Dimension', text: 'Text' };
  document.querySelector('#active-tool-name').textContent = names[activeTool];
  document.querySelector('#tool-hint').textContent = activeTool === 'select'
    ? 'Pan with Space + drag'
    : activeTool === 'room' ? 'Drag to draw four connected walls' : 'Drag to draw · Esc to cancel';
  canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
}

function syncScene() {
  renderer.entities = entities;
  renderer.selectedId = selectedId;
  renderer.draw();
  model3D?.setEntities(entities);
  updateHistoryButtons();
  document.querySelector('.canvas-empty-state').hidden = entities.length > 0;
  document.querySelector('#entity-count').textContent = `${entities.length} objects`;
  syncSelectionProperties();
  document.querySelectorAll('[data-layer-count]').forEach((count) => {
    count.textContent = String(entities.filter((entity) => entity.layer === count.dataset.layerCount).length);
  });
}

function syncSelectionProperties() {
  const entity = entities.find((item) => item.id === selectedId);
  document.querySelector('#selection-properties').classList.toggle('visible', Boolean(entity));
  document.querySelector('.empty-selection').hidden = Boolean(entity);
  if (!entity) return;
  document.querySelector('#selection-id').textContent = entity.id.slice(0, 7);
  document.querySelector('#property-type').value = entity.type;
  document.querySelector('#property-layer').value = entity.layer;
  document.querySelector('#property-thickness').value = entity.thickness;
  document.querySelector('#property-height').value = entity.height;
  document.querySelector('#property-label').value = entity.label;
  document.querySelector('#property-locked').checked = entity.locked;
}

function updateHistoryButtons() {
  undoButton.disabled = !history.canUndo;
  redoButton.disabled = !history.canRedo;
}

function setSaveState(message, error = false) {
  const state = document.querySelector('.save-state');
  state.textContent = message;
  state.classList.toggle('error-state', error);
}

function documentData() {
  return { title: documentTitle, units: 'cm', entities: entities.map((entity) => entity.serialize()) };
}

function saveLocal() {
  localStorage.setItem('planform-autosave', JSON.stringify({ ...documentData(), projectId }));
  setSaveState('Unsaved changes');
}

function restoreEntities(serialized) {
  if (!serialized) return;
  entities.splice(0, entities.length, ...serialized.map(normalizeLoadedEntity).filter(Boolean));
  if (!entities.some((entity) => entity.id === selectedId)) selectedId = null;
  syncScene();
  saveLocal();
}

function commit() {
  history.record(entities);
  syncScene();
  saveLocal();
  if (renderer.roomLabels.length) updateRoomMetrics();
}

function findEntity(point) {
  for (let index = entities.length - 1; index >= 0; index -= 1) {
    if (entities[index].hitTest(point, 8 / camera.scale)) return entities[index];
  }
  return null;
}

function snapOrtho(start, end, event) {
  if (!event.shiftKey) return end;
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
}

function makePreview(type, first, second) {
  if (type === 'room') type = 'rectangle';
  const label = type === 'furniture' ? document.querySelector('#furniture-kind').value : '';
  const thickness = type === 'wall' ? 14 : 2;
  return new Entity({ type, points: [first, second], thickness, color: '#b9cb58', label });
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function furnitureTouchesWall(entity, excludedEntityId = null) {
  if (entity.type !== 'furniture') return false;
  const bounds = entity.getBounds();
  for (const wall of entities) {
    if (wall.type !== 'wall' || wall.id === excludedEntityId || !wall.visible) continue;
    for (let index = 0; index + 1 < wall.points.length; index += 1) {
      const start = wall.points[index];
      const end = wall.points[index + 1];
      const clearance = Math.max(1, Number(wall.thickness || 10) / 2);
      const minX = bounds.minX - clearance;
      const minY = bounds.minY - clearance;
      const maxX = bounds.maxX + clearance;
      const maxY = bounds.maxY + clearance;
      const corners = [
        { x: bounds.minX, y: bounds.minY }, { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY },
      ];
      if (corners.some((corner) => pointSegmentDistance(corner, start, end) <= clearance)) return true;
      const edges = [
        [{ x: minX, y: minY }, { x: maxX, y: minY }],
        [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
        [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
        [{ x: minX, y: maxY }, { x: minX, y: minY }],
      ];
      if (edges.some(([edgeStart, edgeEnd]) => lineIntersection(start, end, edgeStart, edgeEnd))) return true;
      if (start.x >= minX && start.x <= maxX && start.y >= minY && start.y <= maxY) return true;
      if (end.x >= minX && end.x <= maxX && end.y >= minY && end.y <= maxY) return true;
    }
  }
  return false;
}

function wallTouchesFurniture(wall, excludedEntityId = null) {
  if (wall.type !== 'wall') return false;
  for (let index = 0; index + 1 < wall.points.length; index += 1) {
    const wallStart = wall.points[index];
    const wallEnd = wall.points[index + 1];
    const clearance = Math.max(1, Number(wall.thickness || 10) / 2);
    for (const furniture of entities) {
      if (furniture.id === excludedEntityId || furniture.type !== 'furniture' || !furniture.visible) continue;
      const bounds = furniture.getBounds();
      const corners = [
        { x: bounds.minX, y: bounds.minY }, { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY },
      ];
      if (corners.some((corner) => pointSegmentDistance(corner, wallStart, wallEnd) <= clearance)) return true;
      if (wallStart.x >= bounds.minX - clearance && wallStart.x <= bounds.maxX + clearance &&
          wallStart.y >= bounds.minY - clearance && wallStart.y <= bounds.maxY + clearance) return true;
      if (wallEnd.x >= bounds.minX - clearance && wallEnd.x <= bounds.maxX + clearance &&
          wallEnd.y >= bounds.minY - clearance && wallEnd.y <= bounds.maxY + clearance) return true;
    }
  }
  return false;
}

function furnitureOverlapsFurniture(entity, excludedEntityId = null) {
  if (!['furniture', 'rectangle'].includes(entity.type)) return false;
  const first = entity.getBounds();
  for (const other of entities) {
    if (other.id === excludedEntityId || !['furniture', 'rectangle'].includes(other.type) || !other.visible) continue;
    const second = other.getBounds();
    const overlapX = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
    const overlapY = Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY);
    if (overlapX > 2 && overlapY > 2) return true;
  }
  return false;
}

function localRoomFallback() {
  const adjacency = new Map();
  const walls = entities.filter((entity) => entity.type === 'wall' && entity.points.length === 2);
  const key = (point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  const parse = (value) => value.split(',').map(Number);
  for (const wall of walls) {
    const first = key(wall.points[0]); const second = key(wall.points[1]);
    if (!adjacency.has(first)) adjacency.set(first, new Set());
    if (!adjacency.has(second)) adjacency.set(second, new Set());
    adjacency.get(first).add(second); adjacency.get(second).add(first);
  }
  const loops = new Map();
  for (const origin of [...adjacency.keys()].sort()) {
    const stack = [[origin, [origin]]];
    while (stack.length && loops.size < 100) {
      const [current, path] = stack.pop();
      for (const next of adjacency.get(current) || []) {
        if (next === origin && path.length >= 3) {
          const reverse = [...path].reverse();
          const rotations = [path, reverse].flatMap((sequence) => sequence.map((_, index) => JSON.stringify(sequence.slice(index).concat(sequence.slice(0, index)))));
          loops.set(rotations.sort()[0], path.map(parse));
        } else if (next > origin && !path.includes(next) && path.length < 40) stack.push([next, [...path, next]]);
      }
    }
  }
  return [...loops.values()].map((vertices, index) => {
    let crossSum = 0; let centroidX = 0; let centroidY = 0; let perimeter = 0;
    for (let i = 0; i < vertices.length; i += 1) {
      const a = vertices[i]; const b = vertices[(i + 1) % vertices.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      crossSum += cross; centroidX += (a[0] + b[0]) * cross; centroidY += (a[1] + b[1]) * cross;
      perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return { id: `local-room-${index}`, area: Math.abs(crossSum) / 20000, perimeter: perimeter / 100, centroid: { x: centroidX / (3 * crossSum), y: centroidY / (3 * crossSum) } };
  }).filter((room) => Number.isFinite(room.centroid.x));
}

async function updateRoomMetrics() {
  try {
    const response = await fetch('/api/geometry/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentData()) });
    if (!response.ok) throw new Error('Room analysis unavailable');
    renderer.roomLabels = (await response.json()).rooms;
  } catch {
    renderer.roomLabels = localRoomFallback();
    setSaveState('Room metrics using local fallback');
  }
  renderer.draw();
}

function setTool(tool) {
  activeTool = tool;
  renderer.preview = null;
  updateToolbar();
  renderer.draw();
}

function fitView() {
  if (!entities.length) camera.reset(renderer.width, renderer.height);
  else {
    const bounds = entities.map((entity) => entity.getBounds());
    const minX = Math.min(...bounds.map((item) => item.minX));
    const minY = Math.min(...bounds.map((item) => item.minY));
    const maxX = Math.max(...bounds.map((item) => item.maxX));
    const maxY = Math.max(...bounds.map((item) => item.maxY));
    const padding = 72;
    camera.scale = Math.max(camera.minScale, Math.min(camera.maxScale, Math.min((renderer.width - padding * 2) / Math.max(1, maxX - minX), (renderer.height - padding * 2) / Math.max(1, maxY - minY))));
    camera.offsetX = renderer.width / 2 - ((minX + maxX) / 2) * camera.scale;
    camera.offsetY = renderer.height / 2 + ((minY + maxY) / 2) * camera.scale;
  }
  renderer.draw();
  updateZoomLabel();
}

function updateZoomLabel() {
  const label = `${Math.round(camera.scale * 100)}%`;
  zoomReadout.value = label;
  zoomReadout.textContent = label;
}

function setViewMode(mode) {
  is3DView = mode === '3d';
  const stage = document.querySelector('#three-stage');
  const inset = document.querySelector('#three-inset');
  const fullMount = document.querySelector('#three-full-mount');
  const insetMount = document.querySelector('#three-inset-mount');
  canvasWrap.classList.toggle('model-3d', is3DView);
  stage.hidden = !is3DView;
  inset.hidden = is3DView;
  document.querySelector('#view-mode-2d').classList.toggle('active', !is3DView);
  document.querySelector('#view-mode-2d').setAttribute('aria-pressed', String(!is3DView));
  document.querySelector('#view-mode-3d').classList.toggle('active', is3DView);
  document.querySelector('#view-mode-3d').setAttribute('aria-pressed', String(is3DView));
  if (model3DReady) {
    model3D.mount(is3DView ? fullMount : insetMount);
    model3D.setKeyboardNavigation(is3DView);
  }
}

function set3DMoveMode(enabled) {
  const moveMode = Boolean(enabled);
  model3D?.setMode(moveMode);
  for (const button of [document.querySelector('#three-move-mode'), document.querySelector('#inset-move-mode')]) {
    button.classList.toggle('active', moveMode);
    button.setAttribute('aria-pressed', String(moveMode));
  }
  document.querySelector('#three-orbit-mode').classList.toggle('active', !moveMode);
  document.querySelector('#three-orbit-mode').setAttribute('aria-pressed', String(!moveMode));
}

function show3DError(error) {
  const message = `3D view unavailable: ${error.message || 'WebGL could not start'}`;
  for (const id of ['three-inset-message', 'three-stage-message']) {
    const target = document.querySelector(`#${id}`);
    target.textContent = message;
    target.hidden = false;
  }
}

new ResizeObserver(resizeCanvas).observe(canvasWrap);
resizeCanvas();
camera.reset(renderer.width, renderer.height);
titleInput.value = documentTitle;
syncScene();
document.querySelector('#three-inset-message').hidden = false;
document.querySelector('#three-inset-message').textContent = 'Loading 3D renderer…';
model3D.initialize().then(() => {
  model3DReady = true;
  model3D.setEntities(entities);
  document.querySelector('#three-inset-message').hidden = true;
  document.querySelector('#three-stage-message').hidden = true;
  model3D.mount(is3DView ? document.querySelector('#three-full-mount') : document.querySelector('#three-inset-mount'));
}).catch(show3DError);

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
undoButton.addEventListener('click', () => restoreEntities(history.undo()));
redoButton.addEventListener('click', () => restoreEntities(history.redo()));

canvas.addEventListener('pointerdown', (event) => {
  const screen = localPoint(event);
  const world = worldPoint(screen);
  if (event.button === 1 || event.button === 2 || spacePressed) {
    event.preventDefault(); isPanning = true; previousPointer = screen;
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; return;
  }
  if (activeTool === 'select') {
    const hit = findEntity(world);
    selectedId = hit?.id || null;
    if (hit && !hit.locked) {
      isMoving = true; moveOrigin = world; moveSnapshot = hit.points.map((point) => ({ ...point }));
    }
    canvas.setPointerCapture(event.pointerId); syncScene(); return;
  }
  if (activeTool === 'text') {
    const label = window.prompt('Label text', 'Room name');
    if (label?.trim()) {
      const entity = new Entity({ type: 'text', points: [world], label: label.trim(), layer: 'Text & labels', color: '#e0e8e2' });
      entities.push(entity); selectedId = entity.id; lastPoint = { ...world }; commit();
    }
    return;
  }
  isDrawing = true;
  startPoint = world;
  renderer.preview = makePreview(activeTool, world, world);
  canvas.setPointerCapture(event.pointerId);
  renderer.draw();
});

canvas.addEventListener('pointermove', (event) => {
  const screen = localPoint(event);
  const world = worldPoint(screen);
  updateCoordinates(screen);
  if (isPanning && previousPointer) {
    camera.panBy(screen.x - previousPointer.x, screen.y - previousPointer.y);
    previousPointer = screen;
    renderer.draw(); return;
  }
  if (isMoving && moveOrigin) {
    const target = snapOrtho(moveOrigin, world, event);
    const selected = entities.find((entity) => entity.id === selectedId);
    if (selected) {
      const candidate = new Entity({
        ...selected.serialize(),
        points: moveSnapshot.map((point) => ({ x: point.x + target.x - moveOrigin.x, y: point.y + target.y - moveOrigin.y })),
      });
      if (furnitureTouchesWall(candidate, selected.id)) {
        setSaveState('Furniture cannot touch a wall', true);
      } else if (wallTouchesFurniture(candidate, selected.id)) {
        setSaveState('Wall cannot be placed through furniture', true);
      } else if (furnitureOverlapsFurniture(candidate, selected.id)) {
        setSaveState('Furniture overlaps another object', true);
      } else {
        selected.points = candidate.points;
        setSaveState('Unsaved changes');
      }
    }
    syncScene(); return;
  }
  if (isDrawing && startPoint) {
    renderer.preview = makePreview(activeTool, startPoint, snapOrtho(startPoint, world, event));
    renderer.draw();
  } else if (!isPanning && !isMoving) {
    renderer.draw();
  }
});

canvas.addEventListener('pointerup', () => {
  if (isDrawing && renderer.preview) {
    const placed = renderer.preview;
    if (activeTool === 'room' && !hasUsableGeometry(placed)) {
      setSaveState('Room area is too small to place', true);
      renderer.preview = null;
    } else if (activeTool === 'room') {
      const bounds = placed.getBounds();
      const corners = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
      ];
      const walls = corners.map((point, index) => new Entity({
        type: 'wall',
        points: [point, corners[(index + 1) % corners.length]],
        thickness: 14,
        color: defaultEntityColor('wall'),
      }));
      if (walls.some((wall) => wallTouchesFurniture(wall))) {
        setSaveState('Room walls cannot cross furniture', true);
        renderer.preview = null;
      } else {
        entities.push(...walls);
        lastPoint = { ...corners[0] };
        selectedId = walls[0].id;
        commit();
        renderer.preview = null;
      }
    } else if (!hasUsableGeometry(placed)) {
      setSaveState('Object is too small to place', true);
      renderer.preview = null;
    } else if (furnitureTouchesWall(placed)) {
      setSaveState('Furniture cannot touch a wall', true);
      renderer.preview = null;
    } else if (wallTouchesFurniture(placed)) {
      setSaveState('Wall cannot be placed through furniture', true);
      renderer.preview = null;
    } else if (furnitureOverlapsFurniture(placed)) {
      setSaveState('Furniture overlaps another object', true);
      renderer.preview = null;
    } else {
      placed.color = defaultEntityColor(placed.type);
      entities.push(placed); lastPoint = { ...placed.points.at(-1) }; selectedId = placed.id; commit();
      renderer.preview = null;
    }
  } else if (isMoving && moveSnapshot) commit();
  isDrawing = false; isMoving = false; isPanning = false;
  startPoint = null; previousPointer = null; moveOrigin = null; moveSnapshot = null;
  renderer.snapMarker = null;
  canvas.style.cursor = spacePressed ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair';
  renderer.draw();
});
canvas.addEventListener('pointercancel', () => { isDrawing = false; isMoving = false; isPanning = false; renderer.preview = null; renderer.draw(); });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('wheel', (event) => {
  event.preventDefault(); camera.zoomAt(localPoint(event), event.deltaY < 0 ? 1.12 : 1 / 1.12);
  renderer.draw(); updateZoomLabel();
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Space' && !event.repeat) { spacePressed = true; canvas.style.cursor = 'grab'; }
  if (event.key === 'Escape') { isDrawing = false; renderer.preview = null; renderer.draw(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); restoreEntities(event.shiftKey ? history.redo() : history.undo());
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); restoreEntities(history.redo()); }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedId) { event.preventDefault(); const index = entities.findIndex((entity) => entity.id === selectedId); if (index >= 0) entities.splice(index, 1); selectedId = null; commit(); }
  }
  if (event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) {
    const snapToggle = document.querySelector('#snap-toggle');
    snapToggle.checked = !snapToggle.checked;
    snapToggle.dispatchEvent(new Event('change'));
  }
  if (event.key === 'F8') {
    event.preventDefault();
    const mode = document.querySelector('#algorithm-mode');
    mode.value = mode.value === 'native' ? 'custom' : 'native';
    mode.dispatchEvent(new Event('change'));
  }
  const shortcuts = { v: 'select', m: 'select', w: 'wall', l: 'line', r: 'rectangle', c: 'circle', d: 'dimension', t: 'text' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') { spacePressed = false; if (!isPanning) canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair'; } });

document.querySelector('#grid-toggle').addEventListener('click', (event) => {
  renderer.gridVisible = !renderer.gridVisible; event.currentTarget.classList.toggle('selected', renderer.gridVisible);
  event.currentTarget.setAttribute('aria-pressed', String(renderer.gridVisible)); renderer.draw();
});
document.querySelector('#snap-toggle').addEventListener('change', (event) => { document.querySelector('#snap-state').textContent = event.currentTarget.checked ? 'On' : 'Off'; });
document.querySelector('#zoom-in').addEventListener('click', () => { camera.zoomAt({ x: renderer.width / 2, y: renderer.height / 2 }, 1.2); renderer.draw(); updateZoomLabel(); });
document.querySelector('#zoom-out').addEventListener('click', () => { camera.zoomAt({ x: renderer.width / 2, y: renderer.height / 2 }, 1 / 1.2); renderer.draw(); updateZoomLabel(); });
document.querySelector('#fit-view').addEventListener('click', fitView);
document.querySelector('#algorithm-mode').addEventListener('change', (event) => { renderer.algorithm = event.currentTarget.value; renderer.draw(); });
titleInput.addEventListener('input', () => {
  documentTitle = titleInput.value.trim() || 'Untitled plan';
  saveLocal();
});

document.querySelector('#save-plan').addEventListener('click', async () => {
  try {
    const validation = await fetch('/api/geometry/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentData()),
    });
    const validationResult = await validation.json();
    if (!validation.ok) throw new Error(validationResult.error || 'Plan validation failed');
    if (validationResult.issues?.length) {
      setSaveState(validationResult.issues.map((issue) => issue.message).join(' '), true);
      return;
    }
    const saved = projectId ? await api.updateProject(projectId, documentData()) : await api.createProject(documentData());
    projectId = saved.id;
    localStorage.setItem('planform-autosave', JSON.stringify({ ...documentData(), projectId }));
    setSaveState('Saved to projects');
  } catch (error) { setSaveState(error.message, true); }
});

async function openProjectDialog() {
  const dialog = document.querySelector('#project-dialog');
  const listing = document.querySelector('#project-list');
  listing.replaceChildren();
  listing.textContent = 'Loading plans...';
  dialog.showModal();
  try {
    const [projects, samples] = await Promise.all([api.listProjects(), api.listSamples()]);
    listing.replaceChildren();
    const addSection = (heading, items, isSample) => {
      const title = document.createElement('h3'); title.textContent = heading; listing.append(title);
      if (!items.length) { const empty = document.createElement('p'); empty.className = 'list-empty'; empty.textContent = 'No plans here yet'; listing.append(empty); return; }
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'project-option';
        const open = document.createElement('button'); open.type = 'button'; open.className = 'project-open'; open.textContent = item.title;
        open.addEventListener('click', async () => {
          try {
            const project = isSample ? item : await api.getProject(item.id);
            loadDocument(isSample ? project : project.document, isSample ? null : project.id);
            dialog.close();
          } catch (error) { setSaveState(error.message, true); }
        });
        row.append(open);
        if (!isSample) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'project-delete'; remove.textContent = 'Delete';
          remove.addEventListener('click', async () => {
            if (!window.confirm(`Delete “${item.title}”?`)) return;
            try { await api.deleteProject(item.id); await openProjectDialog(); } catch (error) { setSaveState(error.message, true); }
          });
          row.append(remove);
        }
        listing.append(row);
      }
    };
    addSection('SAVED PROJECTS', projects, false);
    addSection('SAMPLE PLANS', samples, true);
  } catch (error) { listing.textContent = error.message; }
}

function loadDocument(document, id = null) {
  entities.splice(0, entities.length, ...(document.entities || []).map(normalizeLoadedEntity).filter(Boolean));
  documentTitle = document.title || 'Untitled plan';
  titleInput.value = documentTitle;
  projectId = id;
  selectedId = null;
  history.record(entities);
  syncScene();
  saveLocal();
  fitView();
  setSaveState(id ? 'Loaded from projects' : 'Sample loaded');
}

document.querySelector('#open-plan').addEventListener('click', openProjectDialog);
document.querySelector('#new-plan').addEventListener('click', () => {
  if (entities.length && !window.confirm('Start a new plan? The current sketch remains available in autosave.')) return;
  entities.splice(0); selectedId = null; projectId = null; documentTitle = 'Untitled plan'; titleInput.value = documentTitle;
  commit(); camera.reset(renderer.width, renderer.height); updateZoomLabel();
});

const importInput = document.querySelector('#import-json');
document.querySelector('#import-plan').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try { loadDocument(JSON.parse(await file.text())); document.querySelector('#project-dialog').close(); }
  catch (error) { setSaveState(`Invalid plan file: ${error.message}`, true); }
  importInput.value = '';
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

document.querySelector('#download-json').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify(documentData(), null, 2)], { type: 'application/json' }), `${documentTitle.replace(/[^a-z0-9_-]+/gi, '_')}.json`);
});
document.querySelector('#export-plan').addEventListener('click', async () => {
  const format = document.querySelector('#export-format').value;
  try { downloadBlob(await api.export(format, documentData()), `${documentTitle.replace(/[^a-z0-9_-]+/gi, '_')}.${format}`); setSaveState(`${format.toUpperCase()} exported`); }
  catch (error) { setSaveState(error.message, true); }
});
document.querySelector('#print-plan').addEventListener('click', () => window.print());
document.querySelector('#help-button').addEventListener('click', () => document.querySelector('#shortcuts-dialog').showModal());
document.querySelector('#sidebar-lab').addEventListener('click', () => { window.location.href = '/lab'; });
document.querySelector('#theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = theme;
  localStorage.setItem('planform-theme', theme);
});
document.documentElement.dataset.theme = localStorage.getItem('planform-theme') || 'light';
document.querySelector('#room-metrics').addEventListener('click', async (event) => {
  const showing = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(showing));
  event.currentTarget.classList.toggle('selected', showing);
  renderer.roomLabels = showing ? renderer.roomLabels : [];
  if (showing) await updateRoomMetrics(); else renderer.draw();
});
document.querySelector('#command-input').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.currentTarget.value = ''; event.currentTarget.blur(); return; }
  if (event.key !== 'Enter') return;
  const input = event.currentTarget.value.trim();
  const match = input.match(/^(@)?(-?\d+(?:\.\d+)?)(?:<(-?\d+(?:\.\d+)?))?$/);
  if (!match) { setSaveState('Use 5000 or @3000<90', true); return; }
  const length = Number(match[2]) / 10;
  const angle = Number(match[3] || 0) * Math.PI / 180;
  const start = lastPoint || { x: 0, y: 0 };
  const end = { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
  const type = activeTool === 'wall' ? 'wall' : activeTool === 'dimension' ? 'dimension' : 'line';
  const entity = new Entity({ type, points: [start, end], thickness: type === 'wall' ? 14 : 2 });
  entities.push(entity); selectedId = entity.id; lastPoint = end;
  event.currentTarget.value = ''; event.currentTarget.blur(); commit();
});

document.querySelector('#property-thickness').addEventListener('change', (event) => {
  const entity = entities.find((item) => item.id === selectedId);
  if (!entity) return;
  entity.thickness = Math.max(1, Math.min(200, Number(event.currentTarget.value) || 1));
  event.currentTarget.value = entity.thickness;
  commit();
});
document.querySelector('#property-label').addEventListener('change', (event) => {
  const entity = entities.find((item) => item.id === selectedId);
  if (entity) { entity.label = event.currentTarget.value; commit(); }
});
document.querySelector('#property-layer').addEventListener('change', (event) => {
  const entity = entities.find((item) => item.id === selectedId);
  if (entity) { entity.layer = event.currentTarget.value; commit(); }
});
document.querySelector('#property-locked').addEventListener('change', (event) => {
  const entity = entities.find((item) => item.id === selectedId);
  if (entity) { entity.locked = event.currentTarget.checked; commit(); }
});

function transformSelection(transform) {
  const entity = entities.find((item) => item.id === selectedId);
  if (!entity || entity.locked) return;
  const bounds = entity.getBounds();
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const matrix = Matrix3.translate(centerX, centerY).compose(transform).compose(Matrix3.translate(-centerX, -centerY));
  const candidate = new Entity({
    ...entity.serialize(),
    points: entity.points.map((point) => matrix.transformPoint(point.x, point.y)),
  });
  if (furnitureTouchesWall(candidate, entity.id)) {
    setSaveState('Furniture cannot touch a wall', true);
    return;
  }
  if (wallTouchesFurniture(candidate, entity.id)) {
    setSaveState('Wall cannot be placed through furniture', true);
    return;
  }
  if (furnitureOverlapsFurniture(candidate, entity.id)) {
    setSaveState('Furniture overlaps another object', true);
    return;
  }
  entity.points = candidate.points;
  commit();
}

document.querySelector('#rotate-selection').addEventListener('click', () => transformSelection(Matrix3.rotate(Math.PI / 2)));
document.querySelector('#mirror-selection').addEventListener('click', () => transformSelection(Matrix3.scale(-1, 1)));
document.querySelector('#duplicate-selection').addEventListener('click', () => {
  const entity = entities.find((item) => item.id === selectedId);
  if (!entity) return;
  const duplicate = new Entity({ ...entity.serialize(), id: undefined, points: entity.points.map((point) => ({ x: point.x + renderer.gridSpacing, y: point.y - renderer.gridSpacing })) });
  if (furnitureTouchesWall(duplicate, duplicate.id) || wallTouchesFurniture(duplicate, duplicate.id) || furnitureOverlapsFurniture(duplicate, duplicate.id)) {
    setSaveState('Duplicate would touch or overlap a wall or furniture', true);
    return;
  }
  entities.push(duplicate); selectedId = duplicate.id; commit();
});
document.querySelectorAll('[data-layer-visibility]').forEach((input) => input.addEventListener('change', (event) => {
  const layer = event.currentTarget.dataset.layerVisibility;
  for (const entity of entities) if (entity.layer === layer) entity.visible = event.currentTarget.checked;
  syncScene(); saveLocal();
}));
document.querySelector('#snap-mode').addEventListener('change', () => { renderer.snapMarker = null; renderer.draw(); });
document.querySelector('#view-mode-2d').addEventListener('click', () => setViewMode('2d'));
document.querySelector('#view-mode-3d').addEventListener('click', () => setViewMode('3d'));
document.querySelector('#expand-model').addEventListener('click', () => setViewMode('3d'));
document.querySelector('#return-to-2d').addEventListener('click', () => setViewMode('2d'));
document.querySelector('#three-orbit-mode').addEventListener('click', () => set3DMoveMode(false));
document.querySelector('#three-move-mode').addEventListener('click', () => set3DMoveMode(true));
document.querySelector('#inset-move-mode').addEventListener('click', (event) => set3DMoveMode(event.currentTarget.getAttribute('aria-pressed') !== 'true'));
document.querySelector('#three-reset-camera').addEventListener('click', () => model3D?.resetCamera());
document.querySelector('#property-height').addEventListener('change', (event) => {
  const entity = entities.find((item) => item.id === selectedId);
  if (!entity) return;
  entity.height = Math.max(1, Math.min(1000, Number(event.currentTarget.value) || 1));
  event.currentTarget.value = entity.height;
  commit();
});
if (savedPlan) fitView();

if (savedPlan) setSaveState('Restored from autosave');
updateToolbar(); updateZoomLabel(); updateHistoryButtons();