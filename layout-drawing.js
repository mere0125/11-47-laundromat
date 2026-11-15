// Plan drawing for the night attendant's two layout sketches.
(() => {
  const W = 900;
  const H = 520;
  const pad = 24;

  function rect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  function line(c, x, y, x2, y2, color, width = 1) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
  }

  function disk(c, x, y, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  function label(c, text, x, y, color, size = 12) {
    c.font = `600 ${size}px "Avenir Next Condensed", Arial, sans-serif`;
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
  }

  function drawFixture(c, fixture) {
    const {x, y, w, h, kind} = fixture;
    rect(c, x + 4, y + 5, w, h, '#100e17a8');
    const metal = c.createLinearGradient(x, y, x + w, y + h);
    metal.addColorStop(0, kind === 'dryer' ? '#758b91' : '#b5ab9b');
    metal.addColorStop(1, kind === 'dryer' ? '#3a5461' : '#7e7583');
    if (kind === 'washer' || kind === 'dryer') {
      rect(c, x, y, w, h, metal);
      line(c, x + 1, y + 1, x + w - 1, y + 1, '#e7d6be95');
      const right = kind === 'washer';
      const front = right ? x + w - 5 : x + 5;
      rect(c, front - 3, y + 4, 6, h - 8, '#272537');
      line(c, front, y + 10, front, y + h - 10, '#e6d4bdad', 2);
      label(c, fixture.label, x + w * .49, y + h / 2, '#201d29', 13);
      return;
    }
    if (kind === 'table') {
      const wood = c.createLinearGradient(x, y, x, y + h);
      wood.addColorStop(0, '#c4aa92');
      wood.addColorStop(1, '#918088');
      rect(c, x, y, w, h, wood);
      for (const [index,color] of ['#ac8198', '#8199aa', '#929f88'].entries()) {
        const crease = x + 13 + index * (w - 22) / 3;
        rect(c, crease, y + 9, Math.min(22, w / 8), 13, color);
        line(c, crease + 2, y + 18, crease + 17, y + 18, '#e3cbb894');
      }
      label(c, fixture.label, x + w / 2, y + h - 12, '#3d323d', 12);
      return;
    }
    const fills = {room: '#544459', bench: '#7a6071', vending: '#965f77', cart: '#4e5069'};
    rect(c, x, y, w, h, fills[kind] || '#62546d');
    c.strokeStyle = '#b59eaf80';
    c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    if (kind === 'cart') {
      for (let i = 7; i < w; i += 7) line(c, x + i, y + 3, x + i, y + h - 3, '#b3abbd4f');
      for (let i = 8; i < h; i += 8) line(c, x + 3, y + i, x + w - 3, y + i, '#b3abbd39');
    } else {
      label(c, fixture.label, x + w / 2, y + h / 2, '#ead7ce');
    }
  }

  function drawZone(c, zone, rainMm) {
    const {x,y,w,h,kind} = zone;
    const mat = kind === 'mat';
    if (!mat && !(rainMm > 0)) return;
    rect(c, x, y, w, h, mat ? '#9bc2a945' : '#6f9bc95c');
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    for (let i=-h; i<w; i+=8) {
      line(c, x+i, y+h, x+i+h, y, mat ? '#a4d0ad70' : '#a3c8fc78');
    }
    c.restore();
    c.strokeStyle = mat ? '#b6dac6a0' : '#a0b9ed9e';
    c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    label(c, mat ? 'DRY MAT' : 'WET FLOOR', x + w / 2, Math.max(pad + 9, y - 8), mat ? '#c4e5ce' : '#c0d5ff', 12);
  }

  function backdrop(layout, rainMm, parent) {
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const c = canvas.getContext('2d');
    c.scale(2, 2);
    rect(c, 0, 0, W, H, '#15131e');
    const floor = c.createLinearGradient(pad, pad, W - pad, H - pad);
    floor.addColorStop(0, '#363044');
    floor.addColorStop(.55, '#393245');
    floor.addColorStop(1, '#262b3b');
    rect(c, pad, pad, W - pad * 2, H - pad * 2, floor);

    c.save();
    c.beginPath();
    c.rect(pad, pad, W - pad * 2, H - pad * 2);
    c.clip();
    for (let y = pad; y < H - pad; y += 28) {
      for (let x = pad; x < W - pad; x += 28) {
        const grain = (x * 19 + y * 39) % 101;
        rect(c, x + 1, y + 1, 27, 27, grain < 45 ? '#eee0bd08' : '#11132116');
        if (grain % 4 === 0) line(c, x + 9, y + 14, x + 16, y + 14, '#d4bed621', .6);
      }
    }
    const light = c.createRadialGradient(400, 120, 10, 424, 275, 420);
    light.addColorStop(0, '#e8b68b26');
    light.addColorStop(1, '#e8b68b00');
    rect(c, pad, pad, W - pad * 2, H - pad * 2, light);
    c.restore();

    for (const zone of layout.zones || []) drawZone(c, zone, rainMm);
    const moved = [];
    if (parent) {
      for (const [i,fixture] of layout.obstacles.entries()) {
        const original = parent.obstacles[i];
        if (fixture.x === original.x && fixture.y === original.y) continue;
        c.save();
        c.setLineDash([5, 4]);
        c.strokeStyle = '#e4bba88f';
        c.strokeRect(original.x, original.y, original.w, original.h);
        c.restore();
        moved.push(fixture);
      }
    }
    for (const fixture of layout.obstacles) drawFixture(c, fixture);
    for (const fixture of moved) {
      c.strokeStyle = '#ffda9a';
      c.lineWidth = 2;
      c.strokeRect(fixture.x - 2, fixture.y - 2, fixture.w + 4, fixture.h + 4);
    }
    c.strokeStyle = '#a38c9e96';
    c.lineWidth = 2;
    c.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    line(c, 468, 496, 552, 496, '#766c94', 4);
    line(c, 468, 496, 468, 477, '#d1abb6', 1.5);
    line(c, 552, 496, 552, 477, '#d1abb6', 1.5);
    label(c, 'STREET', 510, 508, '#b4a5bf', 11);
    return canvas;
  }

  function drawTraffic(c, heat) {
    for (const cell of heat || []) {
      const strength = Math.min(1, cell.count / 7);
      const red = Math.round(144 + strength * 99);
      const green = Math.round(110 + strength * 78);
      rect(c, cell.x - 8.5, cell.y - 8.5, 17, 17, `rgba(${red},${green},129,${.18 + .41 * strength})`);
    }
  }

  function drawSight(c, person) {
    if (!person?.view?.length) return;
    c.beginPath();
    c.moveTo(person.x, person.y);
    for (const point of person.view) c.lineTo(point.x, point.y);
    c.closePath();
    c.fillStyle = '#88cec131';
    c.fill();
    c.strokeStyle = '#b8f6dd67';
    c.lineWidth = 1.3;
    c.stroke();
  }

  function drawRoute(c, person) {
    if (!person?.path?.length) return;
    c.save();
    c.setLineDash([5, 5]);
    c.strokeStyle = '#ffd195';
    c.lineWidth = 2.8;
    c.beginPath();
    c.moveTo(person.x, person.y);
    for (const point of person.path) c.lineTo(point.x, point.y);
    c.stroke();
    c.restore();
    const end = person.path.at(-1);
    c.strokeStyle = '#ffd195';
    c.lineWidth = 2;
    c.strokeRect(end.x - 4, end.y - 4, 8, 8);
  }

  function drawPerson(c, person, focus) {
    const {x,y,heading = 0} = person;
    const color = person.color || (person.role === 'attendant' ? '#9ed3c3' : '#e3b39b');
    disk(c, x + 2, y + 3, 10, '#130e1e9c');
    disk(c, x, y, person.role === 'attendant' ? 10 : 8, color);
    disk(c, x - 1, y - 2, 4, '#f7d9be');
    line(c, x, y, x + Math.cos(heading) * 13, y + Math.sin(heading) * 13, color, 1.2);
    if (focus) {
      c.strokeStyle = '#ffe0aa';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 15, 0, Math.PI * 2);
      c.stroke();
    }
  }

  window.LaundryPlan = {
    backdrop,
    paint(canvas, base, frame, {traffic, focus, layout}) {
      const c = canvas.getContext('2d');
      c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      c.drawImage(base, 0, 0, W, H);
      if (traffic) drawTraffic(c, frame.heat);
      for (const machine of frame.machines || []) {
        const rect = layout.obstacles[machine.index];
        disk(c, rect.x + rect.w - 12, rect.y + 9, 3, machine.fault ? '#e69991' : machine.running ? '#ffc785' : '#75978a');
      }
      const selected = frame.people.find(person => person.id === focus);
      drawSight(c, selected);
      drawRoute(c, selected);
      for (const person of frame.people) drawPerson(c, person, person.id === focus);
    }
  };
})();
