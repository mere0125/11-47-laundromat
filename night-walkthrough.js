import * as THREE from './vendor/three.module.min.js';
import {buildStreet} from './street-model.js?v=20261114-night';
import {buildAtmosphere, makeScan} from './night-atmosphere.js?v=20261114-night';
import {buildPeople} from './night-people.js?v=20261114-night';
import {makeNightSound} from './night-sound.js?v=20261114-night';

const stage = document.querySelector('#night-walkthrough');
const surface = document.querySelector('#night-lens');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

try {
  const renderer = new THREE.WebGLRenderer({canvas:surface,antialias:true,powerPreference:'high-performance',alpha:false});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.11;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount(renderer);
} catch (error) {
  stage.hidden = true;
  console.warn('The 3D scene could not start. The illustrated entrance is available.',error);
}

function mount(renderer) {
  const find = id => document.getElementById(id);
  const canvasScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43,1,.075,104);
  const sceneStreet = buildStreet(THREE,canvasScene);
  const scale = {x:15.2 / WORLD.w,z:9 / WORLD.h};
  const world = (x,y) => ({x:(x-WORLD.w/2)*scale.x,z:-3.9+y*scale.z});
  const room = LaundryModel.buildLaundry(THREE,canvasScene,{
    width:WORLD.w,height:WORLD.h,obstacles,machines:laundryMachines,zones,world,scale
  });
  const people = buildPeople(THREE,canvasScene,occupants,world);
  const atmosphere = buildAtmosphere(THREE,canvasScene);
  for (const fixture of room.group.children) {
    if (fixture.userData.obstacleIndex == null) continue;
    for (const child of fixture.children) {
      if (child.isInstancedMesh) child.castShadow=true;
    }
  }
  for (const {actor} of people.actors.values()) {
    for (const part of actor.children) {
      if (part.isMesh) part.castShadow=true;
    }
  }
  const audio = makeNightSound();
  const entry = find('opening');
  const planLink = find('watch-plan');
  const doorCenter = sceneStreet.doorPivot.position.x + .84;
  const modes = {street:find('street-caption'),shop:find('shop-caption')};
  const viewpoint = find('night-viewpoint');
  const stageText = find('lens-help');
  const follow = find('watch-attendant');
  const loadButton = find('walk-door');
  const scanButton = find('watch-scan');
  const soundButton = find('night-audio');
  const backButton = find('return-to-walkthrough');
  const repair = find('walker-repair');
  const shift = find('walker-shift');
  let mode = 'street';
  let audioOn = false;
  let scan = null;
  let scanning = false;
  let stageInFront = true;
  let studioReturn = false;
  let picked = null;
  let shot = 'door';
  let turn = -.32, orbit = turn, raised = 2.05, range = 1, manual = false;
  let turnFrom = 0, motionStart = 0, motionDuration = 0;
  let yaw = -.46, pitch = -.065;
  let lampLast, last = 0, lastText = 0, openAngle = 0, dragging = null;
  const shopPoint = new THREE.Vector3(doorCenter,1.66,3.58);
  const transitionFrom = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desiredP = new THREE.Vector3(), desiredL = new THREE.Vector3();
  const tracked = new THREE.Vector3();
  const angleGap = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const smoother = k => k*k*k*(k*(k*6-15)+10);
  const eased = (v,a,b) => smoother(Math.min(1,Math.max(0,(v-a)/(b-a))));

  function size() {
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, width < 780 ? 1.25 : 1.4));
    renderer.setSize(width,height,false);
    camera.aspect = width/height;
    camera.fov = mode === 'shop' ? (camera.aspect < .77 ? 74 : 54) : (camera.aspect < .77 ? 65 : 43);
    camera.updateProjectionMatrix();
  }
  const sizeObserver = new ResizeObserver(size);
  sizeObserver.observe(stage);

  function announceMode(next) {
    mode = next;
    const indoor = next === 'shop';
    stage.dataset.place = next;
    modes.street.hidden = next !== 'street';
    modes.shop.hidden = !indoor;
    viewpoint.hidden = !indoor;
    stageText.textContent = indoor ? 'Drag to look around' : 'Drag to turn the street';
    surface.setAttribute('aria-label', indoor
      ? 'Live view inside the laundromat. Drag or use the arrow keys to turn. Click a person to watch them.'
      : 'Three-dimensional laundromat at night. Drag or use the arrow keys to rotate all the way around.');
    scanButton.disabled = next === 'entering' || next === 'leaving';
    size();
  }

  function renderStage(visible) {
    stageInFront = visible;
    stage.hidden = !visible;
    roomPage.classList.toggle('walkthrough-underlay',visible);
    roomPage.inert = visible;
    if (visible) {
      document.body.classList.add('in-walkthrough');
      window.scrollTo({top:0,behavior:'instant'});
      size();
    } else {
      document.body.classList.remove('in-walkthrough');
    }
  }

  function outsideCamera(angle,position,target) {
    const front=Math.cos(angle);
    const radiusZ=19.4*range*(camera.aspect<.76 && front>0 ? 1+.49*front : 1);
    position.set(Math.sin(angle)*Math.min(22.6,22*range),2.55+raised,front*radiusZ+.65);
    target.set(0,1.7,.65);
  }

  function transition(entering) {
    if (mode !== (entering ? 'street' : 'shop')) return;
    toggleScan(false);
    dragging=null;
    turnFrom=orbit;
    transitionFrom.copy(camera.position);
    motionStart=performance.now();
    motionDuration=reduced.matches ? 0 : entering ? (Math.abs(angleGap(orbit,0))>.35?4600:3550) : 2100;
    if (entering) {
      picked=null;
      follow.setAttribute('aria-pressed','false');
      shot='door';
      announceMode('entering');
    } else {
      announceMode('leaving');
      audio.door();
      audio.scene('street');
    }
    // The camera takes a path through the actual opening. Outside silhouettes are otherwise blocked.
    if (motionDuration === 0) endTransition(entering);
  }

  function endTransition(inside) {
    announceMode(inside?'shop':'street');
    roomPage.hidden = !inside;
    audio.scene(inside?'shop':'street');
    if (inside) {
      openAngle=0;
      shopPoint.set(doorCenter,1.66,3.58);
      yaw=-.46;
      pitch=-.065;
      const nose=desiredL.set(-Math.sin(yaw),Math.sin(pitch),-Math.cos(yaw)).multiplyScalar(5).add(shopPoint);
      camera.position.copy(shopPoint);
      look.copy(nose);
      follow.focus({preventScroll:true});
    } else {
      turn=0;
      orbit=0;
      manual=true;
      outsideCamera(0,camera.position,look);
      loadButton.textContent='Back inside';
      find('street-story').textContent=window.laundromatHandover
        ? 'A note on the window waits for the morning shift.'
        : laundryMachines.get(10)?.fault ? 'Through the rain, one dryer light stays red.' : 'Dryer 03 is running again. The rain hasn’t let up.';
      loadButton.focus({preventScroll:true});
    }
  }

  function easeDoor(progress,opening) {
    const outside = new THREE.Vector3(), aimed = new THREE.Vector3();
    const hall = new THREE.Vector3(doorCenter,1.65,12.4);
    const threshold = new THREE.Vector3(doorCenter,1.65,6.15);
    const inward = new THREE.Vector3(doorCenter,1.66,4.45);
    const arrived = new THREE.Vector3(doorCenter,1.66,3.58);
    if (opening) {
      const angle = turnFrom+angleGap(turnFrom,0)*eased(progress,0,.31);
      outsideCamera(angle,outside,aimed);
      desiredP.copy(outside).lerp(hall,eased(progress,.17,.49));
      desiredP.lerp(threshold,eased(progress,.37,.72));
      desiredP.lerp(inward,eased(progress,.65,1));
      desiredP.lerp(arrived,eased(progress,.81,1));
      desiredL.copy(aimed).lerp(new THREE.Vector3(doorCenter,1.55,2.8),eased(progress,.08,.42));
      desiredL.lerp(new THREE.Vector3(3.33,1.34,-.08),eased(progress,.76,1));
      openAngle=1.34*eased(progress,.54,.76);
      if (progress>.56 && roomPage.hidden) {
        audio.door();
        roomPage.hidden=false;
      }
      if (progress>.74) audio.scene('shop');
    } else {
      outsideCamera(0,outside,aimed);
      desiredP.copy(transitionFrom).lerp(inward,eased(progress,0,.38));
      desiredP.lerp(threshold,eased(progress,.24,.55));
      desiredP.lerp(outside,eased(progress,.46,1));
      desiredL.set(doorCenter,1.64,8.0).lerp(aimed,eased(progress,.40,.7));
      openAngle=1.34*eased(progress,.10,.30)*(1-eased(progress,.62,.88));
    }
    camera.position.copy(desiredP);
    look.copy(desiredL);
  }

  function toggleScan(on) {
    if (on===scanning) return;
    scanning=on;
    if (on && !scan) {
      scan=makeScan(THREE,[room.group,sceneStreet.shell]);
      canvasScene.add(scan);
    }
    if (scan) scan.visible=on;
    canvasScene.background.set(on?'#060f1b':'#0d1b31');
    sceneStreet.group.visible=!on;
    room.group.visible=!on;
    people.group.visible=!on;
    scanButton.setAttribute('aria-pressed',String(on));
    scanButton.textContent=on?'Back to the scene':'Point cloud';
    stage.dataset.scan=String(on);
    find('scan-caption').hidden=!on;
  }

  function focusPerson(id) {
    picked=people.actors.get(id)?.person || null;
    shot='follow';
    follow.setAttribute('aria-pressed',String(id==='attendant'));
    if (picked) document.querySelector(`#attention-register [data-person="${id}"]`)?.click();
  }

  function openPlan() {
    if (mode!=='shop') return;
    toggleScan(false);
    renderStage(false);
    roomPage.hidden=false;
    backButton.hidden=false;
    document.querySelector('#plan-view').click();
    resize();
    updateNotebook(true);
    find('room-title').focus({preventScroll:true});
  }

  function openStudio() {
    if (mode!=='shop') return;
    toggleScan(false);
    window.openLayoutStudio();
  }

  function textIfChanged(node, value) {
    if (node.textContent !== value) node.textContent=value;
  }

  function updateLabels() {
    const attendant=minds.get('attendant');
    const dryer=laundryMachines.get(10);
    const observed=attendant?.landmarks.get('machine-10')?.status==='needs repair';
    const status=!dryer?.fault?'Back in service.':attendant?.phase==='servicing' && attendant.machine==='machine-10'?'The attendant is repairing it.':observed?'The attendant found the fault.':'The drum is still. The attendant hasn’t reached it yet.';
    textIfChanged(repair, status);
    if (picked) {
      textIfChanged(viewpoint,picked.id==='attendant'?'Following the night attendant':`Watching ${picked.name.replace(' folding','')}`);
    } else {
      textIfChanged(viewpoint,shot==='dryer'?'Across from Dryer 03':'Inside by the door');
    }
    const note=find('shift-plan-note');
    shift.hidden=note.hidden;
    if (!note.hidden) textIfChanged(shift,note.textContent);
  }

  function positionCamera(dt,seconds,frame) {
    if (mode==='entering' || mode==='leaving') {
      const entering=mode==='entering';
      const p=Math.min(1,(frame-motionStart)/motionDuration);
      easeDoor(p,entering);
      if (p>=1) endTransition(entering);
      return;
    }
    const glide = reduced.matches ? 1 : Math.min(1, dt*4);
    if (mode==='street') {
      const sway=manual || reduced.matches ? 0 : Math.sin(seconds*.35)*.05;
      orbit += angleGap(orbit,turn+sway)*glide;
      outsideCamera(orbit,desiredP,desiredL);
    } else {
      openAngle+=(Number(doorOpen)*.07-openAngle)*Math.min(1,dt*4);
      desiredP.copy(shopPoint);
      if (shot==='dryer') {
        desiredP.set(3.02,1.48,1.65);
        desiredL.set(6.32,1.17,-.076);
      } else if (picked) {
        const target=world(picked.x,picked.y);
        tracked.set(target.x,1.31,target.z);
        if (desiredP.distanceTo(tracked)>.72) desiredL.copy(tracked);
        else desiredL.copy(look);
      } else {
        desiredL.set(-Math.sin(yaw),Math.sin(pitch),-Math.cos(yaw)).multiplyScalar(5).add(desiredP);
      }
    }
    camera.position.lerp(desiredP,glide);
    look.lerp(desiredL,glide);
  }

  function draw(now) {
    requestAnimationFrame(draw);
    const dt=last ? Math.min(.07,(now-last)/1000) : 1/60;
    last=now;
    if (!stageInFront || document.hidden || surface.clientWidth < 1) return;
    const seconds=now/1000;
    positionCamera(dt,seconds,now);
    camera.lookAt(look);
    sceneStreet.doorPivot.rotation.y=openAngle;
    sceneStreet.repairNotice.visible=Boolean(laundryMachines.get(10)?.fault);
    sceneStreet.handoverNotice.visible=Boolean(window.laundromatHandover);
    if (lampLast!==lightsOn) {
      room.updateLighting(lightsOn);
      lampLast=lightsOn;
    }
    for (const [i,machine] of laundryMachines) room.updateMachine(i,machine,elapsed/1000);
    if (!scanning) {
      people.update(minds,reduced.matches?0:seconds,dt);
      for (const {actor} of people.actors.values()) {
        actor.visible=Math.hypot(actor.position.x-camera.position.x,actor.position.z-camera.position.z)>.64;
      }
    }
    if (scan?.visible) {
      scan.material.uniforms.sweep.value=reduced.matches ? 15 : -8+(seconds*2.1)%16;
      scan.material.uniforms.resolution.value=renderer.getPixelRatio();
    }
    atmosphere.update(seconds,mode!=='shop',scanning,lightsOn,!reduced.matches);
    renderer.render(canvasScene,camera);
    if (now-lastText>350 && mode==='shop') {
      updateLabels();
      lastText=now;
    }
  }

  function turnBy(dx,dy) {
    manual=true;
    if (mode==='street') {
      turn -= dx*.009;
      raised = Math.min(6.7,Math.max(.1,raised+dy*.026));
    } else {
      if (picked || shot==='dryer') {
        const direction=look.clone().sub(camera.position);
        yaw=Math.atan2(-direction.x,-direction.z);
        pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
      }
      picked=null;
      follow.setAttribute('aria-pressed','false');
      shot='door';
      yaw += dx*.008;
      pitch = Math.min(.78,Math.max(-.91,pitch+dy*.006));
    }
  }

  scanButton.addEventListener('click',()=>toggleScan(!scanning));
  loadButton.addEventListener('click',()=>transition(true));
  find('walk-out').addEventListener('click',()=>transition(false));
  find('watch-place').addEventListener('click',()=>{
    follow.setAttribute('aria-pressed','false');
    picked=null;
    shot='door';
    yaw=-.46;
    pitch=-.065;
  });
  follow.addEventListener('click',()=>focusPerson('attendant'));
  function lookAtDryer() {
    picked=null;
    follow.setAttribute('aria-pressed','false');
    shot='dryer';
  }
  find('watch-dryer').addEventListener('click',lookAtDryer);
  planLink.addEventListener('click',openPlan);
  find('watch-layouts').addEventListener('click',openStudio);
  backButton.addEventListener('click',()=>{
    if (mode==='street') {
      announceMode('shop');
      camera.position.copy(shopPoint);
    }
    renderStage(true);
    planLink.focus({preventScroll:true});
  });

  document.addEventListener('laundry:show-studio',()=>{
    studioReturn=stageInFront;
    if (studioReturn) renderStage(false);
    audio.scene('studio');
  });
  document.addEventListener('laundry:hide-studio',()=>{
    if (studioReturn) {
      renderStage(true);
      find('watch-layouts').focus({preventScroll:true});
    }
    audio.scene('shop');
    studioReturn=false;
  });

  soundButton.addEventListener('click',async ()=>{
    if (audioOn) {
      audio.disable();
      audioOn=false;
      soundButton.setAttribute('aria-pressed','false');
      soundButton.textContent='Sound off';
      return;
    }
    soundButton.disabled=true;
    audioOn=await audio.enable();
    soundButton.disabled=false;
    soundButton.setAttribute('aria-pressed',String(audioOn));
    soundButton.textContent=audioOn?'Sound on':'Sound unavailable';
  });

  surface.addEventListener('pointerdown',event=>{
    if (dragging || (mode!=='street' && mode!=='shop')) return;
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY,travel:0};
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove',event=>{
    if (dragging?.id!==event.pointerId) return;
    const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
    dragging.travel+=Math.hypot(dx,dy);
    dragging.x=event.clientX;
    dragging.y=event.clientY;
    if (dragging.travel>3) turnBy(dx,dy);
  });
  surface.addEventListener('pointerup',event=>{
    if (dragging?.id!==event.pointerId) return;
    const click=dragging.travel<5;
    dragging=null;
    if (!click || scanning || mode!=='shop') return;
    const rect=surface.getBoundingClientRect();
    const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const picker=new THREE.Raycaster();
    picker.setFromCamera(pointer,camera);
    const hit=picker.intersectObjects([people.group,room.group],true)[0];
    if (!hit) return;
    let node=hit.object;
    while(node && node.parent!==people.group) {
      if (node.userData.obstacleIndex===10) {
        lookAtDryer();
        return;
      }
      node=node.parent;
    }
    for (const [id,figure] of people.actors) if (figure.actor===node) focusPerson(id);
  });
  surface.addEventListener('lostpointercapture',()=>{dragging=null;});
  surface.addEventListener('wheel',event=>{
    if (mode!=='street') return;
    event.preventDefault();
    manual=true;
    range=Math.min(1.23,Math.max(.72,range+Math.sign(event.deltaY)*.045));
  },{passive:false});
  surface.addEventListener('keydown',event=>{
    const controls={ArrowLeft:[-25,0],ArrowRight:[25,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
    const delta=controls[event.key];
    if (!delta || (mode!=='street'&&mode!=='shop')) return;
    event.preventDefault();
    turnBy(...delta);
  });
  surface.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    renderStage(false);
    soundButton.hidden=true;
    backButton.hidden=true;
    find('step-outside').hidden=false;
    audio.dispose();
    if (mode==='street' || mode==='entering' || mode==='leaving') {
      roomPage.hidden=true;
      entry.hidden=false;
    } else {
      roomPage.hidden=false;
      resize();
    }
  },{once:true});

  announceMode('street');
  entry.hidden=true;
  find('step-outside').hidden=true;
  soundButton.hidden=false;
  renderStage(true);
  outsideCamera(orbit,camera.position,look);
  audio.scene('street');
  requestAnimationFrame(draw);
}
