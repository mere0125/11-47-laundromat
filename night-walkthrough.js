import * as THREE from './vendor/three.module.min.js';
import {buildStreet} from './street-model.js?v=20261119-play7';
import {buildAtmosphere,makeScan} from './night-atmosphere.js?v=20261119-play6';
import {buildPeople} from './night-people.js?v=20261119-play6';
import {makeNightSound} from './night-sound.js?v=20261119-play6';
import {makeFirstPerson} from './first-person.js?v=20261119-play6';
import {makeNightFilm,makeLaundryEnvironment} from './night-film.js?v=20261119-play6';
import {makeNightTales} from './night-tales.js?v=20261119-play8';

const stage=document.querySelector('#night-walkthrough');
const surface=document.querySelector('#night-lens');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');

try {
  const renderer=new THREE.WebGLRenderer({canvas:surface,antialias:true,powerPreference:'high-performance'});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.03;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  mount(renderer);
} catch(error) {
  stage.hidden=true;
  console.warn('The illustrated entrance is available while the 3D view is unavailable.',error);
}

function mount(renderer) {
  const find=id=>document.getElementById(id);
  const scene=new THREE.Scene();
  const environment=makeLaundryEnvironment(THREE,renderer);
  scene.environment=environment.texture;
  scene.environmentIntensity=.25;
  const camera=new THREE.PerspectiveCamera(54,1,.055,104);
  const street=buildStreet(THREE,scene);
  const scale={x:15.2/WORLD.w,z:9/WORLD.h};
  const world=(x,y)=>({x:(x-WORLD.w/2)*scale.x,z:-3.9+y*scale.z});
  const room=LaundryModel.buildLaundry(THREE,scene,{
    width:WORLD.w,height:WORLD.h,obstacles,machines:laundryMachines,zones,world,scale
  });
  const people=buildPeople(THREE,scene,occupants,world);
  for(const {actor} of people.actors.values()){
    actor.traverse(mesh=>{if(mesh.isMesh&&!mesh.material.transparent)mesh.castShadow=true;});
  }
  const atmosphere=buildAtmosphere(THREE,scene);
  const film=makeNightFilm(THREE,renderer);
  for(const fixture of room.group.children) {
    if(fixture.userData.obstacleIndex==null)continue;
    fixture.traverse(child=>{if(child.isMesh && !child.material.transparent)child.castShadow=true;});
  }
  const audio=makeNightSound();
  const controller=makeFirstPerson({
    THREE,canvas:surface,world,width:WORLD.w,height:WORLD.h,obstacles,occupants,
    onStep:()=>audio.step(),
    onMove:({distance})=>{
      walked+=distance;
      if(walked>1.6)find('night-walk-hint').classList.add('quiet');
      picked=null;
    }
  });
  const visitor={id:'visitor',name:'visitor',active:false,x:510,y:450,talkingTo:null};
  window.laundryVisitor=visitor;
  const entry=find('opening');
  const planLink=find('watch-plan');
  const soundButton=find('night-audio');
  const soundSlot=roomPage.querySelector('.shop-time');
  const menu=find('night-room-menu');
  const menuButton=find('night-menu-toggle');
  const follow=find('watch-attendant');
  const scanButton=find('watch-scan');
  const doorway=new THREE.Vector3(street.doorPivot.position.x+.84,1.64,3.58);
  const look=new THREE.Vector3();
  const desiredPosition=new THREE.Vector3();
  const desiredLook=new THREE.Vector3();
  const transitionFrom=new THREE.Vector3();
  const ray=new THREE.Raycaster();
  const vector=new THREE.Vector3();
  const aim=new THREE.Vector3();
  let mode='street',visible=true,audioOn=false,scanning=false,scan=null;
  let studioReturn=false,picked=null,dragging=null,joystick=null;
  let turn=-.32,orbit=turn,raised=2.05,range=1,manual=false;
  let turnFrom=0,motionStart=0,motionDuration=0,openAngle=0;
  let last=0,lastLabels=0,lastTarget=0,lampLast,walked=0,target=null;
  let ending=false;
  let departing=false;
  let scanAngle=.6,scanHeight=9;
  const smooth=k=>k*k*k*(k*(k*6-15)+10);
  const easing=(value,a,b)=>smooth(Math.min(1,Math.max(0,(value-a)/(b-a))));
  const angleGap=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

  const tales=makeNightTales({
    host:stage,
    getMind:id=>minds.get(id),
    getMachine:index=>laundryMachines.get(index),
    onOpen:()=>{
      closeMenu();
      unlock();
      controller.setEnabled(false);
      find('night-interact').hidden=true;
    },
    onClose:()=>{
      visitor.talkingTo=null;
      updateControl();
      surface.focus({preventScroll:true});
    },
    onChange:state=>{
      room.setStoryState?.(state);
      find('night-pocket').hidden=!state.sockFound||state.sockReturned;
    },
    onSound:kind=>audio.touch(kind),
    onLayouts:openStudio,
    onFollow:focusPerson
  });
  const actions={
    'blue-sock':'Pick up the blue sock',
    'sock-line':'Look at the lost-and-found line',
    'night-book':'Read the night book',
    'table-lamp':'Switch the table lamp',
    'coin-tray':'Look in the coin dish',
    'umbrella-rack':'Read the umbrella tag',
    'soap-dispenser':'Look at the soap dispenser'
  };
  const roomTargets=(room.interactables || []).map(item=>({
    ...item,label:actions[item.id]||item.label,kind:item.kind||'prop',radius:Math.max(item.radius||1.4,1.65)
  }));
  for(const machine of laundryMachines.values()) {
    const point=world(machine.rect.x+machine.rect.w/2,machine.rect.y+machine.rect.h/2);
    const front=machine.rect.kind==='washer'?1:-1;
    point.x+=front*machine.rect.w*scale.x*.51;
    roomTargets.push({
      id:`machine-${machine.index}`,label:`Check ${machine.rect.label}`,
      machineIndex:machine.index,obstacleIndex:machine.index,kind:'machine',radius:1.75,
      position:new THREE.Vector3(point.x,1.21,point.z)
    });
  }
  roomTargets.push({
    id:'front-door',label:'Step into the rain',kind:'door',radius:1.8,
    position:new THREE.Vector3(doorway.x,1.45,5.25)
  });

  function setText(node,value) {
    if(node.textContent!==value)node.textContent=value;
  }
  function unlock() {
    if(document.pointerLockElement===surface)document.exitPointerLock?.();
  }
  function canWalk() {
    return mode==='shop' && visible && !scanning && !tales.active && menu.hidden && !departing;
  }
  function updateControl() {
    const active=canWalk();
    if(controller.enabled!==active)controller.setEnabled(active);
    visitor.active=visible && mode==='shop' && !scanning;
    find('night-thumbstick').hidden=!active;
    find('night-crosshair').hidden=!active;
    if(!active){
      find('night-interact').hidden=true;
      joystick=null;
      find('night-thumbstick').querySelector('.thumbstick-knob').style.transform='';
    }
  }
  function size() {
    if(!stage.clientWidth || !stage.clientHeight)return;
    const width=stage.clientWidth,height=stage.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio,width<780?1.2:1.35));
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=mode==='shop'?(camera.aspect<.77?73:62):(camera.aspect<.77?65:45);
    camera.updateProjectionMatrix();
    if(mode==='shop')setText(find('lens-help'),width<760?'Drag to look':'WASD to walk - drag to look');
  }
  new ResizeObserver(size).observe(stage);

  function closeMenu() {
    menu.hidden=true;
    menuButton.setAttribute('aria-expanded','false');
    updateControl();
  }
  function toggleMenu() {
    if(tales.active||departing)return;
    menu.hidden=!menu.hidden;
    menuButton.setAttribute('aria-expanded',String(!menu.hidden));
    if(!menu.hidden)unlock();
    updateControl();
  }
  function announce(next) {
    mode=next;
    stage.dataset.place=next;
    find('street-caption').hidden=next!=='street';
    find('shop-caption').hidden=next!=='shop';
    find('night-viewpoint').hidden=next!=='shop';
    find('night-walk-hint').hidden=next!=='shop';
    menuButton.hidden=next!=='street' && next!=='shop';
    setText(find('lens-help'),next==='shop'?'WASD to walk - drag to look':'Drag to turn the street');
    surface.setAttribute('aria-label',next==='shop'
      ? 'Walk through the laundromat with W A S D or the arrow keys. Drag to look, press E or tap to interact.'
      : 'Laundromat in the rain. Drag or use the arrow keys to turn around the building.');
    scanButton.disabled=next==='entering'||next==='leaving';
    for(const id of ['watch-attendant','watch-place','watch-dryer','watch-layouts','watch-plan','night-mouse-look','walk-out'])find(id).disabled=next!=='shop';
    updateControl();
    size();
  }
  function showStage(on) {
    visible=on;
    stage.hidden=!on;
    roomPage.classList.toggle('walkthrough-underlay',on);
    roomPage.inert=on;
    document.body.classList.toggle('in-walkthrough',on);
    if(on) {
      stage.after(soundButton);
      window.scrollTo({top:0,behavior:'instant'});
      size();
    } else {
      unlock();
      if(document.fullscreenElement===stage)document.exitFullscreen?.().catch(()=>{});
    }
    updateControl();
  }
  function outsideCamera(angle,position,targetPoint) {
    const front=Math.cos(angle);
    const radiusZ=19.4*range*(camera.aspect<.76 && front>0?1+.49*front:1);
    position.set(Math.sin(angle)*Math.min(22.6,22*range),2.55+raised,front*radiusZ+.65);
    targetPoint.set(0,1.7,.65);
  }
  function startTransition(inside) {
    if(mode!==(inside?'street':'shop'))return;
    tales.close();
    closeMenu();
    unlock();
    setScan(false);
    dragging=null;
    turnFrom=orbit;
    transitionFrom.copy(camera.position);
    motionStart=performance.now();
    motionDuration=reduced.matches?0:inside?(Math.abs(angleGap(orbit,0))>.35?4300:3200):2100;
    if(inside)picked=null;
    else {
      audio.door();
      audio.scene('street');
    }
    announce(inside?'entering':'leaving');
    if(!motionDuration)finishTransition(inside);
  }
  function finishTransition(inside) {
    roomPage.hidden=!inside;
    audio.scene(inside?'shop':'street');
    if(inside) {
      openAngle=0;
      controller.setPose(doorway,-.30,-.08);
      camera.position.copy(controller.position);
      look.copy(controller.getLookDirection()).multiplyScalar(5).add(camera.position);
    } else {
      turn=orbit=0;
      manual=true;
      outsideCamera(0,camera.position,look);
      setText(find('walk-door'),'Back inside');
      setText(find('street-story'),window.laundromatHandover
        ? 'A note on the window waits for the morning shift.'
        : laundryMachines.get(10)?.fault?'Through the rain, one dryer light stays red.'
          :'Dryer 03 is turning again. The rain hasn’t let up.');
    }
    announce(inside?'shop':'street');
    if(inside)surface.focus({preventScroll:true});
    else find('walk-door').focus({preventScroll:true});
  }
  function travelThroughDoor(progress,inside) {
    const outside=new THREE.Vector3(),aimed=new THREE.Vector3();
    const hall=new THREE.Vector3(doorway.x,1.65,12.4);
    const threshold=new THREE.Vector3(doorway.x,1.65,6.1);
    const inward=new THREE.Vector3(doorway.x,1.64,4.44);
    if(inside) {
      outsideCamera(turnFrom+angleGap(turnFrom,0)*easing(progress,0,.31),outside,aimed);
      desiredPosition.copy(outside).lerp(hall,easing(progress,.17,.49));
      desiredPosition.lerp(threshold,easing(progress,.37,.72));
      desiredPosition.lerp(inward,easing(progress,.65,1));
      desiredPosition.lerp(doorway,easing(progress,.81,1));
      desiredLook.copy(aimed).lerp(new THREE.Vector3(doorway.x,1.5,1.5),easing(progress,.08,.42));
      openAngle=1.34*easing(progress,.54,.76);
      if(progress>.56 && roomPage.hidden) {
        audio.door();
        roomPage.hidden=false;
      }
      if(progress>.74)audio.scene('shop');
    } else {
      outsideCamera(0,outside,aimed);
      desiredPosition.copy(transitionFrom).lerp(inward,easing(progress,0,.38));
      desiredPosition.lerp(threshold,easing(progress,.24,.55));
      desiredPosition.lerp(outside,easing(progress,.46,1));
      desiredLook.set(doorway.x,1.64,8).lerp(aimed,easing(progress,.40,.7));
      openAngle=1.34*easing(progress,.1,.3)*(1-easing(progress,.62,.88));
    }
    camera.position.copy(desiredPosition);
    look.copy(desiredLook);
  }
  function setScan(on) {
    if(on===scanning)return;
    closeMenu();
    unlock();
    scanning=on;
    if(on && !scan) {
      scan=makeScan(THREE,[room.group,street.shell]);
      scene.add(scan);
    }
    if(scan)scan.visible=on;
    scene.background.set(on?'#060f1b':'#0d1b31');
    street.group.visible=room.group.visible=people.group.visible=!on;
    scanButton.setAttribute('aria-pressed',String(on));
    setText(scanButton,on?'Back to the scene':'Point cloud');
    stage.dataset.scan=String(on);
    find('scan-caption').hidden=!on;
    updateControl();
    if(on){scanAngle=.6;scanHeight=9;}
  }

  function focusPerson(id) {
    if(mode!=='shop')return;
    setScan(false);
    closeMenu();
    picked=people.actors.get(id)?.person || null;
    follow.setAttribute('aria-pressed',String(id==='attendant'));
    document.querySelector(`#attention-register [data-person="${id}"]`)?.click();
  }
  function openPlan() {
    if(mode!=='shop')return;
    closeMenu();
    tales.close();
    setScan(false);
    showStage(false);
    soundSlot.append(soundButton);
    roomPage.hidden=false;
    find('return-to-walkthrough').hidden=false;
    find('plan-view').click();
    resize();
    updateNotebook(true);
    find('room-title').focus({preventScroll:true});
  }
  function openStudio() {
    if(mode!=='shop')return;
    closeMenu();
    tales.close();
    setScan(false);
    window.openLayoutStudio();
  }
  function updateLabels() {
    const attendant=minds.get('attendant'),dryer=laundryMachines.get(10);
    const found=attendant?.landmarks.get('machine-10')?.status==='needs repair';
    const text=!dryer?.fault?'Dryer 03 is turning again.'
      :attendant?.phase==='servicing' && attendant.machine==='machine-10'?'A rattle from Dryer 03. The attendant is working on it.'
        :found?'The attendant found the quiet drum.':'One quiet drum among the others.';
    setText(find('walker-repair'),text);
    find('walker-repair').classList.toggle('quiet',walked>2);
    setText(find('night-viewpoint'),picked?'Watching the attendant':'11:47');
    const note=find('shift-plan-note');
    find('walker-shift').hidden=note.hidden;
    if(!note.hidden)setText(find('walker-shift'),note.textContent);
    surface.dataset.playerX=controller.position.x.toFixed(3);
    surface.dataset.playerZ=controller.position.z.toFixed(3);
    surface.dataset.playerYaw=controller.yaw.toFixed(3);
  }

  function ownsHit(object,item) {
    for(let node=object;node;node=node.parent) {
      if(node===item.mesh || node===item.group)return true;
      if(item.obstacleIndex!=null && node.userData.obstacleIndex===item.obstacleIndex)return true;
      if(item.kind==='person' && node===people.actors.get(item.personId)?.actor)return true;
    }
    return false;
  }
  function currentTarget() {
    camera.getWorldDirection(aim);
    const candidates=roomTargets.filter(item=>item.id!=='blue-sock'||!tales.state.sockFound);
    for(const [id,figure] of people.actors) {
      if(!occupants.includes(figure.person))continue;
      const point=world(figure.person.x,figure.person.y);
      candidates.push({
        id:`person-${id}`,label:`Talk to ${id==='attendant'?'the attendant':figure.person.name.replace(' folding','')}`,
        kind:'person',personId:id,position:new THREE.Vector3(point.x,1.49,point.z),radius:1.88,group:figure.actor
      });
    }
    let nearest=null,bestScore=Infinity;
    for(const item of candidates) {
      vector.subVectors(item.position,camera.position);
      const distance=vector.length();
      if(distance>(item.radius||2.05) || distance<.08)continue;
      const alignment=aim.dot(vector.normalize());
      if(alignment<.80)continue;
      const score=distance+(1-alignment)*6+(item.kind==='machine'?.3:0);
      if(score>=bestScore)continue;
      ray.set(camera.position,vector);
      ray.far=Math.max(.05,distance-.1);
      const obstruction=ray.intersectObjects([room.group,street.shell,people.group],true)
        .find(hit=>hit.distance>.08);
      if(obstruction && obstruction.distance<distance-.34 && !ownsHit(obstruction.object,item))continue;
      nearest=item;
      bestScore=score;
    }
    return nearest;
  }
  function refreshTarget(now) {
    if(!canWalk())return;
    if(now-lastTarget<110)return;
    lastTarget=now;
    target=currentTarget();
    find('night-interact').hidden=!target;
    find('night-crosshair').classList.toggle('available',Boolean(target));
    surface.dataset.nearby=target?.id||'';
    if(target)setText(find('night-interact').querySelector('span'),
      target.id==='sock-line'&&tales.state.sockFound&&!tales.state.sockReturned?'Clip the matching sock':target.label);
  }
  function useTarget() {
    if(!canWalk())return;
    target=currentTarget();
    if(!target)return;
    if(target.kind==='door') {startTransition(false);return;}
    visitor.talkingTo=target.personId||null;
    tales.interact(target);
  }

  function leaveFromMenu(){
    if(mode!=='shop'||departing)return;
    setScan(false);
    closeMenu();
    if(controller.position.distanceTo(doorway)<2){startTransition(false);return;}
    departing=true;
    updateControl();
    find('night-curtain').classList.add('closed');
    setTimeout(()=>{
      if(mode==='shop'&&visible){
        controller.setPose(doorway,0,0);
        camera.position.copy(controller.position);
        departing=false;
        startTransition(false);
      } else departing=false;
      find('night-curtain').classList.remove('closed');
    },220);
  }

  function positionCamera(dt,seconds,now) {
    if(scanning){
      camera.position.set(Math.sin(scanAngle)*17,scanHeight,Math.cos(scanAngle)*17);
      look.set(0,1,0);
      return;
    }
    if(mode==='entering'||mode==='leaving') {
      const inside=mode==='entering';
      const progress=Math.min(1,(now-motionStart)/motionDuration);
      travelThroughDoor(progress,inside);
      if(progress>=1)finishTransition(inside);
      return;
    }
    const glide=reduced.matches?1:Math.min(1,dt*4);
    if(mode==='street') {
      orbit+=angleGap(orbit,turn+(manual||reduced.matches?0:Math.sin(seconds*.35)*.05))*glide;
      outsideCamera(orbit,desiredPosition,desiredLook);
      camera.position.lerp(desiredPosition,glide);
      look.lerp(desiredLook,glide);
    } else {
      openAngle+=(Number(doorOpen)*.07-openAngle)*Math.min(1,dt*4);
      controller.update(dt,{blocked:!canWalk(),reducedMotion:reduced.matches});
      camera.position.copy(controller.position);
      desiredLook.copy(controller.getLookDirection()).multiplyScalar(5).add(camera.position);
      if(picked) {
        const point=world(picked.x,picked.y);
        desiredLook.set(point.x,1.38,point.z);
      }
      look.lerp(desiredLook,Math.min(1,dt*12));
      visitor.x=camera.position.x/scale.x+WORLD.w/2;
      visitor.y=(camera.position.z+3.9)/scale.z;
    }
  }
  function draw(now) {
    requestAnimationFrame(draw);
    const dt=last?Math.min(.07,(now-last)/1000):1/60;
    last=now;
    if(!visible||document.hidden||!surface.clientWidth)return;
    const seconds=now/1000;
    positionCamera(dt,seconds,now);
    camera.lookAt(look);
    street.doorPivot.rotation.y=openAngle;
    street.repairNotice.visible=Boolean(laundryMachines.get(10)?.fault);
    street.handoverNotice.visible=Boolean(window.laundromatHandover);
    if(lampLast!==lightsOn) {room.updateLighting(lightsOn);lampLast=lightsOn;}
    for(const [i,machine] of laundryMachines)room.updateMachine(i,machine,elapsed/1000);
    if(!scanning)people.update(minds,reduced.matches?0:seconds,dt);
    if(scan?.visible) {
      scan.material.uniforms.sweep.value=reduced.matches?15:-8+(seconds*2.1)%16;
      scan.material.uniforms.resolution.value=renderer.getPixelRatio();
    }
    atmosphere.update(seconds,mode!=='shop',scanning,lightsOn,!reduced.matches);
    film.render(scene,camera,seconds,scanning);
    if(mode==='shop') {
      refreshTarget(now);
      if(now-lastLabels>250) {updateLabels();lastLabels=now;}
    }
  }

  function turnBy(dx,dy) {
    manual=true;
    if(scanning){
      scanAngle-=dx*.007;
      scanHeight=Math.min(16,Math.max(2,scanHeight+dy*.04));
    } else if(mode==='street') {
        turn-=dx*.009;
        raised=Math.min(6.7,Math.max(.1,raised+dy*.026));
    } else if(mode==='shop' && !tales.active) {
      if(picked) {
        camera.getWorldDirection(vector);
        controller.setPose(controller.position,Math.atan2(-vector.x,-vector.z),Math.asin(vector.y));
      }
      picked=null;
      follow.setAttribute('aria-pressed','false');
      controller.look(dx,dy);
    }
  }

  menuButton.addEventListener('click',toggleMenu);
  scanButton.addEventListener('click',()=>setScan(!scanning));
  find('walk-door').addEventListener('click',()=>startTransition(true));
  find('walk-out').addEventListener('click',leaveFromMenu);
  find('watch-place').addEventListener('click',()=>{
    setScan(false);picked=null;closeMenu();
    controller.setPose(doorway,-.3,-.08);
  });
  follow.addEventListener('click',()=>focusPerson('attendant'));
  find('watch-dryer').addEventListener('click',()=>{
    setScan(false);closeMenu();picked=null;
    controller.setPose(new THREE.Vector3(3.02,1.64,1.65),-1.08,-.11);
  });
  planLink.addEventListener('click',openPlan);
  find('watch-layouts').addEventListener('click',openStudio);
  find('night-interact').addEventListener('click',useTarget);
  find('return-to-walkthrough').addEventListener('click',()=>{
    showStage(true);
    surface.focus({preventScroll:true});
  });
  find('night-mouse-look').addEventListener('click',async()=>{
    closeMenu();
    if(mode!=='shop')return;
    try {await surface.requestPointerLock?.();}
    catch {setText(find('night-walk-hint'),'Drag to look around - WASD to walk');}
  });
  find('night-fullscreen').addEventListener('click',async()=>{
    closeMenu();
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else await stage.requestFullscreen?.();
    }catch{}
  });
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===stage)stage.append(soundButton);
    else if(visible)stage.after(soundButton);
    else if(!find('layout-studio')?.hidden)stage.after(soundButton);
    else soundSlot.append(soundButton);
  });

  document.addEventListener('laundry:show-studio',()=>{
    studioReturn=visible;
    tales.close();
    if(studioReturn)showStage(false);
    stage.after(soundButton);
    audio.scene('studio');
  });
  document.addEventListener('laundry:hide-studio',()=>{
    if(studioReturn) {showStage(true);surface.focus({preventScroll:true});}
    else soundSlot.append(soundButton);
    audio.scene('shop');
    studioReturn=false;
  });
  soundButton.addEventListener('click',async()=>{
    if(audioOn) {
      audio.disable();audioOn=false;
      soundButton.setAttribute('aria-pressed','false');
      setText(soundButton,'Sound off');
    } else {
      soundButton.disabled=true;
      audioOn=await audio.enable();
      soundButton.disabled=false;
      soundButton.setAttribute('aria-pressed',String(audioOn));
      setText(soundButton,audioOn?'Sound on':'Sound unavailable');
    }
  });

  surface.addEventListener('pointerdown',event=>{
    if(dragging||tales.active||(mode!=='street'&&mode!=='shop'))return;
    if(!menu.hidden)closeMenu();
    surface.focus({preventScroll:true});
    if(document.pointerLockElement===surface) {useTarget();return;}
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY,travel:0};
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove',event=>{
    if(document.pointerLockElement===surface) {turnBy(event.movementX,event.movementY);return;}
    if(dragging?.id!==event.pointerId)return;
    const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
    dragging.travel+=Math.hypot(dx,dy);
    dragging.x=event.clientX;dragging.y=event.clientY;
    if(dragging.travel>3)turnBy(dx,dy);
  });
  surface.addEventListener('pointerup',event=>{
    if(dragging?.id!==event.pointerId)return;
    const click=dragging.travel<5;
    dragging=null;
    if(click && mode==='shop' && !scanning)useTarget();
  });
  surface.addEventListener('lostpointercapture',()=>{dragging=null;});
  surface.addEventListener('wheel',event=>{
    if(mode!=='street')return;
    event.preventDefault();manual=true;
    range=Math.min(1.23,Math.max(.72,range+Math.sign(event.deltaY)*.045));
  },{passive:false});

  const thumb=find('night-thumbstick'),knob=thumb.querySelector('.thumbstick-knob');
  function thumbMove(event) {
    if(joystick!==event.pointerId)return;
    const rect=thumb.getBoundingClientRect();
    let x=(event.clientX-(rect.x+rect.width/2))/29;
    let y=(event.clientY-(rect.y+rect.height/2))/29;
    const length=Math.hypot(x,y);
    if(length>1) {x/=length;y/=length;}
    knob.style.transform=`translate(${x*24}px,${y*24}px)`;
    controller.setTouchMove(x,-y);
    picked=null;
  }
  thumb.addEventListener('pointerdown',event=>{
    if(!canWalk()||joystick!=null)return;
    event.preventDefault();joystick=event.pointerId;
    thumb.setPointerCapture(event.pointerId);
    thumbMove(event);
  });
  thumb.addEventListener('pointermove',thumbMove);
  function releaseThumb(event) {
    if(joystick!==event.pointerId)return;
    joystick=null;knob.style.transform='';
    controller.setTouchMove(0,0);
  }
  thumb.addEventListener('pointerup',releaseThumb);
  thumb.addEventListener('pointercancel',releaseThumb);
  thumb.addEventListener('lostpointercapture',releaseThumb);

  window.addEventListener('keydown',event=>{
    if(!visible||tales.active||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;
    if(event.code==='KeyE'&&canWalk()&&!event.repeat) {event.preventDefault();useTarget();return;}
    if(event.code==='Escape') {
      if(scanning)setScan(false);
      else if(!menu.hidden)closeMenu();
      else if(mode==='shop')toggleMenu();
    }
    if(mode==='street') {
      const arrows={ArrowLeft:[-25,0],ArrowRight:[25,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
      if(arrows[event.key]) {event.preventDefault();turnBy(...arrows[event.key]);}
    }
    if(canWalk()&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))picked=null;
  });
  surface.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    if(ending)return;
    ending=true;
    tales.close();showStage(false);
    soundButton.hidden=true;
    find('return-to-walkthrough').hidden=true;
    find('step-outside').hidden=false;
    audio.dispose();controller.dispose();tales.dispose();
    if(mode==='street'||mode==='entering'||mode==='leaving') {roomPage.hidden=true;entry.hidden=false;}
    else {roomPage.hidden=false;resize();}
  },{once:true});
  announce('street');
  entry.hidden=true;
  find('step-outside').hidden=true;
  soundButton.hidden=false;
  showStage(true);
  outsideCamera(orbit,camera.position,look);
  audio.scene('street');
  requestAnimationFrame(draw);
}
