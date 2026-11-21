const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export class Model3D {
  constructor(container, { onSelect = () => {}, onMove = () => {}, onCommit = () => {} } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onMove = onMove;
    this.onCommit = onCommit;
    this.entities = new Map();
    this.entityMeshes = new Map();
    this.moveMode = false;
    this.target = { x: 0, y: 0, z: 0 };
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3.3;
    this.distance = 1250;
    this.drag = null;
    this.available = false;
    this.keyboardNavigation = false;
    this.keyboardHandler = null;
  }

  async initialize() {
    this.THREE = await import(THREE_CDN);
    const THREE = this.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#26312c');
    this.scene.fog = new THREE.Fog('#26312c', 1800, 6500);
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);
    this.camera.up.set(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D floor plan model');
    this.renderer.domElement.tabIndex = 0;
    this.mount(this.container);

    this.scene.add(new THREE.HemisphereLight('#e5f1e8', '#303a34', 1.6));
    const keyLight = new THREE.DirectionalLight('#fff8eb', 1.8);
    keyLight.position.set(-450, 850, 600);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(keyLight);
    this.ambientGroup = new THREE.Group();
    this.scene.add(this.ambientGroup);
    this.floorGroup = new THREE.Group();
    this.scene.add(this.floorGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.installControls();
    this.resize();
    this.available = true;
    this.renderLoop();
    return this;
  }

  mount(container) {
    this.container = container;
    container.replaceChildren(this.renderer.domElement);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver.observe(container);
    }
    this.resize();
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const bounds = this.container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
  }

  setMode(moveMode) {
    this.moveMode = Boolean(moveMode);
    if (this.renderer) this.renderer.domElement.style.cursor = this.moveMode ? 'grab' : 'grab';
  }

  setKeyboardNavigation(enabled) {
    this.keyboardNavigation = Boolean(enabled);
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    if (!this.keyboardNavigation) return;
    this.keyboardHandler = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = Math.max(20, this.distance * (event.shiftKey ? 0.12 : 0.035));
      const forwardX = -Math.sin(this.theta);
      const forwardZ = -Math.cos(this.theta);
      const rightX = Math.cos(this.theta);
      const rightZ = -Math.sin(this.theta);
      if (event.key === 'ArrowUp') {
        this.target.x += forwardX * step;
        this.target.z += forwardZ * step;
      } else if (event.key === 'ArrowDown') {
        this.target.x -= forwardX * step;
        this.target.z -= forwardZ * step;
      } else if (event.key === 'ArrowLeft') {
        this.target.x -= rightX * step;
        this.target.z -= rightZ * step;
      } else if (event.key === 'ArrowRight') {
        this.target.x += rightX * step;
        this.target.z += rightZ * step;
      }
    };
    window.addEventListener('keydown', this.keyboardHandler);
  }

  resetCamera() {
    this.target = { ...this.boundsCenter };
    this.distance = Math.max(850, this.boundsSize * 2.8);
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3.3;
  }

  setEntities(entities) {
    if (!this.available) return;
    const alive = new Set();
    for (const entity of entities) {
      if (!entity.visible || !entity.points.length) continue;
      alive.add(entity.id);
      const openingSignature = entity.type === 'wall'
        ? JSON.stringify(entities
          .filter((item) => ['door', 'window'].includes(item.type))
          .map((item) => [item.type, item.points, item.height]))
        : null;
      const signature = JSON.stringify([
        entity.type,
        entity.points,
        entity.thickness,
        entity.height,
        entity.label,
        entity.color,
        entity.locked,
        openingSignature,
      ]);
      const previous = this.entityMeshes.get(entity.id);
      if (previous?.signature === signature) continue;
      if (previous) this.removeObject(previous.group);
      const group = this.createEntityGroup(entity, entities);
      group.userData.entityId = entity.id;
      this.scene.add(group);
      this.entityMeshes.set(entity.id, { signature, group });
    }
    for (const [id, entry] of this.entityMeshes) {
      if (!alive.has(id)) { this.removeObject(entry.group); this.entityMeshes.delete(id); }
    }
    this.entities = new Map(entities.map((entity) => [entity.id, entity]));
    this.updateFloor(entities);
  }

  createEntityGroup(entity, allEntities = []) {
    const THREE = this.THREE;
    const points = entity.points;
    const bounds = entity.type === 'circle'
      ? { minX: points[0].x, maxX: points[0].x, minY: points[0].y, maxY: points[0].y }
      : { minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)), maxY: Math.max(...points.map((point) => point.y)) };
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minY + bounds.maxY) / 2;
    const group = new THREE.Group();
    group.position.set(centerX, 0, centerZ);
    const color = this.validColor(entity.color);
    const material = (hex, options = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.68, metalness: 0.03, ...options });
    const mainMaterial = material(color, { side: THREE.DoubleSide });
    const secondary = material('#d6e28b', { transparent: true, opacity: 0.82 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: '#86d4dc',
      transparent: true,
      opacity: 0.48,
      roughness: 0.15,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = (first, second, thickness, height, y = height / 2, meshMaterial = mainMaterial) => {
      const dx = second.x - first.x;
      const dz = second.y - first.y;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), meshMaterial);
      mesh.position.set((first.x + second.x) / 2 - centerX, y, (first.y + second.y) / 2 - centerZ);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.entityId = entity.id;
      group.add(mesh);
    };

    if (entity.type === 'wall') {
      const height = Math.max(30, Number(entity.height) || 280);
      for (let index = 0; index + 1 < points.length; index += 1) {
        const wallStart = points[index];
        const wallEnd = points[index + 1];
        const dx = wallEnd.x - wallStart.x;
        const dy = wallEnd.y - wallStart.y;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) continue;
        const wallLength = Math.sqrt(lengthSquared);
        const openings = allEntities
          .filter((item) => ['door', 'window'].includes(item.type) && item.points?.length >= 2)
          .map((item) => {
            const first = item.points[0];
            const second = item.points[item.points.length - 1];
            const openingDx = second.x - first.x;
            const openingDy = second.y - first.y;
            const openingLength = Math.hypot(openingDx, openingDy);
            const firstT = ((first.x - wallStart.x) * dx + (first.y - wallStart.y) * dy) / lengthSquared;
            const secondT = ((second.x - wallStart.x) * dx + (second.y - wallStart.y) * dy) / lengthSquared;
            const firstDistance = Math.abs(dx * (first.y - wallStart.y) - dy * (first.x - wallStart.x)) / wallLength;
            const secondDistance = Math.abs(dx * (second.y - wallStart.y) - dy * (second.x - wallStart.x)) / wallLength;
            const parallelError = Math.abs(dx * openingDy - dy * openingDx) / (wallLength * (openingLength || 1));
            const openingHeight = item.type === 'door'
              ? Math.max(160, Number(item.height) || 210)
              : Math.max(40, Number(item.height) || 115);
            return {
              start: Math.max(0, Math.min(firstT, secondT)),
              end: Math.min(1, Math.max(firstT, secondT)),
              bottom: item.type === 'window' ? 90 : 0,
              top: item.type === 'window' ? 90 + openingHeight : openingHeight,
              valid: Math.max(firstDistance, secondDistance) <= Math.max(10, (entity.thickness || 14) / 2 + 3)
                && parallelError <= 0.087
                && openingLength > 0,
            };
          })
          .filter((opening) => opening.valid && opening.end > opening.start);
        const boundaries = [...new Set([0, 1, ...openings.flatMap((opening) => [opening.start, opening.end])])]
          .sort((first, second) => first - second);
        for (let boundary = 0; boundary + 1 < boundaries.length; boundary += 1) {
          const startT = boundaries[boundary];
          const endT = boundaries[boundary + 1];
          if (endT <= startT) continue;
          const start = { x: wallStart.x + dx * startT, y: wallStart.y + dy * startT };
          const end = { x: wallStart.x + dx * endT, y: wallStart.y + dy * endT };
          const midpoint = (startT + endT) / 2;
          const activeOpenings = openings.filter((opening) => midpoint >= opening.start && midpoint <= opening.end);
          const levels = [...new Set([
            0,
            height,
            ...activeOpenings.flatMap((opening) => [
              Math.max(0, Math.min(height, opening.bottom)),
              Math.max(0, Math.min(height, opening.top)),
            ]),
          ])].sort((first, second) => first - second);
          for (let level = 0; level + 1 < levels.length; level += 1) {
            const bottom = levels[level];
            const top = levels[level + 1];
            const middle = (bottom + top) / 2;
            const isOpening = activeOpenings.some((opening) => middle >= opening.bottom && middle <= opening.top);
            if (!isOpening && top > bottom) {
              beam(start, end, Math.max(6, entity.thickness || 14), top - bottom, (bottom + top) / 2);
            }
          }
        }
      }
    } else if (entity.type === 'door' || entity.type === 'window') {
      const openingHeight = entity.type === 'door' ? Math.max(160, Number(entity.height) || 210) : Math.max(40, Number(entity.height) || 115);
      const sill = entity.type === 'window' ? 90 : 0;
      for (let openingIndex = 0; openingIndex + 1 < points.length; openingIndex += 1) {
        if (entity.type === 'window') {
          beam(points[openingIndex], points[openingIndex + 1], 3, openingHeight, sill + openingHeight / 2, glassMaterial);
          beam(points[openingIndex], points[openingIndex + 1], 5, 5, sill, secondary);
          beam(points[openingIndex], points[openingIndex + 1], 5, 5, sill + openingHeight, secondary);
          for (const point of [points[openingIndex], points[openingIndex + 1]]) {
            const framePost = new THREE.Mesh(new THREE.BoxGeometry(5, openingHeight, 5), secondary);
            framePost.position.set(point.x - centerX, sill + openingHeight / 2, point.y - centerZ);
            framePost.userData.entityId = entity.id;
            group.add(framePost);
          }
        } else {
          beam(points[openingIndex], points[openingIndex + 1], 3, openingHeight, openingHeight / 2, secondary);
        }
      }
    } else if (entity.type === 'circle') {
      const radius = points[1] ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 18;
      const geometry = entity.label?.toLowerCase().includes('table')
        ? new THREE.CylinderGeometry(radius, radius, 72, 32)
        : new THREE.CylinderGeometry(radius, radius, 8, 32);
      const mesh = new THREE.Mesh(geometry, mainMaterial);
      mesh.position.set(0, entity.label?.toLowerCase().includes('table') ? 36 : 4, 0);
      mesh.castShadow = true;
      mesh.userData.entityId = entity.id;
      group.add(mesh);
    } else if (entity.type === 'rectangle' || entity.type === 'furniture') {
      const width = Math.max(8, bounds.maxX - bounds.minX);
      const depth = Math.max(8, bounds.maxY - bounds.minY);
      const label = (entity.label || '').toLowerCase();
      const height = Number(entity.height) || (label.includes('wardrobe') ? 205 : label.includes('bed') ? 42 : label.includes('table') ? 74 : label.includes('chair') ? 88 : label.includes('sofa') ? 78 : 24);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mainMaterial);
      mesh.position.set(0, height / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.entityId = entity.id;
      group.add(mesh);
      if (label.includes('bed')) {
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 8, depth * 0.2), secondary);
        pillow.position.set(0, height + 3, -depth * 0.34);
        pillow.userData.entityId = entity.id;
        group.add(pillow);
      }
    } else if (entity.type === 'dimension' || entity.type === 'line') {
      for (let index = 0; index + 1 < points.length; index += 1) beam(points[index], points[index + 1], entity.type === 'dimension' ? 1.5 : 2, entity.type === 'dimension' ? 1.5 : 3, 2, mainMaterial);
    } else if (entity.type === 'text') {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(22, 3, 3), mainMaterial);
      marker.position.y = 2;
      marker.userData.entityId = entity.id;
      group.add(marker);
    }
    return group;
  }

  updateFloor(entities) {
    const THREE = this.THREE;
    const points = entities.flatMap((entity) => entity.points || []);
    const minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
    const maxX = points.length ? Math.max(...points.map((point) => point.x)) : 500;
    const minZ = points.length ? Math.min(...points.map((point) => point.y)) : 0;
    const maxZ = points.length ? Math.max(...points.map((point) => point.y)) : 500;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const size = Math.max(500, spanX, spanZ) + 240;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const signature = `${minX}:${maxX}:${minZ}:${maxZ}`;
    if (signature === this.floorSignature) return;
    this.floorSignature = signature;
    for (const child of [...this.floorGroup.children]) this.removeObject(child);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: '#34413a', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, -1, centerZ);
    ground.receiveShadow = true;
    this.floorGroup.add(ground);
    const divisions = Math.max(2, Math.round(size / 25));
    const grid = new THREE.GridHelper(size, divisions, '#839286', '#46554c');
    grid.position.set(centerX, 0, centerZ);
    grid.material.transparent = true;
    grid.material.opacity = 0.44;
    this.floorGroup.add(grid);
    this.boundsCenter = { x: centerX, y: 0, z: centerZ };
    this.boundsSize = Math.max(spanX, spanZ, 300);
    if (!this.cameraInitialized) {
      this.resetCamera();
      this.cameraInitialized = true;
    }
  }

  validColor(value) {
    try { return new this.THREE.Color(value || '#c5d0c8'); }
    catch { return new this.THREE.Color('#c5d0c8'); }
  }

  removeObject(object) {
    object.parent?.remove(object);
    object.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose();
    });
  }

  pointerRay(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const pointer = new this.THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    const raycaster = new this.THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    return raycaster;
  }

  groundPoint(event) {
    const ray = this.pointerRay(event);
    const ground = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0);
    return ray.ray.intersectPlane(ground, new this.THREE.Vector3());
  }

  installControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      if (this.moveMode && event.button === 0) {
        const ray = this.pointerRay(event);
        const hits = ray.intersectObjects([...this.entityMeshes.values()].map((entry) => entry.group), true);
        const hit = hits.find((item) => item.object.userData.entityId || item.object.parent?.userData.entityId);
        const id = hit?.object.userData.entityId || hit?.object.parent?.userData.entityId;
        const entity = this.entities.get(id);
        const ground = this.groundPoint(event);
        if (entity && ground) {
          const group = this.entityMeshes.get(id)?.group;
          this.onSelect(id);
          if (!entity.locked) {
            this.drag = { type: 'move', id, entity, group, ground, x: group.position.x, z: group.position.z, basePoints: entity.points.map((point) => ({ ...point })) };
            canvas.style.cursor = 'grabbing';
          }
          return;
        }
      }
      this.drag = { type: event.button === 2 || event.button === 1 ? 'pan' : 'orbit', x: event.clientX, y: event.clientY, target: { ...this.target } };
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      if (this.drag.type === 'move') {
        const point = this.groundPoint(event);
        if (!point) return;
        const dx = point.x - this.drag.ground.x;
        const dz = point.z - this.drag.ground.z;
        const allowed = this.onMove(this.drag.id, dx, dz, this.drag.basePoints);
        if (allowed !== false) {
          this.drag.group.position.x = this.drag.x + dx;
          this.drag.group.position.z = this.drag.z + dz;
        } else {
          this.drag.group.position.x = this.drag.x;
          this.drag.group.position.z = this.drag.z;
        }
        return;
      }
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (this.drag.type === 'orbit') {
        this.theta -= dx * 0.008;
        this.phi = Math.max(0.18, Math.min(Math.PI * 0.48, this.phi + dy * 0.006));
      } else {
        const shift = this.distance * 0.0014;
        this.target.x = this.drag.target.x - dx * shift;
        this.target.z = this.drag.target.z + dy * shift;
      }
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.drag.target = { ...this.target };
    });
    const finish = () => {
      if (this.drag?.type === 'move') this.onCommit(this.drag.id);
      this.drag = null;
      canvas.style.cursor = this.moveMode ? 'grab' : 'grab';
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.distance = Math.max(180, Math.min(8000, this.distance * (event.deltaY < 0 ? 0.9 : 1.1)));
    }, { passive: false });
    canvas.addEventListener('click', (event) => {
      if (this.moveMode) return;
      const hits = this.pointerRay(event).intersectObjects([...this.entityMeshes.values()].map((entry) => entry.group), true);
      const hit = hits.find((item) => item.object.userData.entityId || item.object.parent?.userData.entityId);
      this.onSelect(hit?.object.userData.entityId || hit?.object.parent?.userData.entityId || null);
    });
  }

  renderLoop() {
    if (!this.available) return;
    requestAnimationFrame(() => this.renderLoop());
    const horizontal = this.distance * Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + horizontal * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + horizontal * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
    this.renderer.render(this.scene, this.camera);
  }
}