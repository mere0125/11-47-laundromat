export function makeNightSound() {
  const mixes = {
    street: {rain: .85, cutoff: 6600, motor: .035},
    shop: {rain: .36, cutoff: 790, motor: .62},
    studio: {rain: .16, cutoff: 1050, motor: .17},
  };
  let currentScene = 'street';
  let graph = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer;
  let action = 0;

  function drawMix() {
    if (!graph) return;
    const {context, rainGain, rainFilter, motorGain} = graph;
    const mix = mixes[currentScene];
    const now = context.currentTime;
    for (const [parameter, value] of [[rainGain.gain, mix.rain], [rainFilter.frequency, mix.cutoff], [motorGain.gain, mix.motor]]) {
      parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(value, now, .17);
    }
  }

  function fade(value) {
    if (!graph) return;
    const {context, volume} = graph;
    volume.gain.cancelScheduledValues(context.currentTime);
    volume.gain.setTargetAtTime(value, context.currentTime, .05);
  }

  function suspendAfterFade() {
    clearTimeout(suspendTimer);
    fade(0);
    suspendTimer = setTimeout(() => {
      if (graph && (!enabled || document.hidden)) graph.context.suspend().catch(() => {});
    }, 220);
  }

  async function resume() {
    if (!graph || document.hidden || !enabled) return false;
    const generation = action;
    clearTimeout(suspendTimer);
    try {
      await graph.context.resume();
    } catch {
      return false;
    }
    if (generation !== action || !enabled || disposed || document.hidden) return false;
    drawMix();
    fade(.43);
    return true;
  }

  function onVisibilityChange() {
    if (!enabled) return;
    if (document.hidden) suspendAfterFade();
    else void resume();
  }

  async function enable() {
    if (disposed) return false;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    if (!graph) {
      let context;
      try {
        context = new Audio();
        graph = buildGraph(context);
      } catch {
        if (context) context.close().catch(() => {});
        return false;
      }
    }
    const generation = ++action;
    enabled = true;
    const started = await resume();
    if (!started && generation === action) disable();
    return started;
  }

  function disable() {
    enabled = false;
    action++;
    if (graph) suspendAfterFade();
  }

  function scene(name) {
    if (!Object.hasOwn(mixes, name)) return;
    currentScene = name;
    drawMix();
  }

  function door() {
    if (!enabled || !graph || document.hidden || graph.context.state !== 'running') return;
    const {context, volume} = graph;
    const start = context.currentTime + .009;
    const tones = [[1667, 0, .048, .3], [2238, .021, .023, .19], [3067, .057, .006, .12]];
    for (const [frequency, delay, level, decay] of tones) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const time = start + delay;
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level, time + .006);
      envelope.gain.exponentialRampToValueAtTime(.0001, time + decay);
      oscillator.connect(envelope);
      envelope.connect(volume);
      oscillator.start(time);
      oscillator.stop(time + decay + .008);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    action++;
    clearTimeout(suspendTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (graph) graph.context.close().catch(() => {});
    graph = null;
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  return {enable, disable, scene, door, dispose};

  function buildGraph(context) {
    const volume = context.createGain();
    volume.gain.value = 0;
    volume.connect(context.destination);

    const rain = context.createBufferSource();
    rain.buffer = makeRainBuffer(context);
    rain.loop = true;
    const rainHighpass = context.createBiquadFilter();
    rainHighpass.type = 'highpass';
    rainHighpass.frequency.value = 180;
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = mixes[currentScene].cutoff;
    rainFilter.Q.value = .35;
    const rainGain = context.createGain();
    rainGain.gain.value = mixes[currentScene].rain;
    rain.connect(rainHighpass);
    rainHighpass.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(volume);

    const motor = context.createBufferSource();
    motor.buffer = makeWasherBuffer(context);
    motor.loop = true;
    const motorGain = context.createGain();
    motorGain.gain.value = mixes[currentScene].motor;
    motor.connect(motorGain);
    motorGain.connect(volume);

    rain.start();
    motor.start();
    return {context, volume, rainGain, rainFilter, motorGain};
  }

  function seededNoise(seed) {
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }

  // Blend the start against a short continuation past the loop endpoint.
  function loopChannel(buffer, channel, raw, blendLength) {
    const output = buffer.getChannelData(channel);
    output.set(raw.subarray(0, output.length));
    for (let i = 0; i < blendLength; i++) {
      const weight = i / blendLength;
      output[i] = raw[output.length + i] * (1 - weight) + raw[i] * weight;
    }
  }

  function makeRainBuffer(context) {
    const rate = context.sampleRate;
    const length = Math.floor(rate * 9);
    const blend = Math.floor(rate * .16);
    const buffer = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const sample = seededNoise(92113 + channel * 1103);
      const raw = new Float32Array(length + blend);
      let previousNoise = 0;
      let body = 0;
      const color = Math.exp(-2 * Math.PI * 1500 / rate);
      for (let i = 0; i < raw.length; i++) {
        const white = sample() * 2 - 1;
        body = body * color + white * (1 - color);
        const variation = .83 + .12 * Math.sin(i * 2.23 / rate) + .042 * Math.sin(i * 8.61 / rate);
        raw[i] = (body * .27 + (white - previousNoise) * .026) * variation;
        previousNoise = white;
      }
      let hit = Math.floor(rate * .014);
      while (hit < raw.length) {
        const size = Math.floor(rate * (.014 + sample() * .049));
        const level = .035 + sample() * .16;
        let grain = 0;
        for (let i = 0; i < size && hit + i < raw.length; i++) {
          grain = grain * .64 + (sample() * 2 - 1) * .36;
          const envelope = Math.min(i / (rate * .002), 1) * Math.exp(-5 * i / size);
          raw[hit + i] += grain * envelope * level;
        }
        hit += Math.ceil(rate * (.006 + sample() ** 2 * .057));
      }
      loopChannel(buffer, channel, raw, blend);
    }
    return buffer;
  }

  function makeWasherBuffer(context) {
    const rate = context.sampleRate;
    const length = Math.floor(rate * 7);
    const blend = Math.floor(rate * .18);
    const buffer = context.createBuffer(1, length, rate);
    const raw = new Float32Array(length + blend);
    const sample = seededNoise(7147);
    let body = 0;
    let clatter = 0;
    const contactColor = Math.exp(-2 * Math.PI * 620 / rate);
    const motorColor = Math.exp(-2 * Math.PI * 160 / rate);
    for (let i = 0; i < raw.length; i++) {
      const t = i / rate;
      const white = sample() * 2 - 1;
      body = body * motorColor + white * (1 - motorColor);
      clatter = clatter * contactColor + white * (1 - contactColor);
      const turn = 2 * Math.PI * .89 * t;
      const rotation = .72 + .23 * Math.sin(turn) + .06 * Math.sin(turn * 2.03);
      const motor = .054 * Math.sin(2 * Math.PI * 61 * t + .28 * Math.sin(turn))
        + .023 * Math.sin(2 * Math.PI * 122 * t)
        + .012 * Math.sin(2 * Math.PI * 174 * t);
      raw[i] = (motor + body * .24) * rotation + clatter * .085 * Math.pow(Math.max(0, Math.sin(turn - .88)), 5);
    }
    loopChannel(buffer, 0, raw, blend);
    return buffer;
  }
}
