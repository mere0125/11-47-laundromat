/* The layout trials run the same agents as the live room in separate workers.
   Only the arrangement and the selected rain record vary between runs. */
(() => {
  const stepMs = 100;
  const frameMs = 500;
  const cellSize = 18;
  const columns = 50;
  const rows = 29;
  const maxTrialSeconds = 300;
  const wetFloor = {kind: 'wet', label: 'Wet entrance', x: 419, y: 408, w: 214, h: 80, speed: 1};
  const entranceMat = {kind: 'mat', label: 'Dry mat', x: 477, y: 455, w: 77, h: 27, speed: 1};

  function wetSpeed(rainMm) {
    return Math.max(.58, 1 - .035 * Math.max(0, Number(rainMm) || 0));
  }

  function withRain(layout, rainMm) {
    return {...layout, zones: layout.zones.map(zone => ({...zone, speed: zone.kind === 'wet' ? wetSpeed(rainMm) : 1}))};
  }

  function heatCells(counts) {
    const cells = [];
    for (let index = 0; index < counts.length; index++) {
      if (!counts[index]) continue;
      cells.push({
        x: (index % columns + .5) * cellSize,
        y: (Math.floor(index / columns) + .5) * cellSize,
        count: counts[index]
      });
    }
    return cells;
  }

  if (typeof document === 'undefined') {
    bootTrialWorker();
    return;
  }

  const workerUrl = document.currentScript.src;

  function baseline() {
    return {
      id: 'current-room', title: 'The room tonight', description: 'Two folding tables, two carts and a small mat by the door.',
      round: 0, obstacles: obstacles.map(rect => ({...rect})),
      zones: [{...wetFloor}, {...entranceMat}]
    };
  }

  const cartParking = [
    {index: 0, x: 189, y: 306, title: 'Cart out of the crossing', description: 'Move the washer-side cart away from the crossing between the folding tables.'},
    {index: 1, x: 588, y: 102, title: 'Cart beside the utility room', description: 'Park the dryer-side cart higher up to open the crossing near the door.'},
    {index: 0, x: 232, y: 63, title: 'Cart at the back', description: 'Keep the cart behind the folding area and free the washer-side passage.'},
    {index: 1, x: 629, y: 343, title: 'Cart at the south end', description: 'Open up the middle of the dryer bank by moving the cart closer to the entrance.'}
  ];
  const foldingArrangements = [
    {index: 1, x: 385, y: 318, title: 'Offset folding tables', description: 'Shift the lower folding table toward the dryers to open a diagonal from the washers.'},
    {index: 0, x: 251, y: 94, title: 'Table toward the back', description: 'Leave more turning room between the folding tables.'},
    {index: 1, x: 296, y: 301, title: 'Folding near the washers', description: 'Slide the lower table left to leave wider clearance on the dryer side.'},
    {index: 0, x: 318, y: 148, title: 'Table closer to the center', description: 'Bring the top table closer to the crossing and see where waiting builds up.'}
  ];
  const matArrangements = [
    {x: 439, y: 439, w: 162, h: 47, title: 'A full runner at the door', description: 'Extend the dry walking surface across the entrance and toward both machine banks.'},
    {x: 431, y: 411, w: 84, h: 75, title: 'Dry route toward the washers', description: 'Give the left side of the entrance a longer strip of dry footing.'},
    {x: 547, y: 411, w: 78, h: 75, title: 'Dry route toward the dryers', description: 'Move the dry strip toward the dryer side of the entrance.'}
  ];

  function variants(parent) {
    const round = (parent.round || 0) + 1;
    const types = [['cart', 'table'], ['mat', 'cart'], ['table', 'mat']][(round - 1) % 3];
    return types.map((type, branch) => {
      const result = {...parent, round, id: `${parent.id}-${round}${branch ? 'b' : 'a'}`,
        obstacles: parent.obstacles.map(rect => ({...rect})), zones: parent.zones.map(zone => ({...zone}))};
      const arrangement = type === 'mat'
        ? moveMat(result, round)
        : moveFixture(result, type, round);
      result.title = arrangement.title;
      result.description = arrangement.description;
      return result;
    });
  }

  function moveMat(layout, round) {
    const mat = layout.zones.find(zone => zone.kind === 'mat');
    const placements = matArrangements.filter(option => option.x !== mat.x || option.y !== mat.y);
    const {title, description, ...position} = placements[(round - 1) % placements.length];
    Object.assign(mat, position);
    return {title, description};
  }

  function moveFixture(layout, type, round) {
    const fixtures = layout.obstacles.filter(rect => rect.kind === type);
    const arrangements = type === 'cart' ? cartParking : foldingArrangements;
    // Keep the same spawn points and footprint sizes in every comparison.
    for (let i = 0; i < arrangements.length; i++) {
      const option = arrangements[(round - 1 + i) % arrangements.length];
      const fixture = fixtures[option.index];
      if (fixture.x === option.x && fixture.y === option.y) continue;
      const next = {...fixture, x: option.x, y: option.y};
      if (!clearPlacement(layout, fixture, next)) continue;
      Object.assign(fixture, next);
      return option;
    }
    // A selected parent may already occupy the preferred parking spots.
    // Restore one compatible baseline position before falling back to a dry mat.
    const starting = obstacles.filter(rect => rect.kind === type);
    for (const [index, fixture] of fixtures.entries()) {
      const next = starting[index];
      if ((fixture.x !== next.x || fixture.y !== next.y) && clearPlacement(layout, fixture, next)) {
        Object.assign(fixture, next);
        return {title: `One ${type} back in place`, description: 'Return one fixture to its original position and compare the flow.'};
      }
    }
    return moveMat(layout, round);
  }

  function clearPlacement(layout, fixture, next) {
    const clearance = 9;
    if (next.x < 32 || next.x + next.w > 870 || next.y < 32 || next.y + next.h > 486) return false;
    const conflicts = layout.obstacles.some(other => other !== fixture &&
      next.x < other.x + other.w + clearance && next.x + next.w + clearance > other.x &&
      next.y < other.y + other.h + clearance && next.y + next.h + clearance > other.y);
    return !conflicts && originalPeople.every(person => !pointInRect({x: person.homeX, y: person.homeY}, next, 12));
  }

  function run(layout, {rainMm = 0, seconds = 240, progress, signal} = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl);
      const settle = (fn, value) => {
        signal?.removeEventListener('abort', abort);
        worker.terminate();
        fn(value);
      };
      const abort = () => settle(reject, new DOMException('The trial was cancelled.', 'AbortError'));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, {once: true});
      worker.onmessage = ({data}) => {
        if (data.type === 'progress') progress?.(data.fraction);
        if (data.type === 'complete') settle(resolve, data.run);
        if (data.type === 'error') settle(reject, new Error(data.message));
      };
      worker.onerror = () => settle(reject, new Error('The trial worker could not start.'));
      worker.postMessage({layout: withRain(layout, rainMm), seconds: Math.min(maxTrialSeconds, Math.max(1, Number(seconds) || 240))});
    });
  }

  function frameAt(trial, time) {
    const position = time >= trial.seconds ? trial.frames.length - 1 : Math.min(trial.frames.length - 1, Math.max(0, time / (frameMs / 1000)));
    const index = Math.floor(position);
    const from = trial.frames[index];
    const next = trial.frames[index + 1];
    const fraction = position - index;
    const people = next && fraction > 0 ? from.people.map((person, personIndex) => {
      const other = next.people[personIndex];
      return {...person, x: person.x + (other.x - person.x) * fraction, y: person.y + (other.y - person.y) * fraction};
    }) : from.people;
    return {...from, people, heat: heatCells(from.heatCounts)};
  }

  globalThis.LayoutExperiment = {baseline, createBaseline: baseline, variants, run, frameAt, wetSpeed, withRain};
  globalThis.LaundryExperiment = globalThis.LayoutExperiment;

  function bootTrialWorker() {
    // The original browser scripts also initialize a view. Provide inert view
    // targets, as in tests/agents.cjs, and advance only the fixed-step model.
    const nodes = new Map();
    const noop = () => {};
    const gradient = {addColorStop: noop};
    const drawing = new Proxy({createRadialGradient: () => gradient, createLinearGradient: () => gradient}, {
      get: (values, key) => values[key] ?? noop
    });
    function node(selector) {
      if (!nodes.has(selector)) nodes.set(selector, {
        value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
        width: 460, height: 270, clientWidth: 460, clientHeight: 270,
        classList: {add: noop, remove: noop, toggle: noop},
        setAttribute: noop, addEventListener: noop, replaceWith: noop,
        cloneNode() { return this; }, getContext() { return drawing; }
      });
      return nodes.get(selector);
    }
    Object.assign(globalThis, {
      document: {querySelector: node, querySelectorAll: () => [], body: node('body')},
      window: {addEventListener: noop}, devicePixelRatio: 1, requestAnimationFrame: noop,
      matchMedia: () => ({matches: false})
    });

    self.addEventListener('message', ({data}) => {
      try {
        const version = self.location?.search || '';
        importScripts(`app.js${version}`, `scene.js${version}`, `agents.js${version}`);
        const trial = simulate(data.layout, data.seconds);
        self.postMessage({type: 'complete', run: trial});
      } catch (error) {
        self.postMessage({type: 'error', message: error.message});
      }
    }, {once: true});
  }

  function simulate(layout, horizon) {
    elapsed = 0;
    obstacles.splice(0, obstacles.length, ...layout.obstacles);
    syncRoomRegister = () => {};
    updateNotebook = () => {};
    resetAgents();

    const wet = layout.zones.find(zone => zone.kind === 'wet');
    const mat = layout.zones.find(zone => zone.kind === 'mat');
    function terrainAt(point) {
      if (wet.speed === 1 || !pointInRect(point, wet)) return 'dry';
      return pointInRect(point, mat) ? 'mat' : 'wet';
    }
    function speedAt(point) { return terrainAt(point) === 'wet' ? wet.speed : 1; }
    globalThis.routeTerrainSpeed = speedAt;
    const scan = senseAgent;
    senseAgent = mind => {
      scan(mind);
      mind.terrainSpeeds ??= new Map();
      for (const index of mind.visible) mind.terrainSpeeds.set(index, speedAt(cellPoint(index)));
    };
    const move = routeStep;
    let wetSeconds = 0;
    let matSeconds = 0;
    let terrainDelaySeconds = 0;
    routeStep = (mind, dt) => {
      const terrain = terrainAt(mind.person);
      const before = mind.distance;
      move(mind, dt);
      if (mind.distance === before || terrain === 'dry') return;
      const baseSpeed = mind.role === 'attendant' ? .049 : .043;
      const movementSeconds = (mind.distance - before) / baseSpeed / 1000;
      if (terrain === 'wet') {
        wetSeconds += movementSeconds / wet.speed;
        terrainDelaySeconds += movementSeconds * (1 / wet.speed - 1);
      } else {
        matSeconds += movementSeconds;
      }
    };

    const staff = minds.get('attendant');
    const allMinds = [...minds.values()];
    const customers = allMinds.filter(mind => mind.role === 'customer');
    const currentMetrics = () => ({
      customersDone: customers.filter(mind => mind.finishedAt !== null).length,
      customersTotal: customers.length,
      inspected: staff.inspected.size,
      machinesTotal: laundryMachines.size,
      repairs: staff.repairs,
      metersWalked: allMinds.reduce((sum, mind) => sum + mind.distance, 0) * METERS_PER_UNIT,
      yields: allMinds.reduce((sum, mind) => sum + mind.yields, 0),
      wetSeconds, matSeconds, terrainDelaySeconds
    });
    const frame = () => {
      const heatCounts = new Uint8Array(columns * rows);
      for (const [index, people] of sharedFootprints) heatCounts[index] = people.size;
      return {
        time: elapsed / 1000, ...currentMetrics(), heatCounts,
        machines: [...laundryMachines.values()].map(machine => ({
          index: machine.index, fault: machine.fault, running: machine.running
        })),
        people: allMinds.map(mind => ({
          id: mind.person.id, name: mind.person.name, x: mind.person.x, y: mind.person.y,
          color: mind.person.coat, heading: mind.heading, role: mind.role, phase: mind.phase,
          decision: mind.decision, path: mind.path.map(({x, y}) => ({x, y})),
          view: visionPolygon(mind).filter((_, i, list) => i % 4 === 0 || i === list.length - 1).map(({x, y}) => ({x, y}))
        }))
      };
    };
    const frames = [frame()];
    const end = Math.round(horizon * 1000 / stepMs) * stepMs;
    let nextProgress = 0;
    while (elapsed < end) {
      elapsed += stepMs;
      updateOccupants(stepMs);
      if (elapsed % frameMs === 0 || elapsed === end) frames.push(frame());
      if (elapsed >= nextProgress) {
        self.postMessage({type: 'progress', fraction: elapsed / end});
        nextProgress += end / 10;
      }
    }
    const timedCustomers = customers.filter(mind => mind.finishedAt !== null);
    const result = {
      ...currentMetrics(),
      customerMeanSeconds: timedCustomers.length ? timedCustomers.reduce((sum, mind) => sum + mind.finishedAt, 0) / timedCustomers.length / 1000 : null,
      attendantSeconds: staff.finishedAt !== null ? staff.finishedAt / 1000 : null,
      heat: heatCells(frames.at(-1).heatCounts),
      people: allMinds.map(mind => ({
        id: mind.person.id, name: mind.person.name, role: mind.role, phase: mind.phase,
        distance: mind.distance * METERS_PER_UNIT, yields: mind.yields,
        finishedAt: mind.finishedAt !== null ? mind.finishedAt / 1000 : null,
        completed: [...mind.completed], inspected: mind.inspected.size, repairs: mind.repairs
      }))
    };
    return {layout, seconds: elapsed / 1000, frames, result};
  }
})();
