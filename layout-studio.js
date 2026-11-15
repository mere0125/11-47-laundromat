(() => {
  const engine = window.LayoutExperiment;
  const weather = window.LaundryWeather;
  const plan = window.LaundryPlan;
  if (!engine || !weather || !plan) return;

  const duration = 240;
  const baseline = engine.baseline();
  let parent = baseline;
  let generation = 1;
  let runs = [];
  let layouts = [];
  let bases = [];
  let time = 0;
  let playing = false;
  let loading = false;
  let trialController = null;
  let paintFrameId = null;
  let lastTick = 0;
  let previousFocus = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const firstFocus = 'attendant';

  const studio = document.createElement('main');
  studio.id = 'layout-studio';
  studio.className = 'layout-studio';
  studio.hidden = true;
  studio.innerHTML = `
    <header class="studio-heading">
      <button type="button" id="studio-back">← Back to the shop</button>
      <div class="studio-title">
        <p>11:47 Laundromat</p>
        <h1 tabindex="-1">Tomorrow’s floor</h1>
        <div class="studio-note">
          <p>“Leave me a sketch for tomorrow. Near the fold tables, people keep having to let each other through.”</p>
          <span>Night attendant’s note</span>
        </div>
      </div>
    </header>
    <div class="studio-controls">
      <label>Weather record <select id="studio-weather"></select></label>
      <span id="studio-rain-reading"></span>
      <div class="studio-run-actions">
        <button type="button" id="studio-next">Draw two variations</button>
        <button type="button" id="studio-run">Run both plans</button>
      </div>
    </div>
    <p id="studio-weather-source" class="studio-weather-source"></p>
    <div class="studio-context">
      <p id="studio-parent"></p>
      <p id="studio-status" role="status"></p>
    </div>
    <div id="studio-pair" class="studio-pair"></div>
    <div class="studio-transport" aria-label="Comparison playback">
      <button type="button" id="studio-play" disabled>Replay</button>
      <button type="button" id="studio-finish" disabled>End of shift</button>
      <label class="studio-scrub" for="studio-position"><span>Shift time</span>
        <input id="studio-position" type="range" min="0" max="${duration}" value="0" step=".25" disabled>
        <output for="studio-position" id="studio-clock">0:00</output>
      </label>
      <label>Speed <select id="studio-speed"><option value="1">1×</option><option value="6">6×</option><option value="12" selected>12×</option><option value="24">24×</option></select></label>
      <label>Follow <select id="studio-follow"></select></label>
      <label class="studio-heat"><input id="studio-heat" type="checkbox" checked> Foot traffic</label>
    </div>
    <div class="studio-legend"><span><i></i>Wet floor</span><span><i></i>Dry mat</span><span><i></i>Planned route</span><span><i></i>More people crossed</span><span><i></i>Fixture moved</span></div>
    <section id="studio-verdict" class="studio-verdict" hidden>
      <h2>Notes for tomorrow</h2>
      <p id="studio-observation"></p>
      <p>Keep either floor plan to draw two variations from it.</p>
    </section>
    <section id="studio-archive" class="studio-archive" hidden>
      <h2>Shift log</h2>
      <div id="studio-log"></div>
      <div class="studio-handover">
        <p id="studio-kept"></p>
        <button type="button" id="studio-leave-plan">Leave the plan at the shop</button>
      </div>
    </section>
    <details class="studio-method">
      <summary>How the comparison works</summary>
      <p>Both rooms start with the same eight customers, one attendant, the same starting positions and the same machine fault. Each run lasts four minutes in the simulation. Each person navigates with their own incomplete map.</p>
      <p>The rain readings are measured outside. Inside the model, each millimeter in the hourly record reduces speed on exposed wet tiles by 3.5%, up to 42%. A mat inside that patch restores normal speed. These indoor speed changes are assumptions for the experiment.</p>
      <p>Foot traffic counts different people who have crossed each tile so far. Mean finish time includes customers who finished all four steps. The inspected count and finish time are reported separately for the attendant.</p>
    </details>`;
  document.body.append(studio);
  let kept = null;

  const get = id => studio.querySelector(`#studio-${id}`);
  const select = get('weather');
  for (const record of weather.records) select.add(new Option(`${record.label} (${record.precipitationMm} mm)`, record.id));
  select.value = weather.defaultId;
  for (const person of occupants) get('follow').add(new Option(displayName(person.name), person.id));
  get('follow').value = firstFocus;

  const panels = ['A','B'].map(letter => {
    const el = document.createElement('article');
    el.className = 'studio-plan';
    el.innerHTML = `
      <div class="plan-heading">
        <b>${letter}</b>
        <div><h2></h2><p></p></div>
        <button class="plan-keep" type="button" disabled>Keep ${letter}</button>
      </div>
      <canvas width="1350" height="780" role="img"></canvas>
      <p class="plan-thought"></p>
      <div class="plan-meter" aria-label="Shift results">
        <div><strong data-metric="customers">—</strong><span>Laundry complete</span></div>
        <div><strong data-metric="inspection">—</strong><span>Machines checked</span></div>
        <div><strong data-metric="yields">—</strong><span>Times yielding</span></div>
      </div>
      <dl class="plan-details" hidden></dl>`;
    get('pair').append(el);
    return {
      el, letter, canvas:el.querySelector('canvas'), title:el.querySelector('h2'),
      note:el.querySelector('.plan-heading p'), keep:el.querySelector('.plan-keep'),
      thought:el.querySelector('.plan-thought'), details:el.querySelector('.plan-details'),
      metrics:Object.fromEntries([...el.querySelectorAll('[data-metric]')].map(node => [node.dataset.metric,node]))
    };
  });

  function displayName(name) {
    const text = name.replace(' folding','');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function record() {
    return weather.records.find(item => item.id === select.value);
  }

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function formatTime(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function updateWeather() {
    const chosen = record();
    const slowdown = Math.round(100 * (1 - engine.wetSpeed(chosen.precipitationMm)));
    get('rain-reading').textContent = slowdown
      ? `${chosen.precipitationMm.toFixed(1)} mm in one hour. About ${slowdown}% slower on wet tiles.`
      : '0 mm in one hour. No slowdown at the entrance.';
    const source = get('weather-source');
    const link = document.createElement('a');
    link.href = weather.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'NOAA station record';
    const date = new Intl.DateTimeFormat('en-US', {
      month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',
      timeZone:'America/New_York',timeZoneName:'short'
    }).format(new Date(chosen.utc));
    source.replaceChildren(`${weather.station}, hour ending ${date}. `, link);
  }

  function clearRuns() {
    runs = [];
    playing = false;
    time = 0;
    get('verdict').hidden = true;
    get('play').disabled = true;
    get('finish').disabled = true;
    get('position').disabled = true;
    for (const panel of panels) {
      panel.keep.disabled = true;
      panel.details.hidden = true;
    }
    updateWeather();
    bases = layouts.map(layout => plan.backdrop(layout, record().precipitationMm, parent));
    draw();
  }

  function showPair(pair) {
    layouts = pair;
    for (const [index,panel] of panels.entries()) {
      const layout = pair[index];
      panel.title.textContent = layout.title;
      panel.note.textContent = layout.description;
      panel.canvas.setAttribute('aria-label', `Floor plan ${panel.letter}: ${layout.title}. ${layout.description}`);
    }
    get('next').hidden = pair[0] !== baseline;
    setText(get('parent'), `Round ${generation}, drawn from ${parent.title.toLowerCase()}`);
    setText(get('status'), 'Nine people in each room. Four minutes to see what changes.');
    clearRuns();
  }

  function sample(run) {
    if (engine.frameAt) return engine.frameAt(run, time);
    return run.frames[Math.min(run.frames.length - 1, Math.floor(time * 2))];
  }

  function draw() {
    setText(get('clock'), formatTime(time));
    get('position').value = time;
    get('position').setAttribute('aria-valuetext', formatTime(time));
    const focus = get('follow').value;
    for (const [i,panel] of panels.entries()) {
      const run = runs[i];
      const frame = run ? sample(run) : {people:[],heat:[]};
      if (!frame || !bases[i]) continue;
      plan.paint(panel.canvas, bases[i], frame, {traffic:get('heat').checked, focus, layout:layouts[i]});
      const person = frame.people.find(item => item.id === focus);
      setText(panel.thought, person ? `${displayName(person.name)}: ${person.decision}` : '');
      const state = frame.metrics || frame;
      const atEnd = run && time >= duration;
      const stats = atEnd ? run.result : state;
      setText(panel.metrics.customers, run ? `${stats.customersDone ?? 0} of ${run.result.customersTotal}` : '—');
      setText(panel.metrics.inspection, run ? `${stats.inspected ?? 0} of ${run.result.machinesTotal}` : '—');
      setText(panel.metrics.yields, run ? String(stats.yields ?? 0) : '—');
    }
  }

  function animate(now) {
    paintFrameId = null;
    if (!playing || studio.hidden) return;
    time = Math.min(duration, time + Math.min(.05, (now - lastTick) / 1000) * Number(get('speed').value));
    lastTick = now;
    draw();
    if (time === duration) {
      stopPlayback();
      showResults();
      return;
    }
    paintFrameId = requestAnimationFrame(animate);
  }

  function stopPlayback() {
    playing = false;
    if (paintFrameId !== null) cancelAnimationFrame(paintFrameId);
    paintFrameId = null;
    setText(get('play'), time === duration ? 'Replay' : 'Play');
  }

  function play() {
    if (!runs.length || studio.hidden) return;
    if (time === duration) time = 0;
    playing = true;
    lastTick = performance.now();
    setText(get('play'), 'Pause');
    paintFrameId = requestAnimationFrame(animate);
  }

  function detail(panel, label, value) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    panel.details.append(dt,dd);
  }

  function showResults() {
    for (const [i,panel] of panels.entries()) {
      const r = runs[i].result;
      panel.details.replaceChildren();
      detail(panel,'Mean finish time',formatTime(r.customerMeanSeconds));
      detail(panel,'Attendant finish',formatTime(r.attendantSeconds));
      detail(panel,'Faults repaired',String(r.repairs));
      detail(panel,'Total walked',`${Math.round(r.metersWalked)} m`);
      detail(panel,'Time moving on wet floor',`${r.wetSeconds.toFixed(1)} s`);
      detail(panel,'Time moving on mat',`${r.matSeconds.toFixed(1)} s`);
      panel.details.hidden = false;
      panel.keep.disabled = false;
    }
    const [a,b] = runs.map(run => run.result);
    const gap = Math.abs(a.customersDone - b.customersDone);
    const completed = gap ? `Plan ${a.customersDone > b.customersDone ? 'A' : 'B'} finished ${gap} more ${gap === 1 ? 'load' : 'loads'}.` : `Both plans finished ${a.customersDone} of ${a.customersTotal} loads.`;
    const yieldGap = Math.abs(a.yields - b.yields);
    const yields = yieldGap ? `People yielded ${yieldGap} fewer ${yieldGap === 1 ? 'time' : 'times'} in Plan ${a.yields < b.yields ? 'A' : 'B'}.` : 'Both plans had the same number of yields.';
    const staff = a.attendantSeconds != null && b.attendantSeconds != null && Math.abs(a.attendantSeconds - b.attendantSeconds) >= .5
      ? ` The attendant finished ${Math.abs(a.attendantSeconds - b.attendantSeconds).toFixed(1)} seconds sooner in Plan ${a.attendantSeconds < b.attendantSeconds ? 'A' : 'B'}.`
      : '';
    setText(get('observation'), `${completed} ${yields}${staff}`);
    setText(get('status'), 'Both trials complete.');
    get('verdict').hidden = false;
  }

  async function runPair() {
    if (loading) return;
    clearRuns();
    loading = true;
    const controller = new AbortController();
    trialController = controller;
    const runButton = get('run');
    runButton.disabled = true;
    get('next').disabled = true;
    select.disabled = true;
    const progress = [0,0];
    setText(get('status'), 'Running both rooms…');
    try {
      runs = await Promise.all(layouts.map((layout,index) => engine.run(layout,{
        rainMm:record().precipitationMm, seconds:duration, signal:controller.signal,
        progress:fraction => {
          progress[index] = fraction;
          setText(get('status'), `Running Plan A (${Math.round(progress[0]*100)}%) and Plan B (${Math.round(progress[1]*100)}%).`);
        }
      })));
      get('play').disabled = false;
      get('finish').disabled = false;
      get('position').disabled = false;
      setText(runButton, 'Run both again');
      setText(get('status'), 'Both trials ready. Playback is synchronized.');
      if (still.matches) {
        time = duration;
        draw();
        showResults();
      } else {
        draw();
        play();
      }
    } catch (error) {
      controller.abort();
      if (error.name === 'AbortError') {
        setText(get('status'), 'Run both plans to start a comparison.');
      } else {
        console.error(error);
        setText(get('status'), 'The trial stopped. Run both plans again to retry.');
      }
    } finally {
      trialController = null;
      loading = false;
      runButton.disabled = false;
      select.disabled = false;
      get('next').disabled = false;
    }
  }

  function keep(index) {
    if (!runs.length) return;
    stopPlayback();
    const chosen = layouts[index];
    kept = {title:chosen.title, result:runs[index].result};
    addArchiveRow({generation, layouts, results:runs.map(run => run.result), index, rain:record()});
    setText(get('kept'), `Pencilled in for tomorrow: ${kept.title}.`);
    parent = chosen;
    generation += 1;
    showPair(engine.variants(parent));
    get('run').focus({preventScroll:true});
  }

  function addArchiveRow(entry) {
    get('archive').hidden = false;
    const [a,b] = entry.results;
    const item = document.createElement('div');
    item.className = 'studio-log-item';
    const name = document.createElement('strong');
    name.textContent = `Round ${entry.generation}, kept ${entry.layouts[entry.index].title}`;
    const detail = document.createElement('span');
    detail.textContent = `${entry.rain.precipitationMm.toFixed(1)} mm rain. A finished ${a.customersDone}, with ${a.yields} yields. B finished ${b.customersDone}, with ${b.yields} yields.`;
    item.append(name,detail);
    get('log').append(item);
  }

  function backToShop(focus = previousFocus) {
    trialController?.abort();
    stopPlayback();
    studio.hidden = true;
    roomPage.hidden = false;
    window.scrollTo(0,0);
    resize();
    updateNotebook(true);
    focus?.focus({preventScroll:true});
  }
  get('back').addEventListener('click', () => backToShop());
  get('leave-plan').addEventListener('click', () => {
    if (!kept) return;
    window.laundromatHandover = kept.title;
    const note = document.querySelector('#shift-plan-note');
    note.hidden = false;
    note.textContent = `For tomorrow: ${kept.title}. The trial finished ${kept.result.customersDone} of ${kept.result.customersTotal} loads in four minutes.`;
    backToShop(document.querySelector('#open-layout-studio'));
  });
  get('next').addEventListener('click', () => {
    stopPlayback();
    showPair(engine.variants(parent));
  });
  get('run').addEventListener('click',runPair);
  get('play').addEventListener('click', () => playing ? stopPlayback() : play());
  get('finish').addEventListener('click', () => {
    time = duration;
    stopPlayback();
    draw();
    showResults();
  });
  get('position').addEventListener('input', event => {
    stopPlayback();
    time = Number(event.target.value);
    draw();
    if (time === duration) showResults();
  });
  get('follow').addEventListener('change',draw);
  get('heat').addEventListener('change',draw);
  select.addEventListener('change', () => {
    clearRuns();
    setText(get('status'), 'Weather changed. Run both plans with the new record.');
  });
  for (const [i,panel] of panels.entries()) panel.keep.addEventListener('click', () => keep(i));

  window.openLayoutStudio = () => {
    if (!studio.hidden) return;
    previousFocus = document.activeElement;
    if (!layouts.length) showPair([baseline, engine.variants(baseline)[0]]);
    roomPage.hidden = true;
    studio.hidden = false;
    window.scrollTo(0,0);
    studio.querySelector('h1').focus({preventScroll:true});
  };

  const coordinates = document.createElement('div');
  coordinates.className = 'location-frames';
  coordinates.setAttribute('aria-label','Selected person in two frames of reference');
  const fixed = coordinates.appendChild(document.createElement('p'));
  const relative = coordinates.appendChild(document.createElement('p'));
  document.querySelector('.book-intro').append(coordinates);

  const originalNotebook = updateNotebook;
  updateNotebook = (force = false) => {
    originalNotebook(force);
    const mind = selectedMind();
    if (!mind) return;
    const {person} = mind;
    const other = referent(document.querySelector('#select-b').value);
    const term = other?.type === 'occupant' ? minds.get(other.id) : null;
    const reference = term && term !== mind ? term : minds.get(person.id === 'attendant' ? 'mere' : 'attendant');
    setText(fixed, `From the room’s top left, ${(person.x * METERS_PER_UNIT).toFixed(1)} m east and ${(person.y * METERS_PER_UNIT).toFixed(1)} m south.`);
    if (!reference) return;
    const dx = (person.x - reference.person.x) * METERS_PER_UNIT;
    const dy = (person.y - reference.person.y) * METERS_PER_UNIT;
    const forward = dx * Math.cos(reference.heading) + dy * Math.sin(reference.heading);
    const right = dy * Math.cos(reference.heading) - dx * Math.sin(reference.heading);
    setText(relative, `From ${displayName(reference.person.name)}’s viewpoint, ${Math.abs(forward).toFixed(1)} m ${forward >= 0 ? 'ahead' : 'behind'} and ${Math.abs(right).toFixed(1)} m to the ${right >= 0 ? 'right' : 'left'}.`);
  };
})();
