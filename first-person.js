// A walking body in the same coordinate system as the furnished room.
// The simulation owns the people and furniture; this controller only reads them.
export function makeFirstPerson({
  THREE, canvas, world, width = 900, height = 520,
  obstacles = [], occupants = [], onStep, onMove
}) {
  const toWorld = world || ((x, y) => ({x: (x / width - .5) * 15.2, z: -3.9 + y / height * 9}));
  const low = toWorld(0, 0), high = toWorld(width, height);
  const radius = .21;
  const personRadius = .24;
  const clearance = .001;
  const speed = 1.25;
  const bounds = {
    minX: Math.min(low.x, high.x) + radius + clearance,
    maxX: Math.max(low.x, high.x) - radius - clearance,
    minZ: Math.min(low.z, high.z) + radius + clearance,
    maxZ: Math.max(low.z, high.z) - radius - clearance
  };
  const position = new THREE.Vector3(0, 1.6, 3.6);
  const lookDirection = new THREE.Vector3();
  const keys = new Set();
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
  let enabled = false, disposed = false;
  let yaw = 0, pitch = 0, eyeHeight = 1.6;
  let velocityX = 0, velocityZ = 0, touchX = 0, touchForward = 0;
  let stride = 0, stepDistance = 0, bob = 0, wasMoving = false;
  let rectangles = [], people = [];

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const sourceArray = value => typeof value === 'function' ? value() || [] : value || [];

  function readRoom() {
    rectangles = sourceArray(obstacles).filter(rect =>
      finite(rect.x) && finite(rect.y) && finite(rect.w) && finite(rect.h) && rect.w > 0 && rect.h > 0
    ).map(rect => {
      const a = toWorld(rect.x, rect.y), b = toWorld(rect.x + rect.w, rect.y + rect.h);
      return {minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z)};
    });
    people = sourceArray(occupants).filter(person =>
      person.active !== false && person.visible !== false && finite(person.x) && finite(person.y)
    ).map(person => {
      const p = toWorld(person.x, person.y);
      return {x: p.x, z: p.z, radius: radius + personRadius + clearance};
    });
  }

  function hits(x, z) {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return true;
    for (const rect of rectangles) {
      const dx = x - clamp(x, rect.minX, rect.maxX);
      const dz = z - clamp(z, rect.minZ, rect.maxZ);
      if (dx * dx + dz * dz < (radius + clearance) ** 2) return true;
    }
    for (const person of people) {
      if ((x - person.x) ** 2 + (z - person.z) ** 2 < person.radius ** 2) return true;
    }
    return false;
  }

  function safePoint(x, z) {
    const centerX = clamp(x, bounds.minX, bounds.maxX);
    const centerZ = clamp(z, bounds.minZ, bounds.maxZ);
    if (!hits(centerX, centerZ)) return {x: centerX, z: centerZ};
    // Search outwards, so an occupied entrance moves us only as far as necessary.
    const maxRadius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    for (let ring = .045; ring <= maxRadius; ring += .045) {
      const count = Math.max(16, Math.ceil(2 * Math.PI * ring / .06));
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count;
        const px = centerX + Math.cos(angle) * ring;
        const pz = centerZ + Math.sin(angle) * ring;
        if (!hits(px, pz)) return {x: px, z: pz};
      }
    }
    return null;
  }

  function clearInput() {
    keys.clear();
    touchX = touchForward = velocityX = velocityZ = 0;
  }

  function setPose(next, nextYaw = yaw, nextPitch = 0) {
    if (disposed || !next || !finite(next.x) || !finite(next.z)) return false;
    readRoom();
    const safe = safePoint(next.x, next.z);
    if (!safe) return false;
    eyeHeight = finite(next.y) ? clamp(next.y, 1.2, 2) : 1.6;
    position.set(safe.x, eyeHeight, safe.z);
    if (finite(nextYaw)) yaw = wrap(nextYaw);
    if (finite(nextPitch)) pitch = clamp(nextPitch, -1.27, 1.27);
    stride = stepDistance = bob = 0;
    wasMoving = false;
    clearInput();
    return true;
  }

  function look(dx, dy) {
    if (!enabled || disposed) return;
    if (finite(dx)) yaw = wrap(yaw - dx * .00235);
    if (finite(dy)) pitch = clamp(pitch - dy * .00235, -1.27, 1.27);
  }

  function getLookDirection() {
    const horizontal = Math.cos(pitch);
    return lookDirection.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
  }

  function isEditing(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '') ||
      !!target.closest?.('[contenteditable="true"], [role="textbox"]'));
  }

  function keyDown(event) {
    if (!enabled || disposed || !movementKeys.has(event.code) || isEditing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    keys.add(event.code);
    event.preventDefault();
  }

  function keyUp(event) {
    keys.delete(event.code);
    if (enabled && movementKeys.has(event.code) && !isEditing(event.target)) event.preventDefault();
  }

  function visibilityChanged() {
    if (typeof document !== 'undefined' && document.hidden) clearInput();
  }

  const keyTarget = typeof window !== 'undefined' ? window : canvas;
  keyTarget?.addEventListener('keydown', keyDown);
  keyTarget?.addEventListener('keyup', keyUp);
  keyTarget?.addEventListener('blur', clearInput);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChanged);

  function setEnabled(next) {
    if (disposed) return;
    enabled = !!next;
    clearInput();
    if (!enabled) {
      bob = 0;
      position.y = eyeHeight;
      wasMoving = false;
    }
  }

  function setTouchMove(strafe, forward) {
    if (!enabled || disposed) return;
    touchX = finite(strafe) ? clamp(strafe, -1, 1) : 0;
    touchForward = finite(forward) ? clamp(forward, -1, 1) : 0;
  }

  function normalsAt(x, z) {
    const normals = [];
    for (const rect of rectangles) {
      const dx = x - clamp(x, rect.minX, rect.maxX);
      const dz = z - clamp(z, rect.minZ, rect.maxZ);
      const d = Math.hypot(dx, dz);
      if (d > .000001 && d < radius + clearance) normals.push({x: dx / d, z: dz / d});
    }
    for (const person of people) {
      const dx = x - person.x, dz = z - person.z, d = Math.hypot(dx, dz);
      if (d > .000001 && d < person.radius) normals.push({x: dx / d, z: dz / d});
    }
    return normals;
  }

  function pointSegmentDistanceSquared(px, pz, x, z, dx, dz) {
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? clamp(((px - x) * dx + (pz - z) * dz) / lengthSquared, 0, 1) : 0;
    return (px - x - dx * t) ** 2 + (pz - z - dz * t) ** 2;
  }

  function segmentCrossesRect(x, z, dx, dz, rect) {
    let near = 0, far = 1;
    for (const [origin, delta, min, max] of [[x, dx, rect.minX, rect.maxX], [z, dz, rect.minZ, rect.maxZ]]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin < min || origin > max) return false;
      } else {
        const a = (min - origin) / delta, b = (max - origin) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return true;
  }

  function freeMove(x, z, dx, dz) {
    const nextX = x + dx, nextZ = z + dz;
    if (nextX < bounds.minX || nextX > bounds.maxX || nextZ < bounds.minZ || nextZ > bounds.maxZ) return false;
    const radiusSquared = (radius + clearance) ** 2 - 1e-12;
    for (const rect of rectangles) {
      // The swept circle is tested against the true rectangle, including its
      // rounded Minkowski corners, rather than an oversized square footprint.
      if (segmentCrossesRect(x, z, dx, dz, rect)) return false;
      const aX = x - clamp(x, rect.minX, rect.maxX), aZ = z - clamp(z, rect.minZ, rect.maxZ);
      const bX = nextX - clamp(nextX, rect.minX, rect.maxX), bZ = nextZ - clamp(nextZ, rect.minZ, rect.maxZ);
      let separation = Math.min(aX * aX + aZ * aZ, bX * bX + bZ * bZ);
      for (const px of [rect.minX, rect.maxX]) for (const pz of [rect.minZ, rect.maxZ]) {
        separation = Math.min(separation, pointSegmentDistanceSquared(px, pz, x, z, dx, dz));
      }
      if (separation < radiusSquared) return false;
    }
    for (const person of people) {
      if (pointSegmentDistanceSquared(person.x, person.z, x, z, dx, dz) < person.radius ** 2 - 1e-12) return false;
    }
    return true;
  }

  function slideStep(dx, dz) {
    const x = position.x, z = position.z;
    if (freeMove(x, z, dx, dz)) {
      position.x += dx;
      position.z += dz;
      return;
    }
    let bestX = x, bestZ = z, progress = 0;
    function consider(px, pz) {
      if (!freeMove(x, z, px - x, pz - z)) return;
      const dot = (px - x) * dx + (pz - z) * dz;
      if (dot > progress) {progress = dot; bestX = px; bestZ = pz;}
    }
    // Independent axes slide along straight furniture edges and room walls.
    consider(x + dx, z);
    consider(x, z + dz);
    // Tangents let a round body skim a person or a rounded furniture corner.
    for (const normal of normalsAt(x + dx, z + dz)) {
      const into = Math.min(0, dx * normal.x + dz * normal.z);
      consider(x + dx - normal.x * into, z + dz - normal.z * into);
    }
    position.x = bestX;
    position.z = bestZ;
  }

  function update(dt, {blocked = false, reducedMotion = false} = {}) {
    const result = {moving: false, distance: 0, bob: 0, yaw, pitch};
    if (disposed || !enabled) return result;
    dt = finite(dt) ? clamp(dt, 0, .12) : 0;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const editing = typeof document !== 'undefined' && isEditing(document.activeElement);
    if (blocked || hidden || editing) clearInput();
    readRoom();
    if (hits(position.x, position.z)) {
      // A moving patron can enter our space between frames. Resolve the overlap
      // without changing that patron's simulation state or counting it as a step.
      const safe = safePoint(position.x, position.z);
      if (safe) {position.x = safe.x; position.z = safe.z;}
      else {clearInput(); return result;}
    }

    let strafe = touchX + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    let forward = touchForward + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const inputLength = Math.hypot(strafe, forward);
    if (inputLength > 1) {strafe /= inputLength; forward /= inputLength;}
    const wantedX = (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) * speed;
    const wantedZ = (-Math.sin(yaw) * strafe - Math.cos(yaw) * forward) * speed;
    const blend = 1 - Math.exp(-dt * (inputLength > 0 ? 14 : 20));
    velocityX += (wantedX - velocityX) * blend;
    velocityZ += (wantedZ - velocityZ) * blend;
    if (Math.hypot(velocityX, velocityZ) < .001) velocityX = velocityZ = 0;
    const dx = velocityX * dt, dz = velocityZ * dt;
    // Short sweeps cannot jump over a thin fixture or across another body.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .035));
    let distance = 0;
    for (let i = 0; i < steps; i++) {
      const x = position.x, z = position.z;
      slideStep(dx / steps, dz / steps);
      distance += Math.hypot(position.x - x, position.z - z);
    }
    const moving = distance > .00005;
    const actualSpeed = dt ? distance / dt : 0;
    stride += distance;
    const targetBob = !reducedMotion && moving ? Math.sin(stride * Math.PI * 2 / .56) * .012 * Math.min(1, actualSpeed / speed) : 0;
    bob = reducedMotion ? 0 : bob + (targetBob - bob) * (1 - Math.exp(-dt * 22));
    position.y = eyeHeight + bob;
    stepDistance += distance;
    if (stepDistance >= .56) {
      stepDistance %= .56;
      onStep?.({position, speed: actualSpeed});
    }
    if (moving || wasMoving) onMove?.({position, yaw, pitch, speed: actualSpeed, moving, distance});
    wasMoving = moving;
    return {moving, distance, bob, yaw, pitch};
  }

  function dispose() {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    keyTarget?.removeEventListener('keydown', keyDown);
    keyTarget?.removeEventListener('keyup', keyUp);
    keyTarget?.removeEventListener('blur', clearInput);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChanged);
  }

  readRoom();
  const initial = safePoint(position.x, position.z);
  if (initial) {position.x = initial.x; position.z = initial.z;}
  return {
    position,
    get yaw() {return yaw;},
    get pitch() {return pitch;},
    get enabled() {return enabled;},
    setPose,
    spawn(next) {return setPose(next, yaw, pitch);},
    look, getLookDirection, setEnabled, setTouchMove, update, dispose
  };
}
