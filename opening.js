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

  requestAnimationFrame(paintExterior);
  art.addEventListener('contextrestored', paintExterior);
  window.addEventListener('resize', () => {
    if (!opening.hidden) paintExterior();
  });

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
    const gradient = (x1, y1, x2, y2, ...colors) => {
      const fill = c.createLinearGradient(x1, y1, x2, y2);
      colors.forEach((color, index) => fill.addColorStop(index / (colors.length - 1), color));
      return fill;
    };
    let seed = 0x1147;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

    // Façade and side wall
    glow(404, 322, 392, '#3941554c');
    shape([[6, 101], [59, 121], [59, 531], [6, 554]], gradient(4, 0, 59, 0, '#17152200', '#191a29', '#24222e'));
    for (const y of [169, 279, 389]) {
      rect(18, y, 24, 58, '#141721');
      stroke(17, y + 59, 43, y + 59, '#4a3c4c', 2);
    }
    shape([[57, 93], [750, 73], [787, 96], [787, 521], [57, 531]], '#1f1a2b');
    rect(65, 87, 682, 434, gradient(0, 86, 0, 521, '#262631', '#3a3040', '#241f2c'));
    shape([[747, 87], [787, 96], [787, 521], [747, 521]], gradient(747, 0, 787, 0, '#312835', '#1b1b2a'));
    for (let row = 0; row < 25; row++) {
      const y = 91 + row * 17;
      stroke(66, y, 745, y, '#98879724');
      stroke(750, y, 785, y + 3, '#7769792b');
      for (let x = 66 + (row % 2) * 22; x < 744; x += 43) {
        rect(x + 1, y + 1, Math.min(42, 744 - x), 15, random() < .5 ? '#c49eab0a' : '#0a0c171c');
        stroke(x, y, x, y + 16, '#aca0a322');
      }
    }
    for (const x of [773, 781]) stroke(x, 123, x, 509, '#51445a', 2);
    rect(79, 110, 660, 76, '#100e19a0');
    rect(83, 106, 650, 73, '#171723');
    rect(86, 110, 644, 65, gradient(86, 120, 730, 160, '#342738', '#584052', '#473140', '#332638'));
    glow(401, 144, 186, '#d88a9d36');
    stroke(88, 111, 727, 111, '#b7899d', 1.4);
    stroke(88, 174, 727, 174, '#835771', 2);
    c.save();
    c.shadowColor = '#edc2a183';
    c.shadowBlur = 14;
    c.fillStyle = '#f0d7bd';
    c.font = '500 36px "Yu Mincho", "Hiragino Mincho ProN", serif';
    c.textAlign = 'center';
    c.fillText('コインランドリー', 398, 158);
    c.fillStyle = '#e291a9';
    c.font = 'italic 26px Georgia, serif';
    c.fillText('24', 683, 154);
    c.restore();
    c.textAlign = 'start';
    rect(59, 184, 700, 10, '#171623');
    rect(71, 194, 675, 4, '#8e6d7c');

    // A view through the shop window. The furniture and clothing echo the room.
    c.save();
    c.beginPath();
    c.rect(91, 199, 642, 316);
    c.clip();
    rect(91, 199, 642, 316, '#51424b');
    rect(184, 219, 462, 174, gradient(0, 218, 0, 393, '#655451', '#b5a38c', '#827575'));
    shape([[91, 199], [184, 219], [184, 393], [91, 515]], gradient(91, 0, 184, 0, '#514953', '#7b6864'));
    shape([[646, 219], [733, 199], [733, 515], [646, 393]], gradient(646, 0, 733, 0, '#8d817d', '#403d4d'));
    shape([[91, 199], [733, 199], [646, 219], [184, 219]], '#342f3c');
    shape([[184, 393], [646, 393], [733, 515], [91, 515]], gradient(0, 393, 0, 515, '#8d7d75', '#514958', '#343341'));
    rect(184, 377, 462, 16, '#44384765');
    for (const y of [283, 310, 337, 364]) stroke(184, y, 646, y, '#f6dbc021');
    for (let x = 204; x < 646; x += 39) stroke(x, 283, x, 390, '#503c401a');
    for (let x = 190; x <= 630; x += 42) {
      stroke(x, 393, 414 + (x - 414) * 1.39, 515, '#a797a363');
    }
    for (const y of [398, 414, 439, 474, 514]) stroke(91, y, 733, y, '#a797a370');
    for (const x of [244, 415, 577]) {
      glow(x, 260, 122, '#ffd79851');
      rect(x - 51, 236, 102, 8, '#4e414a');
      c.save();
      c.shadowBlur = 14;
      c.shadowColor = '#f8d69abe';
      rect(x - 48, 239, 96, 3, '#fff1cb');
      c.restore();
      stroke(x - 46, 243, x + 46, 243, '#ffdaa7', 1);
    }
    oval(421, 275, 14, 14, '#49364190');
    oval(420, 273, 13, 13, '#b39b80');
    oval(420, 273, 11, 11, '#ecdfbd');
    stroke(420, 273, 420, 265, '#58434b', 1.4);
    stroke(420, 273, 410, 271, '#58434b', 1.4);

    for (let i = 4; i >= 0; i--) {
      const x = 113 + i * 35;
      const y = 359 - i * 8;
      machine(x, y, 48 - i * 3, 81 - i * 8, '#c1b8ad');
      machine(675 - i * 26, y - 20, 47 - i * 4, 101 - i * 10, '#9ba7a8');
    }

    oval(389, 453, 110, 12, '#211e2c55');
    shape([[307, 390], [441, 390], [478, 413], [291, 413]], gradient(0, 390, 0, 413, '#e2c7a8', '#af9184'));
    rect(291, 413, 187, 6, '#aa8c8d');
    rect(298, 419, 6, 38, '#514957');
    rect(465, 419, 6, 38, '#514957');
    for (const [x, color] of [[316, '#888faf'], [365, '#b38597'], [414, '#7a9c93']]) {
      shape([[x, 396], [x + 23, 396], [x + 31, 403], [x + 1, 403]], color);
    }
    figure(282, 438, 1, '#c5b39e', '#34273e');
    figure(592, 414, .87, '#7a9d9f', '#bcb5c0');

    // Soft reflections across the glazing and dried rain on the lower panes.
    rect(91, 199, 642, 316, gradient(100, 200, 720, 460, '#34547037', '#23192c08', '#28334749'));
    for (const [left, right] of [[93, 303], [306, 509], [512, 672], [675, 733]]) {
      rect(left, 200, right - left, 315, gradient(0, 200, 0, 515, '#1418235e', '#61718106', '#171d316c'));
      stroke(left + 3, 203, left + 3, 511, '#c1c5c445');
      for (let i = 0; i < 42; i++) {
        const x = left + 3 + random() * (right - left - 7);
        const y = 207 + random() * 298;
        const height = 1 + random() * 9;
        stroke(x, y, x + .12, y + height, '#d6d4d22e', .5);
        oval(x, y + height, .45 + random() * .35, .6, '#e0dce54a');
      }
    }
    if (showRepairSlip) {
      c.save();
      c.translate(577, 304);
      c.rotate(-.055);
      rect(-33, -19, 72, 49, '#29213070');
      shape([[-36, -22], [36, -22], [34, 19], [26, 27], [-36, 27]], gradient(0, -22, 0, 27, '#e9dab5', '#c7ae8e'));
      shape([[26, 27], [34, 19], [27, 19]], '#eddfbc');
      rect(-15, -26, 30, 8, '#e8d5b398');
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
      rect(x - 1, 197, 8, 320, gradient(x - 1, 0, x + 7, 0, '#171926', '#554a59', '#282333'));
      stroke(x + 1, 198, x + 1, 515, '#a18b95', 1);
      stroke(x + 7, 201, x + 7, 513, '#baa09827');
    }
    stroke(91, 503, 733, 503, '#46394a', 3);
    for (const y of [359, 413]) rect(522, y, 9, 4, '#392e39');
    stroke(527, 362, 527, 414, '#211c27a4', 6);
    rect(523, 360, 4, 53, gradient(523, 0, 527, 0, '#5f514f', '#ebcda8', '#a68d7d'));

    // Wet pavement catches separate bands of warm and pink light.
    rect(57, 517, 718, 8, gradient(0, 517, 0, 525, '#82717b', '#392f3f'));
    rect(33, 525, 767, 12, gradient(0, 525, 0, 537, '#5c505b', '#211f31'));
    const pavement = gradient(0, 537, 0, 640, '#2e2b3d', '#262535', '#10111d00');
    shape([[33, 537], [800, 537], [819, 639], [0, 639]], pavement);
    c.save();
    c.beginPath();
    c.rect(0, 537, 820, 103);
    c.clip();
    for (const [x, color] of [[228, '#e1c68b55'], [405, '#edd6a759'], [586, '#eed29c4f'], [699, '#d67a9b40']]) {
      c.save();
      c.translate(x, 552);
      c.scale(.62, 1);
      const spill = c.createRadialGradient(0, 0, 0, 0, 0, 90);
      spill.addColorStop(0, color);
      spill.addColorStop(.42, '#ddae932b');
      spill.addColorStop(1, '#a395be00');
      rect(-90, -90, 180, 180, spill);
      c.restore();
    }
    stroke(29, 552, 801, 552, '#95819348');
    stroke(22, 559, 803, 559, '#1513228c', 2);
    for (let i = 0; i < 310; i++) {
      const x = random() * 811;
      const y = 537 + random() * 99;
      const lit = x > 151 && x < 749;
      const alpha = (1 - (y - 537) / 109) * (.045 + random() * .24);
      const color = lit ? `rgba(232,${x > 645 ? 153 : 199},172,${alpha})` : `rgba(151,154,190,${alpha * .5})`;
      stroke(x, y, x + 1 + random() * (lit ? 32 : 13), y, color, random() < .2 ? 1.7 : .55);
    }
    c.restore();

    function machine(x, y, w, h, color) {
      const depth = w * .17;
      const nearLeft = x < 412;
      const side = nearLeft ? x + w : x;
      const back = nearLeft ? side + depth : side - depth;
      oval(x + w / 2, y + h + 2, w * .63, 5, '#21182c70');
      shape([[side, y], [back, y - depth * .8], [back, y + h - 3], [side, y + h]], '#6b6268');
      shape([[x, y], [x + w, y], [x + w + depth * .3, y - depth * .8], [x + depth * .3, y - depth * .8]], '#d4c4b1');
      rect(x, y, w, h, '#5e515b');
      rect(x + 1, y + 1, w - 2, h - 2, gradient(x, y, x + w, y + h, '#dfcfba', color, '#7d737e'));
      rect(x + 2, y + 3, w - 4, 10, '#534c5b4a');
      stroke(x + 2, y + 13, x + w - 2, y + 13, '#81757c');
      rect(x + w - 11, y + 6, 5, 3, '#322f41');
      rect(x + w - 10, y + 7, 3, 1, random() > .55 ? '#e8b97c' : '#92a9a4');
      oval(x + 7, y + 7, 1.6, 1.6, '#665964');
      const drumX = x + w * .51;
      const drumY = y + h * .61;
      oval(drumX, drumY + .7, w * .33, w * .33, '#655761');
      oval(drumX, drumY, w * .30, w * .30, gradient(x, drumY - 10, x + w, drumY + 12, '#d1c2b6', '#766b77', '#b4a7a6'));
      oval(drumX, drumY, w * .24, w * .24, gradient(x, drumY - 10, x + w, drumY + 12, '#302738', '#4e4a5f', '#262132'));
      oval(drumX + w * .06, drumY + w * .073, w * .106, w * .074, '#87778664');
      stroke(drumX - w * .13, drumY - w * .11, drumX + w * .07, drumY - w * .17, '#e0d6cf69', 1.1);
      stroke(x + 4, y + h - 6, x + w - 4, y + h - 6, '#5752605e', .8);
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
