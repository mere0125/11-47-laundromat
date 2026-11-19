import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {VRMLoaderPlugin,VRMCore,VRMHumanoid,VRMExpression,VRMExpressionManager,VRMExpressionMorphTargetBind,VRMUtils} from './vendor/three-vrm.module.min.js';
import {makeAvatarMotion} from './night-avatar-motion.js?v=20261119-faces5';

const models={
  female:new URL('./assets/people/vivi.vrm',import.meta.url).href,
  male:new URL('./assets/people/companion.vrm',import.meta.url).href
};
const femaleIds=new Set(['mere','window','scarf','raincoat']);
const isFemale=person=>femaleIds.has(person.id)||Boolean(person.longHair||person.scarf||person.hood||person.prop==='cloth');

export function makeNightAvatars(scene,people,patrons,world) {
  const motion=makeAvatarMotion(T,{world,patrons});
  const bases=new Map();
  const live=new Map();
  const materialsBySource=new Map();
  const loader=new GLTFLoader();
  loader.register(parser=>new VRMLoaderPlugin(parser,{autoUpdateHumanBones:true}));
  let enabled=false;
  let loading=false;
  let disposed=false;
  let adding=false;

  function loadBase(type) {
    if(!bases.has(type))bases.set(type,loader.loadAsync(models[type]).then(gltf=>{
      const vrm=gltf.userData.vrm;
      if(!vrm?.humanoid)throw new Error('This character has no humanoid rig.');
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      return vrm;
    }));
    return bases.get(type);
  }
  function tintedMap(source,color,kind) {
    if(!source?.image)return source;
    const cacheKey=source.uuid+color+kind;
    if(materialsBySource.has(cacheKey))return materialsBySource.get(cacheKey);
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(1024,source.image.width);
    canvas.height=Math.min(1024,source.image.height);
    const c=canvas.getContext('2d',{willReadFrequently:true});
    c.drawImage(source.image,0,0,canvas.width,canvas.height);
    const data=c.getImageData(0,0,canvas.width,canvas.height);
    // Keep the original painted fabric and hair strands while giving each resident a palette.
    const rgb=[1,3,5].map(offset=>Number.parseInt(color.slice(offset,offset+2),16));
    for(let p=0;p<data.data.length;p+=4) {
      const luminance=(data.data[p]*.2126+data.data[p+1]*.7152+data.data[p+2]*.0722)/255;
      const shade=kind==='hair'?.26+luminance*.93:.31+luminance*.82;
      for(let channel=0;channel<3;channel++)data.data[p+channel]=Math.min(255,rgb[channel]*shade);
    }
    c.putImageData(data,0,0);
    const map=source.clone();
    map.source=new T.Source(canvas);
    map.needsUpdate=true;
    materialsBySource.set(cacheKey,map);
    return map;
  }
  function addDetails(vrm,person){
    const resources=[];
    const mesh=(parent,shape,color,position)=>{
      const material=new T.MeshStandardMaterial({color,roughness:.78,side:T.DoubleSide});
      const item=new T.Mesh(shape,material);
      item.position.set(...position);
      parent.add(item);
      resources.push(shape,material);
      return item;
    };
    const head=vrm.humanoid.getRawBoneNode('head');
    const left=vrm.humanoid.getRawBoneNode('leftEye');
    const right=vrm.humanoid.getRawBoneNode('rightEye');
    if(head&&left&&right&&['attendant','reader'].includes(person.id)){
      vrm.scene.updateMatrixWorld(true);
      const a=head.worldToLocal(left.getWorldPosition(new T.Vector3()));
      const b=head.worldToLocal(right.getWorldPosition(new T.Vector3()));
      const radius=a.distanceTo(b)*.47;
      for(const p of [a,b]){
        mesh(head,new T.TorusGeometry(radius,.0019,6,28),'#51453c',[p.x,p.y,p.z-.022]);
      }
      mesh(head,new T.BoxGeometry(a.distanceTo(b)-radius*1.6,.0027,.003),'#51453c',[(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2-.022]);
    }
    const neck=vrm.humanoid.getRawBoneNode('neck');
    if(neck&&person.scarf){
      const wrap=mesh(neck,new T.TorusGeometry(.067,.018,8,30),'#a84439',[0,-.012,0]);
      wrap.rotation.x=Math.PI/2;
      const tail=mesh(neck,new T.PlaneGeometry(.056,.27,3,10),'#a84439',[.025,-.132,-.077]);
      const positions=tail.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setZ(i,.009*Math.sin(positions.getY(i)*24));
      tail.geometry.computeVertexNormals();
    }
    const chest=vrm.humanoid.getRawBoneNode('chest');
    if(chest&&person.id==='attendant'){
      const apron=new T.PlaneGeometry(.31,.47,8,12);
      const vertices=apron.attributes.position;
      for(let i=0;i<vertices.count;i++){
        const y=vertices.getY(i);
        vertices.setX(i,vertices.getX(i)*(.88-y*.48));
        vertices.setZ(i,-.013*Math.cos(vertices.getX(i)*26)+.004*Math.sin(y*39));
      }
      apron.computeVertexNormals();
      mesh(chest,apron,'#4a5d58',[0,-.16,-.153]);
      mesh(chest,new T.PlaneGeometry(.16,.09,3,3),'#61716a',[0,-.21,-.17]);
      for(const x of [-.075,.075]){
        const strap=mesh(chest,new T.PlaneGeometry(.022,.23),'#4a5d58',[x,.12,-.103]);
        strap.rotation.x=.15;
      }
    }
    return resources;
  }
  function cloneCharacter(base,person,index) {
    base.scene.updateMatrixWorld(true);
    const body=cloneSkeleton(base.scene);
    const original=[],copied=[];
    base.scene.traverse(node=>original.push(node));
    body.traverse(node=>copied.push(node));
    const nodes=new Map(original.map((node,i)=>[node,copied[i]]));
    for(const originalNode of original){
      if(originalNode.colliderMatrix&&originalNode.shape)nodes.get(originalNode).shape=originalNode.shape;
    }
    nodes.get(base.humanoid.normalizedHumanBonesRoot)?.removeFromParent();
    const ownMaterials=new Map();
    body.traverse(node=>{
      if(!node.isMesh)return;
      node.frustumCulled=false;
      node.castShadow=true;
      node.receiveShadow=true;
      const personalize=source=>{
        if(ownMaterials.has(source))return ownMaterials.get(source);
        const material=source.clone();
        material.outlineWidthFactor=Math.min(material.outlineWidthFactor||0,.0012);
        material.envMapIntensity=.25;
        if(/HAIR/.test(source.name) && source.map) {
          const hair=person.id==='attendant'?'#a4a09a':person.id==='reader'?'#9f876b':person.hair;
          material.map=tintedMap(source.map,hair,'hair');
          material.shadeMultiplyTexture=material.map;
          material.color?.set('#ffffff');
        } else if(/Tops|Onepice/.test(source.name)&&source.map) {
          material.map=tintedMap(source.map,person.coat,'cloth');
          material.shadeMultiplyTexture=material.map;
          material.color?.set('#ffffff');
        }
        ownMaterials.set(source,material);
        return material;
      };
      node.material=Array.isArray(node.material)?node.material.map(personalize):personalize(node.material);
    });
    body.updateMatrixWorld(true);
    const bones=Object.fromEntries(Object.entries(base.humanoid.humanBones).map(([name,bone])=>[name,{node:nodes.get(bone.node)}]).filter(([,bone])=>bone.node));
    const humanoid=new VRMHumanoid(bones,{autoUpdateHumanBones:true});
    body.add(humanoid.normalizedHumanBonesRoot);
    const expressions=new VRMExpressionManager();
    for(const originalExpression of base.expressionManager?.expressions||[]) {
      const expression=new VRMExpression(originalExpression.expressionName);
      expression.isBinary=originalExpression.isBinary;
      expression.overrideBlink=originalExpression.overrideBlink;
      expression.overrideMouth=originalExpression.overrideMouth;
      expression.overrideLookAt=originalExpression.overrideLookAt;
      for(const bind of originalExpression.binds) {
        if(!bind.primitives)continue;
        const primitives=bind.primitives.map(mesh=>nodes.get(mesh)).filter(Boolean);
        if(primitives.length)expression.addBind(new VRMExpressionMorphTargetBind({primitives,index:bind.index,weight:bind.weight}));
      }
      expressions.registerExpression(expression);
    }
    const vrm=new VRMCore({scene:body,meta:base.meta,humanoid,expressionManager:expressions});
    VRMUtils.rotateVRM0(vrm);
    const details=addDetails(vrm,person);
    body.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(body);
    const height=box.max.y-box.min.y;
    const targetHeight=isFemale(person)?1.63+(index%3)*.025:1.70+(index%3)*.027;
    const root=new T.Group();
    root.name=person.name;
    root.scale.setScalar(targetHeight/height);
    root.add(body);
    scene.add(root);
    const record=motion.attach(person.id,vrm,root);
    if(!record) {
      root.removeFromParent();
      throw new Error('The character rig could not be connected.');
    }
    const fallback=people.actors.get(person.id);
    if(fallback) {
      fallback.actor.visible=false;
      if(fallback.shadow)fallback.shadow.visible=false;
    }
    const hairBones=[];
    body.traverse(node=>{
      if(node.isBone&&/J_Sec.*Hair/.test(node.name))hairBones.push({node,rest:node.quaternion.clone()});
    });
    live.set(person.id,{vrm,root,materials:[...ownMaterials.values()],details,hairBones,yaw:0,inertia:0});
    return root;
  }

  async function load() {
    if(loading||enabled||disposed)return;
    loading=true;
    try {
      await Promise.all([
        loadBase('female'),
        loadBase('male'),
        new GLTFLoader().loadAsync(new URL('./assets/people/movements.glb',import.meta.url).href).then(gltf=>motion.setAnimationSource?.(gltf))
      ]);
      if(disposed)return;
      for(const [index,person] of patrons.entries()) {
        if(disposed)return;
        const base=await loadBase(isFemale(person)?'female':'male');
        if(disposed)return;
        cloneCharacter(base,person,index);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      enabled=true;
    } finally {loading=false;}
  }
  async function addArrivals(){
    if(adding||!enabled||disposed)return;
    const missing=patrons.filter(person=>!live.has(person.id));
    if(!missing.length)return;
    adding=true;
    try{
      for(const person of missing){
        const base=await loadBase(isFemale(person)?'female':'male');
        if(disposed)return;
        if(patrons.includes(person))cloneCharacter(base,person,patrons.indexOf(person));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }catch(error){
      console.warn('A late arrival is using the simpler character model.',error);
    }finally{adding=false;}
  }
  function update(minds,time,dt) {
    if(disposed)return;
    void addArrivals();
    for(const [id,character] of live){
      if(patrons.some(person=>person.id===id))continue;
      motion.detach(id);
      character.root.removeFromParent();
      character.materials.forEach(material=>material.dispose());
      character.details.forEach(item=>item.dispose());
      live.delete(id);
    }
    motion.update(minds,time,dt);
    for(const [id,character] of live) {
      const figure=people.actors.get(id);
      if(figure) {
        figure.actor.visible=false;
        if(figure.shadow)figure.shadow.visible=false;
      }
      character.root.visible=people.group.visible&&patrons.some(person=>person.id===id);
      character.vrm.update(dt);
      for(const material of character.materials)material.update?.(dt);
      const change=Math.atan2(Math.sin(character.root.rotation.y-character.yaw),Math.cos(character.root.rotation.y-character.yaw));
      character.inertia+=(change*2-character.inertia)*Math.min(1,dt*7);
      character.yaw=character.root.rotation.y;
      const sway=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),T.MathUtils.clamp(character.inertia,-.055,.055));
      for(const hair of character.hairBones)hair.node.quaternion.copy(hair.rest).multiply(sway);
    }
  }
  return {
    load,update,motion,actors:live,
    get ready(){return enabled;},
    get count(){return live.size;},
    dispose(){
      disposed=true;
      motion.dispose();
      for(const item of live.values()) {
        item.root.removeFromParent();
        item.materials.forEach(material=>material.dispose());
        item.details.forEach(part=>part.dispose());
      }
      for(const texture of materialsBySource.values())texture.dispose();
      live.clear();
      materialsBySource.clear();
      bases.clear();
    }
  };
}
