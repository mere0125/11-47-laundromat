(() => {
  const opening = document.querySelector('#opening');
  const enter = document.querySelector('#enter-laundromat');
  const outside = document.querySelector('#step-outside');
  const art = document.querySelector('#storefront-art');
  const storefrontContext = art.getContext('2d');

  enter.addEventListener('click', () => {
    opening.hidden = true;
    roomPage.hidden = false;
    roomPage.classList.add('entering');
    window.scrollTo(0, 0);
    resize();
    updateNotebook(true);
    document.querySelector('#room-title').focus({preventScroll: true});
  });

  outside.addEventListener('click', () => {
    roomPage.hidden = true;
    roomPage.classList.remove('entering');
    opening.hidden = false;
    enter.querySelector('span').textContent = 'Back inside';
    paintExterior();
    window.scrollTo(0, 0);
    enter.focus({preventScroll: true});
  });

  paintExterior();

  function paintExterior() {
    const dryer = [...laundryMachines.values()].find(machine => machine.rect.label === 'D 03');
    drawStorefront(storefrontContext, dryer?.fault);
    art.setAttribute('aria-label', dryer?.fault
      ? 'A lit laundromat on a wet street, with a repair notice taped to the glass door.'
      : 'A lit laundromat on a wet street.');
  }

  function drawStorefront(c, showRepairSlip) {
    if (!c) return;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, 820, 640);
    const rect = (x, y, w, h, color) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    const shape = (points, color) => {
      c.beginPath();
      points.forEach(([x, y], index) => index ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
      c.fillStyle = color;
      c.fill();
    };
    const stroke = (x1, y1, x2, y2, color, width = 1) => {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };
    const oval = (x, y, rx, ry, color) => {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    };
    const glow = (x, y, radius, center) => {
      const light = c.createRadialGradient(x, y, 0, x, y, radius);
      light.addColorStop(0, center);
      light.addColorStop(1, '#df9bb500');
      rect(x - radius, y - radius, radius * 2, radius * 2, light);
    };

    // Façade and side wall
    shape([[57, 93], [750, 73], [787, 96], [787, 521], [57, 531]], '#1f1a2b');
    rect(65, 87, 682, 434, '#302639');
    shape([[747, 87], [787, 96], [787, 521], [747, 521]], '#231f31');
    for (let y = 205; y < 520; y += 17) {
      stroke(65, y, 746, y, '#76607945');
      stroke(750, y, 785, y + 3, '#584a6145');
    }
    for (const x of [773, 781]) stroke(x, 123, x, 509, '#51445a', 2);
    rect(83, 111, 650, 69, '#171723');
    rect(86, 114, 644, 63, '#463247');
    glow(401, 144, 186, '#c9709940');
    stroke(88, 116, 727, 116, '#b7899d', 2);
    stroke(88, 175, 727, 175, '#835771', 2);
    c.fillStyle = '#f0d7bd';
    c.font = '500 36px "Yu Mincho", "Hiragino Mincho ProN", serif';
    c.textAlign = 'center';
    c.fillText('コインランドリー', 398, 158);
    c.fillStyle = '#e291a9';
    c.font = 'italic 26px Georgia, serif';
    c.fillText('24', 683, 154);
    c.textAlign = 'start';
    rect(59, 184, 700, 10, '#171623');
    rect(71, 194, 675, 4, '#8e6d7c');

    // A view through the shop window. The furniture and clothing echo the room.
    c.save();
    c.beginPath();
    c.rect(91, 199, 642, 316);
    c.clip();
    rect(91, 199, 642, 316, '#51424b');
    rect(184, 219, 462, 174, '#a2978e');
    shape([[91, 199], [184, 219], [184, 393], [91, 515]], '#615762');
    shape([[646, 219], [733, 199], [733, 515], [646, 393]], '#6c6572');
    shape([[184, 393], [646, 393], [733, 515], [91, 515]], '#736c78');
    for (let x = 190; x <= 630; x += 42) {
      stroke(x, 393, 414 + (x - 414) * 1.39, 515, '#a797a363');
    }
    for (const y of [398, 414, 439, 474, 514]) stroke(91, y, 733, y, '#a797a370');
    for (const x of [244, 415, 577]) {
      glow(x, 258, 110, '#f8de9e6b');
      rect(x - 49, 239, 98, 5, '#f5e8c8');
      stroke(x - 47, 244, x + 47, 244, '#ffe4a5', 2);
    }
    oval(420, 273, 13, 13, '#e6d7b9');
    stroke(420, 273, 420, 265, '#58434b', 1.4);
    stroke(420, 273, 410, 271, '#58434b', 1.4);

    for (let i = 0; i < 5; i++) {
      const x = 113 + i * 35;
      const y = 359 - i * 8;
      machine(x, y, 48 - i * 3, 81 - i * 8, '#c1b8ad');
      machine(675 - i * 26, y - 20, 47 - i * 4, 101 - i * 10, '#9ba7a8');
    }

    shape([[307, 390], [441, 390], [478, 413], [291, 413]], '#d2b9a8');
    rect(291, 413, 187, 6, '#aa8c8d');
    rect(298, 419, 6, 38, '#514957');
    rect(465, 419, 6, 38, '#514957');
    for (const [x, color] of [[316, '#888faf'], [365, '#b38597'], [414, '#7a9c93']]) {
      shape([[x, 396], [x + 23, 396], [x + 31, 403], [x + 1, 403]], color);
    }
    figure(282, 438, 1, '#c5b39e', '#34273e');
    figure(592, 414, .87, '#7a9d9f', '#bcb5c0');

    // Reflections in the glass and the taped repair slip
    shape([[88, 199], [148, 199], [383, 515], [342, 515]], '#c0c7d121');
    shape([[390, 199], [428, 199], [686, 515], [644, 515]], '#c0c7d120');
    rect(91, 199, 642, 316, '#25162a24');
    if (showRepairSlip) {
      c.save();
      c.translate(577, 304);
      c.rotate(-.055);
      rect(-36, -22, 72, 49, '#e4d4ad');
      rect(-15, -26, 30, 8, '#e8d5b373');
      c.fillStyle = '#634953';
      c.font = '700 14px Arial, sans-serif';
      c.textAlign = 'center';
      c.fillText('D 03', 0, -3);
      c.font = '700 8px Arial, sans-serif';
      c.fillText('OUT OF ORDER', 0, 12);
      c.restore();
    }
    c.restore();
    for (const x of [88, 303, 509, 672, 733]) {
      rect(x, 197, 6, 320, '#352a3d');
      stroke(x + 1, 198, x + 1, 515, '#a18b95', 1);
    }
    stroke(91, 503, 733, 503, '#46394a', 3);
    stroke(525, 362, 525, 414, '#352a37', 7);
    stroke(524, 360, 524, 412, '#d8c1a2', 3);

    // Wet pavement catches separate bands of warm and pink light.
    rect(57, 517, 718, 8, '#5a495f');
    rect(33, 525, 767, 12, '#373143');
    shape([[33, 537], [800, 537], [819, 628], [0, 628]], '#201e2e');
    const pavement = c.createLinearGradient(0, 535, 0, 630);
    pavement.addColorStop(0, '#ddbc9560');
    pavement.addColorStop(1, '#a395be00');
    shape([[104, 535], [718, 535], [800, 628], [24, 628]], pavement);
    for (let i = 0; i < 64; i++) {
      const x = 25 + (i * 83) % 750;
      const y = 541 + (i * 29) % 78;
      const color = ['#e1b6a051', '#c580ac46', '#b3b4d234'][i % 3];
      stroke(x, y, x + 8 + (i * 13) % 52, y, color, i % 4 === 0 ? 2 : 1);
    }
    for (let i = 0; i < 130; i++) {
      const x = (i * 193 + 21) % 820;
      const y = (i * 79 + 11) % 609;
      stroke(x, y, x - 3, y + 8 + i % 6, i % 5 === 0 ? '#ddd0e045' : '#b3b1ce21');
    }

    function machine(x, y, w, h, color) {
      rect(x, y, w, h, '#433a4b');
      rect(x + 2, y + 2, w - 4, h - 4, color);
      stroke(x + 3, y + 12, x + w - 4, y + 12, '#736b73');
      rect(x + w - 11, y + 6, 5, 3, '#957b68');
      oval(x + w / 2, y + h * .61, w * .32, w * .32, '#776a76');
      oval(x + w / 2, y + h * .61, w * .24, w * .24, '#3e394f');
      stroke(x + w * .38, y + h * .64, x + w * .57, y + h * .72, '#ab91a1', 1.5);
    }

    function figure(x, y, scale, coat, hair) {
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      oval(0, 2, 17, 5, '#21182b70');
      rect(-8, -21, 6, 21, '#453d50');
      rect(3, -21, 6, 21, '#453d50');
      shape([[-8, -52], [9, -52], [14, -19], [-13, -19]], coat);
      oval(0, -61, 8, 11, '#cba992');
      oval(-1, -65, 9, 7, hair);
      c.restore();
    }
  }
})();
