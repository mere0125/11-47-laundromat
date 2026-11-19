// The shell follows the simulation's floor, with a real opening at the entrance.
export function buildStreet(THREE, parent) {
  const group = new THREE.Group();
  group.name = 'Rainy laundromat street';
  parent.add(group);
  const shell = new THREE.Group();
  const roof = new THREE.Group();
  shell.add(roof);
  group.add(shell);
  const boxGeometry = new THREE.BoxGeometry();
  const faceGeometry = new THREE.PlaneGeometry();
  const material = (color, roughness = .72, metalness = 0) =>
    new THREE.MeshStandardMaterial({color, roughness, metalness});

  function box(target, dimensions, position, surface) {
    const mesh = new THREE.Mesh(boxGeometry, surface);
    mesh.scale.set(...dimensions);
    mesh.position.set(...position);
    target.add(mesh);
    return mesh;
  }

  function boxes(target, specs, surface) {
    const mesh = new THREE.InstancedMesh(boxGeometry, surface, specs.length);
    const object = new THREE.Object3D();
    for (const [index, {dimensions, position, angle = 0}] of specs.entries()) {
      object.position.set(...position);
      object.rotation.y = angle;
      object.scale.set(...dimensions);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    }
    target.add(mesh);
    return mesh;
  }

  function face(target, width, height, position, surface, angle = 0) {
    const mesh = new THREE.Mesh(faceGeometry, surface);
    mesh.position.set(...position);
    mesh.scale.set(width, height, 1);
    mesh.rotation.y = angle;
    target.add(mesh);
    return mesh;
  }

  function ground(target, width, length, x, z, y, surface) {
    const mesh = face(target, width, length, [x, y, z], surface);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function canvasMap(width, height, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  let seed = 1147;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const pavingMap = canvasMap(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#474852';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(21,24,32,.21)' : 'rgba(164,160,143,.13)';
      ctx.fillRect(random() * w, random() * h, .4 + random() * 3, .4 + random() * 2);
    }
    for (let i = 0; i < 120; i++) {
      const radius = 6 + random() * 46;
      const x = random() * w;
      const y = random() * h;
      const sheen = ctx.createRadialGradient(x, y, 0, x, y, radius);
      sheen.addColorStop(0, i % 2 ? 'rgba(16,18,25,.36)' : 'rgba(137,141,151,.13)');
      sheen.addColorStop(1, 'rgba(66,70,80,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });

  const tileMap = canvasMap(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3c4552';
    ctx.fillRect(0, 0, w, h);
    const columns = 16, rows = 8;
    for (let row = 0; row < rows; row++) {
      for (let column = -1; column < columns; column++) {
        const x = (column + (row % 2) * .5) * 32;
        const y = row * 32;
        const value = 106 + Math.round(random() * 28);
        const shade = ctx.createLinearGradient(x, y, x, y + 31);
        shade.addColorStop(0, `rgb(${value + 7},${value + 10},${value + 13})`);
        shade.addColorStop(1, `rgb(${value - 13},${value - 9},${value - 5})`);
        ctx.fillStyle = shade;
        ctx.fillRect(x + 1, y + 1, 30, 30);
      }
    }
    for (let i = 0; i < 5600; i++) {
      ctx.fillStyle = i % 2 ? '#27252f15' : '#d6cfb319';
      ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 4);
    }
    for (let i = 0; i < 25; i++) {
      const x = random() * w, y = random() * h;
      const wash = ctx.createLinearGradient(x, y, x, y + 65);
      wash.addColorStop(0, '#372c341f');
      wash.addColorStop(1, '#372c3400');
      ctx.fillStyle = wash;
      ctx.fillRect(x, y, 3 + random() * 10, 65);
    }
  });

  function repeatingMap(original, repeatX, repeatY) {
    const texture = original.clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    return texture;
  }

  const asphalt = new THREE.MeshStandardMaterial({
    color: 0xa5abc1, map: repeatingMap(pavingMap, 16, 10), roughness: .34, metalness: .28
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    color: 0xd1c9c1, map: repeatingMap(pavingMap, 10, 1.2), roughness: .48, metalness: .08
  });
  const slabEdge = material('#505565', .51, .1);
  const bitumen = material('#242631');
  const steel = material('#535869', .34, .64);
  const jamb = material('#282935', .43, .53);
  const cap = material('#a7a2a0', .48, .32);
  const shellTile = new THREE.MeshStandardMaterial({
    color: 0xb9bac4, map: repeatingMap(tileMap, 3, 2), roughness: .48, metalness: .08
  });
  const grayPanel = material('#888698', .63, .08);
  const brass = material('#c0a085', .29, .55);
  const rubber = material('#211e2a', .81);
  const clearGlass = new THREE.MeshStandardMaterial({
    color: 0x7d9daf, roughness: .16, metalness: .22,
    opacity: .12, transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const frostedGlass = new THREE.MeshStandardMaterial({
    color: 0x748091, roughness: .37, metalness: .17,
    opacity: .51, transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const tube = new THREE.MeshBasicMaterial({color: '#f5d8b6'});
  const coolTube = new THREE.MeshBasicMaterial({color: '#9db6d4'});
  ground(group, 84, 58, 0, 1, .003, asphalt);
  box(group, [61, .1, 4], [0, .012, 7.38], slabEdge);
  ground(group, 61, 4, 0, 7.38, .066, sidewalk);
  const pavingSeams = [];
  for (let x = -30; x <= 30; x += 1.12) {
    pavingSeams.push({dimensions: [.012, .012, 3.99], position: [x, .07, 7.38]});
  }
  for (const z of [5.95, 7.09, 8.21, 9.36]) {
    pavingSeams.push({dimensions: [61, .013, .014], position: [0, .069, z]});
  }
  boxes(group, pavingSeams, bitumen);
  const gutterTiles = [];
  for (let x = -28; x < 28; x += .71) {
    gutterTiles.push({dimensions: [.68, .066, .196], position: [x, .028, 9.44]});
  }
  boxes(group, gutterTiles, slabEdge);
  const leftPanes = [-7, -4.61, -2.23, .16];
  const rightPanes = [1.84, 3.56, 5.28, 7];

  // Warm window reflections appear as broken bands on the wet pavement.
  const reflection = canvasMap(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 410; i++) {
      const y = random() * h;
      const width = 8 + random() * (65 + .28 * y);
      const x = w / 2 + (random() - .5) * (20 + y * .45);
      const alpha = Math.pow(1 - y / h, 1.12) * (.02 + random() * .12);
      const band = ctx.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
      band.addColorStop(0, 'rgba(255,206,159,0)');
      band.addColorStop(.5, `rgba(255,214,171,${alpha})`);
      band.addColorStop(1, 'rgba(255,206,159,0)');
      ctx.fillStyle = band;
      ctx.fillRect(x - width / 2, y, width, 1 + random() * 4);
    }
  });
  const lightSpill = new THREE.MeshBasicMaterial({
    map: reflection, transparent: true, depthWrite: false, opacity: .72, toneMapped: false
  });
  for (const x of [-5.2, -2.7, 0, 2.7, 5.2]) {
    ground(group, 4.4, 3.78, x, 7.36, .081, lightSpill);
  }

  // Thin actual tiles sit in front of the structural masonry, around the glazing.
  function clad(width, height, x, y, z, angle = 0) {
    const adjusted = shellTile.clone();
    adjusted.map = repeatingMap(tileMap, width / 3.2, height / 1.6);
    return face(shell, width, height, [x, y, z], adjusted, angle);
  }
  box(shell, [.30, 4.28, 9.8], [-7.9, 2.14, .68], grayPanel);
  box(shell, [.30, 4.28, 9.8], [7.9, 2.14, .68], grayPanel);
  box(shell, [16.1, 4.28, .30], [0, 2.14, -4.04], grayPanel);
  const plasterMap=canvasMap(512,512,(ctx,w,h)=>{
    ctx.fillStyle='#c3bea4';ctx.fillRect(0,0,w,h);
    for(let i=0;i<16000;i++){
      ctx.fillStyle=i%2?'#42504515':'#fff3d51d';
      ctx.fillRect(random()*w,random()*h,.5+random()*1.5,.4+random()*1.2);
    }
    const aged=ctx.createLinearGradient(0,0,0,h);
    aged.addColorStop(0,'#5b604022');aged.addColorStop(.8,'#fff0cc00');aged.addColorStop(1,'#655f462b');
    ctx.fillStyle=aged;ctx.fillRect(0,0,w,h);
  });
  const plaster=new THREE.MeshStandardMaterial({map:plasterMap,color:'#ead8b3',roughness:.97,bumpMap:plasterMap,bumpScale:.002});
  const panelGrain=canvasMap(1536,256,(ctx,w,h)=>{
    ctx.fillStyle='#9b744b';ctx.fillRect(0,0,w,h);
    for(let board=0;board<64;board++){
      const x=board*24,shade=140+Math.round(random()*24);
      ctx.fillStyle=`rgb(${shade+38},${shade+8},${shade-31})`;ctx.fillRect(x+1,0,22,h);
      for(let grain=0;grain<13;grain++){
        ctx.strokeStyle=grain%4?'#5c3b2528':'#f0cf9240';ctx.lineWidth=.4+random()*.7;
        const grainX=x+2+random()*19;
        ctx.beginPath();ctx.moveTo(grainX,0);ctx.bezierCurveTo(grainX-2,84,grainX+2,171,grainX,h);ctx.stroke();
      }
      if(board%9===4){
        ctx.strokeStyle='#61452750';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.ellipse(x+11,65+board%3*42,3,14,0,0,Math.PI*2);ctx.stroke();
      }
      ctx.fillStyle='#3c2f2360';ctx.fillRect(x,0,1,h);
      ctx.fillStyle='#f8e2b52b';ctx.fillRect(x+1,0,1,h);
    }
    const polish=ctx.createLinearGradient(0,0,0,h);
    polish.addColorStop(0,'#f1d5a20d');polish.addColorStop(.76,'#4b321a00');polish.addColorStop(1,'#49331c50');
    ctx.fillStyle=polish;ctx.fillRect(0,0,w,h);
  });
  const lowerWall=new THREE.MeshStandardMaterial({color:'#c8a473',map:panelGrain,roughness:.77,bumpMap:panelGrain,bumpScale:.003});
  const rail=material('#7d5c37',.62);
  face(shell,15.5,3.42,[0,1.79,-3.876],plaster);
  face(shell,9.16,3.42,[-7.734,1.79,.65],plaster,Math.PI/2);
  face(shell,9.16,3.42,[7.734,1.79,.65],plaster,-Math.PI/2);
  box(shell,[15.47,.87,.018],[0,.52,-3.86],lowerWall);
  box(shell,[.018,.87,9.12],[-7.722,.52,.65],lowerWall);
  box(shell,[.018,.87,9.12],[7.722,.52,.65],lowerWall);
  box(shell,[15.47,.046,.035],[0,.963,-3.845],rail);
  box(shell,[15.47,.026,.025],[0,.911,-3.838],brass);
  for(const side of [-1,1]){
    box(shell,[.035,.046,9.12],[side*7.712,.963,.65],rail);
    box(shell,[.044,.093,9.12],[side*7.709,.13,.65],rail);
  }
  // Deep window sills and worn timber trim turn the frontage into an inhabited room edge.
  const sills=[];
  for(const panes of [leftPanes,rightPanes])for(let i=0;i<panes.length-1;i++){
    const width=panes[i+1]-panes[i]-.065,x=(panes[i]+panes[i+1])/2;
    sills.push({dimensions:[width,.045,.24],position:[x,.38,5.36]});
  }
  boxes(shell,sills,rail);
  clad(9.8, 4.25, -8.056, 2.14, .68, -Math.PI / 2);
  clad(9.8, 4.25, 8.056, 2.14, .68, Math.PI / 2);
  clad(16.1, 4.25, 0, 2.14, -4.196, Math.PI);
  for (const side of [-1, 1]) {
    box(shell, [1.04, 4.28, .32], [side * 7.48, 2.14, 5.47], shellTile);
    clad(1.03, 4.26, side * 7.48, 2.14, 5.638);
  }
  for (const panes of [leftPanes, rightPanes]) {
    const width = panes.at(-1) - panes[0];
    const middle = panes[0] + width / 2;
    box(shell, [width, .30, .31], [middle, .15, 5.47], shellTile);
    box(shell, [width, .09, .20], [middle, .325, 5.51], steel);
  }
  box(shell, [14.0, .38, .36], [0, 3.54, 5.47], shellTile);
  box(shell, [16.1, .44, .47], [0, 4.04, 5.43], shellTile);
  box(roof, [16.46, .24, 10.20], [0, 4.39, .65], bitumen);
  box(roof, [16.46, .075, .18], [0, 4.48, 5.77], cap);
  box(roof, [16.48, .18, .9], [0, 4.28, 5.9], jamb);
  box(roof, [16.4, .075, .07], [0, 4.28, 6.36], steel);
  box(shell, [15.20, .085, .25], [0, .045, 5.59], cap);
  box(shell, [1.64, .01, .23], [1, .095, 5.46], steel);
  const mullions = [];
  for (const x of [...leftPanes, ...rightPanes]) {
    mullions.push({dimensions: [.077, 3.31, .14], position: [x, 1.7, 5.54]});
  }
  mullions.push({dimensions: [14, .07, .12], position: [0, 2.72, 5.54]});
  mullions.push({dimensions: [13.98, .10, .14], position: [0, 3.36, 5.54]});
  boxes(shell, mullions, steel);
  for (const panes of [leftPanes, rightPanes]) {
    for (let i = 0; i < panes.length - 1; i++) {
      const width = panes[i + 1] - panes[i] - .045;
      const x = (panes[i + 1] + panes[i]) / 2;
      face(shell, width, 2.37, [x, 1.52, 5.548], clearGlass).renderOrder = 4;
      face(shell, width, .61, [x, 3.03, 5.546], frostedGlass).renderOrder = 4;
    }
  }
  face(shell, 1.62, .59, [1, 3.02, 5.546], frostedGlass).renderOrder = 4;
  box(shell, [14.4, .12, .14], [0, 3.39, 5.08], steel);
  for (const x of [-5.0, -1.9, 1.9, 5.0]) {
    box(shell, [1.48, .047, .081], [x, 3.32, 5.09], tube);
  }

  const doorPivot = new THREE.Group();
  doorPivot.name = 'Entrance hinge';
  doorPivot.position.set(.16, .07, 5.52);
  const door = [
    {dimensions: [.054, 2.63, .082], position: [.038, 1.315, 0]},
    {dimensions: [.058, 2.63, .082], position: [1.62, 1.315, 0]},
    {dimensions: [1.65, .08, .082], position: [.825, 2.59, 0]},
    {dimensions: [1.65, .19, .082], position: [.825, .106, 0]},
    {dimensions: [1.65, .044, .082], position: [.825, 1.15, 0]}
  ];
  boxes(doorPivot, door, steel);
  face(doorPivot, 1.56, 2.40, [.826, 1.378, .007], clearGlass).renderOrder = 4;
  boxes(doorPivot, [
    {dimensions: [.049, .43, .047], position: [1.42, 1.16, .111]},
    ...[.97, 1.35].map(y => ({dimensions: [.043, .044, .15], position: [1.42, y, .052]}))
  ], brass);
  box(doorPivot, [1.48, .018, .089], [.825, .019, 0], rubber);
  shell.add(doorPivot);

  function sign(target, width, height, position, pixels, paint, angle = 0, lit = false) {
    const map = canvasMap(pixels[0], pixels[1], paint);
    const surface = lit
      ? new THREE.MeshBasicMaterial({map, toneMapped: false, side: THREE.DoubleSide})
      : new THREE.MeshStandardMaterial({map, roughness: .9, side: THREE.DoubleSide});
    return face(target, width, height, position, surface, angle);
  }

  box(shell, [12.99, .88, .22], [0, 3.99, 5.68], jamb);
  sign(shell, 12.78, .75, [0, 3.99, 5.797], [1536, 96], (ctx, w, h) => {
    const enamel = ctx.createLinearGradient(0, 0, w, h);
    enamel.addColorStop(0, '#adb8b9');
    enamel.addColorStop(.43, '#efdfc1');
    enamel.addColorStop(1, '#b4a2a6');
    ctx.fillStyle = enamel;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#473847';
    ctx.fillRect(0, 7, w, 2);
    ctx.fillRect(0, h - 9, w, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 68px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    ctx.fillText('コインランドリー', w / 2, h / 2 + 4);
    ctx.fillStyle = '#773a57';
    ctx.font = '700 34px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    ctx.fillText('24時間', w - 177, h / 2 + 2);
    ctx.fillStyle='#405d62';
    ctx.font='700 38px "Yu Mincho",serif';
    ctx.fillText('雨宿り',146,h/2+2);
    for (let i = 0; i < 640; i++) {
      ctx.fillStyle = i % 2 ? '#7c66620b' : '#fff2ca15';
      ctx.fillRect(random() * w, random() * h, 2 + random() * 12, 1 + random() * 2);
    }
  }, 0, true);

  const repairNotice = sign(doorPivot, .51, .35, [.78, 1.81, .054], [280, 190], (ctx, w, h) => {
    ctx.fillStyle = '#dfc8a1';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3dfb8';
    ctx.fillRect(w * .38, 0, w * .24, 17);
    ctx.fillStyle = '#563941';
    ctx.textAlign = 'center';
    ctx.font = '700 56px sans-serif';
    ctx.fillText('D 03', w / 2, 81);
    ctx.font = '700 31px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    ctx.fillText('故障中', w / 2, 126);
    ctx.font = '600 15px sans-serif';
    ctx.fillText('OUT OF ORDER', w / 2, 160);
  });
  repairNotice.rotation.z = -.038;
  repairNotice.renderOrder = 6;
  const handoverNotice = sign(shell, .55, .44, [-1.37, 1.75, 5.565], [250, 200], (ctx, w, h) => {
    ctx.fillStyle = '#e7d7b9';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4f3a4b';
    ctx.font = '700 33px "Yu Mincho", serif';
    ctx.fillText('朝の引継ぎ', w / 2, 58);
    ctx.font = '600 16px sans-serif';
    ctx.fillText('MORNING SHIFT', w / 2, 94);
    ctx.strokeStyle = '#7b6c72';
    ctx.strokeRect(45, 111, 160, 72);
    ctx.strokeRect(67, 124, 26, 47);
    ctx.strokeRect(161, 124, 22, 47);
    ctx.strokeRect(113, 131, 22, 31);
  });
  handoverNotice.visible = false;
  handoverNotice.renderOrder = 6;
  sign(shell, 1.03, .48, [-6.15, 1.97, 5.558], [320, 140], (ctx, w, h) => {
    ctx.fillStyle = '#d7d0bc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#354d65';
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#e9dbc1';
    ctx.textAlign = 'center';
    ctx.font = '700 37px "Yu Gothic", sans-serif';
    ctx.fillText('年中無休', w / 2, 65);
    ctx.font = '600 21px sans-serif';
    ctx.fillText('OPEN 24 HOURS', w / 2, 108);
  }).renderOrder = 6;

  // A utility entry, vents and exposed services give the side and rear walls depth.
  const darkPanel = material('#272d3a', .47, .36);
  box(shell, [1.16, 2.3, .09], [4.65, 1.16, -4.245], darkPanel);
  box(shell, [1.32, .060, .11], [4.65, 2.33, -4.26], steel);
  box(shell, [.08, .20, .09], [4.24, 1.08, -4.3], brass);
  box(shell, [1.46, .17, .50], [4.65, .083, -4.43], cap);
  box(shell, [.60, .54, .15], [5.78, 1.59, -4.28], steel);
  box(shell, [.44, .36, .165], [5.78, 1.59, -4.296], rubber);
  boxes(shell, Array.from({length: 6}, (_, index) => ({
    dimensions: [.42, .019, .04], position: [5.78, 1.46 + .05 * index, -4.39]
  })), grayPanel);
  box(shell, [1.38, .83, .21], [-5.25, 2.82, -4.28], darkPanel);
  boxes(shell, Array.from({length: 10}, (_, index) => ({
    dimensions: [1.19, .038, .10], position: [-5.25, 2.46 + .073 * index, -4.42]
  })), steel);
  const pipePieces = [];
  for (const x of [-7.6, -7.28]) {
    pipePieces.push({dimensions: [.076, 3.60, .077], position: [x, 1.80, -4.26]});
    for (const y of [.48, 1.33, 2.22, 3.26]) {
      pipePieces.push({dimensions: [.18, .046, .11], position: [x, y, -4.28]});
    }
  }
  pipePieces.push({dimensions: [2.2, .076, .078], position: [-6.54, 3.57, -4.26]});
  for (const z of [-3.65, 5.28]) {
    pipePieces.push({dimensions: [.083, 4.22, .083], position: [8.116, 2.15, z]});
    for (const y of [.83, 1.95, 3.01]) {
      pipePieces.push({dimensions: [.11, .04, .17], position: [8.106, y, z]});
    }
  }
  boxes(shell, pipePieces, steel);
  for (const side of [-1, 1]) {
    for (const z of [-2.85, -.42, 1.98]) {
      box(shell, [.055, 1.50, 1.68], [side * 8.075, 2.48, z], steel);
      face(shell, 1.59, 1.42, [side * 8.108, 2.49, z], darkPanel, side * Math.PI / 2);
      face(shell, 1.5, 1.36, [side * 8.112, 2.49, z], frostedGlass, side * Math.PI / 2).renderOrder = 4;
      box(shell, [.071, .055, 1.68], [side * 8.14, 2.49, z], cap);
      box(shell, [.15, .10, 1.84], [side * 8.13, 1.72, z], steel);
    }
  }
  for (const [x, z] of [[-4.9, -2.15], [-3.55, -2.15], [5.7, 2.26]]) {
    box(roof, [1.16, .45, .83], [x, 4.73, z], steel);
    box(roof, [1.29, .055, .93], [x, 4.98, z], cap);
  }

  // Recessed shutters and the irregular neighboring buildings leave breathing room for the camera.
  const neighboringWall = material('#3c414f', .85);
  const shutter = material('#333746', .58, .30);
  const roadMark = material('#847c77', .77);
  for (const [x, width, height, setback] of [[-29.2, 10.5, 8.05, 3.4], [29.1, 10.4, 6.66, 1.65], [40.2, 9.8, 9.2, 2.8], [-40.3, 9.5, 7.3, 2]]) {
    box(group, [width, height, 8.3], [x, height / 2, setback - 4.15], neighboringWall);
    box(group, [width + .12, .16, 8.45], [x, height, setback - 4.15], steel);
    box(group, [width * .78, 2.46, .10], [x, 1.25, setback + .07], shutter);
    boxes(group, Array.from({length: 19}, (_, index) => ({
      dimensions: [width * .78, .028, .063], position: [x, .16 + .122 * index, setback + .13]
    })), steel);
    for (let window = -1; window <= 1; window++) {
      const frameX = x + window * width * .285;
      box(group, [1.38, 1.46, .079], [frameX, height - 1.76, setback + .065], darkPanel);
      face(group, 1.18, 1.25, [frameX, height - 1.76, setback + .11], window === -1 ? steel : shutter);
      box(group, [1.48, .09, .18], [frameX, height - 2.49, setback + .11], jamb);
    }
  }
  const markedLanes = [];
  for (let x = -33; x < 37; x += 4.75) {
    markedLanes.push({dimensions: [2.1, .005, .095], position: [x, .007, 13.9]});
  }
  boxes(group, markedLanes, roadMark);
  // A drain grate near the curb and a small bottle crate beside the shop.
  box(group, [.88, .017, .40], [6.55, .052, 9.49], darkPanel);
  boxes(group, Array.from({length: 10}, (_, index) => ({
    dimensions: [.034, .021, .33], position: [6.20 + index * .077, .059, 9.49]
  })), steel);
  box(group, [.89, .48, .58], [8.61, .27, 5.06], material('#634a56'));
  box(group, [.93, .049, .60], [8.61, .523, 5.06], grayPanel);
  const pole = [24.25, 10.24];
  box(group, [.11, 5.52, .11], [pole[0], 2.76, pole[1]], steel);
  box(group, [1.39, .072, .10], [pole[0] - .67, 5.49, pole[1]], steel);
  box(group, [.59, .12, .24], [pole[0] - 1.24, 5.45, pole[1]], jamb);
  box(group, [.47, .025, .17], [pole[0] - 1.24, 5.378, pole[1]], coolTube);

  return {group, shell, roof, doorPivot, repairNotice, handoverNotice};
}
