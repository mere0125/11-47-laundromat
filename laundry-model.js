/* The interior is built in the same coordinates as the spatial model. */
(() => {
  function buildLaundry(THREE, parent, data) {
    const floorY = .085;
    const group = new THREE.Group();
    group.name = 'Coin laundry interior';
    parent.add(group);

    const machines = new Map();
    const interactables = [];
    const storyProps = {};
    let tableLightOn = true;
    const lights = [];
    const textures = [];
    const materials = [];
    const geometries = [];
    let seed = 1147;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const material = (color, options = {}) => {
      const result = new THREE.MeshStandardMaterial({color, roughness: .66, ...options});
      materials.push(result);
      return result;
    };
    const geometry = shape => { geometries.push(shape); return shape; };
    const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
    const planeGeo = geometry(new THREE.PlaneGeometry(1, 1));
    const circleGeo = geometry(new THREE.CircleGeometry(1, 28));
    const cylinderGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 24));
    const sphereGeo = geometry(new THREE.SphereGeometry(1, 14, 9));
    const ringGeo = geometry(new THREE.TorusGeometry(1, .063, 8, 40));

    const navy = material('#24374b', {metalness: .18});
    const enamel = material('#c1c4bf', {metalness: .15, roughness: .46});
    const charcoal = material('#131922');
    const rubber = material('#202530', {roughness: .92});
    const chrome = material('#8b9da4', {metalness: .72, roughness: .32});
    const satin = material('#566574', {metalness: .38, roughness: .49});
    const warmSteel = material('#c6c4ba', {metalness: .42, roughness: .48});
    const woodEdge = material('#654b37');
    const wood = material('#ad885e', {roughness: .68});
    const jade = material('#65817f');
    const textiles = ['#738e99', '#c5ad87', '#7e818f', '#a37382', '#e1dcc3'].map(color => material(color, {roughness: .96}));
    const ledIdle = material('#213138');
    const ledActive = material('#a6e6cf', {emissive: '#82dcb6', emissiveIntensity: .7});
    const ledDone = material('#f1cb84', {emissive: '#dfa75d', emissiveIntensity: .7});
    const ledFault = material('#f1827d', {emissive: '#d5354a', emissiveIntensity: .75});

    function mesh(target, shape, finish, x, y, z, sx = 1, sy = 1, sz = 1) {
      const object = new THREE.Mesh(shape, finish);
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      target.add(object);
      return object;
    }
    function box(target, finish, x, y, z, sx, sy, sz) {
      return mesh(target, boxGeo, finish, x, y, z, sx, sy, sz);
    }
    function face(target, finish, x, y, z, sx, sy) {
      return mesh(target, planeGeo, finish, x, y, z, sx, sy, 1);
    }
    function roller(target, finish, x, y, z, radius, depth) {
      const object = mesh(target, cylinderGeo, finish, x, y, z, radius, depth, radius);
      object.rotation.x = Math.PI / 2;
      return object;
    }
    function texture(width, height, draw) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      draw(canvas.getContext('2d'));
      const result = new THREE.CanvasTexture(canvas);
      result.colorSpace = THREE.SRGBColorSpace;
      result.anisotropy = 4;
      textures.push(result);
      return result;
    }
    function decal(width, height, draw, options = {}) {
      return material('#ffffff', {map: texture(width, height, draw), roughness: .88, ...options});
    }

    // These small marks are painted into the materials, rather than added as floating decoration.
    const enamelWear = texture(512, 512, ctx => {
      ctx.fillStyle = '#e5e7dd'; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = random() < .5 ? '#15273809' : '#fff8d60d';
        ctx.fillRect(random() * 512, random() * 512, .6 + random() * 1.7, .5 + random());
      }
      for (let edge = 0; edge < 22; edge++) {
        const y = random() * 512;
        ctx.fillStyle = '#606b6335'; ctx.fillRect(random() < .5 ? 0 : 507, y, 2 + random() * 4, 1 + random() * 14);
      }
      const grime = ctx.createLinearGradient(0, 0, 0, 512);
      grime.addColorStop(0, '#35433b25'); grime.addColorStop(.08, '#35433b00');
      grime.addColorStop(.8, '#35433b00'); grime.addColorStop(1, '#293a4538');
      ctx.fillStyle = grime; ctx.fillRect(0, 0, 512, 512);
    });
    wood.map = texture(1024, 256, ctx => {
      ctx.fillStyle = '#c3aa7d'; ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 360; i++) {
        const y = random() * 256;
        ctx.strokeStyle = i % 4 ? '#62482f1b' : '#f7e6b429';
        ctx.lineWidth = .4 + random() * 2;
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(290, y + random() * 9, 680, y - random() * 8, 1024, y + random() * 3); ctx.stroke();
      }
      for (const seam of [64, 128, 192]) { ctx.fillStyle = '#59472d52'; ctx.fillRect(0, seam, 1024, 1); }
      for (let i = 0; i < 55; i++) {
        ctx.strokeStyle = '#f5e1b541'; ctx.lineWidth = .7;
        const x = random() * 1000, y = random() * 256;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5 + random() * 55, y + 1); ctx.stroke();
      }
    });
    const clothBlue = material('#3d6b8b', {roughness: .98});
    const lampShade = material('#536c5b', {metalness: .35, roughness: .48});
    const lampLining = material('#eed8a4', {emissive: '#ffc36f', emissiveIntensity: .75, side: THREE.DoubleSide});

    function remember(id, label, kind, target, localPosition, radius = 1.1, extra = {}) {
      target.updateWorldMatrix(true, false);
      let fixture = target;
      while (fixture && !Number.isInteger(fixture.userData.obstacleIndex)) fixture = fixture.parent;
      const item = {id, label, kind, position: target.localToWorld(localPosition.clone()), radius, mesh: target,
        obstacleIndex: fixture?.userData.obstacleIndex, ...extra};
      target.userData.interactableId = id;
      interactables.push(item);
      return item;
    }

    const tile = texture(1536, 896, ctx => {
      const columns = 49;
      const rows = 29;
      const w = 1536 / columns;
      const h = 896 / rows;
      ctx.fillStyle = '#454e4b';
      ctx.fillRect(0, 0, 1536, 896);
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const gray = Math.round(112 + random() * 18 + Math.sin(column * .62 + row * .78) * 5);
        const x = column * w, y = row * h;
        ctx.fillStyle = `rgb(${gray - 3},${gray + 7},${gray + 4})`;
        ctx.fillRect(x + .7, y + .7, w - 1.5, h - 1.6);
        ctx.fillStyle = '#eef0dd23';
        ctx.fillRect(x + 1, y + 1, w - 3, .8);
        for (let grain = 0; grain < 21; grain++) {
          ctx.fillStyle = random() < .4 ? '#e9e1d31f' : '#252b3523';
          ctx.fillRect(x + 2 + random() * (w - 4), y + 1 + random() * (h - 2), .7 + random() * 2, 1);
        }
        if (random() < .055) {
          ctx.strokeStyle = '#303f3b50'; ctx.lineWidth = .7;
          ctx.beginPath(); ctx.moveTo(x + w * .6, y + 1); ctx.lineTo(x + w * .48, y + h * .35); ctx.lineTo(x + w * .64, y + h * .6); ctx.stroke();
        }
      }
      const ends = ctx.createLinearGradient(0, 0, 0, 896);
      ends.addColorStop(0, '#1215213b');
      ends.addColorStop(.3, '#12152100');
      ends.addColorStop(.72, '#14213200');
      ends.addColorStop(1, '#14213226');
      ctx.fillStyle = ends;
      ctx.fillRect(0, 0, 1536, 896);
    });
    const min = data.world(0, 0);
    const max = data.world(data.width, data.height);
    const floor = face(group, material('#ffffff', {map: tile, roughness: .58}),
      (min.x + max.x) / 2, floorY, (min.z + max.z) / 2, Math.abs(max.x - min.x), Math.abs(max.z - min.z));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    const ceilingTiles = texture(768,512,ctx=>{
      ctx.fillStyle='#666d72'; ctx.fillRect(0,0,768,512);
      for (let y=0;y<512;y+=64) for (let x=0;x<768;x+=96) {
        const shade=119+Math.round(random()*10);
        ctx.fillStyle=`rgb(${shade},${shade+2},${shade+1})`;
        ctx.fillRect(x+1,y+1,94,62);
        for (let i=0;i<35;i++) {
          ctx.fillStyle='#383b3c35';
          ctx.fillRect(x+2+random()*91,y+2+random()*59,random()*2+.5,.8);
        }
      }
    });
    const ceiling = face(group,material('#d1d4cd',{map:ceilingTiles,roughness:.92}),
      (min.x+max.x)/2,3.49,(min.z+max.z)/2,max.x-min.x,max.z-min.z);
    ceiling.rotation.x=Math.PI/2;
    ceiling.userData.noScan=true;

    const contact = new THREE.MeshBasicMaterial({
      map: texture(128, 128, ctx => {
        const shadow = ctx.createRadialGradient(64, 64, 10, 64, 64, 63);
        shadow.addColorStop(0, '#0a0c13b4'); shadow.addColorStop(.5, '#0a0c137a'); shadow.addColorStop(1, '#0a0c1300');
        ctx.fillStyle = shadow; ctx.fillRect(0, 0, 128, 128);
      }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    });
    materials.push(contact);

    function contactShadow(target, x, z, w, d) {
      const shadow = face(target, contact, x, .008, z, w, d);
      shadow.rotation.x = -Math.PI / 2;
      return shadow;
    }

    const matFinish = decal(256, 144, ctx => {
      ctx.fillStyle = '#34434a'; ctx.fillRect(0, 0, 256, 144);
      ctx.strokeStyle = '#607577'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 246, 134);
      for (let y = 13; y < 133; y += 3) {
        ctx.strokeStyle = y % 2 ? '#67827d80' : '#202d36';
        ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(244, y); ctx.stroke();
      }
      ctx.fillStyle = '#a4b7ae88';
      ctx.font = '600 19px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('いらっしゃいませ', 128, 77);
    });
    const entrance = data.zones?.find(zone => zone.id === 'threshold');
    const matZones = data.zones?.filter(zone => zone.kind === 'mat' && zone.w && zone.h) || [];
    if (entrance && !matZones.length) {
      matZones.push({x: entrance.x - 44, y: data.height - 49, w: 88, h: 49});
    }
    for (const zone of matZones) {
      const top = Math.min(zone.y, data.height);
      const bottom = Math.min(zone.y + zone.h, data.height);
      const point = data.world(zone.x + zone.w / 2, (top + bottom) / 2);
      const mat = face(group, matFinish, point.x, floorY + .006, point.z, zone.w * data.scale.x, (bottom - top) * data.scale.z);
      mat.rotation.x = -Math.PI / 2;
    }

    const doorGlass = new THREE.MeshPhysicalMaterial({color: '#9db7bb', metalness: .18, roughness: .14,
      clearcoat: 1, clearcoatRoughness: .15, transparent: true, opacity: .29, depthWrite: false});
    materials.push(doorGlass);
    const drumInside = decal(256, 256, ctx => {
      const gradient = ctx.createRadialGradient(100, 86, 5, 128, 128, 130);
      gradient.addColorStop(0, '#788b92'); gradient.addColorStop(.62, '#263746'); gradient.addColorStop(1, '#111b25');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
      for (let band = 1; band < 10; band++) {
        const radius = band * 13;
        const count = Math.ceil(radius * .55);
        for (let i = 0; i < count; i++) {
          const angle = i / count * Math.PI * 2;
          const x = 128 + radius * Math.cos(angle), y = 128 + radius * Math.sin(angle);
          ctx.fillStyle = '#cad8ce6e'; ctx.fillRect(x - .65, y + .75, 2.5, 2.5);
          ctx.fillStyle = '#101c28'; ctx.fillRect(x, y, 2, 2);
        }
      }
    }, {metalness: .38, roughness: .42});
    const sheen = material('#d9eded', {transparent: true, opacity: .34, depthWrite: false, roughness: .21});
    const sheenGeo = geometry(new THREE.RingGeometry(.82, .865, 24, 1, Math.PI * .29, Math.PI * .61));
    const faultNotice = decal(256, 158, ctx => {
      ctx.fillStyle = '#ebd4a5'; ctx.fillRect(0, 0, 256, 158);
      ctx.strokeStyle = '#a3474b'; ctx.lineWidth = 5; ctx.strokeRect(10, 10, 235, 138);
      ctx.fillStyle = '#822d3c'; ctx.font = '700 43px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('故障中', 128, 77);
      ctx.fillStyle = '#633b40'; ctx.font = '700 20px sans-serif'; ctx.fillText('OUT OF ORDER', 128, 116);
    });

    function controlPlate(rect, index, dryer) {
      return decal(512, 130, ctx => {
        const paint = ctx.createLinearGradient(0, 0, 0, 130);
        paint.addColorStop(0, dryer ? '#687a7e' : '#d9d4c6');
        paint.addColorStop(1, dryer ? '#3e5258' : '#b5b6b2');
        ctx.fillStyle = paint; ctx.fillRect(0, 0, 512, 130);
        ctx.fillStyle = dryer ? '#d9e3d4' : '#423f41';
        ctx.font = '600 26px sans-serif'; ctx.fillText(dryer ? '乾燥機' : '全自動洗濯機', 18, 39);
        ctx.font = '600 15px sans-serif'; ctx.fillText(dryer ? '10分 100円' : '標準コース  400円', 20, 64);
        ctx.font = '700 40px monospace'; ctx.fillText(rect.label, 17, 111);
        ctx.fillStyle = '#18282e'; ctx.fillRect(210, 19, 111, 48);
        ctx.strokeStyle = '#7e9a8a'; ctx.strokeRect(213, 22, 105, 41);
        ctx.fillStyle = '#84c3aa'; ctx.font = '600 26px monospace'; ctx.fillText(index % 3 ? '--' : '00', 248, 53);
        ctx.fillStyle = dryer ? '#e6ddd1' : '#504a4a'; ctx.font = '700 17px sans-serif'; ctx.fillText(dryer ? '14 kg' : (index < 4 ? '7 kg' : '10 kg'), 211, 107);
        ctx.fillStyle = '#332e37'; ctx.fillRect(376, 16, 119, 101);
        ctx.fillStyle = '#a6aca2'; ctx.fillRect(400, 32, 70, 7);
        ctx.strokeStyle = '#cad2c9'; ctx.lineWidth = 2; ctx.strokeRect(385, 23, 99, 86);
        ctx.fillStyle = '#b89971'; ctx.font = '600 18px sans-serif'; ctx.fillText('100円', 403, 92);
      });
    }

    function appliance(target, rect, index, shellWidth, shellDepth) {
      const dryer = rect.kind === 'dryer';
      const w = shellDepth - .035;
      const d = shellWidth - .036;
      const h = dryer ? 1.94 : 1.13 + (index % 3) * .017;
      const frontZ = d / 2;
      const shellColor = dryer ? ['#3f5a69','#455a61','#4d616b','#38556a','#526565','#405267'][index % 6]
        : ['#3d566e','#405a71','#40586a','#344b63'][index % 4];
      const shell = material(shellColor, {map: enamelWear, metalness: dryer ? .32 : .24, roughness: .48});
      box(target, navy, 0, .049, 0, w - .067, .098, d - .068);
      box(target, shell, 0, h / 2 + .051, 0, w, h - .10, d);
      box(target, warmSteel, 0, h - .041, 0, w + .003, .025, d + .005);
      box(target, satin, 0, .145, frontZ + .009, w - .018, .099, .019);
      box(target, shell, 0, h * .49, frontZ + .013, w - .026, h * .62, .026);
      for (const x of [-w / 2 + .019, w / 2 - .019]) {
        box(target, chrome, x, h * .52, frontZ + .022, .009, h - .17, .01);
      }
      const panelY = h - .155;
      face(target, controlPlate(rect, index, dryer), 0, panelY, frontZ + .031, w - .053, .182);
      box(target, navy, w * .34, panelY - .061, frontZ + .034, .071, .019, .017);
      const led = box(target, ledIdle, w * .17, panelY + .045, frontZ + .040, .043, .017, .013);
      led.userData.animated = true;
      const radius = Math.min((w - .115) / 2, dryer ? .363 : .285);
      const cy = dryer ? .99 : .548;
      roller(target, rubber, 0, cy, frontZ + .044, radius * 1.085, .075);
      const inner = new THREE.Group();
      inner.position.set(0, cy, frontZ + .087);
      target.add(inner);
      const drum = new THREE.Group();
      inner.add(drum);
      mesh(drum, circleGeo, drumInside, 0, 0, 0, radius * .915, radius * .915, 1);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + index * .51;
        const cloth = mesh(drum, sphereGeo, textiles[(i + index) % textiles.length],
          Math.sin(angle) * radius * .55, Math.cos(angle) * radius * .55, .009,
          radius * .32, radius * .23, .014);
        cloth.rotation.z = angle;
        cloth.visible = false;
      }
      roller(inner, doorGlass, 0, 0, .027, radius * .95, .038).renderOrder = 2;
      mesh(inner, ringGeo, chrome, 0, 0, .034, radius, radius, radius);
      mesh(inner, ringGeo, rubber, 0, 0, .038, radius * .9, radius * .9, radius * .7);
      mesh(inner, sheenGeo, sheen, 0, 0, .055, radius, radius, 1).renderOrder = 3;
      box(target, charcoal, -radius - .005, cy, frontZ + .108, .075, .13, .077);
      box(target, warmSteel, radius * .88, cy + .004, frontZ + .129, .086, .068, .032);
      if (dryer) {
        for (let slat = 0; slat < 6; slat++) box(target, navy, 0, 1.39 + slat * .026, frontZ + .005, w * .57, .011, .022);
      } else {
        box(target, satin, w * .27, .23, frontZ + .032, .13, .10, .017);
        box(target, shell, w * .27, .23, frontZ + .043, .109, .08, .011);
      }
      // Recessed service screws and the rubbed plinth give each machine a credible scale.
      for (const x of [-w * .41, w * .41]) for (const y of [.2, h - .31]) {
        roller(target, satin, x, y, frontZ + .032, .012, .009);
        box(target, charcoal, x, y, frontZ + .038, .012, .0025, .003);
      }
      const maintenance = decal(128, 96, ctx => {
        ctx.fillStyle = '#d7c89b'; ctx.fillRect(0, 0, 128, 96);
        ctx.fillStyle = '#40535b'; ctx.font = '15px sans-serif'; ctx.fillText('点検済', 10, 22);
        ctx.strokeStyle = '#a65e4b'; ctx.lineWidth = 2; ctx.strokeRect(9, 33, 109, 52);
        ctx.fillStyle = '#97543f'; ctx.font = '19px monospace'; ctx.fillText('10.24', 26, 67);
      });
      face(target, maintenance, -w * .30, .24, frontZ + .034, .094, .071);
      const faultTag = face(target, faultNotice, -.031, cy + radius * .38, frontZ + .152, w * .69, .21);
      faultTag.rotation.z = -.078;
      faultTag.visible = false;
      machines.set(index, {group: target, drum, led, faultTag, load: drum.children.slice(1)});
    }

    let tableCount = 0;
    function table(target, w, d, index) {
      const height = .84;
      for (const x of [-w / 2 + .115, w / 2 - .115]) for (const z of [-d / 2 + .091, d / 2 - .091]) {
        box(target, navy, x, height * .46, z, .047, height * .92, .047);
        box(target, rubber, x, .028, z, .065, .045, .064);
      }
      for (const z of [-d / 2 + .1, d / 2 - .1]) box(target, satin, 0, .62, z, w - .23, .061, .043);
      box(target, woodEdge, 0, height - .027, 0, w, .059, d);
      box(target, wood, 0, height + .008, 0, w - .008, .017, d - .008);
      for (const x of [-w / 2 + .08, w / 2 - .08]) for (const z of [-d / 2 + .07, d / 2 - .07]) {
        mesh(target, cylinderGeo, satin, x, height + .018, z, .008, .001, .008);
      }
      for (let i = 0; i < 3; i++) {
        const stack = new THREE.Group();
        stack.position.set((i - 1) * w * .235, height + .035, (i % 2 - .5) * d * .3);
        stack.rotation.y = (random() - .5) * .44;
        target.add(stack);
        for (let cloth = 0; cloth < 2 + (i + index) % 3; cloth++) {
          const finish = textiles[(i + cloth + index) % textiles.length];
          box(stack, finish, cloth * .012, cloth * .039, 0, .36 - cloth * .018, .036, .26 - cloth * .011);
          mesh(stack, sphereGeo, finish, .008, cloth * .039 + .003, .124, .175, .020, .030);
          box(stack, textiles[(i + cloth + index + 1) % textiles.length], .04, cloth * .039 + .019, .07, .12, .002, .025);
        }
      }
      if (tableCount++ === 0) {
        const sock = new THREE.Group();
        sock.name = 'The blue sock'; sock.position.set(w * .09, height + .025, d * .29); sock.rotation.y = -.33;
        target.add(sock);
        const outline = new THREE.Shape();
        outline.moveTo(-.065, -.15); outline.lineTo(.043, -.15); outline.lineTo(.039, .045);
        outline.quadraticCurveTo(.052, .076, .107, .083); outline.quadraticCurveTo(.165, .104, .153, .145);
        outline.quadraticCurveTo(.106, .178, .017, .154); outline.quadraticCurveTo(-.065, .123, -.067, .069);
        outline.closePath();
        const sockMesh = mesh(sock, geometry(new THREE.ExtrudeGeometry(outline, {depth: .009, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .004, bevelThickness: .003})), clothBlue, 0, .013, 0);
        sockMesh.rotation.x = -Math.PI / 2;
        for (let rib = 0; rib < 5; rib++) box(sock, textiles[0], -.055 + rib * .022, .026, .135, .004, .003, .025);
        box(sock, material('#b2c5bd', {roughness: 1}), -.01, .027, .092, .103, .002, .012);
        storyProps.sock = sock;
        remember('blue-sock', 'A blue sock', 'lost-property', sock, new THREE.Vector3(0, .05, 0), 1.3);

        const lamp = new THREE.Group(); lamp.name = 'Folding table lamp';
        lamp.position.set(w * .40, height + .02, -d * .12); target.add(lamp);
        mesh(lamp, cylinderGeo, lampShade, 0, .028, 0, .13, .055, .13);
        mesh(lamp, cylinderGeo, chrome, 0, .22, 0, .015, .36, .015);
        const shadeGeometry = geometry(new THREE.CylinderGeometry(.095, .23, .20, 32, 1, true));
        mesh(lamp, shadeGeometry, lampShade, 0, .44, 0);
        mesh(lamp, geometry(new THREE.CylinderGeometry(.088, .222, .187, 32, 1, true)), lampLining, 0, .438, 0);
        mesh(lamp, sphereGeo, lampLining, 0, .386, 0, .055, .065, .055);
        mesh(lamp, cylinderGeo, satin, 0, .548, 0, .035, .012, .035);
        box(lamp, charcoal, .092, .059, .016, .023, .012, .028);
        const warmPool = new THREE.SpotLight('#ffc46f', 9, 3.4, Math.PI*.36, .8, 2);
        warmPool.position.set(0, .35, 0); lamp.add(warmPool);
        warmPool.target.position.set(0,-.25,0);
        lamp.add(warmPool.target);
        storyProps.tableLamp = warmPool;
        storyProps.lampGlow = lampLining;
        const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(.02,.011,-.04),new THREE.Vector3(.13,.006,-.15),new THREE.Vector3(.18,-.03,-d*.32),new THREE.Vector3(.18,-.65,-d*.34)]);
        mesh(lamp, geometry(new THREE.TubeGeometry(cable, 18, .006, 5, false)), charcoal, 0, 0, 0);
        remember('table-lamp', 'The green table lamp', 'light', lamp, new THREE.Vector3(0, .35, 0), 1.2);
      }
    }

    function cart(target, w, d, index) {
      for (const x of [-w * .38, w * .38]) for (const z of [-d * .4, d * .4]) {
        box(target, chrome, x, .48, z, .031, .79, .031);
        roller(target, rubber, x, .071, z, .066, .036).rotation.y = (x > 0 ? 1 : -1) * Math.PI / 3;
      }
      box(target, satin, 0, .47, 0, w * .92, .026, d * .94);
      for (const [y, thick] of [[.49, .026], [.68, .017], [.87, .032]]) {
        for (const x of [-w / 2, w / 2]) box(target, chrome, x, y, 0, thick, thick, d);
        for (const z of [-d / 2, d / 2]) box(target, chrome, 0, y, z, w, thick, thick);
      }
      const wireFace = decal(128, 128, ctx => {
        ctx.strokeStyle = '#b7c3c2'; ctx.lineWidth = 3;
        for (let i = 3; i < 128; i += 13) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
        }
      }, {transparent: true, alphaTest: .35, side: THREE.DoubleSide, metalness: .35});
      for (const z of [-d / 2, d / 2]) face(target, wireFace, 0, .675, z, w, .369);
      for (const x of [-w / 2, w / 2]) face(target, wireFace, x, .675, 0, d, .369).rotation.y = Math.PI / 2;
      box(target, navy, 0, .95, -d / 2, w * .82, .049, .054);
      mesh(target, sphereGeo, textiles[index % textiles.length], .04, .523, -.09, w * .34, .07, d * .28);
    }

    function bench(target, w, d) {
      const sections = Math.max(3, Math.round(w / .55));
      for (const x of [-w / 2 + .134, w / 2 - .134]) {
        box(target, navy, x, .22, 0, .08, .42, .08);
        box(target, navy, x, .025, 0, .188, .04, d - .110);
      }
      box(target, satin, 0, .35, 0, w - .15, .068, d * .71);
      for (let i = 0; i < sections; i++) {
        const x = (-.5 + (i + .5) / sections) * w;
        const seat = box(target, i === 2 ? jade : navy, x, .46, 0, w / sections - .016, .10, d - .027);
        seat.castShadow = true;
        box(target, satin, x, .70, d * .39, .041, .40, .036);
        box(target, i === 2 ? jade : navy, x, .845, d * .41, w / sections - .015, .203, .067);
      }
      const magazine = decal(128, 196, ctx => {
        ctx.fillStyle = '#c4b69a'; ctx.fillRect(0, 0, 128, 196);
        ctx.fillStyle = '#4e6d78'; ctx.fillRect(7, 8, 114, 68);
        ctx.fillStyle = '#ede5c8'; ctx.font = '700 26px sans-serif'; ctx.fillText('街の声', 13, 48);
        ctx.fillStyle = '#7d6d70';
        for (let row = 0; row < 13; row++) ctx.fillRect(11, 90 + row * 6, 86 + row % 3 * 5, 1.5);
      });
      const book = face(target, magazine, -.17, .517, -.028, .23, .34);
      book.rotation.set(-Math.PI / 2, 0, .24);

      const pot = new THREE.Group();
      pot.position.set(-w*.43,.513,-.017);
      target.add(pot);
      mesh(pot,geometry(new THREE.CylinderGeometry(.10,.075,.17,24)),material('#a36d4a',{roughness:.9}),0,.085,0);
      mesh(pot,circleGeo,material('#3e3a2f',{roughness:1}),0,.174,0,.093,.093,1).rotation.x=-Math.PI/2;
      const stem=material('#5b6943',{roughness:1});
      const leafFinish=material('#597551',{roughness:.84,side:THREE.DoubleSide});
      const leafShape=new THREE.Shape();
      leafShape.moveTo(0,0);
      leafShape.quadraticCurveTo(.09,.055,.025,.19);
      leafShape.quadraticCurveTo(-.07,.11,0,0);
      const leafGeometry=geometry(new THREE.ShapeGeometry(leafShape,12));
      for(let branch=0;branch<3;branch++){
        const branchGroup=new THREE.Group();
        branchGroup.position.set((branch-1)*.025,.17,0);
        branchGroup.rotation.z=(branch-1)*.23;
        pot.add(branchGroup);
        mesh(branchGroup,cylinderGeo,stem,0,.21,0,.005,.42,.005);
        for(let tier=0;tier<4;tier++)for(const side of [-1,1]){
          const leaf=mesh(branchGroup,leafGeometry,leafFinish,0,.08+tier*.085,0);
          leaf.rotation.set(-.3,tier*.88+branch*1.8,side*.78);
          leaf.scale.setScalar(.64+tier*.06);
        }
      }

      const nightBook = new THREE.Group(); nightBook.name = 'The night book';
      nightBook.position.set(w * .34, .525, -.015); nightBook.rotation.y = -.13; target.add(nightBook);
      box(nightBook, material('#5d6a61'), 0, .006, 0, .38, .022, .28);
      box(nightBook, material('#c7baa0'), 0, .021, 0, .363, .014, .267);
      const nightPages = decal(640, 448, ctx => {
        ctx.fillStyle = '#e4d7b7'; ctx.fillRect(0, 0, 640, 448);
        const crease = ctx.createLinearGradient(293, 0, 335, 0);
        crease.addColorStop(0, '#b2a28300'); crease.addColorStop(.5, '#8b7d5960'); crease.addColorStop(1, '#b2a28300');
        ctx.fillStyle = crease; ctx.fillRect(293, 0, 42, 448);
        ctx.strokeStyle = '#86948840'; ctx.lineWidth = 1;
        for (let y = 88; y < 424; y += 34) { ctx.beginPath(); ctx.moveTo(17,y); ctx.lineTo(622,y); ctx.stroke(); }
        ctx.fillStyle = '#43504b'; ctx.font = '27px cursive'; ctx.fillText('夜のノート', 24, 48);
        ctx.font = '21px cursive'; ctx.fillText('11/19   雨', 26, 112);
        ctx.fillText('傘は入口に。', 25, 177); ctx.fillText('D03  点検待ち', 27, 244);
        ctx.fillStyle = '#7d5544'; ctx.fillText('忘れ物：青いくつ下', 344, 110);
        ctx.font = '18px cursive'; ctx.fillText('Lost sock on the folding table.', 344, 153);
        ctx.strokeStyle = '#6a7770'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(397, 236); ctx.lineTo(397, 315); ctx.quadraticCurveTo(447,355,474,327); ctx.lineTo(424,294); ctx.lineTo(424,236); ctx.stroke();
        ctx.fillStyle = '#9b5c4c'; ctx.fillRect(583, 0, 10, 54);
      });
      face(nightBook, nightPages, 0, .031, 0, .36, .26).rotation.x = -Math.PI / 2;
      box(nightBook, material('#a66550'), .142, .033, .133, .015, .002, .068);
      const pencil = box(nightBook, material('#c3a158'), -.19, .043, .015, .009, .009, .19);
      pencil.rotation.y = -.14;
      remember('night-book', 'The night book', 'note', nightBook, new THREE.Vector3(0, .05, 0), 1.25);
    }

    function dispenser(target, w, d) {
      const originalTarget = target, originalWidth = w;
      const body = new THREE.Group(); body.position.x = w * .10; target.add(body);
      target = body; w *= .78;
      const finish = material('#a58c60', {map: enamelWear, metalness: .19, roughness: .62});
      box(target, finish, 0, .93, 0, w, 1.86, d);
      const vendingFace = decal(256, 448, ctx => {
        ctx.fillStyle = '#a78e62'; ctx.fillRect(0, 0, 256, 448);
        ctx.fillStyle = '#e5cdb2'; ctx.fillRect(13, 17, 230, 66);
        ctx.font = '700 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#4e4651'; ctx.fillText('洗剤  SOAP', 128, 61);
        ctx.fillStyle = '#354450'; ctx.fillRect(13, 97, 187, 199);
        for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
          ctx.fillStyle = ['#ada879','#d9c6a2','#82a7a5','#b39ca9'][(row + column * 3) % 4];
          ctx.fillRect(21 + column * 60, 110 + row * 59, 46, 35);
          ctx.fillStyle = '#263e4b'; ctx.fillRect(26 + column * 60, 119 + row * 59, 26, 3);
        }
        ctx.fillStyle = '#8a7452'; ctx.fillRect(23, 326, 209, 96);
        ctx.fillStyle = '#222633'; ctx.fillRect(31, 357, 170, 46);
      }, {emissive: '#f1d1b1', emissiveIntensity: .11});
      face(target, vendingFace, 0, .94, d / 2 + .006, w - .065, 1.77);
      box(target, chrome, w * .4, .87, d / 2 + .024, .099, .23, .038);
      box(target, charcoal, w * .4, .914, d / 2 + .046, .062, .012, .011);
      box(target, ledActive, w * .40, .81, d / 2 + .047, .027, .014, .01);
      remember('soap-dispenser', 'The soap dispenser', 'soap', target, new THREE.Vector3(0, .94, d / 2), 1.3);

      const tray = new THREE.Group(); tray.name = 'Coin tray'; tray.position.set(-w*.2, 1.89, d*.15); target.add(tray);
      box(tray, material('#4b625b',{metalness:.35}), 0, 0, 0, .25, .022, .18);
      for (const x of [-.12,.12]) box(tray, jade, x, .017, 0, .012,.025,.18);
      for (const z of [-.085,.085]) box(tray, jade, 0,.017,z,.24,.025,.012);
      const coinMetal = material('#b4a37a',{metalness:.75,roughness:.38});
      for (let i=0;i<4;i++) {
        const x=[-.04,.045,.015,-.055][i],z=[-.025,.02,-.01,.035][i];
        mesh(tray,cylinderGeo,coinMetal,x,.018+i*.002,z,.027,.003,.027);
      }
      remember('coin-tray', 'A few spare coins', 'coins', tray, new THREE.Vector3(0,.06,0), 1.4);

      // The narrow umbrella well is inside the dispenser's existing collision rectangle.
      const rack = new THREE.Group(); rack.name = 'Umbrella well';
      rack.position.set(-originalWidth*.385, .005, -d*.15); originalTarget.add(rack);
      const rackWidth = originalWidth*.19;
      box(rack, navy, 0,.035,0,rackWidth,.06,d*.62);
      for(const x of [-rackWidth*.43,rackWidth*.43]) for(const z of [-d*.27,d*.27]) box(rack,satin,x,.24,z,.014,.45,.014);
      for(const y of [.15,.39]) {
        for(const x of [-rackWidth*.43,rackWidth*.43]) box(rack,satin,x,y,0,.014,.018,d*.55);
        for(const z of [-d*.27,d*.27]) box(rack,satin,0,y,z,rackWidth*.88,.018,.014);
      }
      for(let i=0;i<3;i++) {
        const umbrella = new THREE.Group(); umbrella.position.set((i-1)*rackWidth*.22,.1,(i-1)*d*.12); umbrella.rotation.z=(i-1)*.055; rack.add(umbrella);
        const fabric = material(['#586b68','#3e556f','#a48d62'][i],{roughness:.76});
        mesh(umbrella,cylinderGeo,chrome,0,.49,0,.008,.95,.008);
        mesh(umbrella,geometry(new THREE.CylinderGeometry(.012,.041,.58,8)),fabric,0,.36,0);
        box(umbrella,satin,0,.48,0,.078,.012,.065);
        const handle = new THREE.CatmullRomCurve3([new THREE.Vector3(0,.92,0),new THREE.Vector3(0,1.01,0),new THREE.Vector3(.07,1.025,0),new THREE.Vector3(.085,.96,0)]);
        mesh(umbrella,geometry(new THREE.TubeGeometry(handle,12,.012,6,false)),i===2?woodEdge:navy,0,0,0);
        for(let drop=0;drop<2;drop++) mesh(rack,sphereGeo,sheen,(i-1)*rackWidth*.22,.06,((i+drop)%3-1)*d*.11,.012,.0025,.018);
      }
      remember('umbrella-rack', 'Umbrellas by the door', 'umbrella', rack, new THREE.Vector3(0,.65,0),1.4);
      const umbrellaNote = decal(384, 224, ctx => {
        ctx.fillStyle='#ddcda4'; ctx.fillRect(0,0,384,224);
        ctx.fillStyle='#3c5358'; ctx.textAlign='center'; ctx.font='33px cursive'; ctx.fillText('借り傘',192,57);
        ctx.font='22px cursive'; ctx.fillText('晴れた日に返してください',192,108);
        ctx.font='18px sans-serif'; ctx.fillText('Bring it back when',192,155); ctx.fillText('the sun comes out.',192,181);
      });
      const card = face(rack,umbrellaNote,0,.455,d*.285,rackWidth*.95,.14);
      card.rotation.z=-.045;
    }

    function utility(target, w, d) {
      const concrete = material('#7e816a', {roughness: .96});
      box(target, concrete, 0, 1.26, 0, w, 2.52, d);
      box(target, navy, 0, .069, 0, w + .003, .123, d + .003);
      box(target, satin, -.22, 1.04, d / 2 + .021, .85, 2.07, .040);
      box(target, navy, -.22, 1.036, d / 2 + .047, .76, 1.98, .016);
      box(target, chrome, .06, 1.025, d / 2 + .074, .064, .168, .028);
      box(target, enamel, -.22, 1.65, d / 2 + .057, .534, .168, .008);
      const sign = decal(256, 74, ctx => {
        ctx.fillStyle = '#d1d5c7'; ctx.fillRect(0, 0, 256, 74);
        ctx.textAlign = 'center'; ctx.fillStyle = '#465654'; ctx.font = '700 21px sans-serif';
        ctx.fillText('関係者以外立入禁止', 128, 29); ctx.font = '600 14px sans-serif'; ctx.fillText('STAFF ONLY', 128, 54);
      });
      face(target, sign, -.22, 1.65, d / 2 + .065, .51, .144);
      box(target, charcoal, w * .29, 2.07, d / 2 + .012, .49, .278, .026);
      for (let louver = 0; louver < 7; louver++) box(target, satin, w * .29, 1.960 + louver * .035, d / 2 + .033, .438, .013, .024);
    }

    for (const [index, rect] of data.obstacles.entries()) {
      const point = data.world(rect.x + rect.w / 2, rect.y + rect.h / 2);
      const w = rect.w * data.scale.x;
      const d = rect.h * data.scale.z;
      const fixture = new THREE.Group();
      fixture.name = rect.label;
      fixture.userData.obstacleIndex = index;
      fixture.position.set(point.x, floorY, point.z);
      group.add(fixture);
      if (rect.kind === 'washer' || rect.kind === 'dryer') {
        fixture.rotation.y = rect.kind === 'washer' ? Math.PI / 2 : -Math.PI / 2;
        contactShadow(fixture, .05, .05, d * 1.42, w * 1.47);
        appliance(fixture, rect, index, w, d);
      } else {
        contactShadow(fixture, .05, .05, w * 1.42, d * 1.47);
        if (rect.kind === 'table') table(fixture, w, d, index);
        else if (rect.kind === 'bench') bench(fixture, w, d);
        else if (rect.kind === 'cart') cart(fixture, w, d, index);
        else if (rect.kind === 'vending') dispenser(fixture, w, d);
        else if (rect.kind === 'room') utility(fixture, w, d);
      }
    }

    // A found sock gets its mate back. The line is above head height, against the front glass.
    if (storyProps.sock) {
      const paired = new THREE.Group(); paired.name = 'Reunited socks'; paired.position.set(-3.4,2.04,5.42);
      group.add(paired);
      const socks=[];
      for (const x of [-.16,.16]) {
        const sock = storyProps.sock.clone(true);
        sock.position.set(x,0,0); sock.rotation.set(Math.PI/2,0,Math.PI+(x<0?-.08:.06));
        delete sock.userData.interactableId; paired.add(sock);socks.push(sock);
        box(paired,wood,x,.17,.009,.022,.064,.026);
      }
      box(paired,material('#a2a69a',{roughness:.9}),0,.19,0,1.1,.006,.006);
      for (const x of [-.55,.55]) box(paired,satin,x,.20,.025,.014,.035,.067);
      storyProps.paired=paired;
      storyProps.returnedSock=socks[1];
      socks[1].visible=false;
      remember('sock-line','The lost-and-found line','lost-property',paired,new THREE.Vector3(0,.05,0),1.6);
    }

    const clockFace = decal(256, 256, ctx => {
      ctx.fillStyle = '#c6c8ba'; ctx.beginPath(); ctx.arc(128, 128, 127, 0, Math.PI * 2); ctx.fill();
      for (let tick = 0; tick < 60; tick++) {
        const angle = tick * Math.PI / 30;
        const major = tick % 5 === 0;
        ctx.strokeStyle = major ? '#3f4440' : '#7a7d72';
        ctx.lineWidth = major ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(128 + Math.sin(angle) * (major ? 110 : 115), 128 - Math.cos(angle) * (major ? 110 : 115));
        ctx.lineTo(128 + Math.sin(angle) * 122, 128 - Math.cos(angle) * 122);
        ctx.stroke();
      }
      ctx.fillStyle = '#464b46'; ctx.textAlign = 'center'; ctx.font = '25px sans-serif';
      for (let hour = 1; hour <= 12; hour++) {
        const angle = hour * Math.PI / 6;
        ctx.fillText(String(hour), 128 + Math.sin(angle) * 91, 136 - Math.cos(angle) * 91);
      }
      for (const [turn, length, width, color] of [[(11 + 47 / 60) / 12, 56, 6, '#272e30'], [47 / 60, 82, 4, '#272e30'], [9 / 60, 92, 2, '#994e52']]) {
        const angle = turn * Math.PI * 2;
        ctx.lineWidth = width; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.sin(angle) * length, 128 - Math.cos(angle) * length); ctx.stroke();
      }
      ctx.fillStyle = '#353836'; ctx.beginPath(); ctx.arc(128, 128, 5, 0, Math.PI * 2); ctx.fill();
    }, {transparent: true, roughness: .6, alphaTest: .5});
    const clock = data.world(data.width * .502, 17);
    roller(group, navy, clock.x, 2.77, clock.z, .259, .059);
    face(group, clockFace, clock.x, 2.77, clock.z + .031, .47, .47);
    box(group, satin, clock.x, 3.013, clock.z, .035, .124, .031);

    const instructions=decal(768,384,ctx=>{
      ctx.fillStyle='#e6e0cc'; ctx.fillRect(0,0,768,384);
      ctx.fillStyle='#2b5063'; ctx.fillRect(0,0,768,83);
      ctx.fillStyle='#fff1cf'; ctx.font='bold 43px sans-serif'; ctx.fillText('洗濯乾燥のご案内',32,59);
      ctx.font='19px sans-serif'; ctx.fillText('WASH & DRY',611,56);
      for (const [i,title,detail] of [[0,'洗濯物を入れる','Load the drum'],[1,'コースを選ぶ','Select a cycle'],[2,'硬貨を入れる','Insert coins']]) {
        const x=25+i*250;
        ctx.fillStyle='#cbc6af'; ctx.fillRect(x,107,218,230);
        ctx.fillStyle='#445d61'; ctx.fillRect(x+44,121,131,121);
        ctx.strokeStyle='#e9e3cc'; ctx.lineWidth=8;
        ctx.beginPath(); ctx.arc(x+109,188,36,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='#e9e3cc'; ctx.fillRect(x+56,134,49,10); ctx.fillRect(x+147,134,14,10);
        ctx.fillStyle='#283f43'; ctx.font='bold 25px sans-serif'; ctx.fillText(title,x+19,278);
        ctx.font='20px sans-serif'; ctx.fillText(detail,x+19,317);
      }
    });
    box(group,navy,-2.5,2.36,-3.88,2.14,1.09,.046);
    face(group,instructions,-2.5,2.36,-3.854,2.075,1.039);
    const notice=decal(384,256,ctx=>{
      ctx.fillStyle='#e0d7a9'; ctx.fillRect(0,0,384,256);
      ctx.fillStyle='#935643'; ctx.fillRect(0,0,384,69);
      ctx.fillStyle='#f8f1cf'; ctx.font='bold 34px sans-serif'; ctx.fillText('お願い',21,48);
      ctx.fillStyle='#425452'; ctx.font='bold 24px sans-serif'; ctx.fillText('洗濯が終わりましたら',19,116);
      ctx.fillText('お早めにお取り出しください',19,157);
      ctx.font='18px sans-serif'; ctx.fillText('Please collect your laundry promptly.',19,204);
    });
    face(group,notice,.92,2.19,-3.85,1.01,.68);

    const tubeCool = material('#e4d2b7', {emissive: '#f4d6aa', emissiveIntensity: 1.08, roughness: .29});
    const tubeWarm = material('#f5d9ac', {emissive: '#f6cc90', emissiveIntensity: 1.22, roughness: .31});
    const circuit = material('#4b515d', {metalness: .45});
    const span = Math.abs(max.x - min.x);
    const center = (max.x + min.x) / 2;
    const y = 3.14;
    for (const yPlan of [.25, .67]) {
      const location = data.world(data.width / 2, data.height * yPlan);
      box(group, circuit, center, y + .21, location.z, span - .42, .039, .050);
      for (const xPlan of [.18, .49, .80]) {
        const x = data.world(data.width * xPlan, data.height * yPlan).x;
        const length = 1.75;
        const warm = xPlan === .49 && yPlan > .5;
        box(group, satin, x, y + .044, location.z, length + .08, .065, .211);
        for (const offset of [-.053, .053]) {
          box(group, warm ? tubeWarm : tubeCool, x, y, location.z + offset, length, .031, .055);
        }
        for (const end of [-1, 1]) {
          box(group, navy, x + end * (length / 2 + .015), y + .022, location.z, .052, .090, .218);
          box(group, circuit, x + end * .68, y + .119, location.z, .018, .149, .018);
        }
        const intensity = warm ? 9 : 6.5;
        const lamp = new THREE.PointLight(warm ? '#ffcf8c' : '#efd6b0', intensity, 8, 2);
        lamp.position.set(x, y - .122, location.z);
        group.add(lamp);
        lights.push({lamp, intensity});
      }
    }

    // Batch repeated metal parts as one draw per finish without moving the fixture's hit area.
    function batchBoxes(target) {
      const partsByFinish = new Map();
      for (const part of target.children) {
        if (part.geometry !== boxGeo || part.material.transparent || part.castShadow || part.userData.animated) continue;
        if (!partsByFinish.has(part.material)) partsByFinish.set(part.material, []);
        partsByFinish.get(part.material).push(part);
      }
      for (const [finish, parts] of partsByFinish) {
        if (parts.length < 2) continue;
        const batch = new THREE.InstancedMesh(boxGeo, finish, parts.length);
        parts.forEach((part, index) => {
          part.updateMatrix();
          batch.setMatrixAt(index, part.matrix);
          target.remove(part);
        });
        batch.instanceMatrix.needsUpdate = true;
        target.add(batch);
      }
    }
    for (const fixture of group.children.filter(item => item.type === 'Group')) batchBoxes(fixture);
    batchBoxes(group);

    function updateMachine(index, state = {}, elapsedSeconds = 0) {
      const item = machines.get(Number(index));
      if (!item) return;
      const {fault, running, finished, owner} = state;
      item.faultTag.visible = Boolean(fault);
      item.led.material = fault ? ledFault : running ? ledActive : finished ? ledDone : ledIdle;
      for (const cloth of item.load) cloth.visible = Boolean(running || owner || finished);
      if (running) item.drum.rotation.z = -elapsedSeconds * 3.25 + Number(index) * .51;
    }

    function updateLighting(enabled) {
      tubeCool.emissiveIntensity = enabled ? 1.08 : 0;
      tubeWarm.emissiveIntensity = enabled ? 1.22 : 0;
      tubeCool.color.set(enabled ? '#e4d2b7' : '#656b70');
      tubeWarm.color.set(enabled ? '#f5d9ac' : '#746e65');
      for (const {lamp, intensity} of lights) lamp.intensity = enabled ? intensity : 0;
      // The little task lamp has its own switch; it remains a pocket of warm light.
      if (storyProps.tableLamp) storyProps.tableLamp.intensity = tableLightOn ? 9 : 0;
    }

    function setStoryState(state = {}) {
      if (typeof state.sockFound === 'boolean') {
        if (storyProps.sock) storyProps.sock.visible = !state.sockFound;
      }
      if(storyProps.returnedSock&&typeof state.sockReturned==='boolean')storyProps.returnedSock.visible=state.sockReturned;
      if (typeof state.lightOn === 'boolean') {
        tableLightOn = state.lightOn;
        if (storyProps.tableLamp) storyProps.tableLamp.intensity = tableLightOn ? 9 : 0;
        lampLining.emissiveIntensity = tableLightOn ? .75 : 0;
        lampLining.color.set(tableLightOn ? '#eed8a4' : '#958b74');
      }
      if (state.bookRead) {
        const book = interactables.find(item => item.id === 'night-book');
        if (book) book.mesh.userData.read = true;
      }
    }

    const initialMachines = Array.isArray(data.machines) ? data.machines : [...(data.machines?.values?.() || [])];
    for (const machine of initialMachines) updateMachine(machine.index, machine);
    return {group, machines, interactables, setStoryState, updateMachine, updateLighting, dispose() {
      parent.remove(group);
      for (const item of textures) item.dispose();
      for (const item of materials) item.dispose();
      for (const item of geometries) item.dispose();
    }};
  }

  globalThis.LaundryModel = {buildLaundry};
})();
