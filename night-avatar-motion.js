/* Poses drive the avatar's normalized human skeleton. Spatial decisions stay in agents.js. */
export function makeAvatarMotion(T, {world, patrons}) {
  const actors = new Map();
  const axisX = new T.Vector3(1, 0, 0);
  const axisZ = new T.Vector3(0, 0, 1);
  const point = new T.Vector3();
  const parentRotation = new T.Quaternion();
  const inverseRotation = new T.Quaternion();
  const targetRotation = new T.Quaternion();
  const rollRotation = new T.Quaternion();
  const targetDirection = new T.Vector3();
  const rootRotation = new T.Quaternion();
  const rootPosition = new T.Vector3();
  const rootScale = new T.Vector3();
  const kneeTarget = new T.Vector3();
  const footTarget = new T.Vector3();
  const direction = new T.Vector3();
  const bend = new T.Vector3();
  const hipPosition = new T.Vector3();
  const elbowTarget = new T.Vector3();
  const wristTarget = new T.Vector3();
  const forearmDirection = new T.Vector3();
  let paused = false;
  const animationClips = new Map();
  const clipIdle = new T.Quaternion();
  const clipWalk = new T.Quaternion();
  const clipValue = new T.Quaternion();
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const mix = (a, b, dt, speed = 8) => a + (b - a) * (1 - Math.exp(-dt * speed));
  const smooth = n => n * n * (3 - 2 * n);
  const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
  const profiles = ['mere','window','attendant','sleeping','bluecoat','student','reader','scarf','raincoat'];
  const fingerNames = ['Index','Middle','Ring','Little'];
  const bodyNames = ['hips','spine','chest','upperChest','neck','head','leftEye','rightEye','leftShoulder','rightShoulder'];
  const arms = ['left','right'];
  const names = [...bodyNames];
  for (const side of arms) {
    names.push(`${side}UpperArm`,`${side}LowerArm`,`${side}Hand`,`${side}UpperLeg`,`${side}LowerLeg`,`${side}Foot`,`${side}Toes`);
    for (const finger of fingerNames) for (const section of ['Proximal','Intermediate','Distal']) names.push(`${side}${finger}${section}`);
    for (const section of ['Metacarpal','Proximal','Distal']) names.push(`${side}Thumb${section}`);
  }
  const sourceBoneMap={pelvis:'hips',spine_01:'spine',spine_02:'chest',spine_03:'upperChest',neck_01:'neck',Head:'head'};
  for(const [side,suffix]of [['left','l'],['right','r']]){
    for(const [source,target]of [['clavicle','Shoulder'],['upperarm','UpperArm'],['lowerarm','LowerArm'],['hand','Hand'],['thigh','UpperLeg'],['calf','LowerLeg'],['foot','Foot'],['ball','Toes']])sourceBoneMap[`${source}_${suffix}`]=side+target;
    for(const [source,finger]of [['index','Index'],['middle','Middle'],['ring','Ring'],['pinky','Little']])for(const [index,section]of ['Proximal','Intermediate','Distal'].entries())sourceBoneMap[`${source}_0${index+1}_${suffix}`]=side+finger+section;
    for(const [index,section]of ['Metacarpal','Proximal','Distal'].entries())sourceBoneMap[`thumb_0${index+1}_${suffix}`]=side+'Thumb'+section;
  }
  function setAnimationSource(gltf) {
    if(!gltf?.scene||!gltf?.animations)return {clips:[],bones:0};
    gltf.scene.updateWorldMatrix(true,true);
    animationClips.clear();
    for(const clip of gltf.animations){
      if(!['Idle_Loop','Walk_Loop','Idle_Talking_Loop','Sitting_Idle_Loop'].includes(clip.name))continue;
      const tracks=new Map();
      for(const track of clip.tracks){
        if(!track.name.endsWith('.quaternion'))continue;
        const sourceName=track.name.slice(0,-11),targetName=sourceBoneMap[sourceName];
        const source=gltf.scene.getObjectByName(sourceName);
        if(!targetName||!source)continue;
        const parent=source.parent?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion();
        const inverse=source.getWorldQuaternion(new T.Quaternion()).invert();
        tracks.set(targetName,{interpolant:track.createInterpolant(new Float32Array(4)),parent,inverse});
      }
      animationClips.set(clip.name,{duration:clip.duration,tracks});
    }
    return {clips:[...animationClips.keys()],bones:animationClips.get('Walk_Loop')?.tracks.size||0};
  }
  function sampleClip(clip,name,time,result){
    const track=clip?.tracks.get(name);
    if(!track)return false;
    result.fromArray(track.interpolant.evaluate(time%clip.duration));
    result.premultiply(track.parent).multiply(track.inverse).normalize();
    return true;
  }
  function authoredPose(figure,pose,walk){
    const idle=animationClips.get(pose==='talk'?'Idle_Talking_Loop':'Idle_Loop')||animationClips.get('Idle_Loop');
    const walking=animationClips.get('Walk_Loop');
    if(!idle||!walking)return false;
    const free=['walk','idle','wait','look','talk','yield','doze'].includes(pose);
    for(const [name,rest]of figure.rest){
      if(name==='head'||name==='neck'||name.endsWith('Eye'))continue;
      const lower=name==='hips'||name.includes('Leg')||name.includes('Foot')||name.includes('Toes');
      if(!free&&!lower)continue;
      if(!sampleClip(idle,name,figure.clock+figure.seed,clipIdle))continue;
      if(sampleClip(walking,name,(figure.travel/figure.stride%1)*walking.duration,clipWalk))clipIdle.slerp(clipWalk,walk);
      const correction=figure.frames.get(name);
      clipValue.copy(correction).invert().multiply(clipIdle).multiply(correction).multiply(rest.quaternion);
      figure.bones[name].quaternion.copy(clipValue);
    }
    return true;
  }
  function getPerson(id) { return patrons.find(person => person.id === id); }
  function setExpression(vrm, name, value) {
    const manager = vrm.expressionManager;
    if (manager?.setValue) manager.setValue(name, value);
  }
  function resetBones(figure) {
    for (const [name, rest] of figure.rest) {
      const node = figure.bones[name];
      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      node.scale.copy(rest.scale);
    }
  }
  function rotate(figure, name, x = 0, y = 0, z = 0) {
    const bone = figure.bones[name], rest = figure.rest.get(name);
    if (!bone || !rest) return;
    targetRotation.setFromEuler(new T.Euler(x,y,z,'XYZ'));
    if(['spine','chest','upperChest','neck','head','leftEye','rightEye'].includes(name)){
      const frame=figure.frames.get(name);
      clipValue.copy(frame).invert().multiply(targetRotation).multiply(frame);
      bone.quaternion.copy(rest.quaternion).multiply(clipValue);
    }else bone.quaternion.copy(rest.quaternion).multiply(targetRotation);
  }
  function aimBone(node, localAxis, worldTarget) {
    node.getWorldPosition(point);
    targetDirection.copy(worldTarget).sub(point).normalize();
    node.parent.getWorldQuaternion(parentRotation);
    inverseRotation.copy(parentRotation).invert();
    targetDirection.applyQuaternion(inverseRotation);
    node.quaternion.setFromUnitVectors(localAxis, targetDirection);
    node.updateWorldMatrix(false,true);
  }
  function makePhone(root) {
    const group = new T.Group();
    const frameMaterial = new T.MeshStandardMaterial({color:'#343c46',roughness:.44});
    const screenMaterial = new T.MeshStandardMaterial({color:'#b4c9c4',emissive:'#75a2a6',emissiveIntensity:.20,roughness:.40});
    const frame = new T.Mesh(new T.BoxGeometry(.067,.122,.010),frameMaterial);
    const screen = new T.Mesh(new T.PlaneGeometry(.058,.103),screenMaterial);
    screen.position.z=.0058;group.add(frame,screen);root.add(group);group.visible=false;
    const cloth=new T.Group();root.add(cloth);cloth.visible=false;
    const clothMaterial=new T.MeshStandardMaterial({color:'#c7c1ac',roughness:.98});
    const foldMaterial=new T.MeshStandardMaterial({color:'#b0aa96',roughness:.99});
    const clothGeometry=new T.BoxGeometry(.255,.018,.152);
    const sheet=new T.Mesh(clothGeometry,clothMaterial);cloth.add(sheet);
    const folded=new T.Mesh(clothGeometry,foldMaterial);folded.position.set(.008,.017,-.006);folded.scale.set(.93,.6,.92);cloth.add(folded);
    return {group,cloth,dispose(){
      frame.geometry.dispose();screen.geometry.dispose();clothGeometry.dispose();
      frameMaterial.dispose();screenMaterial.dispose();clothMaterial.dispose();foldMaterial.dispose();
      root.remove(group,cloth);
    }};
  }
  function attach(id, vrm, root = vrm.scene) {
    if (!vrm?.humanoid?.getNormalizedBoneNode || !root) throw new Error('A normalized VRM human skeleton is required.');
    detach(id);
    const bones = {}, rest = new Map(),frames = new Map();
    for (const name of names) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      bones[name] = node;
      rest.set(name,{position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});
    }
    if (!bones.hips || !bones.head) throw new Error('Avatar is missing its hips or head bone.');
    const person = getPerson(id);
    const position = world(person?.x ?? 450,person?.y ?? 260);
    root.position.set(position.x,.085,position.z);
    root.updateWorldMatrix(true,true);
    root.getWorldPosition(rootPosition);root.getWorldQuaternion(rootRotation);root.getWorldScale(rootScale);
    const invRoot = rootRotation.clone().invert();
    for(const [name,node]of Object.entries(bones))frames.set(name,invRoot.clone().multiply(node.parent.getWorldQuaternion(new T.Quaternion())));
    const legs = [];
    const armRigs = [];
    for (const side of arms) {
      const arm=bones[`${side}UpperArm`],elbow=bones[`${side}LowerArm`],hand=bones[`${side}Hand`];
      if(arm&&elbow&&hand){
        const a=arm.getWorldPosition(new T.Vector3()),b=elbow.getWorldPosition(new T.Vector3()),c=hand.getWorldPosition(new T.Vector3());
        armRigs.push({side,upper:arm,lower:elbow,hand,a:a.distanceTo(b),b:b.distanceTo(c),upperAxis:elbow.position.clone().normalize(),
          lowerAxis:hand.position.clone().normalize(),restDirection:c.clone().sub(b).normalize().applyQuaternion(invRoot),
          handRest:invRoot.clone().multiply(hand.getWorldQuaternion(new T.Quaternion())),fingerSign:Math.sign(hand.position.x)||1});
      }
      const upper = bones[`${side}UpperLeg`], lower = bones[`${side}LowerLeg`], foot = bones[`${side}Foot`];
      if (!upper || !lower || !foot) continue;
      const a=upper.getWorldPosition(new T.Vector3()), b=lower.getWorldPosition(new T.Vector3()), c=foot.getWorldPosition(new T.Vector3());
      const anchor=c.clone().sub(rootPosition).applyQuaternion(invRoot);
      const footRest=invRoot.clone().multiply(foot.getWorldQuaternion(new T.Quaternion()));
      legs.push({side,upper,lower,foot,toes:bones[`${side}Toes`],a:a.distanceTo(b),b:b.distanceTo(c),
        upperAxis:lower.position.clone().normalize(),lowerAxis:foot.position.clone().normalize(),anchor,footRest,
        lift:0,offset:0,pitch:0,vertical:a.y-c.y,planted:null,contact:false});
    }
    const styleIndex = profiles.indexOf(id);
    const style = styleIndex < 0 ? actors.size % 9 : styleIndex;
    const seed = style * 1.713 + .47;
    const figure = {id,vrm,root,actor:root,bones,rest,frames,legs,arms:armRigs,person,style,seed,scale:Math.max(.001,rootScale.y),
      lastX:null,lastZ:null,travel:seed*.11,walk:0,pose:'idle',age:0,clock:0,
      blinkAt:1.3+style*.31,blinkStart:-10,gestureAt:3.5+style*.74,
      gestureStart:-10,gestureDuration:0,gestureKind:style%4,weight:0,weightTarget:0,
      headYaw:0,headPitch:0,bodyLean:0,lookTarget:new T.Object3D(),phone:makePhone(root),
      stride:.78+(style%4)*.025};
    if(vrm.lookAt) vrm.lookAt.target=figure.lookTarget;
    actors.set(id,figure);
    updateFigure(figure,null,0,0);
    return figure;
  }
  function detach(id) {
    const figure=actors.get(id);
    if(!figure)return;
    if(figure.vrm.lookAt?.target===figure.lookTarget)figure.vrm.lookAt.target=null;
    figure.phone.dispose();actors.delete(id);
  }
  function choosePose(figure,mind,moving) {
    const person=figure.person,activity=person?.activity||'';
    if(activity==='talking to you'||globalThis.laundryVisitor?.talkingTo===figure.id)return 'talk';
    if(moving)return 'walk';
    if(activity.includes('letting someone pass'))return 'yield';
    if(mind?.phase==='servicing')return 'repair';
    if(mind?.phase==='checking')return 'inspect';
    if(mind?.phase==='folding')return 'fold';
    if(person?.prop==='phone'&&(mind?.phase?.endsWith('wait')||mind?.phase==='done'))return 'phone';
    if(person?.prop==='book'&&mind?.phase==='done')return 'read';
    if(figure.style===3&&mind?.phase==='done')return 'doze';
    if(activity.includes('looking')||mind?.scan>0)return 'look';
    if(mind?.phase?.endsWith('wait'))return 'wait';
    return 'idle';
  }
  function solveFeet(figure) {
    const {root,bones,legs}=figure;
    root.updateWorldMatrix(true,true);
    root.getWorldQuaternion(rootRotation);root.getWorldPosition(rootPosition);
    const hipParentScale=bones.hips.parent.getWorldScale(rootScale).y || 1;
    let hipDip=0;
    for (const leg of legs) {
      const reach=Math.max(.1,leg.a+leg.b-.006);
      const forward=leg.offset;
      const required=leg.vertical-Math.sqrt(Math.max(.01,reach*reach-forward*forward));
      hipDip=Math.max(hipDip,required);
    }
    bones.hips.position.y-=Math.max(0,hipDip)/hipParentScale;
    root.updateWorldMatrix(true,true);
    for (const leg of legs) {
      leg.upper.getWorldPosition(hipPosition);
      const contactZ=leg.pitch>0?.135:-.047;
      const soleHeight=leg.anchor.y;
      const rollLift=Math.max(0,soleHeight*(Math.cos(leg.pitch)-1)+contactZ*Math.sin(leg.pitch));
      footTarget.set(leg.anchor.x,leg.anchor.y+leg.lift+rollLift,leg.anchor.z+leg.offset).applyQuaternion(rootRotation).add(rootPosition);
      direction.copy(footTarget).sub(hipPosition);
      const distance=clamp(direction.length(),.03,leg.a+leg.b-.001);
      direction.normalize();
      bend.copy(axisZ).applyQuaternion(rootRotation);
      bend.addScaledVector(direction,-bend.dot(direction)).normalize();
      const along=(leg.a*leg.a+distance*distance-leg.b*leg.b)/(2*distance);
      const height=Math.sqrt(Math.max(0,leg.a*leg.a-along*along));
      kneeTarget.copy(hipPosition).addScaledVector(direction,along).addScaledVector(bend,height);
      aimBone(leg.upper,leg.upperAxis,kneeTarget);
      aimBone(leg.lower,leg.lowerAxis,footTarget);
      leg.foot.parent.getWorldQuaternion(parentRotation);
      rollRotation.setFromAxisAngle(axisX,leg.pitch);
      targetRotation.copy(rootRotation).multiply(rollRotation).multiply(leg.footRest);
      leg.foot.quaternion.copy(parentRotation).invert().multiply(targetRotation);
      if(leg.toes)rotate(figure,`${leg.side}Toes`,-Math.max(0,leg.pitch)*.7,0,0);
    }
  }
  function groundAuthoredFeet(figure,moving){
    const {root,bones,legs}=figure;
    root.updateWorldMatrix(true,true);root.getWorldPosition(rootPosition);root.getWorldQuaternion(rootRotation);
    const actual=[];
    let floorShift=Infinity;
    for(const leg of legs){
      const ankle=leg.foot.getWorldPosition(new T.Vector3());
      const relativeY=ankle.y-rootPosition.y-leg.anchor.y;
      floorShift=Math.min(floorShift,relativeY);
      actual.push({leg,ankle,relativeY,orientation:leg.foot.getWorldQuaternion(new T.Quaternion())});
    }
    if(!Number.isFinite(floorShift))return;
    const scale=bones.hips.parent.getWorldScale(rootScale).y||1;
    bones.hips.position.y-=floorShift/scale;
    root.updateWorldMatrix(true,true);
    const goals=[];
    let supportDip=0;
    for(const {leg,ankle,relativeY,orientation}of actual){
      const contact=relativeY-floorShift<.024;
      ankle.y=rootPosition.y+leg.anchor.y+clamp(relativeY-floorShift,0,.095);
      if(contact){
        if(!leg.contact||!leg.planted||Math.abs(angle(root.rotation.y-(leg.plantYaw??root.rotation.y)))>.20){
          leg.planted=ankle.clone();leg.plantYaw=root.rotation.y;
        }
        if(moving&&leg.planted.distanceTo(ankle)>.34)leg.planted.copy(ankle);
        leg.planted.y=rootPosition.y+leg.anchor.y;
        footTarget.copy(leg.planted);
      }else{
        leg.planted=null;footTarget.copy(ankle);
      }
      leg.contact=contact;
      goals.push({leg,target:footTarget.clone(),orientation,contact});
      leg.upper.getWorldPosition(hipPosition);
      const horizontal=(hipPosition.x-footTarget.x)**2+(hipPosition.z-footTarget.z)**2;
      const reach=leg.a+leg.b-.005;
      const height=Math.sqrt(Math.max(.01,reach*reach-horizontal));
      supportDip=Math.max(supportDip,hipPosition.y-footTarget.y-height);
    }
    bones.hips.position.y-=clamp(supportDip,0,.13)/scale;
    root.updateWorldMatrix(true,true);
    for(const {leg,target,orientation,contact}of goals){
      footTarget.copy(target);
      leg.upper.getWorldPosition(hipPosition);
      direction.copy(footTarget).sub(hipPosition);
      const distance=clamp(direction.length(),.03,leg.a+leg.b-.001);
      direction.normalize();
      bend.copy(axisZ).applyQuaternion(rootRotation);
      bend.addScaledVector(direction,-bend.dot(direction)).normalize();
      const along=(leg.a*leg.a+distance*distance-leg.b*leg.b)/(2*distance),height=Math.sqrt(Math.max(0,leg.a*leg.a-along*along));
      kneeTarget.copy(hipPosition).addScaledVector(direction,along).addScaledVector(bend,height);
      aimBone(leg.upper,leg.upperAxis,kneeTarget);aimBone(leg.lower,leg.lowerAxis,footTarget);
      leg.foot.parent.getWorldQuaternion(parentRotation);
      const flat=rootRotation.clone().multiply(leg.footRest);
      if(contact)orientation.slerp(flat,.76);
      leg.foot.quaternion.copy(parentRotation).invert().multiply(orientation);
    }
  }
  function updateFigure(figure,mind,time,dt) {
    const person=getPerson(figure.id);
    if(!person)return;
    figure.person=person;
    const {root,bones,style}=figure;
    const coordinate=world(person.x,person.y);
    const moved=figure.lastX===null?0:Math.hypot(coordinate.x-figure.lastX,coordinate.z-figure.lastZ);
    const distance=moved<.65?moved:0;
    if(moved>=.65)for(const leg of figure.legs){leg.planted=null;leg.contact=false;}
    const speed=dt>0?distance/dt:0;
    const moving=speed>.018;
    figure.lastX=coordinate.x;figure.lastZ=coordinate.z;
    figure.walk=mix(figure.walk,moving?clamp(speed/.52,0,1):0,dt,moving?10:7);
    figure.travel+=distance;
    if(time!==0)figure.clock+=dt;
    const pose=choosePose(figure,mind,moving||figure.walk>.18);
    if(pose!==figure.pose){figure.pose=pose;figure.age=0;}else figure.age+=dt;
    const t=figure.clock,age=figure.age,walk=figure.walk;
    const wanted=Math.PI/2-(mind?.heading??person.phase??0);
    const turn=angle(wanted-root.rotation.y);
    root.rotation.y+=turn*(1-Math.exp(-dt*6.5));
    root.position.set(coordinate.x,.085,coordinate.z);
    resetBones(figure);
    let armL=.035,armR=.015,elbowL=-.13,elbowR=-.16,outL=.035,outR=-.035;
    let lean=0,headPitch=.015,headYaw=clamp(turn*.65,-.28,.28),handTurn=0;
    const phase=figure.travel/figure.stride;
    const strideWave=Math.sin(phase*Math.PI*2);
    const shoulderEase=strideWave*.14+Math.sin(phase*Math.PI*4+.6)*.022;
    if(pose==='walk') {
      armL=-shoulderEase*walk;armR=shoulderEase*.91*walk;
      elbowL=-.17-Math.max(0,-strideWave)*.11;elbowR=-.18-Math.max(0,strideWave)*.09;
      lean=.025*walk;
    } else if(pose==='fold') {
      const f=(age%3.7)/3.7;
      const reach=smooth(clamp(f/.28,0,1))-smooth(clamp((f-.70)/.24,0,1));
      const across=smooth(clamp((f-.27)/.30,0,1))-smooth(clamp((f-.73)/.20,0,1));
      armL=-.18-reach*.10;armR=-.21-reach*.09;
      elbowL=-.29-across*.13;elbowR=-.27+across*.08;outL=-.14+across*.15;outR=.12+across*.06;
      lean=.12;headPitch=.40;handTurn=.14;
    } else if(pose==='inspect') {
      const reach=smooth(clamp(age/.55,0,1));
      armR=-.47*reach;elbowR=-.76*reach;armL=-.07;elbowL=-.22;headPitch=.12;
    } else if(pose==='repair') {
      const turnTool=Math.sin(age*5.1)*.10;
      armR=-.63;elbowR=-.95;armL=-.35;elbowL=-.78;headPitch=.26;lean=.095;handTurn=turnTool;
    } else if(pose==='phone') {
      armR=-.25;elbowR=-1.21;outR=.02;armL=-.09;elbowL=-.35;headPitch=.36;
    } else if(pose==='read') {
      armL=-.28;armR=-.27;elbowL=-1.06;elbowR=-1.04;outL=-.12;outR=.12;headPitch=.25;
    } else if(pose==='doze') {
      headPitch=.24;headYaw=.08;lean=.03;elbowL=-.43;elbowR=-.40;
    } else if(pose==='yield') {
      elbowR=-.32;elbowL=-.24;headYaw=clamp(turn*.7,-.36,.36);
    } else if(pose==='talk') {
      const visitor=globalThis.laundryVisitor;
      if(visitor){
        const visitorPoint=world(visitor.x,visitor.y);
        root.updateWorldMatrix(true,true);bones.head.getWorldPosition(point);
        const dx=visitorPoint.x-point.x,dz=visitorPoint.z-point.z;
        headYaw=clamp(angle(Math.atan2(dx,dz)-root.rotation.y),-.55,.55);
        headPitch=clamp(-Math.atan2((visitor.eyeHeight||1.58)-point.y,Math.hypot(dx,dz)),-.22,.20);
      }
      const sentence=age%6.1;
      const gesture=Math.sin(clamp(sentence/2.2,0,1)*Math.PI)*(sentence<2.2?1:0);
      armR=-.06-gesture*.09;elbowR=-.22-gesture*.25;handTurn=gesture*.12;
      headPitch+=gesture*.025;
    }
    // A glance or weight change occurs once in a while, with long quiet intervals.
    if(t>=figure.gestureAt&&pose!=='walk') {
      figure.gestureStart=t;figure.gestureDuration=1.8+(style%3)*.35;
      figure.gestureKind=(figure.gestureKind+1)%4;
      figure.gestureAt=t+6.4+(style%4)*.93;
      if(figure.gestureKind===2)figure.weightTarget=figure.weightTarget>0?-.011:.011;
    }
    const progress=(t-figure.gestureStart)/Math.max(.1,figure.gestureDuration);
    const gesture=progress>0&&progress<1?Math.sin(progress*Math.PI)**2:0;
    if(['idle','wait','look','yield'].includes(pose)) {
      if(figure.gestureKind===0)headYaw+=gesture*(style%2?.19:-.19);
      if(figure.gestureKind===1){headPitch+=gesture*.12;elbowL-=gesture*.14;}
      if(figure.gestureKind===3){elbowR-=gesture*.16;armR-=gesture*.035;}
    }
    figure.weight=mix(figure.weight,walk>.2?0:figure.weightTarget,dt,2.4);
    const hipParentScale=bones.hips.parent.getWorldScale(rootScale).y||1;
    bones.hips.position.x+=figure.weight/hipParentScale;
    figure.bodyLean=mix(figure.bodyLean,lean,dt,5.5);
    rotate(figure,'spine',figure.bodyLean*.55,0,-strideWave*.008*walk);
    rotate(figure,'chest',figure.bodyLean*.45,0,strideWave*.009*walk);
    const breath=time===0?0:Math.sin(t*1.45+figure.seed)*.0025;
    if(bones.chest){bones.chest.scale.x*=1+breath; bones.chest.scale.z*=1+breath*1.3;}
    figure.headPitch=mix(figure.headPitch,headPitch,dt,5.5);
    figure.headYaw=mix(figure.headYaw,headYaw,dt,5.5);
    rotate(figure,'neck',figure.headPitch*.22,figure.headYaw*.24,0);
    rotate(figure,'head',figure.headPitch*.78,figure.headYaw*.76,0);
    if(!figure.vrm.lookAt){
      rotate(figure,'leftEye',clamp(figure.headPitch*.33,-.12,.12),figure.headYaw*.20,0);
      rotate(figure,'rightEye',clamp(figure.headPitch*.33,-.12,.12),figure.headYaw*.20,0);
    }
    root.updateWorldMatrix(true,true);
    root.getWorldQuaternion(rootRotation);
    for(const rig of figure.arms) {
      const side=rig.side;
      const sign=side==='left'?1:-1;
      const arm=side==='left'?armL:armR,elbow=side==='left'?elbowL:elbowR,out=side==='left'?outL:outR;
      rig.upper.getWorldPosition(hipPosition);
      direction.set(Math.sin(out),-Math.cos(arm)*Math.cos(out),-Math.sin(arm)*Math.cos(out)).normalize().applyQuaternion(rootRotation);
      elbowTarget.copy(hipPosition).addScaledVector(direction,rig.a);
      forearmDirection.set(Math.sin(out),-Math.cos(arm+elbow)*Math.cos(out),-Math.sin(arm+elbow)*Math.cos(out)).normalize();
      wristTarget.copy(elbowTarget).addScaledVector(direction.copy(forearmDirection).applyQuaternion(rootRotation),rig.b);
      aimBone(rig.upper,rig.upperAxis,elbowTarget);
      aimBone(rig.lower,rig.lowerAxis,wristTarget);
      targetRotation.setFromUnitVectors(rig.restDirection,forearmDirection).multiply(rig.handRest).premultiply(rootRotation);
      rollRotation.setFromAxisAngle(direction,sign*(.44+handTurn));
      targetRotation.premultiply(rollRotation);
      rig.hand.parent.getWorldQuaternion(parentRotation);
      rig.hand.quaternion.copy(parentRotation).invert().multiply(targetRotation);
      const hold=['phone','read','repair','fold'].includes(pose)?.30:.13;
      for(const [fingerIndex,finger]of fingerNames.entries())for(const [sectionIndex,section]of ['Proximal','Intermediate','Distal'].entries()) {
        rotate(figure,`${side}${finger}${section}`,0,rig.fingerSign*(hold+fingerIndex*.022)*(sectionIndex===0?1:.65),0);
      }
      rotate(figure,`${side}ThumbProximal`,0,rig.fingerSign*.12,rig.fingerSign*-.11);
    }
    for(const [index,leg]of figure.legs.entries()) {
      const cycle=(phase+index*.5)%1,stance=.64,span=figure.stride*stance/2;
      let offset=leg.offset,lift=0,pitch=0;
      if(moving) {
        if(cycle<stance) {
          offset=span-cycle/stance*span*2;
          const strike=1-smooth(clamp(cycle/.10,0,1));
          const push=smooth(clamp((cycle-.48)/.16,0,1));
          pitch=-strike*.095+push*.17;
        }else {
          const swing=(cycle-stance)/(1-stance);
          offset=-span+smooth(swing)*span*2;
          lift=Math.sin(swing*Math.PI)*.062;
          pitch=-Math.sin(swing*Math.PI)*.08;
        }
        leg.offset=mix(leg.offset,offset,dt,22);
      }
      leg.lift=mix(leg.lift,lift,dt,moving?24:14);
      leg.pitch=mix(leg.pitch,pitch,dt,moving?20:12);
    }
    const authored=authoredPose(figure,pose,walk);
    if(authored)groundAuthoredFeet(figure,moving);
    else solveFeet(figure);
    root.updateWorldMatrix(true,true);
    const phone=figure.phone.group;
    phone.visible=pose==='phone';
    if(phone.visible&&bones.rightHand) {
      bones.rightHand.getWorldPosition(point);
      if(bones.rightLowerArm){
        bones.rightLowerArm.getWorldPosition(direction);
        direction.subVectors(point,direction).normalize();point.addScaledVector(direction,.037);
      }
      root.worldToLocal(point);phone.position.copy(point);
      phone.scale.setScalar(1/figure.scale);
      targetRotation.setFromAxisAngle(axisX,-2.20);
      phone.quaternion.copy(targetRotation);
    }
    const cloth=figure.phone.cloth;cloth.visible=pose==='fold';
    if(cloth.visible&&bones.leftHand&&bones.rightHand){
      bones.leftHand.getWorldPosition(point);bones.rightHand.getWorldPosition(direction);
      point.add(direction).multiplyScalar(.5);point.y-=.025;
      root.worldToLocal(point);cloth.position.copy(point);cloth.scale.setScalar(1/figure.scale);
      cloth.rotation.set(0,Math.sin(age*1.4)*.045,0);
    }
    if(t>=figure.blinkAt&&pose!=='doze') {
      figure.blinkStart=t;figure.blinkAt=t+3.0+(style%4)*.53+Math.sin(t+figure.seed)*.45;
    }
    const blinkAge=t-figure.blinkStart;
    const blink=pose==='doze'?.86:blinkAge>=0&&blinkAge<.16?Math.sin(blinkAge/.16*Math.PI):0;
    setExpression(figure.vrm,'blink',blink);
    setExpression(figure.vrm,'relaxed',pose==='doze'?.20:.08);
    setExpression(figure.vrm,'happy',pose==='talk'?.10:.025);
    setExpression(figure.vrm,'aa',pose==='talk'&&age<2.7?.035+Math.sin(age*13)**2*.06:0);
    bones.head.getWorldPosition(point);
    if(pose==='talk'&&globalThis.laundryVisitor) {
      const visitor=globalThis.laundryVisitor,p=world(visitor.x,visitor.y);
      figure.lookTarget.position.set(p.x,visitor.eyeHeight||1.58,p.z);
    }else {
      direction.set(Math.sin(root.rotation.y+figure.headYaw*.75),-.03-Math.max(0,figure.headPitch)*.6,Math.cos(root.rotation.y+figure.headYaw*.75));
      figure.lookTarget.position.copy(point).addScaledVector(direction,2.5);
    }
    figure.lookTarget.updateMatrixWorld(true);
  }
  return {
    actors,attach,detach,setAnimationSource,
    setPaused(value){paused=Boolean(value);},
    update(minds,time,dt){
      if(paused)return;
      const delta=clamp(Number.isFinite(dt)?dt:0,0,.10);
      for(const figure of actors.values())updateFigure(figure,minds?.get(figure.id),time,delta);
    },
    dispose(){for(const id of [...actors.keys()])detach(id);}
  };
}
