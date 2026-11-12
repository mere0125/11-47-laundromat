(() => {
  const opening = document.querySelector('#opening');
  const storefront = opening.querySelector('.storefront');
  const weather = document.querySelector('#storefront-weather');
  const c = weather.getContext('2d');
  if (!c) return;

  const width = 820;
  const height = 640;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const glass = {left: 92, right: 733, top: 199, bottom: 515};
  const restingLight = {x: 526, y: 340, intensity: .23};
  const light = {...restingLight};
  let target = restingLight;
  let frameId = null;
  let lastTime = 0;
  let weatherTime = 0;
  const layers = [
    {count: 126, speed: 230, length: 12, width: .6, alpha: .18},
    {count: 48, speed: 460, length: 30, width: 1, alpha: .25},
    {count: 15, speed: 630, length: 43, width: 1.5, alpha: .21},
  ].map((layer, depth) => ({
    ...layer,
    drops: Array.from({length: layer.count}, (_, i) => ({
      x: (i * 181.37 + depth * 139.7) % (width + 100) - 30,
      y: (i * 119.81 + depth * 211.3) % (height + 100),
      speed: layer.speed * (.8 + (i % 11) * .038),
      length: layer.length * (.66 + (i % 9) * .085),
    })),
  }));
  const ripples = Array.from({length: 21}, (_, i) => ({
    x: 78 + (i * 123.6) % 671,
    y: 544 + (i * 43.7) % 78,
    offset: (i * .618) % 1,
  }));

  function aimLight(event) {
    const bounds = storefront.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    target = {
      x: (event.clientX - bounds.left) * width / bounds.width,
      y: (event.clientY - bounds.top) * height / bounds.height,
      intensity: 1,
    };
    if (still.matches) paint(0);
  }

  function restLight(event) {
    if (event?.pointerType === 'touch') return;
    target = restingLight;
    if (still.matches) paint(0);
  }

  function paint(delta) {
    const amount = still.matches ? 1 : 1 - Math.exp(-delta * 10);
    for (const key of ['x', 'y', 'intensity']) light[key] += (target[key] - light[key]) * amount;
    weatherTime += delta;
    c.setTransform(weather.width / width, 0, 0, weather.height / height, 0, 0);
    c.clearRect(0, 0, width, height);
    paintGlassLight();
    paintPavement();
    paintRain();
  }

  function paintGlassLight() {
    const x = Math.min(glass.right, Math.max(glass.left, light.x));
    const y = Math.min(glass.bottom, Math.max(glass.top, light.y));
    const proximity = Math.max(0, 1 - Math.hypot(x - light.x, y - light.y) / 168);
    const strength = light.intensity * proximity;
    const glow = c.createRadialGradient(light.x, light.y, 2, light.x, light.y, 150);
    glow.addColorStop(0, `rgba(255,231,178,${.39 * strength})`);
    glow.addColorStop(.48, `rgba(247,208,162,${.14 * strength})`);
    glow.addColorStop(1, 'rgba(244,185,149,0)');
    c.fillStyle = glow;
    for (const [left, right] of [[92, 303], [309, 509], [515, 672], [678, 733]]) {
      c.fillRect(left, glass.top, right - left, glass.bottom - glass.top);
    }

    // Droplets attached to the window pick up the light before the rain in front.
    for (let i = 0; i < 64; i++) {
      const dropX = 98 + (i * 109.13) % 628;
      const dropY = 208 + (i * 67.57) % 298;
      const highlight = Math.max(0, 1 - Math.hypot(dropX - light.x, dropY - light.y) / 136);
      if (highlight < .08) continue;
      c.fillStyle = `rgba(255,242,213,${highlight * strength * .68})`;
      c.fillRect(dropX, dropY, i % 3 ? .8 : 1.4, 2 + i % 4);
    }
  }

  function paintPavement() {
    const x = Math.min(738, Math.max(83, light.x));
    const y = 557 + Math.max(0, Math.min(52, (light.y - glass.bottom) * .48));
    c.save();
    c.beginPath();
    c.moveTo(36, 537);
    c.lineTo(798, 537);
    c.lineTo(816, 628);
    c.lineTo(4, 628);
    c.closePath();
    c.clip();
    c.save();
    c.translate(x, y);
    c.scale(1, .32);
    const reflection = c.createRadialGradient(0, 0, 1, 0, 0, 168);
    reflection.addColorStop(0, `rgba(249,202,143,${.31 * light.intensity})`);
    reflection.addColorStop(.52, `rgba(227,152,157,${.13 * light.intensity})`);
    reflection.addColorStop(1, 'rgba(196,147,177,0)');
    c.fillStyle = reflection;
    c.fillRect(-168, -168, 336, 336);
    c.restore();
    for (const ripple of ripples) {
      const phase = (weatherTime * .8 + ripple.offset) % 1;
      const radius = 1.5 + phase * (6 + (ripple.y - 544) * .08);
      const glint = Math.max(0, 1 - Math.abs(ripple.x - x) / 150) * light.intensity;
      c.strokeStyle = `rgba(236,213,199,${(1 - phase) * (.18 + .37 * glint)})`;
      c.lineWidth = .8;
      c.beginPath();
      c.ellipse(ripple.x, ripple.y, radius, radius * .22, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  function paintRain() {
    for (const layer of layers) {
      c.beginPath();
      for (const drop of layer.drops) {
        const travel = weatherTime * drop.speed;
        const y = (drop.y + travel) % (height + 100) - 50;
        const x = ((drop.x - travel * .15) % (width + 100) + width + 100) % (width + 100) - 45;
        c.moveTo(x, y);
        c.lineTo(x - drop.length * .15, y + drop.length);
      }
      c.lineWidth = layer.width;
      c.strokeStyle = `rgba(188,201,226,${layer.alpha})`;
      c.stroke();
    }
  }

  function tick(now) {
    if (opening.hidden || document.hidden || still.matches) {
      frameId = null;
      return;
    }
    paint(Math.min((now - lastTime) / 1000, .045));
    lastTime = now;
    frameId = requestAnimationFrame(tick);
  }

  function syncWeather() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (opening.hidden || document.hidden) return;
    paint(0);
    lastTime = performance.now();
    if (!still.matches) frameId = requestAnimationFrame(tick);
  }

  storefront.addEventListener('pointermove', aimLight);
  storefront.addEventListener('pointerdown', aimLight);
  storefront.addEventListener('pointerleave', restLight);
  document.querySelector('#enter-laundromat').addEventListener('click', syncWeather);
  document.querySelector('#step-outside').addEventListener('click', syncWeather);
  document.addEventListener('visibilitychange', syncWeather);
  still.addEventListener('change', syncWeather);
  syncWeather();
})();
