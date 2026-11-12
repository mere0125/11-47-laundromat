// Draw a reconstruction from the selected person's observations and plan.
function drawMemoryScene(mind) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const backdrop = ctx.createRadialGradient(width * .46, height * .54, 0, width * .46, height * .54, width * .65);
  backdrop.addColorStop(0, '#192439');
  backdrop.addColorStop(1, '#0f1020');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);
  if (!mind) return;

  frameMemoryScene(mind, width, height);
  drawMemoryTiles(mind);
  if (mind.trail.length > 1) wire(mind.trail, '#a083aa80', 1);
  if (mind.path.length) drawMemoryRoute(mind);

  const visiblePeople = new Set(mind.neighbors.map(person => person.id));
  for (const person of mind.peopleMemory.values()) {
    if (visiblePeople.has(person.id) || elapsed - person.seenAt > 25000) continue;
    const position = screen(person);
    ctx.strokeStyle = '#ac92b2a0';
    ctx.lineWidth = 1;
    ctx.strokeRect(position.x - 2.5, position.y - 2.5, 5, 5);
  }

  const objects = [];
  for (const [index, rect] of mind.objects) {
    const visible = mind.visibleObjects.has(index);
    const landmark = mind.landmarks.get(machineId(index)) ?? mind.landmarks.get(`place-${index}`);
    objects.push({
      depth: screen({x: rect.x + rect.w / 2, y: rect.y + rect.h}).y,
      draw: () => drawMemoryObject(rect, visible, landmark)
    });
  }
  for (const person of mind.neighbors) {
    objects.push({depth: screen(person).y, draw: () => drawMemoryPerson(person)});
  }
  objects.push({depth: screen(mind.person).y, draw: () => personModel(mind.person, mind.index)});
  objects.sort((a, b) => a.depth - b.depth).forEach(object => object.draw());

  const { person } = mind;
  if (eyesVisible) {
    const look = {x: person.x + 28 * Math.cos(mind.heading), y: person.y + 28 * Math.sin(mind.heading), z: 2};
    wire([{...person, z: 2}, look], '#a6f0d8', 1.6);
  }
}

function frameMemoryScene(mind, width, height) {
  const previous = memoryProjection;
  memoryProjection = null;
  const base = projectionInfo();
  let minX = mind.person.x;
  let maxX = minX;
  let minY = mind.person.y;
  let maxY = minY;
  for (let k = 0; k < mind.belief.length; k++) {
    if (!mind.belief[k]) continue;
    const point = cellPoint(k);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const highest = Math.max(50, ...[...mind.objects.values()].map(memoryObjectHeight));
  const bounds = [minX - 18, maxX + 18].flatMap(x =>
    [minY - 18, maxY + 18].flatMap(y => [0, highest].map(z => screen({x, y, z})))
  );
  const left = Math.min(...bounds.map(point => point.x));
  const right = Math.max(...bounds.map(point => point.x));
  const top = Math.min(...bounds.map(point => point.y));
  const bottom = Math.max(...bounds.map(point => point.y));
  const compact = width < 760;
  const fit = Math.min((width - (compact ? 42 : 280)) / (right - left), (height - (compact ? 48 : 160)) / (bottom - top));
  const zoom = clamp(fit * cameraZoom, .85, compact ? 2.15 : 1.8);
  const target = {
    ...base,
    scale: base.scale * zoom,
    cx: base.cx + (base.cx - (left + right) / 2) * zoom,
    cy: height * (compact ? .5 : .56) + (base.cy - (top + bottom) / 2) * zoom
  };
  if (previous && !reducedMotion) {
    for (const key of ['scale', 'cx', 'cy']) target[key] = previous[key] + (target[key] - previous[key]) * .14;
  }
  memoryProjection = target;
}

function drawMemoryTiles(mind) {
  const {scale, cx, cy, c, s, squash} = projectionInfo();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(scale * c, scale * s * squash, -scale * s, scale * c * squash, 0, 0);
  ctx.translate(-WORLD.w / 2, -WORLD.h / 2);
  for (const [visible, fill] of [[false, '#53506c'], [true, '#5b9d9e']]) {
    ctx.beginPath();
    for (let k = 0; k < mind.belief.length; k++) {
      if (mind.belief[k] !== 1 || mind.visible.has(k) !== visible) continue;
      const point = cellPoint(k);
      const half = BELIEF.step / 2;
      ctx.rect(point.x - half, point.y - half, BELIEF.step - 1.5, BELIEF.step - 1.5);
    }
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}

function drawMemoryRoute(mind) {
  const route = [mind.person, ...mind.path].map(point => ({...point, z: 1}));
  const endpoint = route.at(-1);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  wire(route, '#211d2d', 4);
  ctx.setLineDash([3, 6]);
  ctx.lineDashOffset = reducedMotion ? 0 : -elapsed / 100;
  wire(route, '#ffd091', 2);
  ctx.restore();
  ellipseWorld(endpoint, 8, 8, '#ffcb8f28', '#ffd091', 'ground', 0, 1.4);
}

function memoryObjectHeight(rect) {
  return {washer: 60, dryer: 74, table: 42, cart: 38, bench: 28, room: 105, vending: 94}[rect.kind] ?? 36;
}

function drawMemoryObject(rect, visible, landmark) {
  const {x, y, w, h} = rect;
  const height = memoryObjectHeight(rect);
  const edge = visible ? '#b1e0d6' : '#877c9d';
  const top = visible ? '#5b8890' : '#3c3a56';
  const front = visible ? '#304e61' : '#25273e';
  const side = visible ? '#3a6575' : '#303149';
  const isMachine = rect.kind === 'washer' || rect.kind === 'dryer';
  if (rect.kind === 'table' || rect.kind === 'bench') {
    for (const [px, py] of [[x + 3, y + 3], [x + w - 6, y + 3], [x + 3, y + h - 6], [x + w - 6, y + h - 6]]) {
      box(px, py, 3, 3, height - 4, edge, front, side);
    }
    box(x, y, w, h, 4, top, front, side, height - 4);
  } else {
    box(x, y, w, h, height, top, front, side);
  }
  groundRect(x, y, w, h, top, height + .1, edge);

  if (isMachine) {
    const faceX = rect.kind === 'washer' ? x + w + .4 : x - .4;
    const drum = {x: faceX, y: y + h / 2, z: height * .47};
    ellipseWorld(drum, Math.min(h * .32, 14), height * .25, front, edge, 'side');
    const stateColor = {running: '#c0ead1', 'needs repair': '#f4a390', 'ready to collect': '#ffd091'}[landmark?.status];
    if (stateColor) groundRect(x + 6, y + h - 10, 5, 4, stateColor, height + .3, null);
  }
  if (learnedPlacesVisible && landmark) {
    labelAt(landmark.name, {x: x + w / 2, y: y + h * .58, z: height + 3}, edge, 10, 'center');
  }
}

function drawMemoryPerson(person) {
  const {x, y} = screen(person);
  const scale = projectionInfo().scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#a6cccb';
  ctx.fillRect(-6, -29, 12, 25);
  ctx.beginPath();
  ctx.arc(0, -36, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
