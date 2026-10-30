const canvas = document.querySelector("#room");
const ctx = canvas.getContext("2d");

const WORLD = { w: 900, h: 520, pad: 24 };
const colors = {
  paper: "#181432", ink: "#f7e9bd", muted: "rgba(225,210,235,.34)",
  red: "#ff607f", blue: "#6e8cff", cyan: "#4de1d0",
  yellow: "#ffd25c", green: "#74d89b", violet: "#c078cf",
};

const obstacles = [];
for (let i = 0; i < 8; i++) obstacles.push({ x: 42, y: 52 + i * 53, w: 92, h: 42, kind: "washer", label: `W ${String(i + 1).padStart(2, "0")}` });
for (let i = 0; i < 6; i++) obstacles.push({ x: 774, y: 67 + i * 65, w: 84, h: 50, kind: "dryer", label: `D ${String(i + 1).padStart(2, "0")}` });
obstacles.push(
  { x: 290, y: 118, w: 282, h: 58, kind: "table", label: "FOLD 1" },
  { x: 323, y: 314, w: 245, h: 58, kind: "table", label: "FOLD 2" },
  { x: 625, y: 44, w: 122, h: 138, kind: "room", label: "UTILITY" },
  { x: 202, y: 428, w: 200, h: 38, kind: "bench", label: "WAIT" },
  { x: 650, y: 428, w: 76, h: 50, kind: "vending", label: "SOAP" },
  { x: 148, y: 207, w: 45, h: 72, kind: "cart", label: "CART" },
  { x: 600, y: 244, w: 48, h: 75, kind: "cart", label: "CART" },
);

const attractors = [
  { id: "clock", name: "wall clock", short: "CLOCK", x: 452, y: 43, color: colors.yellow },
  { id: "dryers", name: "dryer bank", short: "DRYERS", x: 760, y: 252, color: colors.cyan },
  { id: "door", name: "front door", short: "DOOR", x: 510, y: 493, color: colors.green },
  { id: "phone", name: "phone glow", short: "PHONE", x: 220, y: 73, color: colors.violet },
  { id: "soap", name: "soap machine", short: "SOAP", x: 688, y: 416, color: colors.red },
];

const occupants = [
  { id: "mere", name: "Mere folding", x: 246, y: 272, baseX: 246, baseY: 272, phase: .4, attention: [.52, .27, .06, .11, .04] },
  { id: "window", name: "woman by window", x: 676, y: 215, baseX: 676, baseY: 215, phase: 2.1, attention: [.49, .28, .08, .10, .05] },
  { id: "attendant", name: "night attendant", x: 701, y: 354, baseX: 701, baseY: 354, phase: 4.2, attention: [.08, .46, .09, .05, .32] },
  { id: "sleeping", name: "sleeping man", x: 294, y: 406, baseX: 294, baseY: 406, phase: 5.5, attention: [.09, .06, .20, .57, .08] },
];

const zones = [
  { id: "folding-aisle", name: "folding aisle", x: 450, y: 252 },
  { id: "window-seat", name: "window seat", x: 684, y: 205 },
  { id: "washer-end", name: "washer end", x: 160, y: 365 },
  { id: "threshold", name: "street threshold", x: 510, y: 486 },
];

let running = true;
let elapsed = 0;
let lastFrame = performance.now();
let lastMetricUpdate = 0;
let visibilitySamples = [];
let comparison = null;
let lightsOn = true;
let neonOn = true;
let doorOpen = true;
let coins = 0;
const activeMachines = new Set([1, 4, 9, 12]);
const METERS_PER_UNIT = .018;
const PERSONAL_SPACE_METERS = 1.2;
const MACHINE_CLEARANCE_METERS = .8;
const EXIT_CLEARANCE_METERS = .9;
let proximity = { body: [], machine: [], attention: [], exit: [] };
let draggedOccupant = null;
let pointerMoved = false;
let dragStart = null;
let attentionPairCache = null;

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rgba(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`;
}
function pointInRect(point, rect, inset = 0) {
  return point.x >= rect.x - inset && point.x <= rect.x + rect.w + inset && point.y >= rect.y - inset && point.y <= rect.y + rect.h + inset;
}
function pointBlocked(point) { return obstacles.some(rect => pointInRect(point, rect)); }

function lineIntersectsRect(a, b, rect) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rect.x, rect.x + rect.w - a.x, a.y - rect.y, rect.y + rect.h - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 > .002 && t0 < .998;
}
function segmentBlocked(a, b) {
  const own = obstacles.find(rect => pointInRect(a, rect));
  return obstacles.some(rect => rect !== own && lineIntersectsRect(a, b, rect));
}
function buildVisibilitySamples() {
  visibilitySamples = [];
  for (let x = 35; x <= WORLD.w - 35; x += 28) {
    for (let y = 35; y <= WORLD.h - 35; y += 28) {
      const point = { x, y };
      if (!pointBlocked(point)) visibilitySamples.push(point);
    }
  }
}
function visibilityProfile(point) {
  return visibilitySamples.map(sample => distance(point, sample) <= 325 && !segmentBlocked(point, sample));
}
function rayRectDistance(origin, direction, rect) {
  let near = -Infinity, far = Infinity;
  for (const axis of ["x", "y"]) {
    const min = rect[axis], max = rect[axis] + rect[axis === "x" ? "w" : "h"];
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < min || origin[axis] > max) return Infinity;
      continue;
    }
    const t1 = (min - origin[axis]) / direction[axis], t2 = (max - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
    if (near > far) return Infinity;
  }
  return far > .5 && near < 325 ? Math.max(.5, near) : Infinity;
}
function boundaryDistance(origin, direction) {
  const values = [];
  if (direction.x > 0) values.push((WORLD.w - WORLD.pad - origin.x) / direction.x);
  if (direction.x < 0) values.push((WORLD.pad - origin.x) / direction.x);
  if (direction.y > 0) values.push((WORLD.h - WORLD.pad - origin.y) / direction.y);
  if (direction.y < 0) values.push((WORLD.pad - origin.y) / direction.y);
  return Math.min(...values.filter(value => value > 0));
}
function isovistPolygon(point) {
  return Array.from({ length: 96 }, (_, index) => {
    const angle = index / 96 * Math.PI * 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const obstacleDistance = Math.min(...obstacles.map(rect => rayRectDistance(point, direction, rect)));
    const radius = Math.min(325, boundaryDistance(point, direction), obstacleDistance);
    return { x: point.x + direction.x * radius, y: point.y + direction.y * radius };
  });
}

function normalized(values) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map(value => value / total);
}
function attentionProfile(ref) {
  if (ref.type === "occupant") return [...ref.source.attention];
  return normalized(attractors.map(attractor => Math.exp(-distance(ref, attractor) / 145)));
}
function addFlowEdge(graph, from, to, capacity, cost) {
  const forward = { to, capacity, cost, reverse: graph[to].length };
  const reverse = { to: from, capacity: 0, cost: -cost, reverse: graph[from].length };
  graph[from].push(forward); graph[to].push(reverse);
}
function earthMover(sourceWeights, targetWeights) {
  const count = attractors.length, source = count * 2, sink = source + 1;
  const graph = Array.from({ length: sink + 1 }, () => []);
  sourceWeights.forEach((weight, index) => addFlowEdge(graph, source, index, weight, 0));
  targetWeights.forEach((weight, index) => addFlowEdge(graph, count + index, sink, weight, 0));
  for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) addFlowEdge(graph, i, count + j, 1, distance(attractors[i], attractors[j]));
  let flow = 0, cost = 0;
  while (flow < 1 - 1e-8) {
    const dist = Array(graph.length).fill(Infinity), previousNode = Array(graph.length).fill(-1), previousEdge = Array(graph.length).fill(-1);
    dist[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let node = 0; node < graph.length; node++) {
        if (!Number.isFinite(dist[node])) continue;
        graph[node].forEach((edge, edgeIndex) => {
          if (edge.capacity > 1e-9 && dist[node] + edge.cost < dist[edge.to] - 1e-9) {
            dist[edge.to] = dist[node] + edge.cost;
            previousNode[edge.to] = node; previousEdge[edge.to] = edgeIndex; changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (previousNode[sink] < 0) break;
    let amount = 1 - flow;
    for (let node = sink; node !== source; node = previousNode[node]) amount = Math.min(amount, graph[previousNode[node]][previousEdge[node]].capacity);
    for (let node = sink; node !== source; node = previousNode[node]) {
      const parent = previousNode[node], edge = graph[parent][previousEdge[node]];
      edge.capacity -= amount; graph[node][edge.reverse].capacity += amount;
    }
    flow += amount; cost += amount * dist[sink];
  }
  return cost;
}
const maximumAttentionDistance = Math.max(...attractors.flatMap(a => attractors.map(b => distance(a, b))));

function occupantPairs() {
  const pairs = [];
  for (let i = 0; i < occupants.length; i++) {
    for (let j = i + 1; j < occupants.length; j++) pairs.push([occupants[i], occupants[j]]);
  }
  return pairs;
}
function dominantAttention(occupant) {
  const weight = Math.max(...occupant.attention);
  return { index: occupant.attention.indexOf(weight), weight };
}
function machineCenter(rect) { return { x: rect.x + rect.w * .5, y: rect.y + rect.h * .5 }; }
function computeProximity() {
  const pairs = occupantPairs();
  proximity.body = pairs.map(([a, b]) => ({ a, b, meters: distance(a, b) * METERS_PER_UNIT })).filter(item => item.meters < PERSONAL_SPACE_METERS);
  if (!attentionPairCache) {
    attentionPairCache = pairs.map(([a, b]) => {
      const focusA = dominantAttention(a), focusB = dominantAttention(b);
      const cost = earthMover(a.attention, b.attention);
      return { a, b, focusA, focusB, cost, attractor: attractors[focusA.index] };
    }).filter(item => item.cost < 30 && item.focusA.index === item.focusB.index && item.focusA.weight >= .45 && item.focusB.weight >= .45);
  }
  proximity.attention = attentionPairCache;
  proximity.machine = [];
  obstacles.forEach((machine, index) => {
    if (!activeMachines.has(index) || (machine.kind !== "washer" && machine.kind !== "dryer")) return;
    occupants.forEach(occupant => {
      const meters = distance(occupant, machineCenter(machine)) * METERS_PER_UNIT;
      if (meters < MACHINE_CLEARANCE_METERS) proximity.machine.push({ occupant, machine, index, meters });
    });
  });
  const door = attractors.find(item => item.id === "door");
  proximity.exit = occupants.map(occupant => ({ occupant, meters: distance(occupant, door) * METERS_PER_UNIT })).filter(item => item.meters < EXIT_CLEARANCE_METERS);
}

function referent(value) {
  const [type, id] = value.split(":");
  if (type === "occupant") {
    const source = occupants.find(item => item.id === id);
    return source ? { type, id, name: source.name, source, x: source.x, y: source.y } : null;
  }
  const source = zones.find(item => item.id === id) || attractors.find(item => item.id === id);
  return source ? { type: "location", id, name: source.name, source, x: source.x, y: source.y } : null;
}
function optionMarkup() {
  return `<optgroup label="occupants">${occupants.map(item => `<option value="occupant:${item.id}">${item.name}</option>`).join("")}</optgroup>` +
    `<optgroup label="locations">${zones.map(item => `<option value="location:${item.id}">${item.name}</option>`).join("")}${attractors.map(item => `<option value="location:${item.id}">${item.name}</option>`).join("")}</optgroup>`;
}
function fillSelects() {
  const a = document.querySelector("#select-a"), b = document.querySelector("#select-b");
  a.innerHTML = optionMarkup(); b.innerHTML = optionMarkup();
  a.value = "occupant:mere"; b.value = "occupant:window";
}

function scaleInfo() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = Math.min((width - 28) / WORLD.w, (height - 28) / WORLD.h);
  return { scale, ox: (width - WORLD.w * scale) / 2, oy: (height - WORLD.h * scale) / 2 };
}
function screen(point) {
  const info = scaleInfo();
  return { x: info.ox + point.x * info.scale, y: info.oy + point.y * info.scale };
}
function world(sx, sy) {
  const info = scaleInfo();
  return { x: (sx - info.ox) / info.scale, y: (sy - info.oy) / info.scale };
}
function resize() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function pathWorld(points, close = false) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const p = screen(point);
    index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  if (close) ctx.closePath();
}
function drawTileGrid() {
  const a = screen({ x: WORLD.pad, y: WORLD.pad }), b = screen({ x: WORLD.w - WORLD.pad, y: WORLD.h - WORLD.pad });
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.save();
  if (lightsOn) {
    [{ x: 246, y: 70 }, { x: 450, y: 70 }, { x: 660, y: 70 }].forEach(lamp => {
      const p = screen(lamp), glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 115 * scaleInfo().scale);
      glow.addColorStop(0, "rgba(255,226,146,.18)"); glow.addColorStop(1, "rgba(255,226,146,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, 115 * scaleInfo().scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,243,201,.78)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x - 16, p.y); ctx.lineTo(p.x + 16, p.y); ctx.stroke();
    });
  }
  ctx.strokeStyle = "rgba(110,140,255,.10)"; ctx.lineWidth = .7;
  for (let x = 30; x < WORLD.w; x += 36) { const p1 = screen({ x, y: WORLD.pad }), p2 = screen({ x, y: WORLD.h - WORLD.pad }); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
  for (let y = 30; y < WORLD.h; y += 36) { const p1 = screen({ x: WORLD.pad, y }), p2 = screen({ x: WORLD.w - WORLD.pad, y }); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
  ctx.strokeStyle = "rgba(255,243,201,.62)"; ctx.lineWidth = 1.3; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  const doorA = screen({ x: 475, y: WORLD.h - WORLD.pad }), doorB = screen({ x: 550, y: WORLD.h - WORLD.pad });
  ctx.strokeStyle = colors.paper; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(doorA.x, doorA.y); ctx.lineTo(doorB.x, doorB.y); ctx.stroke();
  ctx.strokeStyle = doorOpen ? colors.green : "rgba(255,243,201,.42)"; ctx.lineWidth = 1.2; ctx.beginPath();
  if (doorOpen) ctx.arc(doorA.x, doorA.y, Math.abs(doorB.x - doorA.x), -Math.PI / 2, 0);
  else { ctx.moveTo(doorA.x, doorA.y); ctx.lineTo(doorB.x, doorB.y); }
  ctx.stroke();
  ctx.fillStyle = "rgba(77,225,208,.65)"; ctx.fillRect(a.x, a.y - 3, b.x - a.x, 2);
  ctx.restore();
}
function drawIsovists() {
  if (!comparison) return;
  [[comparison.polygonA, colors.red, [6, 5]], [comparison.polygonB, colors.blue, [1, 5]]].forEach(([polygon, color, dash]) => {
    pathWorld(polygon, true); ctx.fillStyle = rgba(color, .07); ctx.fill();
    ctx.strokeStyle = rgba(color, .72); ctx.lineWidth = 1.1; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  });
}
function drawAttentionThreads() {
  if (!comparison) return;
  [[comparison.a, comparison.attentionA, colors.red], [comparison.b, comparison.attentionB, colors.blue]].forEach(([ref, weights, color]) => {
    const start = screen(ref);
    attractors.forEach((attractor, index) => {
      const end = screen(attractor); ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = rgba(color, .08 + weights[index] * .62); ctx.lineWidth = .4 + weights[index] * 3.2; ctx.stroke();
    });
  });
}
function hatch(rect) {
  const info = scaleInfo(), left = info.ox + rect.x * info.scale, top = info.oy + rect.y * info.scale, width = rect.w * info.scale, height = rect.h * info.scale;
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip(); ctx.strokeStyle = "rgba(218,196,238,.13)"; ctx.lineWidth = .6;
  for (let x = left - height; x < left + width + height; x += 7) { ctx.beginPath(); ctx.moveTo(x, top + height); ctx.lineTo(x + height, top); ctx.stroke(); }
  ctx.restore();
}
function drawObstacle(rect, index) {
  const topLeft = screen(rect), bottomRight = screen({ x: rect.x + rect.w, y: rect.y + rect.h });
  const width = bottomRight.x - topLeft.x, height = bottomRight.y - topLeft.y;
  const fills = { washer: "rgba(44,49,88,.96)", dryer: "rgba(36,65,94,.96)", table: "rgba(74,43,83,.94)", room: "rgba(13,10,31,.96)", bench: "rgba(65,48,84,.94)", vending: "rgba(124,48,78,.96)", cart: "rgba(42,57,80,.94)" };
  ctx.fillStyle = fills[rect.kind] || "rgba(40,35,70,.94)";
  ctx.fillRect(topLeft.x, topLeft.y, width, height); hatch(rect);
  ctx.strokeStyle = "rgba(231,215,244,.48)"; ctx.lineWidth = rect.kind === "room" ? 1.4 : .85; ctx.strokeRect(topLeft.x, topLeft.y, width, height);
  if (rect.kind === "washer" || rect.kind === "dryer") {
    const center = screen({ x: rect.x + rect.w * .36, y: rect.y + rect.h / 2 });
    const radius = Math.min(width, height) * .28;
    const active = activeMachines.has(index), machineColor = rect.kind === "dryer" ? colors.cyan : colors.blue;
    if (active) {
      const glow = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, radius * 2.1);
      glow.addColorStop(0, rgba(machineColor, .32)); glow.addColorStop(1, rgba(machineColor, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(center.x, center.y, radius * 2.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.strokeStyle = active ? machineColor : "rgba(225,210,235,.35)"; ctx.lineWidth = active ? 1.8 : 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(center.x, center.y, radius * .67, elapsed * (active ? .004 : .00025) + index, elapsed * (active ? .004 : .00025) + index + Math.PI * 1.35); ctx.strokeStyle = rgba(machineColor, active ? .9 : .28); ctx.lineWidth = active ? 2 : 1; ctx.stroke();
    ctx.fillStyle = active ? colors.yellow : "rgba(225,210,235,.25)"; ctx.fillRect(topLeft.x + width - 7, topLeft.y + 4, 2.5, 2.5);
  }
  ctx.fillStyle = "rgba(255,243,201,.78)"; ctx.font = `600 ${Math.max(6, 7 * scaleInfo().scale)}px Avenir Next Condensed, Arial`;
  ctx.fillText(rect.label, topLeft.x + 5, topLeft.y + 10);
}
function drawAttractors() {
  attractors.forEach(attractor => {
    const p = screen(attractor); ctx.strokeStyle = attractor.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y); ctx.stroke();
    ctx.shadowBlur = 7; ctx.shadowColor = attractor.color; ctx.fillStyle = "rgba(255,243,201,.86)"; ctx.font = "700 7px Avenir Next Condensed, Arial"; ctx.fillText(attractor.short, p.x + 9, p.y + 3); ctx.shadowBlur = 0;
  });
}
function drawOccupants() {
  const selectedA = document.querySelector("#select-a").value, selectedB = document.querySelector("#select-b").value;
  occupants.forEach(occupant => {
    const p = screen(occupant), value = `occupant:${occupant.id}`;
    const color = value === selectedA ? colors.red : value === selectedB ? colors.blue : colors.ink;
    const conflict = proximity.body.find(item => item.a === occupant || item.b === occupant);
    const labelShift = conflict ? (conflict.a === occupant ? -22 : 18) : 0;
    ctx.strokeStyle = color; ctx.lineWidth = value === selectedA || value === selectedB ? 3 : 1.8;
    ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y); ctx.stroke();
    ctx.fillStyle = "rgba(13,10,31,.82)"; ctx.fillRect(p.x + 10, p.y - 11 + labelShift, Math.min(114, occupant.name.length * 5.2 + 9), 15);
    ctx.fillStyle = "rgba(255,243,201,.88)"; ctx.font = "700 7px Avenir Next Condensed, Arial"; ctx.fillText(occupant.name.toUpperCase(), p.x + 14, p.y - 1 + labelShift);
  });
  if (comparison) {
    [[comparison.a, "A", colors.red], [comparison.b, "B", colors.blue]].forEach(([ref, label, color]) => {
      const p = screen(ref), inConflict = ref.type === "occupant" && proximity.body.some(item => item.a === ref.source || item.b === ref.source);
      ctx.fillStyle = color; ctx.font = "italic 700 15px Georgia"; ctx.fillText(label, p.x - 5, p.y - (inConflict ? 27 : 10));
    });
  }
}
function drawProximity() {
  const unitRadius = PERSONAL_SPACE_METERS / METERS_PER_UNIT * scaleInfo().scale;
  proximity.body.forEach(item => {
    const a = screen(item.a), b = screen(item.b);
    ctx.save(); ctx.strokeStyle = rgba(colors.red, .88); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    [a, b].forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, unitRadius, 0, Math.PI * 2); ctx.strokeStyle = rgba(colors.red, .32); ctx.stroke(); });
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.fillStyle = colors.red; ctx.font = "700 7px Avenir Next Condensed, Arial"; ctx.fillText(`${item.meters.toFixed(1)} m TOO CLOSE`, middle.x - 25, middle.y - unitRadius - 7); ctx.restore();
  });
  proximity.attention.forEach(item => {
    const a = screen(item.a), b = screen(item.b), target = screen(item.attractor);
    ctx.save(); ctx.strokeStyle = rgba(colors.violet, .65); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(target.x, target.y, b.x, b.y); ctx.stroke();
    ctx.fillStyle = colors.violet; ctx.fillRect(target.x - 2, target.y - 2, 4, 4); ctx.restore();
  });
  proximity.machine.forEach(item => {
    const a = screen(item.machine), b = screen({ x: item.machine.x + item.machine.w, y: item.machine.y + item.machine.h });
    ctx.save(); ctx.strokeStyle = colors.red; ctx.lineWidth = 2; ctx.strokeRect(a.x - 3, a.y - 3, b.x - a.x + 6, b.y - a.y + 6); ctx.restore();
  });
  if (proximity.exit.length) {
    const door = screen(attractors.find(item => item.id === "door"));
    ctx.save(); ctx.strokeStyle = colors.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(door.x, door.y, 22, Math.PI, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
function drawPlan() {
  drawTileGrid(); drawIsovists(); drawAttentionThreads(); obstacles.forEach(drawObstacle); drawAttractors(); drawOccupants(); drawProximity();
}

function updateOccupants(dt) {
  occupants.forEach((occupant, index) => {
    const amplitude = index < 2 ? 4 : 7;
    occupant.x = occupant.baseX + Math.sin(elapsed * .00035 + occupant.phase) * amplitude;
    occupant.y = occupant.baseY + Math.cos(elapsed * .00027 + occupant.phase) * amplitude * .6;
  });
}
function updateClock() {
  const total = 23 * 3600 + 47 * 60 + Math.floor(elapsed / 1000);
  const h24 = Math.floor(total / 3600) % 24, minute = Math.floor(total / 60) % 60, second = total % 60;
  document.querySelector("#clock").textContent = `${String(h24 % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} PM`;
}
function classification(value) { return value < 18 ? "close" : value < 42 ? "between" : "far"; }
function distributionStrip(weights) {
  return weights.map((weight, index) => `<i title="${attractors[index].name}: ${Math.round(weight * 100)}%" style="width:${weight * 100}%;background:${attractors[index].color}"></i>`).join("");
}
function updateComparison(force = false) {
  if (!force && performance.now() - lastMetricUpdate < 650) return;
  const a = referent(document.querySelector("#select-a").value), b = referent(document.querySelector("#select-b").value);
  if (!a || !b) return;
  const visibilityA = visibilityProfile(a), visibilityB = visibilityProfile(b);
  const different = visibilityA.reduce((sum, visible, index) => sum + (visible !== visibilityB[index] ? 1 : 0), 0);
  const union = visibilityA.reduce((sum, visible, index) => sum + (visible || visibilityB[index] ? 1 : 0), 0);
  const isovistPercent = different / Math.max(1, union) * 100;
  const attentionA = attentionProfile(a), attentionB = attentionProfile(b);
  const attentionCost = earthMover(attentionA, attentionB);
  const attentionPercent = attentionCost / maximumAttentionDistance * 100;
  comparison = { a, b, attentionA, attentionB, polygonA: isovistPolygon(a), polygonB: isovistPolygon(b), isovistPercent, attentionPercent, attentionCost, different, union };
  lastMetricUpdate = performance.now();
  document.querySelector("#isovist-value").textContent = `${Math.round(isovistPercent)}%`;
  document.querySelector("#isovist-detail").textContent = `${different} of ${union} visible tiles differ`;
  document.querySelector("#isovist-bar").style.width = `${clamp(isovistPercent, 0, 100)}%`;
  document.querySelector("#attention-value").textContent = `${Math.round(attentionCost)} steps`;
  document.querySelector("#attention-detail").textContent = `${Math.round(attentionPercent)}% of floor-scale maximum`;
  document.querySelector("#attention-bar").style.width = `${clamp(attentionPercent, 0, 100)}%`;
  document.querySelector("#distribution-strips").innerHTML = `<div class="dist-row"><b>A</b><span>${distributionStrip(attentionA)}</span></div><div class="dist-row"><b>B</b><span>${distributionStrip(attentionB)}</span></div>`;
  const sight = classification(isovistPercent), attention = classification(attentionPercent);
  const contrast = sight === "far" && attention === "close";
  document.querySelector("#reading").innerHTML = contrast
    ? `<b>Far by sight, close by attention.</b> The machines divide their views; the same clock occupies both waits.`
    : `They are <b>${sight}</b> in visible space and <b>${attention}</b> in attention space.`;
  updateProximityUI();
}
function updateRegister() {
  document.querySelector("#attention-register").innerHTML = occupants.map(occupant => {
    const maximum = Math.max(...occupant.attention), index = occupant.attention.indexOf(maximum), attractor = attractors[index];
    return `<div class="register-row" style="--register-color:${attractor.color}"><strong>${occupant.name}</strong><span>${attractor.short} ${Math.round(maximum * 100)}%</span><i><b style="width:${maximum * 100}%"></b></i></div>`;
  }).join("");
}
function updateProximityUI() {
  const signals = [];
  if (proximity.body.length) {
    const closest = [...proximity.body].sort((a, b) => a.meters - b.meters)[0];
    signals.push(`<div class="proximity-signal hot"><span>BODY SPACE</span><b>${closest.meters.toFixed(1)} m</b></div>`);
  }
  if (proximity.machine.length) signals.push(`<div class="proximity-signal hot"><span>MACHINE CLEARANCE</span><b>${proximity.machine[0].meters.toFixed(1)} m</b></div>`);
  if (proximity.exit.length) signals.push(`<div class="proximity-signal hot"><span>EXIT CLEARANCE</span><b>${proximity.exit[0].meters.toFixed(1)} m</b></div>`);
  if (proximity.attention.length) signals.push(`<div class="proximity-signal mind"><span>ATTENTION DISTANCE</span><b>${Math.round(proximity.attention[0].cost)} STEPS</b></div>`);
  document.querySelector("#proximity-signals").innerHTML = signals.length ? signals.join("") : `<div class="proximity-signal"><span>ROOM BREATHING</span><b>OK</b></div>`;

  let rule = `<span>IF</span> every clearance is safe <b>THEN</b> keep the room moving <i>ELSE</i> slow the night down`;
  if (proximity.attention.length) {
    const item = proximity.attention[0];
    rule = `<span>IF</span> attention distance is under 30 steps and both focus ${item.attractor.short} <b>THEN</b> mark their attention too close <i>ELSE</i> keep the wait private`;
  }
  if (proximity.exit.length) rule = `<span>IF</span> someone leaves less than 0.9 m at the door <b>THEN</b> mark the exit blocked <i>ELSE</i> keep the route open`;
  if (proximity.machine.length) rule = `<span>IF</span> someone is within 0.8 m of an active drum <b>THEN</b> block its door <i>ELSE</i> let it open`;
  if (proximity.body.length) rule = `<span>IF</span> two people are less than 1.2 m apart <b>THEN</b> ask for personal space <i>ELSE</i> let them wait`;
  document.querySelector("#rule-ticket").innerHTML = rule;
}
function inspect(point) {
  const occupant = occupants.map(item => ({ item, d: distance(point, item) })).sort((a, b) => a.d - b.d)[0];
  const obstacle = obstacles.find(rect => pointInRect(point, rect));
  const nearestZone = zones.map(item => ({ item, d: distance(point, item) })).sort((a, b) => a.d - b.d)[0];
  let title = nearestZone.item.name, detail = `open floor, ${Math.round(nearestZone.d)} steps away`;
  if (obstacle) { title = obstacle.label.toLowerCase(); detail = `${obstacle.kind}, solid obstruction`; }
  if (occupant.d < 28) { title = occupant.item.name; detail = `person at ${Math.round(point.x)} east and ${Math.round(point.y)} south`; }
  document.querySelector("#inspection").innerHTML = `<small>you are looking at</small><strong>${title}</strong><span>${detail}</span>`;
}
function render(now) {
  const dt = Math.min(now - lastFrame, 40); lastFrame = now;
  if (running) { elapsed += dt; updateOccupants(dt); }
  computeProximity(); updateComparison(); updateClock(); drawPlan(); requestAnimationFrame(render);
}

function setControl(id, label, active) {
  const button = document.querySelector(id); button.innerHTML = `<i></i>${label}`; button.classList.toggle("active", active);
}
function note(message) { document.querySelector("#active-note").textContent = message; }

document.querySelector("#play").addEventListener("click", () => {
  running = !running; setControl("#play", running ? "PAUSE THE NIGHT" : "RESUME THE NIGHT", running); note(running ? "the room starts breathing again" : "11:47 holds still");
});
document.querySelector("#neon").addEventListener("click", event => {
  neonOn = !neonOn; document.body.classList.toggle("neon-off", !neonOn); event.currentTarget.classList.toggle("on", neonOn); note(neonOn ? "the pink sign hums outside" : "the street loses its pink glow");
});
document.querySelector("#lights").addEventListener("click", () => {
  lightsOn = !lightsOn; document.body.classList.toggle("lights-off", !lightsOn); setControl("#lights", "CEILING LIGHTS", lightsOn); note(lightsOn ? "the fluorescent lights flicker on" : "only the drums and signs remain");
});
document.querySelector("#door").addEventListener("click", () => {
  doorOpen = !doorOpen; setControl("#door", "FRONT DOOR", doorOpen); note(doorOpen ? "cold street air enters the room" : "the door clicks shut");
});
document.querySelector("#coin").addEventListener("click", () => {
  const machines = obstacles.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === "washer" || item.kind === "dryer");
  const next = machines[coins % machines.length]; coins += 1; activeMachines.add(next.index);
  document.querySelector("#coin-count").textContent = `${coins} ${coins === 1 ? "COIN" : "COINS"}`; note(`${next.item.label} accepts the coin and begins to turn`);
});
document.querySelector("#reset").addEventListener("click", () => {
  elapsed = 0; running = true; lightsOn = true; neonOn = true; doorOpen = true; coins = 0;
  activeMachines.clear(); [1, 4, 9, 12].forEach(index => activeMachines.add(index));
  [[246, 272], [676, 215], [701, 354], [294, 406]].forEach(([x, y], index) => {
    occupants[index].baseX = x; occupants[index].baseY = y; occupants[index].x = x; occupants[index].y = y;
  });
  document.body.classList.remove("lights-off", "neon-off"); document.querySelector("#neon").classList.add("on");
  setControl("#play", "PAUSE THE NIGHT", true); setControl("#lights", "CEILING LIGHTS", true); setControl("#door", "FRONT DOOR", true);
  document.querySelector("#coin-count").textContent = "0 COINS"; note("the room returns to 11:47");
  document.querySelector("#select-a").value = "occupant:mere"; document.querySelector("#select-b").value = "occupant:window"; computeProximity(); updateComparison(true);
});
document.querySelector("#select-a").addEventListener("change", () => updateComparison(true));
document.querySelector("#select-b").addEventListener("change", () => updateComparison(true));
document.querySelector("#contradiction").addEventListener("click", () => {
  document.querySelector("#select-a").value = "occupant:mere"; document.querySelector("#select-b").value = "occupant:window"; updateComparison(true);
});
canvas.addEventListener("pointerdown", event => {
  const rect = canvas.getBoundingClientRect(), point = world(event.clientX - rect.left, event.clientY - rect.top);
  const hit = occupants.map(item => ({ item, d: distance(point, item) })).sort((a, b) => a.d - b.d)[0];
  if (hit.d >= 28) return;
  draggedOccupant = hit.item; dragStart = point; pointerMoved = false; canvas.setPointerCapture(event.pointerId);
  document.querySelector("#select-a").value = `occupant:${hit.item.id}`; note(`moving ${hit.item.name}`);
});
canvas.addEventListener("pointermove", event => {
  if (!draggedOccupant) return;
  const rect = canvas.getBoundingClientRect(), raw = world(event.clientX - rect.left, event.clientY - rect.top);
  const point = { x: clamp(raw.x, WORLD.pad + 8, WORLD.w - WORLD.pad - 8), y: clamp(raw.y, WORLD.pad + 8, WORLD.h - WORLD.pad - 8) };
  if (pointBlocked(point)) return;
  if (distance(point, dragStart) > 3) pointerMoved = true;
  draggedOccupant.baseX = point.x; draggedOccupant.baseY = point.y; draggedOccupant.x = point.x; draggedOccupant.y = point.y;
  computeProximity(); updateProximityUI();
});
canvas.addEventListener("pointerup", event => {
  if (!draggedOccupant) return;
  const name = draggedOccupant.name; draggedOccupant = null; dragStart = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  updateComparison(true); note(pointerMoved ? `${name} waits in a new place` : `${name} becomes point A`);
});
canvas.addEventListener("click", event => {
  if (pointerMoved) { pointerMoved = false; return; }
  const rect = canvas.getBoundingClientRect(), point = world(event.clientX - rect.left, event.clientY - rect.top);
  const hit = occupants.map(item => ({ item, d: distance(point, item) })).sort((a, b) => a.d - b.d)[0];
  const machineIndex = obstacles.findIndex(item => (item.kind === "washer" || item.kind === "dryer") && pointInRect(point, item));
  if (hit.d < 26) { document.querySelector("#select-a").value = `occupant:${hit.item.id}`; updateComparison(true); note(`${hit.item.name} becomes point A`); }
  else if (machineIndex >= 0) { activeMachines.has(machineIndex) ? activeMachines.delete(machineIndex) : activeMachines.add(machineIndex); note(`${obstacles[machineIndex].label} ${activeMachines.has(machineIndex) ? "begins to turn" : "comes to rest"}`); }
  inspect(point);
});

window.addEventListener("resize", resize);
buildVisibilitySamples(); fillSelects(); updateRegister(); resize(); computeProximity(); updateComparison(true); inspect({ x: 450, y: 252 });
document.querySelector("#neon").classList.add("on"); setControl("#play", "PAUSE THE NIGHT", true); setControl("#lights", "CEILING LIGHTS", true); setControl("#door", "FRONT DOOR", true);
requestAnimationFrame(render);
