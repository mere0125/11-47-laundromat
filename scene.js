/* The room and the analytical plan share one ground plane and one set of rules. */
let planView = false;
let memoryView = false;
let memoryProjection = null;
let fieldsVisible = false;
let cameraAngle = -.22;
let requestedAngle = -.22;
let cameraZoom = 1;
let walking = null;
const roomWalks = new Map();
const routineMemory = new Map();
const roomRoutines = {
  attendant: {delay:22000,speed:.033,stops:[{x:750,y:345,task:"checking drums",wait:17000},{x:590,y:205,task:"checking the room",wait:14000},{x:700,y:285,task:"checking drums",wait:21000}]},
  bluecoat: {delay:12000,speed:.030,stops:[{x:240,y:100,task:"sorting clothes",wait:14000},{x:250,y:230,task:"carrying wash",wait:10000},{x:160,y:145,task:"loading wash",wait:21000}]},
  student: {delay:18000,speed:.036,stops:[{x:450,y:235,task:"folding a shirt",wait:15000},{x:550,y:395,task:"checking phone",wait:13000},{x:556,y:224,task:"checking phone",wait:22000}]},
  scarf: {delay:27000,speed:.029,stops:[{x:748,y:348,task:"waiting for a dryer",wait:22000},{x:590,y:278,task:"sorting laundry",wait:17000},{x:595,y:402,task:"sorting laundry",wait:16000}]},
  raincoat: {delay:7000,speed:.032,stops:[{x:620,y:410,task:"buying detergent",wait:12000},{x:748,y:434,task:"waiting for a dryer",wait:18000},{x:530,y:467,task:"watching the rain",wait:22000}]}
};
let hoveredFloor = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const garmentColors = ["#b988af", "#628d91", "#cfb686", "#788ab0"];

function projectionInfo() {
  if (memoryView && memoryProjection) return memoryProjection;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const compact = width < 760;
  const right = compact ? 16 : 175;
  const left = compact ? 16 : 66;
  const c = Math.cos(cameraAngle), s = Math.sin(cameraAngle);
  const squash = planView ? 1 : .63;
  const angle = planView ? 0 : cameraAngle;
  const ac = Math.cos(angle), as = Math.sin(angle);
  const boundW = WORLD.w * Math.abs(ac) + WORLD.h * Math.abs(as);
  const boundH = (WORLD.w * Math.abs(as) + WORLD.h * Math.abs(ac)) * squash + (planView ? 0 : 145);
  const scale = Math.max(.15, Math.min((width - left - right) / boundW, (height - 66) / boundH)) * cameraZoom;
  return { scale, cx: left + (width - left - right) / 2, cy: height / 2 + (planView ? 0 : 54 * scale), c: planView ? 1 : c, s: planView ? 0 : s, squash };
}
scaleInfo = function () { const p = projectionInfo(); return { scale: p.scale, ox: p.cx - 450 * p.scale, oy: p.cy - 260 * p.scale }; };
screen = function (point) {
  const p = projectionInfo(), x = point.x - 450, y = point.y - 260;
  return { x: p.cx + (x * p.c - y * p.s) * p.scale, y: p.cy + ((x * p.s + y * p.c) * p.squash - (point.z || 0)) * p.scale };
};
world = function (sx, sy) {
  const p = projectionInfo(), x = (sx - p.cx) / p.scale, y = (sy - p.cy) / p.scale / p.squash;
  return { x: 450 + x * p.c + y * p.s, y: 260 - x * p.s + y * p.c };
};

function face(points, fill, stroke = "rgba(224,206,232,.16)", lineWidth = .8) {
  pathWorld(points, true); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function groundRect(x, y, w, h, fill, z = 0, stroke) {
  face([{x,y,z},{x:x+w,y,z},{x:x+w,y:y+h,z},{x,y:y+h,z}], fill, stroke);
}
function wire(points, color, width = 1) {
  pathWorld(points); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function box(x, y, w, d, h, top, front, side, z = 0) {
  const a={x,y,z}, b={x:x+w,y,z}, c={x:x+w,y:y+d,z}, d0={x,y:y+d,z};
  const A={...a,z:z+h}, B={...b,z:z+h}, C={...c,z:z+h}, D={...d0,z:z+h};
  face([a,b,B,A],side);
  face([b,c,C,B],side);
  face([d0,c,C,D],front);
  face([a,d0,D,A],side);
  face([A,B,C,D],top);
}
function ellipseWorld(center, rx, ry, fill, stroke, plane="ground", rotation=0, lineWidth=1) {
  const points=Array.from({length:40},(_,i)=>{
    const angle=i/40*Math.PI*2, a=Math.cos(angle)*rx, b=Math.sin(angle)*ry;
    if(plane==="side") return {x:center.x,y:center.y+a,z:(center.z||0)+b};
    if(plane==="front") return {x:center.x+a,y:center.y,z:(center.z||0)+b};
    return {x:center.x+a*Math.cos(rotation)-b*Math.sin(rotation),y:center.y+a*Math.sin(rotation)+b*Math.cos(rotation),z:center.z||0};
  });
  face(points,fill,stroke,lineWidth);
}
function labelAt(text,point,color="#f3dfbc",size=10,align="left") {
  const p=screen(point); ctx.save(); ctx.font=`500 ${size}px Avenir Next Condensed, Arial`; ctx.textAlign=align;
  ctx.fillStyle=color; ctx.fillText(text,p.x,p.y); ctx.restore();
}
function lampGlow(point,r,color,alpha) {
  const p=screen(point),radius=r*projectionInfo().scale;
  const gradient=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
  gradient.addColorStop(0,rgba(color,alpha)); gradient.addColorStop(1,rgba(color,0));
  ctx.fillStyle=gradient; ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
}

function stageFloor() {
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.fillStyle="#100e23"; ctx.fillRect(0,0,w,h);
  const back=ctx.createRadialGradient(w*.48,h*.55,5,w*.5,h*.5,w*.65);
  back.addColorStop(0,"#332644"); back.addColorStop(1,"#100e23"); ctx.fillStyle=back;ctx.fillRect(0,0,w,h);
  ellipseWorld({x:450,y:300,z:-36},510,320,"rgba(0,0,0,.26)",null);
  box(12,12,876,496,20,"#38334e","#252039","#211e32",-20);
  for(let y=24;y<496;y+=28) for(let x=24;x<876;x+=28) {
    const seed=(x*13+y*7)%113;
    const fill=seed<10?"#514454":seed<44?"#494051":seed<76?"#453d50":"#4c4356";
    groundRect(x,y,27.3,27.3,fill,.1,"rgba(154,136,157,.12)");
  }
  // Keep the light on the tile plane, underneath the objects and people.
  ctx.save();
  pathWorld([{x:24,y:24},{x:876,y:24},{x:876,y:497},{x:24,y:497}],true);
  ctx.clip();
  if (lightsOn) {
    lampGlow({x:280,y:191},235,"#e8b986",.22);
    lampGlow({x:755,y:150},220,"#81cad1",.16);
  }
  if (neonOn) lampGlow({x:568,y:477},210,"#f47b9e",.21);
  ctx.restore();
  // The rain and the platform sit outside the occupiable room.
  groundRect(10,508,878,100,"#1c1a30",-19,null);
  for(let i=0;i<32;i++) {
    const x=20+(i*79)%865,y=518+(i*31)%85;
    wire([{x,y,z:-18},{x:x+35+(i%4)*15,y,z:-18}],rgba(i%2?colors.cyan:colors.red,.06+(i%4)*.02),1);
  }
  for(let i=0;i<4;i++){
    const x=115+i*190,y=553+(i%2)*23,phase=reducedMotion ? .35 : (elapsed*.00016+i*.23)%1;
    ellipseWorld({x,y,z:-17},14+phase*15,4+phase*3,"rgba(0,0,0,0)",rgba("#8d82aa",(1-phase)*.17));
  }
  if(doorOpen) {
    face([{x:475,y:493,z:1},{x:550,y:493,z:1},{x:650,y:600,z:-18},{x:430,y:600,z:-18}],"rgba(255,203,120,.08)",null);
  }
  // Two back walls and an open front make a cutaway, rather than a closed dollhouse.
  box(16,12,868,12,118,"#6f617c","#443a59","#342b47");
  box(12,24,12,473,84,"#6a5e78","#43374e","#322a44");
  for(let x=40;x<875;x+=26) wire([{x,y:25,z:4},{x,y:25,z:94}],"rgba(183,158,187,.16)",.6);
  for(let z=6;z<100;z+=18) wire([{x:25,y:25,z},{x:875,y:25,z}],"rgba(183,158,187,.16)",.6);
  box(30,23,842,5,5,"#bdaea8","#817186","#685e72",16);
  // Back-wall glazing with asymmetric frames and a little street light.
  for(let i=0;i<3;i++) {
    const x=[278,535,638][i];
    face([{x,y:26,z:40},{x:x+92,y:26,z:40},{x:x+92,y:26,z:106},{x,y:26,z:106}],"#191a38","#74667c",1.5);
    face([{x:x+3,y:27,z:43},{x:x+44,y:27,z:43},{x:x+81,y:27,z:103},{x:x+56,y:27,z:103}],"rgba(99,143,170,.15)",null);
    wire([{x:x+46,y:27,z:41},{x:x+46,y:27,z:105}],"#6b6078",1);
    for(let j=0;j<9;j++) {
      const t=reducedMotion?j/9:((elapsed*.00015+j/9+i*.22)%1);
      const rx=x+8+j*9;
      wire([{x:rx,y:28,z:104-t*55},{x:rx-1,y:28,z:99-t*55}],"rgba(158,182,202,.30)",.7);
    }
  }
  // A wall clock, a handwritten shop notice and hanging cables.
  const clockPoint=attractors.find(item=>item.id==="clock");
  ellipseWorld({...clockPoint,z:85},17,17,"#e7d1a1","#a98b9b","front",0,2);
  wire([{...clockPoint,z:85},{x:clockPoint.x,y:clockPoint.y,z:96}],"#493a58",1.4);
  wire([{...clockPoint,z:85},{x:clockPoint.x-9,y:clockPoint.y,z:81}],"#493a58",1.2);
  box(204,61,28,20,3,"#44364f","#27233b","#312742",20);
  groundRect(210,65,13,13,"#b788bb",23.5,"#d7a4db");
  lampGlow({x:220,y:73,z:22},34,colors.violet,.18);
  face([{x:63,y:27,z:36},{x:119,y:27,z:36},{x:118,y:27,z:95},{x:63,y:27,z:95}],"#d5c29e",null);
  labelAt("おしらせ",{x:69,y:28,z:82},"#5e4861",10);
  for(let i=0;i<4;i++) wire([{x:69,y:28,z:70-i*7},{x:108-i%2*12,y:28,z:70-i*7}],"#9d8292",.8);
  face([{x:784,y:27,z:43},{x:841,y:27,z:43},{x:841,y:27,z:97},{x:784,y:27,z:97}],"#8b727a","#b19399",.8);
  labelAt("24 時間",{x:790,y:28,z:80},"#e4c99f",11);
  labelAt("100 円",{x:793,y:28,z:61},"#e4c99f",10);
  // Two exposed water lines and warm brass collars on the rear wall.
  for(const z of [25,31])wire([{x:34,y:29,z},{x:870,y:29,z}],"rgba(181,141,142,.4)",1.2);
  wire([{x:146,y:36,z:112},{x:265,y:36,z:112}],"#b39baa",.8);
  for(let i=0;i<4;i++){
    const x=158+i*27,z=103-(i%2)*7,sway=reducedMotion?0:Math.sin(elapsed*.0006+i)*1.3;
    wire([{x,y:36,z:112},{x,y:36,z:z+5}],"#b39baa",.7);
    face([{x:x-11,y:37,z},{x:x-4,y:37,z:z+4},{x:x+4,y:37,z:z+4},{x:x+11,y:37,z},{x:x+14,y:37,z:z-11},{x:x+8,y:37,z:z-14},{x:x+7+sway,y:37,z:z-36},{x:x-8+sway,y:37,z:z-36},{x:x-8,y:37,z:z-13},{x:x-14,y:37,z:z-10}],garmentColors[i],"rgba(255,235,216,.20)",.6);
    wire([{x,y:38,z:z-4},{x:x+sway,y:38,z:z-32}],"rgba(255,231,217,.25)",.7);
  }
  groundRect(474,454,78,28,"#6d647b",.4,"#9b899b");
  for(let i=0;i<6;i++)wire([{x:480+i*12,y:456,z:1},{x:480+i*12,y:479,z:1}],"#80788d",.7);
  if(lightsOn){
    wire([{x:30,y:28,z:111},{x:875,y:28,z:111}],"rgba(99,197,197,.55)",1.4);
    lampGlow({x:815,y:175,z:6},140,colors.cyan,.09);
  }
  if(lightsOn) {
    [210,455,690].forEach((x,i)=>{
      lampGlow({x,y:175,z:0},165,"#e4c3a9",.13);
      wire([{x,y:150,z:122},{x,y:150,z:150}],"#5d526d",1);
      box(x-44,142,88,9,5,"#d7d3c4","#aaa5ac","#8c8595",118);
      wire([{x:x-39,y:152,z:118},{x:x+39,y:152,z:118}],i===1&&Math.sin(elapsed*.012)>.998?"#8a7788":"#f8e4be",3);
    });
  }
  if(neonOn) {
    lampGlow({x:710,y:470,z:0},180,colors.red,.11);
    for(let i=0;i<5;i++) groundRect(620+i*11,500,5,62,rgba(colors.red,.07),-18,null);
  }
  if(hoveredFloor&&!pointBlocked(hoveredFloor)&&!walking) {
    ellipseWorld(hoveredFloor,13,13,"rgba(255,237,186,.08)","rgba(255,237,186,.32)");
  }
}

function machineModel(rect,index) {
  const isDry=rect.kind==="dryer",color=isDry?colors.cyan:colors.blue,active=activeMachines.has(index);
  const h=isDry?74:60;
  const blocked=proximity.machine.some(item=>item.index===index||item.machine===rect);
  const adj=placement.adjacent.some(item=>item.machine===rect);
  // Cast shadow, chipped enamel lid, pressed-metal casing.
  groundRect(rect.x+9,rect.y+8,rect.w+4,rect.h+7,"rgba(9,7,23,.30)",.2,null);
  box(rect.x,rect.y,rect.w,rect.h,h,isDry?"#83969f":"#aaa2b4",isDry?"#405768":"#68647c",isDry?"#526478":"#79768e");
  groundRect(rect.x+3,rect.y+3,rect.w-6,rect.h-6,isDry?"#98a6a5":"#b9afbd",h+.2,"rgba(255,247,217,.3)");
  // Doors lie on the aisle-facing vertical plane, keeping the plan footprint exact.
  const side=rect.x<450?rect.x+rect.w+.3:rect.x-.3;
  const center={x:side,y:rect.y+rect.h*.51,z:h*.43};
  ellipseWorld(center,rect.h*.38,h*.32,"#21233d",blocked?colors.red:adj?colors.green:"#b0acbd","side",0,2);
  ellipseWorld(center,rect.h*.30,h*.255,active?"#2a3e57":"#28293e",active?color:"#645f7d","side",0,1);
  if(adj&&!active){
    const direction=rect.x<450?1:-1;
    const hinge={x:side,y:center.y-rect.h*.38,z:center.z};
    const openCenter={x:side+direction*rect.h*.35,y:hinge.y,z:center.z};
    ellipseWorld(openCenter,rect.h*.35,h*.32,"rgba(116,216,155,.1)","#adc2b6","front",0,1.7);
    wire([{...hinge,z:center.z+h*.28},{x:openCenter.x,y:hinge.y,z:center.z+h*.28}],"#adc2b6",1);
    wire([{...hinge,z:center.z-h*.28},{x:openCenter.x,y:hinge.y,z:center.z-h*.28}],"#adc2b6",1);
  }
  for(let k=0;k<3;k++) {
    const theta=(active?elapsed*.002:0)+k*2.09+index;
    const a={x:side+(rect.x<450?.3:-.3),y:center.y+Math.cos(theta)*rect.h*.17,z:center.z+Math.sin(theta)*h*.14};
    ellipseWorld(a,rect.h*.10,h*.10,rgba(garmentColors[(index+k)%4],active?.9:.42),null,"side");
  }
  wire([{x:side,y:center.y-rect.h*.25,z:center.z+h*.12},{x:side,y:center.y-rect.h*.05,z:center.z+h*.24}],"rgba(220,235,244,.45)",1);
  const controlX=rect.x+(rect.x<450?rect.w-1:1);
  face([{x:controlX,y:rect.y+4,z:h-5},{x:controlX,y:rect.y+rect.h-4,z:h-5},{x:controlX,y:rect.y+rect.h-4,z:h-16},{x:controlX,y:rect.y+4,z:h-16}],"#29263f",null);
  const status=blocked?colors.red:adj&&!active?colors.green:active?colors.yellow:"#a091a3";
  wire([{x:controlX,y:rect.y+9,z:h-10},{x:controlX,y:rect.y+15,z:h-10}],status,2.2);
  ellipseWorld({x:controlX,y:rect.y+rect.h-9,z:h-10},3,3,"#b1a7b7","#d4c5c1","side",0,.6);
  for(const y of [rect.y+3,rect.y+rect.h-3]){
    wire([{x:controlX,y,z:4},{x:controlX,y:y+2,z:6}],"rgba(229,218,216,.45)",.6);
  }
  wire([{x:rect.x+5,y:rect.y+4,z:h+1},{x:rect.x+rect.w-5,y:rect.y+4,z:h+1}],"rgba(255,246,221,.3)",.6);
  labelAt(rect.label,{x:rect.x+8,y:rect.y+rect.h*.64,z:h+1},"#352b46",Math.max(7,9*projectionInfo().scale));
  if(active) {
    lampGlow({x:side+(rect.x<450?17:-17),y:center.y,z:0},45,color,.12);
    for(let k=0;k<3;k++) groundRect(side+(rect.x<450?5:-25),rect.y+9+k*9,20,2,rgba(color,.12),1,null);
    const angle=elapsed*.0015+index;
    const reflection=Array.from({length:13},(_,i)=>{const t=-.6+i*.1;return {x:side,y:center.y+Math.cos(t+angle)*rect.h*.28,z:center.z+Math.sin(t+angle)*h*.24};});
    wire(reflection,rgba(color,.65),1.6);
  }
  if(adj) {
    wire([{x:side,y:rect.y,z:2},{x:side,y:rect.y+rect.h,z:2}],status,3);
    labelAt(active?"LOCKED":"DOOR OPEN",{x:side+(rect.x<450?15:-15),y:rect.y+rect.h/2,z:7},status,8,rect.x<450?"left":"right");
  }
}

function furnitureModel(rect,index) {
  if(rect.kind==="washer"||rect.kind==="dryer") { machineModel(rect,index);return; }
  const {x,y,w,h}=rect;
  groundRect(x+8,y+9,w,h,"rgba(8,7,24,.25)",.1,null);
  if(rect.kind==="table") {
    [[5,5],[w-10,5],[5,h-10],[w-10,h-10]].forEach(([dx,dy])=>box(x+dx,y+dy,5,5,37,"#8a818e","#65596d","#494459"));
    box(x,y,w,h,5,"#b7a7b1","#806d87","#766981",37);
    for(let i=0;i<3;i++) {
      const lx=x+20+i*(w-45)/3;
      for(let k=0;k<2+i%2;k++) box(lx,y+12,28,24,2.6,garmentColors[(i+index)%4],"#7d667e","#62596e",42+k*3);
      wire([{x:lx+5,y:y+14,z:48},{x:lx+5,y:y+32,z:48}],"rgba(255,243,217,.25)",.7);
    }
    labelAt(rect.label,{x:x+w-53,y:y+h-6,z:43},"#4c3b57",9);
    if(index===14){
      box(x+w-24,y+8,9,11,15,"#dec8b0","#9b929c","#898194",42);
      box(x+w-22,y+10,5,7,3,"#6c8d89","#6c8d89","#526d70",57);
      wire([{x:x+w-20,y:y+7,z:46},{x:x+w-20,y:y+7,z:53}],"#759797",1.2);
    }
  } else if(rect.kind==="bench") {
    box(x+9,y+4,9,h-4,18,"#71647b","#514159","#3a3249");
    box(x+w-18,y+4,9,h-4,18,"#71647b","#514159","#3a3249");
    for(let i=0;i<3;i++)box(x,y+i*12,w,10,5,"#a37d87","#805e70","#634b62",18);
    box(x-6,y+h-9,32,14,27,"#88748d","#66536f","#554660",23);
  } else if(rect.kind==="room") {
    box(x,y,w,h,90,"#55495f","#3e344f","#302940");
    face([{x:x+20,y:y+h+.2,z:0},{x:x+75,y:y+h+.2,z:0},{x:x+75,y:y+h+.2,z:70},{x:x+20,y:y+h+.2,z:70}],"#29253b","#796b86",1.5);
    labelAt("STAFF",{x:x+30,y:y+h+1,z:54},"#ad98b4",9);
    labelAt("休憩中",{x:x+29,y:y+h+1,z:37},"#ad98b4",10);
    box(x+86,y+h,4,3,4,"#d8b698","#d8b698","#d8b698",35);
    // Folded cloth and a little plant soften the service-room roof.
    box(x+12,y+20,36,24,8,"#9e8a99","#74657b","#64556c",90);
    box(x+85,y+75,20,20,22,"#c48c8c","#9c687d","#815b72",90);
    [[0,0,30],[-8,2,25],[8,-2,22]].forEach(([dx,dy,dz])=>wire([{x:x+95,y:y+85,z:112},{x:x+95+dx,y:y+85+dy,z:112+dz}],"#78988b",3));
  } else if(rect.kind==="cart") {
    [[4,4],[w-8,4],[4,h-8],[w-8,h-8]].forEach(([dx,dy])=>ellipseWorld({x:x+dx,y:y+dy,z:4},4,5,"#15152a","#6c627c","front"));
    box(x,y,w,h,27,"#736b88","#4a4562","#514f6d",9);
    groundRect(x+4,y+4,w-8,h-8,"#3e3653",37,null);
    for(let i=0;i<4;i++)wire([{x:x+4+i*(w-8)/3,y:y+h,z:10},{x:x+4+i*(w-8)/3,y:y+h,z:35}],"#a49ab0",.7);
    for(let i=0;i<3;i++) ellipseWorld({x:x+w/2+(i-1)*8,y:y+h/2+i*5,z:38},w*.3,8,garmentColors[(i+index)%4],null);
    wire([{x:x+4,y,z:35},{x:x+4,y:y-8,z:48},{x:x+w-4,y:y-8,z:48},{x:x+w-4,y,z:35}],"#ab9bb7",1.5);
  } else if(rect.kind==="vending") {
    box(x,y,w,h,94,"#ca849a","#814c76","#5b3d63");
    face([{x:x+8,y:y+h+.5,z:30},{x:x+w-8,y:y+h+.5,z:30},{x:x+w-8,y:y+h+.5,z:80},{x:x+8,y:y+h+.5,z:80}],"#d9c0b3","#e6c5bb");
    for(let i=0;i<3;i++)for(let j=0;j<2;j++)box(x+13+i*17,y+h,10,2,12,garmentColors[(i+j)%4],"#c9b3b9","#a18a9f",35+j*22);
    labelAt("SOAP",{x:x+12,y:y+h+1,z:86},"#fff0cf",11);
    face([{x:x+16,y:y+h+1,z:9},{x:x+w-16,y:y+h+1,z:9},{x:x+w-16,y:y+h+1,z:20},{x:x+16,y:y+h+1,z:20}],"#26243c",null);
    lampGlow({x:x+w/2,y:y+h+20,z:0},80,colors.red,.09);
  }
}

function personModel(person,index) {
  const p=screen(person),s=projectionInfo().scale;
  const selected=document.querySelector("#select-a").value===`occupant:${person.id}`;
  const second=document.querySelector("#select-b").value===`occupant:${person.id}`;
  const color=selected?colors.red:second?colors.blue:garmentColors[index%4];
  const trip=walking?.person===person?walking:roomWalks.get(person.id);
  const moving=!!trip&&!trip.yielding;
  const seated=person.seated&&!trip&&distance(person,{x:person.homeX,y:person.homeY})<25;
  const gesture=reducedMotion?0:Math.sin(elapsed*.0016+person.phase);
  ellipseWorld({...person,z:.5},seated?16:12,7,"rgba(7,6,22,.45)",selected?colors.red:second?colors.blue:null);
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(s,s);
  const walk=moving?Math.sin(elapsed*.010+person.phase)*5:gesture*.35;
  const bob=moving&&!reducedMotion?Math.abs(Math.sin(elapsed*.010+person.phase))*.9:0;
  ctx.translate(0,-bob);
  // Small cut-paper silhouettes. Feet stay at their actual ground coordinates.
  ctx.strokeStyle="#2a263b";ctx.lineWidth=4.5;ctx.lineCap="round";
  ctx.beginPath();
  if(seated){ctx.moveTo(-4,-14);ctx.lineTo(-9,-7);ctx.lineTo(-11,1);ctx.moveTo(4,-14);ctx.lineTo(9,-7);ctx.lineTo(11,1);}
  else{ctx.moveTo(-4,-15);ctx.lineTo(-5+walk,0);ctx.moveTo(4,-15);ctx.lineTo(5-walk,0);}
  ctx.stroke();
  ctx.fillStyle="#15172b";ctx.fillRect(-8+walk,0,7,2);ctx.fillRect(2-walk,0,7,2);
  const lift=seated?6:0;ctx.translate(0,lift);
  if(person.backpack){ctx.fillStyle="#56546f";ctx.fillRect(4,-35,10,19);ctx.strokeStyle="#aaa1a9";ctx.lineWidth=1;ctx.strokeRect(6,-32,6,12);}
  ctx.fillStyle=person.coat;
  ctx.beginPath();ctx.moveTo(-8,-35);ctx.quadraticCurveTo(0,-40,8,-35);ctx.lineTo(person.hood?12:10,-14);ctx.quadraticCurveTo(0,-10,person.hood?-12:-10,-14);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(245,227,202,.26)";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,-33);ctx.lineTo(0,-15);ctx.stroke();
  const occupiedHands=!!person.prop&&!moving;
  ctx.strokeStyle=person.coat;ctx.lineWidth=4.5;ctx.beginPath();ctx.moveTo(-7,-32);ctx.lineTo(occupiedHands?-7:-12,occupiedHands?-22+gesture:-18+walk*.6);ctx.moveTo(7,-32);ctx.lineTo(occupiedHands?7:13,occupiedHands?-22+gesture:-20-walk*.6);ctx.stroke();
  const nod=person.task==="dozing"?4+gesture:0;
  if(person.hood){ctx.fillStyle="#b79858";ctx.beginPath();ctx.ellipse(0,-42,9,10,0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle=index===4||index===7?"#cda991":"#e2bdaa";ctx.beginPath();ctx.ellipse(nod*.4,-42+nod,6,7.5,nod*.04,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=person.hair;ctx.beginPath();ctx.ellipse(-1,-47+nod,6.5,4.5,-.2,0,Math.PI*2);ctx.fill();
  if(person.longHair){ctx.fillRect(-7,-46,4,15);ctx.fillRect(4,-46,3,12);}
  if(person.apron){ctx.fillStyle="#d2c6aa";ctx.fillRect(-6,-27,12,13);ctx.strokeStyle="#8c9293";ctx.lineWidth=1;ctx.strokeRect(-3,-23,6,5);}
  if(person.scarf){ctx.fillStyle="#bc647d";ctx.fillRect(-8,-36,16,4);ctx.fillRect(4,-34,4,15);}
  const propY=gesture*.8;
  if(person.prop==="basket"){
    ctx.fillStyle="#c6af99";ctx.fillRect(-13,-23+propY,26,13);ctx.strokeStyle="#77637d";ctx.lineWidth=1;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-10+i*5,-21+propY);ctx.lineTo(-10+i*5,-12+propY);ctx.stroke();}
    ctx.fillStyle="#a18bad";ctx.fillRect(-8,-27+propY,13,5);ctx.fillStyle="#799c9d";ctx.fillRect(2,-25+propY,9,3);
  }
  if(person.prop==="cloth"){ctx.fillStyle="#9e8bac";ctx.fillRect(-11,-23+propY,22,7);ctx.strokeStyle="#cebac6";ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-8,-20+propY);ctx.lineTo(8,-20+propY);ctx.stroke();}
  if(person.prop==="phone"){ctx.fillStyle="#29253c";ctx.fillRect(5,-27+propY,6,10);ctx.fillStyle="#b0b8d8";ctx.fillRect(6,-26+propY,4,7);}
  if(person.prop==="book"){
    ctx.fillStyle="#dfcda4";ctx.beginPath();ctx.moveTo(-13,-26);ctx.lineTo(0,-23);ctx.lineTo(13,-26);ctx.lineTo(12,-16);ctx.lineTo(0,-13);ctx.lineTo(-12,-16);ctx.closePath();ctx.fill();ctx.strokeStyle="#a28d91";ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(0,-14);ctx.stroke();
  }
  if(person.prop==="bag"){ctx.fillStyle="#93828f";ctx.fillRect(10,-16,12,16);ctx.strokeStyle="#c8aeb4";ctx.lineWidth=1;ctx.beginPath();ctx.arc(16,-16,4,Math.PI,0);ctx.stroke();}
  if(person.prop==="umbrella"){
    ctx.strokeStyle="#b0a3ad";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(15,-30);ctx.lineTo(19,1);ctx.stroke();ctx.fillStyle="#596b86";ctx.beginPath();ctx.moveTo(16,-25);ctx.lineTo(24,-2);ctx.lineTo(16,-1);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function selectedMarkers() {
  const placed=[];
  [["#select-a","A",colors.red],["#select-b","B",colors.blue]].forEach(([selector,letter,color])=>{
    const ref=referent(document.querySelector(selector).value);if(!ref)return;
    const foot=screen(ref),top=screen({...ref,z:82});let x=top.x,y=top.y;
    if(placed.some(p=>Math.abs(p.x-x)<135&&Math.abs(p.y-y)<40)){x+=80;y-=36;}
    placed.push({x,y});
    ctx.save();ctx.strokeStyle=rgba(color,.45);ctx.lineWidth=.7;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(foot.x,foot.y-4);ctx.lineTo(x,y+18);ctx.stroke();ctx.setLineDash([]);
    ctx.shadowColor="#110d25";ctx.shadowBlur=6;
    ctx.fillStyle=color;ctx.font="italic 16px Georgia";ctx.textAlign="center";ctx.fillText(letter,x,y);
    ctx.font="500 11px Avenir Next Condensed, Arial";ctx.fillStyle="#e9d6bd";ctx.fillText(ref.name||ref.source?.name||"place",x,y+15);ctx.restore();
  });
}

function groundRelations() {
  if(fieldsVisible){drawIsovists();drawAttentionThreads();}
  if(placement.between.length) {
    groundRect(323,176,245,138,"rgba(255,210,92,.07)",1,"rgba(255,210,92,.5)");
    labelAt("BETWEEN",{x:445,y:301,z:2},colors.yellow,10,"center");
  }
  const drawnMembers=new Set();
  placement.among.filter(group=>{if(group.some(p=>drawnMembers.has(p.id)))return false;group.forEach(p=>drawnMembers.add(p.id));return true;}).forEach(group=>{
    const points=[...group].sort((a,b)=>Math.atan2(a.y-260,a.x-450)-Math.atan2(b.y-260,b.x-450));
    face(points.map(p=>({...p,z:2})),"rgba(192,120,207,.15)","rgba(192,120,207,.7)",1.3);
    const center={x:group.reduce((v,p)=>v+p.x,0)/3,y:group.reduce((v,p)=>v+p.y,0)/3};
    labelAt("AMONG",{...center,z:4},colors.violet,10,"center");
  });
  placement.adjacent.forEach(item=>{
    const edge={x:clamp(item.occupant.x,item.machine.x,item.machine.x+item.machine.w),y:clamp(item.occupant.y,item.machine.y,item.machine.y+item.machine.h)};
    wire([item.occupant,edge],colors.green,2);
    labelAt("ADJACENT",{x:item.occupant.x,y:item.occupant.y+20,z:2},colors.green,9,"center");
  });
  proximity.body.forEach(item=>{
    [item.a,item.b].forEach(p=>ellipseWorld({...p,z:1},PERSONAL_SPACE_METERS/METERS_PER_UNIT,PERSONAL_SPACE_METERS/METERS_PER_UNIT,"rgba(255,96,127,.025)","rgba(255,96,127,.28)"));
    wire([item.a,item.b],"rgba(255,96,127,.55)",1);
  });
  drawMovement();
  if(walking) {ctx.setLineDash([2,5]);wire([walking.person,...walking.path],"rgba(255,239,199,.38)",1);ctx.setLineDash([]);}
  const focus=document.querySelector("#select-a").value;
  for(const trip of roomWalks.values()) if(focus===`occupant:${trip.person.id}`){ctx.setLineDash([2,6]);wire([trip.person,...trip.path],"rgba(255,239,199,.25)",.8);ctx.setLineDash([]);}
}

drawPlan = function () {
  cameraAngle += (requestedAngle - cameraAngle) * (reducedMotion ? 1 : .09);
  if (memoryView) {
    drawMemoryScene(selectedMind());
    return;
  }
  if(planView){drawTileGrid();if(fieldsVisible){drawIsovists();drawAttentionThreads();}obstacles.forEach(drawObstacle);drawAttractors();drawMovement();drawOccupants();drawProximity();drawPlacement();return;}
  stageFloor();groundRelations();
  const objects=obstacles.map((rect,index)=>({depth:screen({x:rect.x+rect.w/2,y:rect.y+rect.h}).y,draw:()=>furnitureModel(rect,index)}));
  occupants.forEach((person,index)=>objects.push({depth:screen(person).y,draw:()=>personModel(person,index)}));
  objects.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
  // The canopy is drawn last, over the room, with the entrance deliberately open.
  const strip=[{x:36,y:497,z:3},{x:463,y:497,z:3},{x:463,y:497,z:15},{x:36,y:497,z:15}];
  face(strip,"#504158","#8f738a",.8);
  face([{x:553,y:497,z:3},{x:876,y:497,z:3},{x:876,y:497,z:15},{x:553,y:497,z:15}],"#504158","#8f738a",.8);
  if(!doorOpen)face([{x:475,y:496,z:0},{x:550,y:496,z:0},{x:550,y:496,z:80},{x:475,y:496,z:80}],"rgba(124,160,177,.18)","#a698b0",1.5);
  if(!lightsOn){ctx.fillStyle="rgba(13,11,34,.29)";ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);}
  selectedMarkers();
  ctx.save();ctx.fillStyle="#887593";ctx.font="italic 12px Georgia";ctx.fillText("the last wash",26,canvas.clientHeight-26);ctx.restore();
};

function sceneHitTest(sx,sy) {
  return occupants.map(item=>{
    const p=screen(item),s=projectionInfo().scale;
    const dx=sx-p.x,dy=sy-(p.y-(planView?0:25*s));
    return {item,d:Math.hypot(dx,dy*.55)};
  }).filter(hit=>hit.d<Math.max(18,22*projectionInfo().scale)).sort((a,b)=>a.d-b.d)[0]?.item;
}
function sceneMachineHitTest(sx,sy) {
  if(planView){const p=world(sx,sy);return obstacles.findIndex(item=>["washer","dryer"].includes(item.kind)&&pointInRect(p,item));}
  const hits=[];
  obstacles.forEach((item,index)=>{
    if(!["washer","dryer"].includes(item.kind))return;
    const h=item.kind==="dryer"?74:60;
    const points=[0,h].flatMap(z=>[{x:item.x,y:item.y,z},{x:item.x+item.w,y:item.y,z},{x:item.x+item.w,y:item.y+item.h,z},{x:item.x,y:item.y+item.h,z}].map(screen));
    // Convex projected outline; exact point-in-polygon avoids neighboring boxes.
    const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const lower=[],upper=[];
    for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    const hull=lower.slice(0,-1).concat(upper.slice(0,-1));let inside=false;
    for(let i=0,j=hull.length-1;i<hull.length;j=i++)if((hull[i].y>sy)!==(hull[j].y>sy)&&sx<(hull[j].x-hull[i].x)*(sy-hull[i].y)/(hull[j].y-hull[i].y)+hull[i].x)inside=!inside;
    if(inside)hits.push({index,depth:screen({x:item.x+item.w/2,y:item.y+item.h}).y});
  });
  return hits.sort((a,b)=>b.depth-a.depth)[0]?.index??-1;
}

// Grid routing uses the same obstacle footprints as ray casting and proximity.
function walkingPath(start,end) {
  if(pointBlocked(end))return null;
  const step=16,cols=Math.floor(900/step),rows=Math.floor(520/step);
  const at=(x,y)=>({x:x*step+step/2,y:y*step+step/2});
  const cell=p=>({x:clamp(Math.floor(p.x/step),2,cols-3),y:clamp(Math.floor(p.y/step),2,rows-3)});
  const a=cell(start),b=cell(end),key=(x,y)=>y*cols+x;
  const source=key(a.x,a.y),target=key(b.x,b.y);
  const open=[source],cost=new Map([[source,0]]),prev=new Map(),visited=new Set();
  const heuristic=k=>Math.hypot(k%cols-b.x,Math.floor(k/cols)-b.y);
  while(open.length){
    open.sort((u,v)=>(cost.get(u)+heuristic(u))-(cost.get(v)+heuristic(v)));
    const k=open.shift();if(visited.has(k))continue;visited.add(k);
    if(k===target){const result=[end];let cursor=k;while(cursor!==source){result.unshift(at(cursor%cols,Math.floor(cursor/cols)));cursor=prev.get(cursor);if(cursor===undefined)return null;}
      if(segmentBlocked(start,result[0]))return null;
      return result;
    }
    const x=k%cols,y=Math.floor(k/cols),p=k===source?start:at(x,y);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=x+dx,ny=y+dy;if(nx<2||ny<2||nx>=cols-2||ny>=rows-2)continue;
      const n=key(nx,ny),q=at(nx,ny);
      if(pointBlocked(q)||segmentBlocked(p,q))continue;
      const next=cost.get(k)+Math.hypot(dx,dy);
      if(next<(cost.get(n)??Infinity)){cost.set(n,next);prev.set(n,k);open.push(n);}
    }
  }
  return null;
}
function walkTo(point) {
  const ref=referent(document.querySelector("#select-a").value);
  if(ref?.type!=="occupant"){note("choose a person as A before asking them to walk");return;}
  const person=ref.source,path=walkingPath(person,point);
  if(!path){note("that tile is behind a solid object. Try the open aisle");return;}
  holdPerson(person);person.activity="walking";
  walking={person,path,points:[{x:person.x,y:person.y}],reference:nearestMovementReference(person)};
  note(`${person.name} is walking`);
}
function resetRoomRoutines(){
  roomWalks.clear();routineMemory.clear();
  occupants.forEach(person=>{person.activity=person.task;person.manualUntil=0;});
  Object.entries(roomRoutines).forEach(([id,config])=>routineMemory.set(id,{next:config.delay,index:0}));
  syncRoomRegister();
}
function holdPerson(person){
  roomWalks.delete(person.id);person.manualUntil=elapsed+45000;person.activity="waiting for you";
}
function syncRoomRegister(){
  const selected=document.querySelector("#select-a").value;
  document.querySelectorAll("#attention-register [data-person]").forEach(button=>{
    const person=occupants.find(p=>p.id===button.dataset.person);if(!person)return;
    const activity=button.querySelector(".person-activity");if(activity&&activity.textContent!==person.activity)activity.textContent=person.activity;
    button.title=`${person.name}: ${person.activity}`;
    button.classList.toggle("selected-person",selected===`occupant:${person.id}`);button.setAttribute("aria-pressed",String(selected===`occupant:${person.id}`));
  });
}
let lastRoomRegister=0;
function advancePerson(trip,dt,manual=false){
  const {person,path,points}=trip;
  if(!path.length)return true;
  const target=path[0],d=distance(person,target),travel=Math.min(d,dt*(manual ? .075 : trip.speed));
  const next=d<.001?{...target}:{x:person.x+(target.x-person.x)/d*travel,y:person.y+(target.y-person.y)/d*travel};
  // A short local wait avoids figure overlap; personal-space warnings still use 1.2 m.
  const obstructing=occupants.find(other=>other!==person&&distance(next,other)<22&&distance(next,other)<distance(person,other));
  if(obstructing){
    trip.yielding=true;person.activity="letting someone pass";trip.waited=(trip.waited||0)+dt;
    if(!manual&&trip.waited>4200)return true;
    if(manual&&trip.waited>7000){note(`${person.name} is waiting for a clear tile. Choose another tile to continue`);return true;}
    return false;
  }
  if(pointBlocked(next)||segmentBlocked(person,next)){path.length=0;return true;}
  trip.yielding=false;trip.waited=0;person.activity="walking";
  person.x=next.x;person.y=next.y;person.baseX=next.x;person.baseY=next.y;
  if(d<=travel+.001)path.shift();
  if(distance(person,points.at(-1))>4)points.push({x:person.x,y:person.y});
  return !path.length;
}
updateOccupants=function(dt){
  if(walking){
    const trip=walking;
    if(advancePerson(trip,dt,true)){
      trip.points.push({x:trip.person.x,y:trip.person.y});const result=finishMovement(trip.person,trip.points,trip.reference);walking=null;trip.person.activity="waiting here";trip.person.manualUntil=elapsed+45000;
      updateComparison(true);if(result)note(`${trip.person.name} moved ${result.kind.toLowerCase()} ${result.target.toLowerCase()}`);
    }
  }
  for(const [id,config] of Object.entries(roomRoutines)){
    const person=occupants.find(p=>p.id===id),memory=routineMemory.get(id);
    if(!memory||draggedOccupant===person||walking?.person===person||elapsed<person.manualUntil)continue;
    const trip=roomWalks.get(id);
    if(trip){
      if(advancePerson(trip,dt)){
        trip.points.push({x:person.x,y:person.y});
        const selected=document.querySelector("#select-a").value===`occupant:${id}`;
        if(selected)finishMovement(person,trip.points,trip.reference);
        person.activity=distance(person,trip.stop)<20?trip.stop.task:"waiting for space";
        roomWalks.delete(id);memory.next=elapsed+trip.stop.wait;memory.index=(memory.index+1)%config.stops.length;
      }
    }else if(elapsed>=memory.next){
      const stop=config.stops[memory.index],path=walkingPath(person,stop);
      if(path)roomWalks.set(id,{person,path,points:[{x:person.x,y:person.y}],reference:nearestMovementReference(person),stop,speed:config.speed});
      else{memory.next=elapsed+8000;memory.index=(memory.index+1)%config.stops.length;}
    }
  }
  if(elapsed-lastRoomRegister>400){syncRoomRegister();lastRoomRegister=elapsed;}
};
resetRoomRoutines();

document.querySelector("#walk-aisle").addEventListener("click",()=>walkTo({x:445,y:246}));
for (const mode of ["room", "memory", "plan"]) {
  const id = mode === "room" ? "scene" : mode;
  document.querySelector(`#${id}-view`).addEventListener("click", () => setView(mode));
}
function setView(mode) {
  planView = mode === "plan";
  memoryView = mode === "memory";
  memoryProjection = null;
  document.querySelector(".scene-area").dataset.view = mode;
  for (const [id, view] of [["scene", "room"], ["plan", "plan"], ["memory", "memory"]]) {
    const button = document.querySelector(`#${id}-view`);
    button.classList.toggle("selected", view === mode);
    button.setAttribute("aria-pressed", String(view === mode));
  }
  document.querySelector("#show-fields").disabled = memoryView;
  document.querySelector("#shared-traces").disabled = memoryView;
  document.querySelector("#agent-vision").textContent = memoryView ? "view direction" : "view cone";
  canvas.setAttribute("aria-label", memoryView
    ? "Selected person's memory. Choose a person in the list below."
    : "Interactive laundromat. Select or drag a person, or click a floor tile to walk.");
}
document.querySelector("#show-fields").addEventListener("click",event=>{fieldsVisible=!fieldsVisible;event.currentTarget.classList.toggle("selected",fieldsVisible);event.currentTarget.setAttribute("aria-pressed",String(fieldsVisible));});
document.querySelector("#camera-left").addEventListener("click",()=>{requestedAngle=clamp(requestedAngle-.14,-.62,.08);});
document.querySelector("#camera-right").addEventListener("click",()=>{requestedAngle=clamp(requestedAngle+.14,-.62,.08);});
document.querySelector("#camera-closer").addEventListener("click",()=>{cameraZoom=clamp(cameraZoom+.08,.84,1.16);});
document.querySelector("#camera-farther").addEventListener("click",()=>{cameraZoom=clamp(cameraZoom-.08,.84,1.16);});
document.querySelector("#reset").addEventListener("click",()=>{walking=null;requestedAngle=-.22;cameraZoom=1;lastRoomRegister=0;resetRoomRoutines();});
document.querySelector("#attention-register").addEventListener("click",syncRoomRegister);
document.querySelector("#select-a").addEventListener("change",syncRoomRegister);
canvas.addEventListener("pointermove",event=>{const r=canvas.getBoundingClientRect();hoveredFloor=world(event.clientX-r.left,event.clientY-r.top);});
canvas.addEventListener("pointerleave",()=>{hoveredFloor=null;});
canvas.addEventListener("keydown",event=>{
  if (memoryView) return;
  const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];if(!delta)return;
  event.preventDefault();const p=referent(document.querySelector("#select-a").value);if(p?.source)walkTo({x:clamp(p.x+delta[0],32,868),y:clamp(p.y+delta[1],32,488)});
});
