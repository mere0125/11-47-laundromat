/* Character roots follow the spatial simulation. Only the joints are animated here. */
export function buildPeople(T, scene, patrons, world) {
  const group = new T.Group();
  group.name = 'People at eleven forty seven';
  scene.add(group);
  const actors = new Map();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let paused = false;
  const keep = item => { geometries.add(item); return item; };
  const shared = {
    ball: keep(new T.SphereGeometry(1, 10, 7)),
    eye: keep(new T.SphereGeometry(1, 8, 6)),
    head: keep(new T.SphereGeometry(1, 20, 14)),
    sleeve: keep(new T.CapsuleGeometry(1, 1, 3, 8)),
    box: keep(new T.BoxGeometry(1, 1, 1, 2, 2, 2)),
    sole: keep(new T.CapsuleGeometry(1, 1, 3, 10)),
    circle: keep(new T.CircleGeometry(1, 28)),
    ring: keep(new T.TorusGeometry(1, .075, 5, 20)),
    hair: null
  };
  const hairPositions = [], hairIndices = [];
  for (let row=0;row<=11;row++) for(let column=0;column<=20;column++) {
    const azimuth=column/20*Math.PI*2;
    const edge=.95+(1-Math.cos(azimuth))*.47;
    const theta=row/11*edge;
    hairPositions.push(Math.sin(azimuth)*Math.sin(theta),Math.cos(theta),Math.cos(azimuth)*Math.sin(theta));
  }
  for(let row=0;row<11;row++)for(let column=0;column<20;column++) {
    const a=row*21+column,b=a+21;
    hairIndices.push(a,b,a+1,a+1,b,b+1);
  }
  shared.hair=keep(new T.BufferGeometry());
  shared.hair.setAttribute('position',new T.Float32BufferAttribute(hairPositions,3));
  shared.hair.setIndex(hairIndices);
  shared.hair.computeVertexNormals();
  function roundedTube(levels, sides=12) {
    const positions=[],indices=[];
    for(const [y,radius,bend=0] of levels)for(let side=0;side<=sides;side++){
      const angle=side/sides*Math.PI*2;
      positions.push(Math.cos(angle)*radius,y,Math.sin(angle)*radius+bend);
    }
    for(let level=0;level<levels.length-1;level++)for(let side=0;side<sides;side++){
      const a=level*(sides+1)+side,b=a+sides+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    const shape=keep(new T.BufferGeometry());
    shape.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    shape.setIndex(indices);shape.computeVertexNormals();
    return shape;
  }
  const clothTube=roundedTube([[-.5,.83],[-.474,.96],[-.39,1],[.23,.98],[.455,.91],[.5,.81]]);
  const hairLock=roundedTube([[-1,.025,.30],[-.63,.51,.22],[-.13,.88,.10],[.43,1,0],[.84,.71,-.04],[1,.18,-.07]],10);
  const headPoints=shared.head.attributes.position;
  for(let i=0;i<headPoints.count;i++){
    const y=headPoints.getY(i),taper=1+Math.min(0,y)*.17;
    headPoints.setXYZ(i,headPoints.getX(i)*taper,y,headPoints.getZ(i)*(1+Math.min(0,y)*.08));
  }
  shared.head.computeVertexNormals();
  // A small bevel gives shoes, pockets and books a softened edge under the shop lights.
  const vertices = shared.box.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const point = new T.Vector3(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
    const center = point.clone().clampScalar(-.34, .34);
    point.sub(center).normalize().multiplyScalar(.16).add(center);
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  shared.box.computeVertexNormals();

  const colorMaterial = (color, options = {}) => {
    const result = new T.MeshStandardMaterial({color, roughness: .88, ...options});
    materials.add(result);
    return result;
  };
  function canvasTexture(width, height, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d'));
    const result = new T.CanvasTexture(canvas);
    result.colorSpace = T.SRGBColorSpace;
    result.anisotropy = 2;
    textures.add(result);
    return result;
  }
  const weave = canvasTexture(128, 128, ctx => {
    ctx.fillStyle = '#f7f6f2';
    ctx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 128; row += 2) {
      ctx.fillStyle = row % 4 ? '#e7e6e366' : '#ffffff65';
      ctx.fillRect(0, row, 128, 1);
    }
    for (let column = 0; column < 128; column += 3) {
      ctx.fillStyle = column % 2 ? '#efeeeb55' : '#ffffff55';
      ctx.fillRect(column, 0, 1, 128);
    }
  });
  const shadowTexture=canvasTexture(96,96,ctx=>{
    const falloff=ctx.createRadialGradient(48,48,9,48,48,47);
    falloff.addColorStop(0,'#161e31b0');
    falloff.addColorStop(.50,'#161e3178');
    falloff.addColorStop(1,'#161e3100');
    ctx.fillStyle=falloff;ctx.fillRect(0,0,96,96);
  });
  const shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity:.31,depthWrite:false});
  materials.add(shadowMaterial);
  const trousers = ['#424959', '#3f3e50', '#344d50', '#383c51', '#34465c', '#4a4854', '#515450', '#424453', '#3c464e'];
  const skins = ['#d9ad94', '#dab599', '#c7a285', '#c39b80', '#d8ad8a', '#c89c80', '#dfbfa2', '#c59a83', '#d6b191'];
  const irises = ['#62524d', '#5b4747', '#4c5c57', '#525368', '#57606a', '#5a4944', '#66766b', '#766052', '#665747'];
  const profileIds = ['mere', 'window', 'attendant', 'sleeping', 'bluecoat', 'student', 'reader', 'scarf', 'raincoat'];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = n => n * n * (3 - 2 * n);
  const mix = (current, target, dt, rate = 9) => lerp(current, target, 1 - Math.exp(-dt * rate));
  const inverseBody = new T.Quaternion();
  const footOrientation = new T.Quaternion();
  const footPitch = new T.Quaternion();
  const ankleTarget = new T.Vector3();
  const pitchAxis = new T.Vector3(1, 0, 0);
  function piece(parent, geometry, finish, position, scale, rotation) {
    const mesh = new T.Mesh(geometry, finish);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }
  const oval = (parent, finish, p, s, r) => piece(parent, shared.ball, finish, p, s, r);
  const box = (parent, finish, p, s, r) => piece(parent, shared.box, finish, p, s, r);
  function capsule(parent, finish, position, radiusX, length, radiusZ, rotation) {
    return piece(parent, shared.sleeve, finish, position, [radiusX, length / 3, radiusZ], rotation);
  }
  function sleeve(parent, finish, position, radiusX, length, radiusZ) {
    return piece(parent,clothTube,finish,position,[radiusX,length,radiusZ]);
  }
  function torsoGeometry(longCoat) {
    const rings = longCoat
      ? [[-.075,.174,.121],[.005,.184,.131],[.15,.166,.128],[.30,.181,.133],[.415,.211,.127],[.458,.204,.119],[.485,.169,.105],[.502,.099,.074]]
      : [[.012,.161,.111],[.037,.177,.123],[.14,.164,.125],[.29,.182,.132],[.412,.208,.127],[.451,.203,.119],[.482,.165,.101],[.496,.097,.071]];
    const positions = [], uv = [], indices = [];
    const steps = 20;
    for (const [level, width, depth] of rings) {
      for (let j = 0; j <= steps; j++) {
        const angle = j / steps * Math.PI * 2;
        positions.push(Math.cos(angle) * width, level, Math.sin(angle) * depth);
        uv.push(j / steps, level * 2);
      }
    }
    for (let ring = 0; ring < rings.length - 1; ring++) for (let j = 0; j < steps; j++) {
      const a = ring * (steps + 1) + j, b = a + steps + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const shape = new T.BufferGeometry();
    shape.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    shape.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    shape.setIndex(indices);
    shape.computeVertexNormals();
    return keep(shape);
  }
  const coatGeo = torsoGeometry(true), shirtGeo = torsoGeometry(false);
  const faceGeo = (() => {
    const shape = new T.PlaneGeometry(.183, .151, 10, 8);
    const points = shape.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i) + .103;
      const front = .106 * Math.sqrt(Math.max(.05, 1 - (x / .121) ** 2 - ((y - .115) / .151) ** 2));
      points.setXYZ(i, x, y, front + .0018);
    }
    shape.computeVertexNormals();
    return keep(shape);
  })();

  // Static pieces share a draw call, while every elbow, eyelid and knee stays independent.
  function batch(target) {
    const sets = new Map();
    for (const child of target.children) {
      if (!child.isMesh || child.userData.dynamic) continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}`;
      if (!sets.has(key)) sets.set(key, []);
      sets.get(key).push(child);
    }
    for (const parts of sets.values()) {
      if (parts.length < 2) continue;
      const instances = new T.InstancedMesh(parts[0].geometry, parts[0].material, parts.length);
      instances.castShadow = true;
      parts.forEach((part, index) => {
        part.updateMatrix();
        instances.setMatrixAt(index, part.matrix);
        target.remove(part);
      });
      instances.instanceMatrix.needsUpdate = true;
      target.add(instances);
    }
  }
  function makePerson(person, index) {
    const known = profileIds.indexOf(person.id);
    const style = known < 0 ? index % 9 : known;
    const actor = new T.Group();
    actor.name = person.name;
    actor.userData.personId = person.id;
    group.add(actor);
    const size = [.96, .97, 1.025, 1.02, 1.01, 1.025, .94, .965, .98][style];
    actor.scale.setScalar(size);
    const coatColor=new T.Color(person.coat || '#a79a91');
    if(style===5)coatColor.multiplyScalar(.84);
    const clothes = colorMaterial(coatColor, {map: weave});
    const seams = colorMaterial(new T.Color(person.coat || '#a79a91').multiplyScalar(.76));
    const lining = colorMaterial(['#e2d2b8','#e3c5ba','#c0d3c4','#c4bcce','#c4d4d2','#d5bdab','#d5d5b6','#ddc3b5','#e3cf9e'][style], {map: weave});
    const skin = colorMaterial(skins[style], {roughness: .81});
    const hair = colorMaterial(person.hair || '#443b43', {roughness: .69});
    const hairSheen = colorMaterial(new T.Color(person.hair || '#443b43').lerp(new T.Color('#a98a78'), .16));
    const pants = colorMaterial(trousers[style], {map: weave});
    const shoeFinish = colorMaterial([0,4,5].includes(style) ? '#d1c9b6' : '#46424a', {roughness: .66});
    const soleFinish = colorMaterial('#afa796');
    const button = colorMaterial('#d0be9f', {metalness: .22, roughness: .58});
    const body = new T.Group();
    body.position.y = .86;
    actor.add(body);
    oval(body, pants, [0,-.025,-.008], [.176,.113,.123]);
    piece(body, [0,1,7,8].includes(style) ? coatGeo : shirtGeo, clothes, [0,0,0], [1,1,1]);
    oval(body, clothes, [0,.457,-.004], [.183,.055,.112]);
    // The shirt opening and two collar folds give the shoulders a continuous silhouette.
    box(body, lining, [0,.411,.107], [.117,.159,.028]);
    oval(body, skin, [0,.505,.001], [.052,.055,.050]);
    for (const side of [-1, 1]) {
      box(body, lining, [side*.066,.476,.076], [.092,.068,.049], [-.30,0,side*-.38]);
      box(body, seams, [side*.116,.156,.122], [.089,.016,.013], [0,0,side*.075]);
    }
    box(body, seams, [0,.211,.133], [.010,.300,.013]);
    for (let i = 0; i < 3; i++) oval(body, button, [.021,.12+i*.105,.140], [.009,.009,.004]);
    if (person.apron) {
      const apron = colorMaterial('#344d52', {map: weave});
      box(body, apron, [0,.171,.137], [.300,.416,.021]);
      box(body, apron, [0,.086,.152], [.163,.106,.015]);
      for (const side of [-1,1]) box(body, apron, [side*.101,.424,.120], [.027,.160,.020], [0,0,side*-.10]);
      const tag = canvasTexture(128,48, ctx => {
        ctx.fillStyle = '#d8d0ae'; ctx.fillRect(0,0,128,48);
        ctx.fillStyle = '#39545c'; ctx.font = '20px sans-serif'; ctx.fillText('スタッフ',13,31);
      });
      const label = colorMaterial('#ffffff',{map:tag});
      piece(body, keep(new T.PlaneGeometry(.105,.039)), label, [.058,.320,.153],[1,1,1]);
    }
    if (person.scarf) {
      const scarf = colorMaterial('#a44445', {map: weave});
      oval(body, scarf, [0,.510,.007], [.105,.056,.102]);
      box(body, scarf, [.065,.335,.148], [.073,.297,.027], [0,0,-.12]);
      for (let j=0;j<4;j++) box(body,lining,[.065,.238+j*.018,.165],[.068,.004,.006],[0,0,-.12]);
    }
    if (person.backpack) {
      const bag = colorMaterial('#545d55',{map:weave});
      box(body,bag,[0,.236,-.170],[.293,.337,.146]);
      box(body,seams,[0,.177,-.250],[.225,.122,.035]);
      for (const side of [-1,1]) capsule(body,bag,[side*.136,.307,.112],.019,.286,.023,[0,0,side*.10]);
      box(body,button,[.047,.245,-.274],[.040,.009,.006]);
    }
    if (person.hood) {
      oval(body, seams, [0,.468,-.074],[.139,.117,.099]);
      for (const side of [-1,1]) capsule(body,lining,[side*.061,.369,.132],.005,.130,.005,[0,0,side*.12]);
    }

    const head = new T.Group();
    head.position.set(0,.557,.006);
    body.add(head);
    piece(head, shared.head, skin,[0,.111,0],[.115,.147,.105]);
    for (const side of [-1,1]) {
      oval(head,skin,[side*.110,.105,-.002],[.021,.036,.020]);
      oval(head,hairSheen,[side*.115,.107,-.005],[.010,.017,.006]);
    }
    oval(head,skin,[0,.094,.104],[.011,.021,.014]);
    const faceInk = canvasTexture(384,320, ctx => {
      ctx.lineCap='round';
      ctx.strokeStyle = style===2 ? '#746761' : person.hair || '#4b4144';
      ctx.lineWidth = 5;
      for (const side of [-1,1]) {
        ctx.beginPath(); ctx.moveTo(192+side*42,102); ctx.quadraticCurveTo(192+side*72,89+style%3*2,192+side*102,102+style%2*4); ctx.stroke();
      }
      ctx.fillStyle = '#bd757349';
      for (const x of [65,319]) {ctx.beginPath();ctx.ellipse(x,193,35,13,0,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle = '#8c5d58'; ctx.lineWidth=3.5;
      ctx.beginPath();ctx.moveTo(171,235);ctx.quadraticCurveTo(192,243,215,233);ctx.stroke();
      ctx.strokeStyle = '#b6867560';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(188,209);ctx.quadraticCurveTo(193,213,199,208);ctx.stroke();
      if ([0,7,8].includes(style)) {
        ctx.fillStyle='#97695361';
        for (let dot=0;dot<7;dot++) {ctx.beginPath();ctx.arc(89+dot*34,180+(dot%3)*5,1.5,0,Math.PI*2);ctx.fill();}
      }
      if (style===2) {ctx.strokeStyle='#7b746d';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(160,218);ctx.quadraticCurveTo(192,211,221,218);ctx.stroke();}
    });
    const faceMaterial = colorMaterial('#ffffff',{map:faceInk,transparent:true,depthWrite:false,roughness:.93});
    piece(head,faceGeo,faceMaterial,[0,0,0],[1,1,1]);
    const eyeWhite = colorMaterial('#e5ded0');
    const iris = colorMaterial(irises[style]);
    const pupil = colorMaterial('#282a35');
    const glint = new T.MeshBasicMaterial({color:'#efe9d9'});
    materials.add(glint);
    const eyes = [-1,1].map(side => {
      const eye = new T.Group();
      eye.position.set(side*.041,.127,.097);
      head.add(eye);
      const opened = new T.Group();eye.add(opened);
      piece(opened,shared.eye,eyeWhite,[0,0,0],[.025,.0102,.006]);
      piece(opened,shared.eye,iris,[side*-.001,0,.0054],[.009,.0095,.003]);
      piece(opened,shared.eye,pupil,[side*-.001,0,.0076],[.0041,.0067,.0021]);
      piece(opened,shared.eye,glint,[-.0035,.0034,.0092],[.0020,.0021,.001]);
      const lid = box(eye,hairSheen,[0,.0089,.004],[.047,.003,.006],[0,0,-side*.06]);
      lid.userData.dynamic=true;
      batch(opened);
      return {eye,opened,lid};
    });
    // Asymmetric locks break up the repeated round scalp silhouette.
    piece(head,shared.hair,hair,[0,.124,-.010],[.123,.157,.113]);
    const longHair = person.longHair || style===0 || style===7;
    if (longHair) {
      oval(head,hair,[0,style===1?-.038:.031,-.074],[.114,style===1?.228:.119,.072]);
      for (const side of [-1,1]) {
        const lock=piece(head,hairLock,hair,[side*.101,.047,.009],[.030,style===1?.171:.110,.039],[side*.06,0,side*-.09]);
        lock.rotation.z += style===0 ? .055 : -.02;
      }
    } else oval(head,hair,[0,.117,-.071],[.110,.101,.061]);
    const part = [1,-1,-1,1,1,-1,-1,1,1][style];
    for (let lock=0;lock<4;lock++) {
      const x=(lock-1.5)*.043;
      piece(head,hairLock,lock===1?hairSheen:hair,[x,.216-Math.abs(x)*.24,.056+lock%2*.008],[.030,.076-(lock%3)*.009,.033],[.14,part*.08,-part*(.25+lock*.11)]);
    }
    if (style===3) for (let tuft=0;tuft<3;tuft++) oval(head,hair,[(tuft-1)*.049,.259,-.015],[.034,.038,.041],[0,0,(tuft-1)*.42]);
    if (style===7) oval(head,hair,[.068,.122,-.115],[.062,.061,.053]);
    if (style===2 || style===4 || style===6) {
      const frames=colorMaterial(style===6?'#8f725f':'#53515a',{metalness:.15,roughness:.48});
      for (const side of [-1,1]) {
        piece(head,shared.ring,frames,[side*.041,.128,.109],[.032,.023,.031]);
        box(head,frames,[side*.088,.133,.055],[.006,.006,.11],[0,side*-.11,0]);
      }
      box(head,frames,[0,.132,.111],[.025,.005,.005]);
    }
    if (person.hood) {
      const hoodRim = colorMaterial(new T.Color(person.coat).lerp(new T.Color('#ddcfa2'), .18));
      piece(head,shared.hair,clothes,[0,.115,-.028],[.145,.175,.137],[-.22,0,0]);
      for(const side of [-1,1]) oval(head,hoodRim,[side*.124,.073,.029],[.021,.101,.031],[0,0,side*.12]);
    }

    const limbs = [-1,1].map(side => {
      const arm = new T.Group();arm.position.set(side*.206,.411,0);arm.rotation.z=side*.065;body.add(arm);
      oval(arm,clothes,[0,-.009,0],[.064,.062,.067]);
      sleeve(arm,clothes,[0,-.121,0],.064,.302,.066);
      const elbow = new T.Group();elbow.position.y=-.263;arm.add(elbow);
      oval(elbow,clothes,[0,-.003,0],[.055,.054,.057]);
      sleeve(elbow,clothes,[0,-.105,0],.053,.267,.055);
      sleeve(elbow,lining,[0,-.222,0],.053,.032,.055);
      const hand = new T.Group();hand.position.set(0,-.239,.002);elbow.add(hand);
      oval(hand,skin,[0,-.032,0],[.032,.042,.022]);
      for(let finger=0;finger<4;finger++) {
        const length=.035-Math.abs(finger-1.4)*.006;
        capsule(hand,skin,[(finger-1.5)*.012,-.063-length*.15,.004],.006,length,.006,[.08,0,(finger-1.5)*.035]);
      }
      capsule(hand,skin,[-side*.032,-.031,.012],.009,.039,.009,[-.18,0,side*-.56]);
      batch(hand);
      const hip = new T.Group();hip.position.set(side*.094,0,0);hip.rotation.order='ZXY';body.add(hip);
      sleeve(hip,pants,[0,-.181,0],.079,.470,.080);
      const knee = new T.Group();knee.position.y=-.405;hip.add(knee);
      oval(knee,pants,[0,.003,0],[.063,.062,.066]);
      sleeve(knee,pants,[0,-.178,0],.063,.418,.065);
      sleeve(knee,seams,[0,-.365,0],.063,.034,.065);
      const foot = new T.Group();foot.position.set(0,-.395,0);knee.add(foot);
      box(foot,soleFinish,[0,-.043,.035],[.135,.037,.243]);
      oval(foot,shoeFinish,[0,-.013,.043],[.071,.055,.124]);
      box(foot,lining,[0,.020,.057],[.084,.009,.085],[-.22,0,0]);
      for(let lace=0;lace<3;lace++) box(foot,soleFinish,[0,.029-lace*.005,.035+lace*.019],[.071,.006,.007],[.08,0,(lace%2?1:-1)*.12]);
      batch(foot);
      return {arm,elbow,hand,hip,knee,foot,side};
    });

    const props = new T.Group();body.add(props);
    const phone = new T.Group();limbs[1].hand.add(phone);
    phone.position.set(.002,-.056,.026);phone.rotation.x=-.10;
    box(phone,colorMaterial('#3c3a45',{roughness:.44}),[0,0,0],[.070,.126,.013]);
    const phoneScreen = canvasTexture(128,224, ctx => {
      ctx.fillStyle='#385563';ctx.fillRect(0,0,128,224);
      ctx.fillStyle='#bfccb8';ctx.font='24px monospace';ctx.fillText('11:47',21,48);
      ctx.fillStyle='#819b9a';ctx.fillRect(12,78,104,30);ctx.fillRect(12,121,87,19);ctx.fillRect(12,153,69,7);
    });
    const screen=colorMaterial('#ffffff',{map:phoneScreen,emissive:'#99beb9',emissiveIntensity:.30,roughness:.45});
    piece(phone,shared.box,screen,[0,.001,.0075],[.061,.110,.001]);
    phone.visible=false;
    const laundry = new T.Group();props.add(laundry);laundry.position.set(0,.078,.307);
    const cotton=colorMaterial('#d8cbb2',{map:weave});
    box(laundry,cotton,[0,0,0],[.288,.039,.167]);
    box(laundry,lining,[.011,.032,-.004],[.262,.028,.151],[0,.06,0]);
    laundry.visible=false;
    const book = new T.Group();props.add(book);book.position.set(0,.147,.328);book.rotation.x=-.35;
    box(book,colorMaterial('#69726b'),[0,0,0],[.252,.174,.020]);
    box(book,cotton,[0,0,.014],[.230,.155,.010]);
    box(book,seams,[0,0,.024],[.004,.153,.005]);book.visible=false;
    const tool = new T.Group();limbs[1].hand.add(tool);tool.position.set(0,-.052,.021);
    capsule(tool,button,[0,-.035,0],.008,.152,.008);
    box(tool,seams,[0,-.111,0],[.029,.063,.022]);tool.visible=false;
    let carry=null;
    if(person.prop==='basket') {
      carry=new T.Group();props.add(carry);carry.position.set(0,.057,.319);
      const plastic=colorMaterial('#c3b38f',{roughness:.80});
      box(carry,plastic,[0,-.064,0],[.331,.034,.226]);
      for(const side of [-1,1]) {
        box(carry,plastic,[side*.164,.014,0],[.018,.175,.234]);
        box(carry,plastic,[0,.014,side*.110],[.327,.175,.014]);
        box(carry,lining,[side*.110,.111,0],[.016,.046,.191]);
      }
      oval(carry,cotton,[.028,.074,-.022],[.138,.043,.098]);
      box(carry,clothes,[-.047,.077,.018],[.170,.028,.143],[0,.14,.08]);
      batch(carry);
    }
    if(person.prop==='bag') {
      const tote=new T.Group();limbs[0].hand.add(tote);tote.position.set(-.019,-.206,.004);
      box(tote,cotton,[0,-.043,0],[.217,.240,.095]);
      piece(tote,shared.ring,lining,[0,.114,0],[.079,.106,.065]);
      box(tote,seams,[0,-.063,.050],[.095,.071,.005]);
      batch(tote);
    }
    if(person.prop==='umbrella') {
      const umbrella=new T.Group();limbs[0].hand.add(umbrella);umbrella.position.set(0,-.068,0);
      capsule(umbrella,button,[0,-.186,0],.006,.498,.006);
      oval(umbrella,seams,[0,-.248,0],[.046,.236,.045]);
      box(umbrella,lining,[0,-.154,.043],[.073,.023,.012]);
      const hook=keep(new T.TorusGeometry(.028,.007,5,13,Math.PI*1.32));
      piece(umbrella,hook,seams,[.024,.038,0],[1,1,1],[0,0,.15]);
      batch(umbrella);
    }
    const shadow=piece(group,shared.circle,shadowMaterial,[0,.091,0],[.30,.22,1],[-Math.PI/2,0,0]);
    for(const node of [body,head,props,phone,laundry,book,tool]) batch(node);
    actor.traverse(node=>{if(node.isMesh)node.castShadow=!node.material.transparent;});
    const figure={person,actor,body,head,limbs,shadow,eyes,phone,laundry,book,tool,carry,size,style,lastX:null,lastZ:null,
      move:0,travel:style*.09,pose:'idle',poseAge:0,idleClock:style*3.41,blinkAt:1.7+style*.34,blinkStart:-10,
      seated:0};
    actors.set(person.id,figure);
    const p=world(person.x,person.y);actor.position.set(p.x,.085,p.z);shadow.position.set(p.x,.091,p.z);
    return figure;
  }
  patrons.forEach(makePerson);

  function choosePose(figure,mind,moving) {
    if(figure.person.activity==='talking to you')return 'talk';
    if(moving) return 'walk';
    const activity=figure.person.activity||'';
    if(activity.includes('letting someone pass')) return 'yield';
    if(mind?.phase==='servicing') return 'repair';
    if(mind?.phase==='checking') return 'inspect';
    if(mind?.phase==='folding'||(!mind&&activity.includes('fold'))) return 'fold';
    if(activity.includes('looking')||mind?.scan>0) return 'look';
    if(figure.person.prop==='phone'&&(mind?.phase?.endsWith('wait')||mind?.phase==='done'||!mind)) return 'phone';
    if(figure.person.prop==='book'&&(mind?.phase==='done'||!mind)) return 'read';
    if(mind?.phase==='done'&&figure.style===3) return 'doze';
    if(mind?.phase?.endsWith('wait')) return 'wait';
    return 'idle';
  }
  function solveLeg(limb,target) {
    const a=.405,b=.395;
    const dy=-Math.hypot(target.y,target.x);
    const span=clamp(target.length(),.10,a+b-.001);
    const direction=Math.atan2(-target.z,-dy);
    const hipAngle=direction-Math.acos(clamp((a*a+span*span-b*b)/(2*a*span),-1,1));
    const kneeAngle=Math.acos(clamp((span*span-a*a-b*b)/(2*a*b),-1,1));
    limb.hip.rotation.z=Math.atan2(target.x,-target.y);
    limb.hip.rotation.x=hipAngle;
    limb.knee.rotation.x=kneeAngle;
  }
  function updateFigure(figure,mind,time,dt) {
    const {person,actor,body,head,limbs,size}=figure;
    const point=world(person.x,person.y);
    const delta=figure.lastX===null?0:Math.hypot(point.x-figure.lastX,point.z-figure.lastZ);
    const plausible=delta<.7;
    const moved=plausible?delta:0;
    const speed=dt>0?moved/dt:0;
    const walking=speed>.012;
    figure.lastX=point.x;figure.lastZ=point.z;
    figure.move=mix(figure.move,walking?clamp(speed/.48,0,1):0,dt,walking?15:11);
    figure.travel+=moved/size;
    const walk=figure.move;
    const pose=choosePose(figure,mind,walking||walk>.12);
    if(pose!==figure.pose){figure.pose=pose;figure.poseAge=0;}else figure.poseAge+=dt;
    if(time!==0) figure.idleClock+=dt;
    const age=figure.poseAge,t=figure.idleClock;
    const target=Math.PI/2-(mind?.heading??person.phase??0);
    const yaw=Math.atan2(Math.sin(target-actor.rotation.y),Math.cos(target-actor.rotation.y));
    actor.rotation.y+=yaw*(1-Math.exp(-dt*10));
    actor.position.set(point.x,.085,point.z);
    figure.shadow.position.set(point.x,.091,point.z+.014);
    const sit=Boolean(person.seated&&(pose==='read'||pose==='doze')&&!mind?.path?.length);
    figure.seated=mix(figure.seated,Number(sit),dt,5);
    const cycle=figure.travel/.84;
    const sway=Math.sin(cycle*Math.PI*2);
    const breathing=time===0?0:Math.sin(t*1.6+figure.style*.8);
    body.position.y=lerp(.86-.044*walk,.487,figure.seated)+breathing*.0025*(1-walk)-Math.abs(sway)*.008*walk;
    body.position.x=Math.sin(t*.57+figure.style)*.006*(1-walk)+sway*.005*walk;
    body.rotation.z=(time===0?0:Math.sin(t*.52+figure.style)*.009)*(1-walk)-sway*.014*walk;
    let lean=0,headPitch=.015,headYaw=0;
    let leftArm=.045,rightArm=.025,leftElbow=-.13,rightElbow=-.14;
    let leftOut=-.055,rightOut=.055,handTurn=0;
    figure.phone.visible=pose==='phone';
    figure.laundry.visible=pose==='fold';
    figure.book.visible=pose==='read';
    figure.tool.visible=pose==='repair';
    if(figure.carry)figure.carry.visible=pose!=='fold';
    if(pose==='walk'){
      const stride=Math.sin(cycle*Math.PI*2);
      leftArm=stride*.32*walk;rightArm=-stride*.30*walk;
      leftElbow=-.19-Math.max(0,-stride)*.13*walk;
      rightElbow=-.17-Math.max(0,stride)*.12*walk;
      lean=.025*walk;headPitch=.008;
    }else if(pose==='fold'){
      const fold=(age%2.8)/2.8;
      const reach=Math.sin(fold*Math.PI*2);
      lean=.10;headPitch=.26;
      leftArm=-.48-reach*.10;rightArm=-.48+reach*.10;
      leftElbow=-.76-Math.max(0,reach)*.09;rightElbow=-.76-Math.max(0,-reach)*.09;
      leftOut=.13+reach*.10;rightOut=-.13+reach*.10;handTurn=.25;
      figure.laundry.rotation.y=reach*.06;
      figure.laundry.position.y=.078+Math.max(0,reach)*.012;
    }else if(pose==='inspect'){
      const touch=ease(clamp(age/.35,0,1));
      headPitch=.14;headYaw=-.04;rightArm=-.58*touch;rightElbow=-.83*touch;
      leftArm=-.10;leftElbow=-.24;rightOut=.02;
    }else if(pose==='repair'){
      const turn=Math.sin(age*6.4)*.16;
      lean=.14;headPitch=.31;rightArm=-.70;rightElbow=-.94;
      leftArm=-.44;leftElbow=-.88;handTurn=turn;rightOut=.09;
      figure.tool.rotation.y=turn*1.8;
    }else if(pose==='phone'){
      headPitch=.27;rightArm=-.27;rightElbow=-1.33;leftArm=-.05;leftElbow=-.24;
      rightOut=.03;handTurn=age%6<.5?.05*Math.sin(age*10):0;
    }else if(pose==='read'){
      headPitch=.29;leftArm=-.33;rightArm=-.33;leftElbow=-1.13;rightElbow=-1.13;
      leftOut=.13;rightOut=-.13;
    }else if(pose==='doze'){
      headPitch=.25+.045*Math.sin(t*.7);headYaw=.09;lean=.052;
      leftArm=-.13;rightArm=-.13;leftElbow=-.7;rightElbow=-.7;
    }else if(pose==='yield'){
      headYaw=Math.sin(t*.45+figure.style)*.16;leftArm=-.08;rightArm=-.08;
      leftElbow=-.36;rightElbow=-.40;rightOut=.11;leftOut=-.11;
    }else if(pose==='look'){
      headYaw=Math.sin(age*.82+figure.style)*.20;headPitch=-.015;
      rightElbow=-.21;leftElbow=-.18;
    }else if(pose==='talk'){
      headPitch=.025+Math.sin(age*1.8)*.028;
      headYaw=Math.sin(age*.65)*.025;
      leftArm=-.05;leftElbow=-.20;
      rightArm=-.12;rightElbow=-.42-Math.sin(age*1.4)*.09;
      rightOut=.075;handTurn=.17;
    }else if(pose==='wait'){
      headYaw=Math.sin(t*.28+figure.style)*.09;headPitch=.035;
      if(Math.floor((t+figure.style)/7)%3===1){leftElbow=-.49;rightElbow=-.28;leftArm=-.09;rightArm=-.04;}
    }else {
      headYaw=Math.sin(t*.33+figure.style)*.07;
      leftArm=.04;rightArm=.02;leftElbow=-.16;rightElbow=-.18;
    }
    if(figure.carry&&figure.carry.visible){
      leftArm=-.24;rightArm=-.24;leftElbow=-1.00;rightElbow=-1.00;
      leftOut=.13;rightOut=-.13;
    }
    body.rotation.x=mix(body.rotation.x,lean,dt,7);
    head.rotation.x=mix(head.rotation.x,headPitch,dt,7);
    head.rotation.y=mix(head.rotation.y,headYaw,dt,5);
    head.rotation.z=Math.sin(t*.41+figure.style)*.012*(1-walk);
    inverseBody.copy(body.quaternion).invert();
    for(const [i,limb] of limbs.entries()){
      const phase=(cycle+i*.5)%1;
      const stance=.62;
      let footZ,footY=.062,toe=0;
      if(phase<stance){footZ=.26-phase/stance*.52;toe=-Math.max(0,(phase-.48)/.14)*.08;}
      else{
        const swing=(phase-stance)/(1-stance);
        footZ=-.26+ease(swing)*.52;
        footY+=Math.sin(swing*Math.PI)*.075;
        toe=-Math.sin(swing*Math.PI)*.10;
      }
      footZ*=walk;footY=lerp(.062,footY,walk);
      footZ=lerp(footZ,.29,figure.seated);
      ankleTarget.set(limb.side*.094,footY,footZ).sub(body.position).applyQuaternion(inverseBody).sub(limb.hip.position);
      solveLeg(limb,ankleTarget);
      footPitch.setFromAxisAngle(pitchAxis,toe*walk);
      footOrientation.copy(body.quaternion).multiply(limb.hip.quaternion).multiply(limb.knee.quaternion).invert().multiply(footPitch);
      limb.foot.quaternion.copy(footOrientation);
      limb.arm.rotation.x=mix(limb.arm.rotation.x,i?rightArm:leftArm,dt,10);
      limb.arm.rotation.z=mix(limb.arm.rotation.z,i?rightOut:leftOut,dt,9);
      limb.elbow.rotation.x=mix(limb.elbow.rotation.x,i?rightElbow:leftElbow,dt,10);
      limb.hand.rotation.y=mix(limb.hand.rotation.y,(i?1:-1)*handTurn,dt,10);
    }
    if(t>=figure.blinkAt&&pose!=='doze'){
      figure.blinkStart=t;figure.blinkAt=t+3.2+(figure.style%4)*.59+Math.sin(t)*.44;
    }
    const blinkAge=t-figure.blinkStart;
    const blink=pose==='doze'?.045:blinkAge>=0&&blinkAge<.17?Math.max(.035,Math.abs(blinkAge/.085-1)):1;
    for(const eye of figure.eyes){eye.opened.scale.y=blink;eye.lid.position.y=.009*blink;}
  }
  return {
    group,
    actors,
    setPaused(value){paused=Boolean(value);},
    update(minds,time,dt){
      if(paused)return;
      const delta=clamp(Number.isFinite(dt)?dt:0,0,.12);
      const current=new Set(patrons.map(person=>person.id));
      for(const [id,figure] of actors)if(!current.has(id)){group.remove(figure.actor,figure.shadow);actors.delete(id);}
      patrons.forEach((person,index)=>{
        const figure=actors.get(person.id)||makePerson(person,index);
        figure.person=person;
        updateFigure(figure,minds?.get(person.id),time,delta);
      });
    },
    dispose(){
      scene.remove(group);actors.clear();
      for(const material of materials)material.dispose();
      for(const texture of textures)texture.dispose();
      for(const geometry of geometries)geometry.dispose();
    }
  };
}
