/* Sensors may read the world. Decisions and routes may read only personal memory.
   The collision gate below is physical contact, not a route-planning oracle. */
const BELIEF={step:18,cols:50,rows:29};
const minds=new Map();
const laundryMachines=new Map();
const originalPeople=occupants.slice();
const sharedFootprints=new Map();
const sharedLandmarks=new Map();
let sharedTracesVisible=false;
let eyesVisible=true;
let learnedPlacesVisible=true;
let lastNotebook=-Infinity;
let lastAgentFrame=0;
const beliefCanvas=document.querySelector('#belief-map');
const beliefCtx=beliefCanvas.getContext('2d');
const facilityName=kind=>({washer:'washer',dryer:'dryer',table:'folding table',exit:'front door',bench:'bench',cart:'laundry cart',room:'staff room',vending:'soap machine'}[kind]||kind);
const cellIndex=p=>clamp(Math.floor(p.y/BELIEF.step),0,BELIEF.rows-1)*BELIEF.cols+clamp(Math.floor(p.x/BELIEF.step),0,BELIEF.cols-1);
const cellPoint=k=>({x:(k%BELIEF.cols+.5)*BELIEF.step,y:(Math.floor(k/BELIEF.cols)+.5)*BELIEF.step});
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const machineId=index=>`machine-${index}`;
const legalPoint=p=>p.x>=30&&p.x<=870&&p.y>=30&&p.y<=490;
const seconds=t=>`${Math.floor(Math.max(0,t)/60000)}:${String(Math.floor(Math.max(0,t)/1000)%60).padStart(2,'0')}`;

function selectedMind(){
  const ref=referent(document.querySelector('#select-a').value);
  return minds.get(ref?.type==='occupant'?ref.id:'mere');
}
function rememberEvent(mind,text){
  if(mind.events.at(-1)?.text===text)return;
  mind.events.push({time:elapsed,text});mind.events=mind.events.slice(-9);
}
function makeMind(person,index){
  const staff=person.id==='attendant';
  return {person,index,role:staff?'attendant':'customer',range:staff?250:210,fov:(staff?125:100)*Math.PI/180,
    heading:Math.atan2(260-person.y,450-person.x),belief:new Uint8Array(BELIEF.cols*BELIEF.rows),visible:new Set(),visibleObjects:new Set(),
    objects:new Map(),landmarks:new Map(),neighbors:[],peopleMemory:new Map(),trail:[],visits:new Map(),events:[],inspected:new Set(),
    phase:staff?'inspect':'seek-wash',completed:new Set(),path:[],target:null,trip:null,scan:2.3,
    nextSense:-Infinity,nextDecision:1200+index*170,manualUntil:0,manualTarget:null,
    distance:0,waited:0,contacts:0,yields:0,repairs:0,interventions:0,finishedAt:null,spawnedAt:elapsed,
    decision:'I know my starting point. Looking around.',workUntil:0,machine:null,blockedFor:0,turnBias:index%2?1:-1,
    edges:new Map(),cooldowns:new Map(),yieldUntil:0};
}
function resetAgents(){
  simulationSpeed=1;document.querySelector('#time-speed').textContent='time 1×';document.querySelector('#time-speed').setAttribute('aria-label','Simulation speed, currently 1 times');
  walking=null;roomWalks.clear();routineMemory.clear();minds.clear();laundryMachines.clear();
  occupants.splice(0,occupants.length,...originalPeople);sharedFootprints.clear();sharedLandmarks.clear();
  refreshPopulationUI(false);
  obstacles.forEach((rect,index)=>{
    if(!['washer','dryer'].includes(rect.kind))return;
    laundryMachines.set(index,{rect,index,owner:null,running:activeMachines.has(index),until:activeMachines.has(index)?14000+index*900:0,finished:false,fault:index===10});
  });
  occupants.forEach((person,index)=>{
    person.manualUntil=0;person.activity=person.id==='attendant'?'looking for machines':'looking for a washer';
    const mind=makeMind(person,index);minds.set(person.id,mind);
    mind.belief[cellIndex(person)]=1;
    mind.landmarks.set('home',{id:'home',name:'starting place',kind:'home',x:person.homeX,y:person.homeY,status:'remembered',seenAt:elapsed,firstSeen:elapsed,visited:0});
    rememberEvent(mind,'Started with an empty map.');
    senseAgent(mind);
  });
  lastAgentFrame=elapsed;lastNotebook=-Infinity;syncRoomRegister();updateNotebook(true);
}

function inCone(mind,point){
  const d=distance(mind.person,point);
  return d<=mind.range&&Math.abs(angleDifference(Math.atan2(point.y-mind.person.y,point.x-mind.person.x),mind.heading))<=mind.fov/2;
}
function sensorSees(mind,point,ignoredRect=null){
  return inCone(mind,point)&&!obstacles.some(rect=>rect!==ignoredRect&&lineIntersectsRect(mind.person,point,rect));
}
function sensedRectPoint(mind,rect){
  const p=mind.person;
  const candidates=[{x:clamp(p.x,rect.x,rect.x+rect.w),y:clamp(p.y,rect.y,rect.y+rect.h)},
    {x:rect.x,y:rect.y+rect.h*.5},{x:rect.x+rect.w,y:rect.y+rect.h*.5},
    {x:rect.x+rect.w*.5,y:rect.y},{x:rect.x+rect.w*.5,y:rect.y+rect.h}];
  return candidates.find(point=>sensorSees(mind,point,rect));
}
function machineObservation(machine,observerId){
  if(machine.fault)return {status:'needs repair',owner:machine.owner};
  if(machine.running)return {status:'running',owner:machine.owner};
  if(machine.finished)return {status:machine.owner===observerId?'ready to collect':'occupied',owner:machine.owner};
  return {status:machine.owner&&machine.owner!==observerId?'occupied':'available',owner:machine.owner};
}
function registerLandmark(mind,id,data){
  const old=mind.landmarks.get(id);
  const isNew=!old;
  if(isNew)rememberEvent(mind,`${data.name}: ${data.status}.`);
  else if(old.status!==data.status)rememberEvent(mind,`${data.name} changed to ${data.status}.`);
  mind.landmarks.set(id,{...old,...data,id,offsetX:data.x-mind.person.homeX,offsetY:data.y-mind.person.homeY,reference:'starting place',firstSeen:old?.firstSeen??elapsed,seenAt:elapsed,visited:old?.visited||0});
  if(!sharedLandmarks.has(id))sharedLandmarks.set(id,new Set());sharedLandmarks.get(id).add(mind.person.id);
}
function senseAgent(mind){
  mind.visible.clear();
  mind.visibleObjects.clear();
  const p=mind.person,step=BELIEF.step;
  const minX=clamp(Math.floor((p.x-mind.range)/step),0,BELIEF.cols-1),maxX=clamp(Math.ceil((p.x+mind.range)/step),0,BELIEF.cols-1);
  const minY=clamp(Math.floor((p.y-mind.range)/step),0,BELIEF.rows-1),maxY=clamp(Math.ceil((p.y+mind.range)/step),0,BELIEF.rows-1);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const k=y*BELIEF.cols+x,q=cellPoint(k);
    if(legalPoint(q)&&!pointBlocked(q)&&sensorSees(mind,q)){mind.belief[k]=1;mind.visible.add(k);}
  }
  mind.belief[cellIndex(p)]=1;mind.visible.add(cellIndex(p));
  obstacles.forEach((rect,index)=>{
    if(!sensedRectPoint(mind,rect))return;
    mind.visibleObjects.add(index);
    // Object recognition reveals this object's own extent, never a hidden neighbor.
    const copy={x:rect.x,y:rect.y,w:rect.w,h:rect.h,kind:rect.kind,label:rect.label};
    if(!mind.objects.has(index))mind.edges.clear();
    mind.objects.set(index,copy);
    for(let y=Math.floor(rect.y/step);y<=Math.floor((rect.y+rect.h)/step);y++)for(let x=Math.floor(rect.x/step);x<=Math.floor((rect.x+rect.w)/step);x++){
      const k=y*BELIEF.cols+x;if(k>=0&&k<mind.belief.length&&pointInRect(cellPoint(k),copy))mind.belief[k]=2;
    }
    if(['washer','dryer','table','bench','vending'].includes(rect.kind)){
      const snapshot=laundryMachines.has(index)?machineObservation(laundryMachines.get(index),p.id):{status:'usable'};
      registerLandmark(mind,laundryMachines.has(index)?machineId(index):`place-${index}`,{name:rect.label,kind:rect.kind,rect:copy,index,x:rect.x+rect.w/2,y:rect.y+rect.h/2,...snapshot});
    }
  });
  const exit=attractors.find(item=>item.id==='door');
  if(sensorSees(mind,exit))registerLandmark(mind,'exit',{name:'front door',kind:'exit',x:exit.x,y:exit.y,status:doorOpen?'open':'closed'});
  mind.neighbors=occupants.filter(other=>other!==p&&sensorSees(mind,other)).map(other=>({id:other.id,x:other.x,y:other.y,seenAt:elapsed}));
  mind.neighbors.forEach(other=>mind.peopleMemory.set(other.id,{...other}));
  mind.nextSense=elapsed+190;
}

/* No obstacle list, real machine state, or other person's map enters this planner. */
function beliefPath(mind,end){
  if(!legalPoint(end))return null;
  const start=mind.person,source=cellIndex(start),target=cellIndex(end),cols=BELIEF.cols;
  if(mind.belief[target]===2)return null;
  const open=[],cost=new Float64Array(mind.belief.length).fill(Infinity),came=new Int32Array(mind.belief.length).fill(-1),closed=new Uint8Array(mind.belief.length);
  const heuristic=k=>Math.hypot(k%cols-target%cols,Math.floor(k/cols)-Math.floor(target/cols));
  const knownRects=[...mind.objects.values()];
  const blocked=(a,b)=>knownRects.some(rect=>lineIntersectsRect(a,b,rect));
  const push=(k,f)=>{let i=open.length;open.push({k,f});while(i){const p=(i-1)>>1;if(open[p].f<=f)break;open[i]=open[p];i=p;}open[i]={k,f};};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let j=i*2+1;if(j+1<open.length&&open[j+1].f<open[j].f)j++;if(last.f<=open[j].f)break;open[i]=open[j];i=j;}open[i]=last;}return first.k;};
  cost[source]=0;push(source,heuristic(source));
  while(open.length){
    const k=pop();if(closed[k])continue;closed[k]=1;
    if(k===target){
      const path=[{x:end.x,y:end.y}];let cur=k;
      while(cur!==source){path.unshift(cellPoint(cur));cur=came[cur];if(cur<0)return null;}
      if(path.length&&blocked(start,path[0]))return null;
      if(path.length>1&&blocked(path[path.length-2],end))return null;
      return path;
    }
    const x=k%cols,y=Math.floor(k/cols),a=k===source?start:cellPoint(k);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=BELIEF.rows)continue;
      const n=ny*cols+nx,b=cellPoint(n);
      if(!legalPoint(b)||mind.belief[n]===2)continue;
      const edgeKey=Math.min(k,n)*mind.belief.length+Math.max(k,n);
      let blockedEdge=k===source?blocked(a,b):mind.edges.get(edgeKey);
      if(blockedEdge===undefined){blockedEdge=blocked(a,b);mind.edges.set(edgeKey,blockedEdge);}
      if(blockedEdge)continue;
      if(dx&&dy&&(mind.belief[y*cols+nx]===2||mind.belief[ny*cols+x]===2))continue;
      const personalObstacle=mind.neighbors.some(other=>distance(other,b)<25&&distance(other,start)>24);
      if(personalObstacle&&n!==target)continue;
      const next=cost[k]+Math.hypot(dx,dy)*(mind.belief[n]===0?1.65:1);
      if(next<cost[n]){cost[n]=next;came[n]=k;push(n,next+heuristic(n));}
    }
  }
  return null;
}
function landmarkApproach(mind,landmark){
  if(!landmark.rect)return {x:landmark.x,y:Math.min(480,landmark.y)};
  const r=landmark.rect;
  let wanted;
  if(r.kind==='washer')wanted={x:r.x+r.w+23,y:r.y+r.h/2};
  else if(r.kind==='dryer')wanted={x:r.x-23,y:r.y+r.h/2};
  else if(r.kind==='table')wanted={x:r.x+r.w*(.22+(mind.index%3)*.28),y:r.y+r.h+24};
  else wanted={x:r.x-25,y:r.y+r.h/2};
  const known=[...mind.objects.values()];
  if(mind.belief[cellIndex(wanted)]!==2&&!known.some(rect=>pointInRect(wanted,rect)))return wanted;
  // Recognition supplies an affordance, but a remembered cart may cover it.
  // Pick another nearby tile from this person's map, not the true floor plan.
  const candidates=[];
  for(let k=0;k<mind.belief.length;k++)if(mind.belief[k]===1){const p=cellPoint(k);if(distance(p,wanted)<60&&!known.some(rect=>pointInRect(p,rect)))candidates.push(p);}
  return candidates.sort((a,b)=>distance(a,wanted)-distance(b,wanted))[0]||wanted;
}
function beginRoute(mind,point,reason,targetId=null){
  const path=beliefPath(mind,point);
  if(!path){mind.scan=Math.max(mind.scan,1.8);mind.nextDecision=elapsed+1300;mind.decision='I cannot connect those remembered tiles yet. Looking for another way.';return false;}
  mind.path=path;mind.target={x:point.x,y:point.y,id:targetId};
  const knownReference=[...mind.landmarks.values()].sort((a,b)=>distance(mind.person,a)-distance(mind.person,b))[0];
  mind.trip={person:mind.person,path:mind.path,points:[{x:mind.person.x,y:mind.person.y}],reference:{name:knownReference?.name||'starting place',point:knownReference||{x:mind.person.homeX,y:mind.person.homeY}},speed:mind.role==='attendant' ? .049 : .043,yielding:false};
  roomWalks.set(mind.person.id,mind.trip);mind.blockedFor=0;mind.decision=reason;mind.person.activity='finding a way';return true;
}
function explore(mind){
  const options=[];
  for(let k=0;k<mind.belief.length;k++){
    if(mind.belief[k]!==1)continue;
    const p=cellPoint(k);if(!legalPoint(p)||distance(p,mind.person)<34)continue;
    const x=k%BELIEF.cols,y=Math.floor(k/BELIEF.cols);
    const unknown=[[1,0],[-1,0],[0,1],[0,-1]].reduce((n,[dx,dy])=>{const nx=x+dx,ny=y+dy;return n+(nx>=0&&nx<BELIEF.cols&&ny>=0&&ny<BELIEF.rows&&mind.belief[ny*BELIEF.cols+nx]===0?1:0);},0);
    if(!unknown)continue;
    options.push({p,k,score:distance(p,mind.person)*.055+(mind.visits.get(k)||0)*20-unknown*6});
  }
  options.sort((a,b)=>a.score-b.score);
  for(const option of options.slice(0,14))if(beginRoute(mind,option.p,'There are tiles I have not seen beyond this edge.')){mind.visits.set(option.k,(mind.visits.get(option.k)||0)+1);return;}
  mind.scan=2*Math.PI;mind.decision='I have not found what I need. Turning to look behind me.';mind.nextDecision=elapsed+2000;
}

function finishRoute(mind){
  if(mind.trip){
    mind.trip.points.push({x:mind.person.x,y:mind.person.y});
    if(selectedMind()===mind)finishMovement(mind.person,mind.trip.points,mind.trip.reference);
  }
  roomWalks.delete(mind.person.id);mind.path=[];mind.trip=null;
  if(mind.target?.id){const mark=mind.landmarks.get(mind.target.id);if(mark)mark.visited++;}
  mind.nextDecision=elapsed+150;mind.scan=.9;
}
function routeStep(mind,dt){
  if(!mind.path.length)return;
  const person=mind.person,target=mind.path[0],d=distance(person,target);
  if(d<1){mind.path.shift();if(!mind.path.length)finishRoute(mind);return;}
  const wanted=Math.atan2(target.y-person.y,target.x-person.x);
  mind.heading+=clamp(angleDifference(wanted,mind.heading),-dt*.0045,dt*.0045);
  const travel=Math.min(d,dt*(mind.role==='attendant' ? .049 : .043));
  const next={x:person.x+(target.x-person.x)/d*travel,y:person.y+(target.y-person.y)/d*travel};
  if([...mind.objects.values()].some(rect=>lineIntersectsRect(person,next,rect))){finishRoute(mind);mind.decision='That newly seen object cuts across my route. Replanning.';return;}
  // Physical collision resolution. A hidden obstruction can stop a body, but
  // its distant location is never supplied to the planner in advance.
  const hit=obstacles.find(rect=>pointInRect(next,rect)||lineIntersectsRect(person,next,rect));
  if(hit){
    mind.contacts++;mind.belief[cellIndex(next)]=2;mind.heading=wanted;senseAgent(mind);
    rememberEvent(mind,'A nearby obstruction stopped this step.');finishRoute(mind);mind.scan=1.8;mind.decision='Something blocks this route. I need another way.';return;
  }
  const other=occupants.find(p=>p!==person&&distance(next,p)<24&&distance(next,p)<distance(person,p));
  if(other){
    if(mind.blockedFor===0)mind.yields++;
    mind.blockedFor+=dt;mind.waited+=dt;mind.person.activity='letting someone pass';if(mind.trip)mind.trip.yielding=true;
    mind.heading=Math.atan2(other.y-person.y,other.x-person.x);senseAgent(mind);
    const receiver=minds.get(other.id);
    if(receiver?.phase==='done')receiver.giveWayRequest={x:person.x,y:person.y,until:elapsed+2200};
    mind.decision='Someone is in the way. Waiting, then trying a different tile.';
    if(mind.blockedFor>800+(mind.index%3)*180){
      const old=mind.target;if(old?.id)mind.cooldowns.set(old.id,elapsed+6500);
      finishRoute(mind);mind.scan=0;mind.yieldUntil=elapsed+1800;
      const candidates=[];
      for(let k=0;k<mind.belief.length;k++)if(mind.belief[k]===1){const q=cellPoint(k),d0=distance(person,q);if(d0>17&&d0<75&&distance(q,other)>distance(person,other)+18)candidates.push({q,score:d0-distance(q,other)*.2});}
      candidates.sort((a,b)=>a.score-b.score);
      for(const item of candidates.slice(0,8))if(beginRoute(mind,item.q,'Making room so the other person can pass.'))break;
      mind.nextDecision=elapsed+1300;
    }
    return;
  }
  mind.blockedFor=0;if(mind.trip)mind.trip.yielding=false;
  person.x=next.x;person.y=next.y;person.baseX=next.x;person.baseY=next.y;person.activity=mind.manualUntil>elapsed?'walking with you':'exploring';
  mind.distance+=travel;
  const footprint=cellIndex(person);if(!sharedFootprints.has(footprint))sharedFootprints.set(footprint,new Set());sharedFootprints.get(footprint).add(person.id);
  if(mind.lastCell!==footprint){mind.trail.push({x:person.x,y:person.y});mind.lastCell=footprint;}
  if(mind.trip&&distance(person,mind.trip.points.at(-1))>5)mind.trip.points.push({x:person.x,y:person.y});
  if(travel>=d-.01){mind.path.shift();if(!mind.path.length)finishRoute(mind);}
}

function rememberedCandidates(mind,kind,predicate=()=>true){
  return [...mind.landmarks.values()].filter(mark=>mark.kind===kind&&predicate(mark)&&(mind.cooldowns.get(mark.id)||0)<=elapsed).sort((a,b)=>distance(mind.person,landmarkApproach(mind,a))-distance(mind.person,landmarkApproach(mind,b)));
}
function nearLandmark(mind,landmark){return distance(mind.person,landmarkApproach(mind,landmark))<23;}
function startCycle(mind,landmark,cycle){
  const machine=laundryMachines.get(landmark.index);
  if(!machine||machine.fault||machine.running||(machine.owner&&machine.owner!==mind.person.id)){
    if(machine)registerLandmark(mind,landmark.id,{...landmark,...machineObservation(machine,mind.person.id)});
    mind.decision='It is no longer free. I will look for another machine.';mind.scan=1.1;return false;
  }
  machine.owner=mind.person.id;machine.running=true;machine.finished=false;machine.until=elapsed+(cycle==='wash'?16000:13000);
  activeMachines.add(machine.index);mind.machine=landmark.id;mind.phase=cycle==='wash'?'wash-wait':'dry-wait';
  mind.person.activity=cycle==='wash'?'washing':'drying';mind.decision=`My ${cycle==='wash'?'wash':'dryer'} is running. I will watch for the door light.`;
  registerLandmark(mind,landmark.id,{...landmark,status:'running',owner:mind.person.id});rememberEvent(mind,`${landmark.name}: started ${cycle}.`);return true;
}
function collectCycle(mind,landmark,cycle){
  const machine=laundryMachines.get(landmark.index);
  if(!machine||machine.owner!==mind.person.id||!machine.finished)return false;
  machine.owner=null;machine.finished=false;machine.running=false;activeMachines.delete(machine.index);
  mind.completed.add(cycle);mind.machine=null;mind.phase=cycle==='wash'?'seek-dry':'seek-fold';mind.scan=1.1;
  registerLandmark(mind,landmark.id,{...landmark,status:'available',owner:null});
  rememberEvent(mind,`${cycle==='wash'?'Washing':'Drying'} finished. Clothes collected.`);return true;
}
function chooseKnownStation(mind,kind,predicate,reason){
  const options=rememberedCandidates(mind,kind,predicate);
  for(const mark of options){
    if(nearLandmark(mind,mark))return mark;
    if(beginRoute(mind,landmarkApproach(mind,mark),reason(mark),mark.id))return null;
  }
  return undefined;
}
function decideCustomer(mind){
  const person=mind.person;
  if(mind.phase==='done'){person.activity='laundry finished';return;}
  if(mind.phase==='seek-wash'||mind.phase==='seek-dry'){
    const cycle=mind.phase==='seek-wash'?'wash':'dry',kind=cycle==='wash'?'washer':'dryer';
    const mark=chooseKnownStation(mind,kind,m=>m.status==='available',m=>`${m.name} was free when I saw it. Going to check.`);
    if(mark){startCycle(mind,mark,cycle);return;}
    if(mark===null)return;
    person.activity=`looking for a ${kind}`;mind.decision=`I have not seen an available ${kind} yet. Looking further.`;explore(mind);return;
  }
  if(mind.phase==='wash-wait'||mind.phase==='dry-wait'){
    const mark=mind.landmarks.get(mind.machine),cycle=mind.phase==='wash-wait'?'wash':'dry';
    if(!mark){mind.phase=cycle==='wash'?'seek-wash':'seek-dry';return;}
    const point=landmarkApproach(mind,mark);
    if(!nearLandmark(mind,mark)){beginRoute(mind,point,`I remember leaving my clothes at ${mark.name}.`,mark.id);return;}
    mind.heading=Math.atan2(mark.y-person.y,mark.x-person.x);person.activity=cycle==='wash'?'waiting for wash':'waiting for dryer';
    mind.decision=`Watching ${mark.name}. Its remembered state is ${mark.status}.`;
    if(mark.status==='ready to collect')collectCycle(mind,mark,cycle);
    mind.nextDecision=elapsed+400;return;
  }
  if(mind.phase==='seek-fold'){
    const mark=chooseKnownStation(mind,'table',()=>true,m=>`I remember a folding surface at ${m.name}.`);
    if(mark){mind.phase='folding';mind.workUntil=elapsed+6000;mind.target={id:mark.id,...landmarkApproach(mind,mark)};person.activity='folding clean clothes';mind.decision='A clear table. Folding the dry clothes.';return;}
    if(mark===null)return;explore(mind);return;
  }
  if(mind.phase==='folding'){
    person.activity='folding clean clothes';
    if(elapsed>=mind.workUntil){mind.completed.add('fold');mind.phase='return';mind.returnStart=mind.distance;rememberEvent(mind,'Clothes folded. Returning to my starting place.');}
    return;
  }
  if(mind.phase==='return'){
    const home=mind.landmarks.get('home');
    if(distance(person,home)<40){mind.completed.add('home');mind.phase='done';mind.finishedAt=elapsed;mind.returnDistance=mind.distance-(mind.returnStart||0);person.activity='laundry finished';mind.decision='Washed, dried, folded, and back with my clothes.';rememberEvent(mind,'Task complete.');return;}
    beginRoute(mind,home,'I kept my starting place as a landmark. Going back.','home');
  }
}
function decideAttendant(mind){
  const repairs=[...mind.landmarks.values()].filter(m=>m.status==='needs repair');
  const uninspected=[...mind.landmarks.values()].filter(m=>['washer','dryer'].includes(m.kind)&&!mind.inspected.has(m.id));
  const options=(repairs.length?repairs:uninspected).filter(m=>(mind.cooldowns.get(m.id)||0)<=elapsed).sort((a,b)=>distance(mind.person,landmarkApproach(mind,a))-distance(mind.person,landmarkApproach(mind,b)));
  if(mind.phase==='servicing'){
    mind.person.activity='repairing a dryer';
    if(elapsed>=mind.workUntil){
      const mark=mind.landmarks.get(mind.machine),world=laundryMachines.get(mark.index);
      if(world.fault){world.fault=false;mind.repairs++;registerLandmark(mind,mark.id,{...mark,...machineObservation(world,mind.person.id)});rememberEvent(mind,`${mark.name}: repaired.`);}
      mind.inspected.add(mark.id);mind.phase='inspect';mind.machine=null;
    }
    return;
  }
  if(mind.phase==='checking'){
    mind.person.activity='inspecting a machine';
    if(elapsed>=mind.workUntil){mind.inspected.add(mind.machine);const m=mind.landmarks.get(mind.machine);rememberEvent(mind,`${m.name}: inspected.`);mind.phase='inspect';mind.machine=null;}
    return;
  }
  if(mind.inspected.size===laundryMachines.size&&!repairs.length){
    if(!mind.finishedAt){mind.finishedAt=elapsed;rememberEvent(mind,'Every machine inspected.');}
    mind.phase='done';mind.person.activity='inspection complete';mind.decision='All 14 machines inspected. Watching for new trouble.';mind.scan=.6;return;
  }
  mind.phase='inspect';
  for(const mark of options){
    const closeEnoughToInspect=mark.seenAt>=elapsed-300&&pointRectDistance(mind.person,mark.rect)<75;
    if(nearLandmark(mind,mark)||(mark.status!=='needs repair'&&closeEnoughToInspect)){
      mind.heading=Math.atan2(mark.y-mind.person.y,mark.x-mind.person.x);mind.machine=mark.id;
      mind.phase=mark.status==='needs repair'?'servicing':'checking';mind.workUntil=elapsed+(mind.phase==='servicing'?4000:1100);
      mind.decision=mind.phase==='servicing'?`${mark.name} has a fault. I can repair it here.`:`Checking ${mark.name} before marking it on my inspection map.`;return;
    }
    if(beginRoute(mind,landmarkApproach(mind,mark),mark.status==='needs repair'?`I remember a fault at ${mark.name}.`:`${mark.name} is on my map but has not been inspected.`,mark.id))return;
  }
  mind.person.activity='mapping the machine banks';explore(mind);
}
function updateLaundryWorld(){
  for(const machine of laundryMachines.values()){
    const switchedOn=activeMachines.has(machine.index);
    if(switchedOn!==machine.running){
      machine.running=switchedOn;
      if(switchedOn){machine.finished=false;machine.until=elapsed+16000;}
      else machine.finished=!!machine.owner;
    }
    if(machine.running&&elapsed>=machine.until){machine.running=false;machine.finished=!!machine.owner;activeMachines.delete(machine.index);}
  }
}
function cognitiveStep(dt){
  updateLaundryWorld();
  for(const mind of minds.values()){
    const person=mind.person;
    if(elapsed>=mind.nextSense)senseAgent(mind);
    if(draggedOccupant===person)continue;
    if(mind.path.length){routeStep(mind,dt);continue;}
    if(mind.phase==='done'&&mind.giveWayRequest?.until>elapsed){
      const request=mind.giveWayRequest;mind.giveWayRequest=null;
      const options=[];
      for(let k=0;k<mind.belief.length;k++)if(mind.belief[k]===1){const p=cellPoint(k),d=distance(p,person);if(d>22&&d<70&&distance(p,request)>50)options.push({p,score:d-distance(p,request)*.15});}
      options.sort((a,b)=>a.score-b.score);
      for(const choice of options.slice(0,10))if(beginRoute(mind,choice.p,'Making space after someone asked to pass.'))break;
      continue;
    }
    if(elapsed<mind.yieldUntil){person.activity='letting someone pass';continue;}
    if(mind.manualUntil>elapsed){
      if(mind.manualTarget){const p=mind.manualTarget;mind.manualTarget=null;beginRoute(mind,p,'You gave me this destination. I still have to discover the way.');}
      else person.activity='waiting for you';continue;
    }
    if(mind.scan>0){
      const delta=Math.min(mind.scan,dt*.0028);mind.heading+=delta*mind.turnBias;mind.scan-=delta;
      if(!mind.path.length)person.activity='looking around';continue;
    }
    if(elapsed<mind.nextDecision)continue;
    mind.nextDecision=elapsed+350;
    if(mind.role==='attendant')decideAttendant(mind);else decideCustomer(mind);
  }
  if(elapsed-lastAgentFrame>350){syncRoomRegister();updateNotebook();lastAgentFrame=elapsed;}
}

function visionPolygon(mind){
  const points=[{x:mind.person.x,y:mind.person.y,z:1}];
  for(let i=0;i<=48;i++){
    const angle=mind.heading-mind.fov/2+mind.fov*i/48,direction={x:Math.cos(angle),y:Math.sin(angle)};
    const r=Math.min(mind.range,boundaryDistance(mind.person,direction),...obstacles.map(rect=>rayRectDistance(mind.person,direction,rect)));
    points.push({x:mind.person.x+direction.x*r,y:mind.person.y+direction.y*r,z:1});
  }
  return points;
}
const ordinaryRelations=groundRelations;
groundRelations=function(){
  ordinaryRelations();
  if(sharedTracesVisible)for(const [k,people] of sharedFootprints){
    const p=cellPoint(k),n=people.size;const color=n>=6?'#e3b66b':n>=3?'#c77eaa':'#7d8cba';
    groundRect(p.x-8,p.y-8,16,16,rgba(color,Math.min(.48,.1+n*.055)),1,null);
  }
  const mind=selectedMind();if(!mind)return;
  const color=mind.role==='attendant'?'#e3b66b':'#74c8bb';
  if(eyesVisible){
    face(visionPolygon(mind),rgba(color,.13),rgba(color,.48),1);
    const end={x:mind.person.x+Math.cos(mind.heading)*24,y:mind.person.y+Math.sin(mind.heading)*24,z:2};
    wire([{...mind.person,z:2},end],color,2);
  }
  if(learnedPlacesVisible){
    const marks=[...mind.landmarks.values()].filter(m=>m.kind!=='home').sort((a,b)=>(b.id===mind.target?.id?100000:0)+b.seenAt-((a.id===mind.target?.id?100000:0)+a.seenAt)).slice(0,4);
    for(const mark of marks){
      const p=landmarkApproach(mind,mark);const base=screen({...p,z:2}),top=screen({...p,z:19});
      ctx.save();ctx.strokeStyle=rgba(color,.7);ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(top.x,top.y);ctx.stroke();
      ctx.fillStyle=mark.status==='needs repair'?'#d99579':'#cfb798';ctx.fillRect(top.x-3,top.y-6,19,9);ctx.fillStyle='#3f2d46';ctx.font='600 7px Avenir Next Condensed, Arial';ctx.fillText(mark.name.replace(' ','').toLowerCase(),top.x-1,top.y+1);ctx.restore();
    }
  }
};
const ordinaryMarkers=selectedMarkers;
selectedMarkers=function(){
  ordinaryMarkers();if(!sharedTracesVisible)return;
  const known=new Map();for(const mind of minds.values())for(const [id,mark] of mind.landmarks)if(id!=='home'&&!known.has(id))known.set(id,mark);
  for(const [id,people] of sharedLandmarks)if(people.size>1){const mark=known.get(id);if(mark)labelAt(`×${people.size}`,{x:mark.x,y:mark.y,z:mark.kind==='table'?61:87},'#e9bc81',10,'center');}
};
const ordinaryMachineModel=machineModel;
machineModel=function(rect,index){
  ordinaryMachineModel(rect,index);
  const machine=laundryMachines.get(index);if(!machine)return;
  const h=rect.kind==='dryer'?74:60;
  if(machine.fault){
    face([{x:rect.x+5,y:rect.y+5,z:h+1},{x:rect.x+32,y:rect.y+5,z:h+1},{x:rect.x+32,y:rect.y+22,z:h+1},{x:rect.x+5,y:rect.y+22,z:h+1}],'#b97876','#ddab8d',.7);
    labelAt('修理',{x:rect.x+9,y:rect.y+17,z:h+2},'#f0d8ae',9);
    const edge=rect.x<450?rect.x+rect.w:rect.x;
    wire([{x:edge,y:rect.y+8,z:20},{x:edge,y:rect.y+rect.h-8,z:48}],'#c7857d',2);
    wire([{x:edge,y:rect.y+rect.h-8,z:20},{x:edge,y:rect.y+8,z:48}],'#c7857d',2);
  }else if(machine.owner){
    const mark=machine.finished?'collect':'in use';
    labelAt(mark,{x:rect.x+11,y:rect.y+rect.h-5,z:h+2},machine.finished?'#7bc5ac':'#64576a',8);
  }
};

function paintBeliefMap(mind){
  const width=beliefCanvas.clientWidth||460,height=width*520/900,ratio=Math.min(devicePixelRatio||1,2);
  if(beliefCanvas.width!==Math.round(width*ratio)||beliefCanvas.height!==Math.round(height*ratio)){
    beliefCanvas.width=Math.round(width*ratio);beliefCanvas.height=Math.round(height*ratio);
  }
  const c=beliefCtx,scale=width/900;c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#211c32';c.fillRect(0,0,width,height);
  for(let k=0;k<mind.belief.length;k++){
    const value=mind.belief[k];if(!value)continue;
    const p=cellPoint(k);c.fillStyle=value===2?'#696076':mind.visible.has(k)?'#84ada0':'#a69a9e';
    c.globalAlpha=value===2?.88:mind.visible.has(k)?.8:.35;
    c.fillRect((p.x-9)*scale,(p.y-9)*scale,17*scale,17*scale);
  }
  c.globalAlpha=1;
  for(const object of mind.objects.values()){
    c.strokeStyle='#9c899c';c.lineWidth=.7;c.strokeRect(object.x*scale,object.y*scale,object.w*scale,object.h*scale);
  }
  if(mind.trail.length>1){c.beginPath();mind.trail.forEach((p,i)=>i?c.lineTo(p.x*scale,p.y*scale):c.moveTo(p.x*scale,p.y*scale));c.strokeStyle='rgba(193,139,169,.5)';c.lineWidth=.8;c.stroke();}
  for(const remembered of mind.peopleMemory.values()){
    const age=elapsed-remembered.seenAt;c.fillStyle=age<500?'#e4b9c8':'#ae8ba6';c.globalAlpha=Math.max(.18,1-age/25000);c.fillRect(remembered.x*scale-1.7,remembered.y*scale-1.7,3.4,3.4);
  }
  c.globalAlpha=1;
  if(mind.path.length){
    c.beginPath();c.moveTo(mind.person.x*scale,mind.person.y*scale);mind.path.forEach(p=>c.lineTo(p.x*scale,p.y*scale));c.strokeStyle='#e7c585';c.setLineDash([2,3]);c.lineWidth=1;c.stroke();c.setLineDash([]);
  }
  if(eyesVisible){
    const polygon=visionPolygon(mind);c.beginPath();polygon.forEach((p,i)=>i?c.lineTo(p.x*scale,p.y*scale):c.moveTo(p.x*scale,p.y*scale));c.closePath();c.fillStyle='rgba(135,208,183,.12)';c.fill();c.strokeStyle='rgba(135,208,183,.5)';c.lineWidth=.8;c.stroke();
  }
  if(learnedPlacesVisible)for(const mark of mind.landmarks.values()){
    const x=mark.x*scale,y=mark.y*scale;c.fillStyle=mark.status==='needs repair'?'#e39d82':mark.kind==='home'?'#d8b4c6':'#ecd3a5';c.fillRect(x-2,y-2,4,4);
    if(mark.kind!=='home'){c.font='9px Avenir Next Condensed, Arial';c.fillText(mark.name.replace(' ',''),x+5,y+3);}
  }
  const p=mind.person;c.fillStyle='#ff8a9c';c.beginPath();c.arc(p.x*scale,p.y*scale,3,0,Math.PI*2);c.fill();
  c.strokeStyle='#ff8a9c';c.lineWidth=1.4;c.beginPath();c.moveTo(p.x*scale,p.y*scale);c.lineTo((p.x+Math.cos(mind.heading)*24)*scale,(p.y+Math.sin(mind.heading)*24)*scale);c.stroke();
  c.fillStyle='#8e7b98';c.font='9px Avenir Next Condensed, Arial';c.fillText('N',width-15,14);c.strokeStyle='#8e7b98';c.beginPath();c.moveTo(width-12,20);c.lineTo(width-12,29);c.stroke();
}
function updateNotebook(force=false){
  if(!force&&elapsed-lastNotebook<300)return;
  lastNotebook=elapsed;const mind=selectedMind();if(!mind)return;
  const person=mind.person,staff=mind.role==='attendant',usedTime=(mind.finishedAt??elapsed)-mind.spawnedAt;
  const focusName = document.querySelector('#focus-name');
  const focusRole = document.querySelector('#focus-role');
  const focusDecision = document.querySelector('#focus-decision');
  const focusDestination = document.querySelector('#focus-destination');
  const destination = mind.path.length ? mind.landmarks.get(mind.target?.id) : null;
  focusName.textContent = staff ? 'Night attendant' : person.name.replace(' folding', '');
  focusRole.textContent = staff ? 'Staff' : 'Customer';
  focusDecision.textContent = mind.decision;
  focusDestination.hidden = !destination;
  focusDestination.textContent = destination ? `Heading to ${destination.name}` : '';
  const known=mind.belief.reduce((n,value,k)=>n+(value&&legalPoint(cellPoint(k))?1:0),0);
  let total=0;for(let k=0;k<mind.belief.length;k++)if(legalPoint(cellPoint(k)))total++;
  document.querySelector('#agent-role').textContent=staff?'night attendant':'customer';
  document.querySelector('#agent-name').textContent=staff?'The inspection sheet':`${person.name.replace(' folding','')} remembers`;
  document.querySelector('#agent-goal').textContent=staff?'Find every machine, inspect it, and repair any faults you discover.':'Find an available washer, dry the clothes, fold them, and return with the laundry.';
  document.querySelector('#agent-thought').textContent=mind.decision;
  document.querySelector('#agent-stats').innerHTML=`<span><b>${(mind.distance*METERS_PER_UNIT).toFixed(1)} m</b>walked</span><span><b>${seconds(usedTime)}</b>${mind.finishedAt?'completed in':'time elapsed'}</span><span><b>${Math.round(known/total*100)}%</b>of the map learned</span>`;
  if(staff){
    document.querySelector('#agent-progress').innerHTML=`<span class="${mind.inspected.size===14?'done':'current'}">${mind.inspected.size} of 14 inspected</span><span class="${mind.repairs?'done':''}">${mind.repairs} repaired</span>`;
  }else{
    const keys=['wash','dry','fold','home'],current=mind.phase.includes('wash')?'wash':mind.phase.includes('dry')?'dry':mind.phase.includes('fold')?'fold':'home';
    document.querySelector('#agent-progress').innerHTML=keys.map(key=>`<span class="${mind.completed.has(key)?'done':current===key?'current':''}">${key==='home'?'return':key}</span>`).join('');
  }
  const limit=staff?180000:240000;
  const result=mind.finishedAt?usedTime<=limit?'Target met. ':'Finished after the time target. ':'';
  document.querySelector('#agent-criterion').textContent=`${result}${staff?'Inspect all 14 machines within 3:00.':'Complete all four steps within 4:00.'} Shorter travel is better. ${mind.yields} yields${mind.interventions?`, ${mind.interventions} manual interventions`:''}.${mind.returnDistance!==undefined?` Return using memory: ${(mind.returnDistance*METERS_PER_UNIT).toFixed(1)} m.`:''}`;
  const entries=[...mind.landmarks.values()].filter(m=>m.id!=='home').sort((a,b)=>(b.status==='needs repair'?100000:0)+b.seenAt-((a.status==='needs repair'?100000:0)+a.seenAt)).slice(0,5);
  const signature=entries.map(m=>`${m.id}:${m.status}:${Math.floor(m.seenAt/1000)}:${m.visited}`).join('|')+person.id;
  const list=document.querySelector('#agent-landmarks');
  if(list.dataset.signature!==signature){
    list.dataset.signature=signature;
    list.innerHTML=entries.length?entries.map(m=>`<button type="button" data-landmark="${m.id}"><b>${m.name}</b><span>${m.status}</span><small>seen ${seconds(m.seenAt)} - ${Math.round(Math.abs(m.offsetX)*METERS_PER_UNIT)} m ${m.offsetX>=0?'east':'west'}, ${Math.round(Math.abs(m.offsetY)*METERS_PER_UNIT)} m ${m.offsetY>=0?'south':'north'} of start</small></button>`).join(''):'<p>No useful place discovered yet. Walk or look around to find one.</p>';
  }
  const last=mind.events.at(-1);document.querySelector('#agent-log').textContent=last?`${seconds(last.time)} - ${last.text}`:'';
  paintBeliefMap(mind);
  const common=[...sharedLandmarks.values()].filter(s=>s.size>1).length;
  document.querySelector('#trace-summary').textContent=`${occupants.length} people - ${common} landmarks remembered by more than one person`;
}

function refreshPopulationUI(preserve=true){
  const a=document.querySelector('#select-a').value,b=document.querySelector('#select-b').value;
  updateRegister();fillSelects();if(preserve){document.querySelector('#select-a').value=a;document.querySelector('#select-b').value=b;}
  document.querySelector('#population-count').textContent=`${occupants.length} people`;
}
function addLateCrowd(){
  if(occupants.length>=18){note('the room is at its 18-person workshop limit');return;}
  const candidates=[];
  for(let y=60;y<480;y+=47)for(let x=60;x<850;x+=47)if(!pointBlocked({x,y}))candidates.push({x,y,rank:(x*17+y*31)%113});
  candidates.sort((a,b)=>a.rank-b.rank);let added=0;
  for(const p of candidates){
    if(added===9)break;if(occupants.some(other=>distance(other,p)<47))continue;
    const template=originalPeople[(added+4)%originalPeople.length],index=occupants.length;
    const person={...template,id:`arrival-${index}`,name:`late arrival ${added+1}`,attention:[...template.attention],x:p.x,y:p.y,baseX:p.x,baseY:p.y,homeX:p.x,homeY:p.y,seated:false,phase:index*.7,activity:'arriving',manualUntil:0};
    occupants.push(person);const mind=makeMind(person,index);minds.set(person.id,mind);mind.belief[cellIndex(person)]=1;
    mind.landmarks.set('home',{id:'home',name:'starting place',kind:'home',x:p.x,y:p.y,status:'remembered',seenAt:elapsed,firstSeen:elapsed,visited:0});senseAgent(mind);added++;
  }
  attentionPairCache=null;refreshPopulationUI();syncRoomRegister();updateComparison(true);updateNotebook(true);
  note(`${added} late arrivals. Each starts with a separate, mostly unknown map.`);
}

// Replace the old full-map routines, including manual walking. An observer may
// see the whole cutaway, but each body acts from a different partial map.
updateOccupants=cognitiveStep;
holdPerson=function(person){
  const mind=minds.get(person.id);if(!mind)return;
  roomWalks.delete(person.id);mind.path=[];mind.trip=null;mind.manualTarget=null;mind.manualUntil=elapsed+45000;mind.interventions++;
  person.manualUntil=mind.manualUntil;person.activity='waiting for you';mind.decision='You moved me. I can only add what I see from here.';
};
walkTo=function(point){
  const mind=selectedMind();if(!mind)return;
  if(!legalPoint(point)){note('choose a tile inside the room');return;}
  holdPerson(mind.person);mind.manualTarget={x:point.x,y:point.y};mind.scan=0;
  note(`${mind.person.name} will find a route using their own map`);updateNotebook(true);
};
function resumeSelectedMind(){
  const mind=selectedMind();if(!mind)return;
  mind.manualUntil=0;mind.manualTarget=null;mind.person.manualUntil=0;mind.path=[];mind.trip=null;roomWalks.delete(mind.person.id);mind.scan=.8;mind.nextDecision=elapsed;
  note(`${mind.person.name} decides what to do next`);updateNotebook(true);
}
document.querySelector('#agent-resume').addEventListener('click',resumeSelectedMind);
document.querySelector('#crowd-more').addEventListener('click',addLateCrowd);
document.querySelector('#time-speed').addEventListener('click',event=>{
  simulationSpeed=simulationSpeed===1?4:simulationSpeed===4?8:1;
  event.currentTarget.textContent=`time ${simulationSpeed}×`;
  event.currentTarget.setAttribute('aria-label',`Simulation speed, currently ${simulationSpeed} times`);
  note(`Watching at ${simulationSpeed}× speed. Goals and cycles still use simulation seconds.`);
});
document.querySelector('#shared-traces').addEventListener('click',event=>{
  sharedTracesVisible=!sharedTracesVisible;event.currentTarget.setAttribute('aria-pressed',String(sharedTracesVisible));event.currentTarget.classList.toggle('selected',sharedTracesVisible);document.querySelector('#trace-key').hidden=!sharedTracesVisible;updateNotebook(true);
});
document.querySelector('#agent-vision').addEventListener('click',event=>{
  eyesVisible=!eyesVisible;event.currentTarget.classList.toggle('selected',eyesVisible);event.currentTarget.setAttribute('aria-pressed',String(eyesVisible));updateNotebook(true);
});
document.querySelector('#agent-memory-toggle').addEventListener('click',event=>{
  learnedPlacesVisible=!learnedPlacesVisible;event.currentTarget.setAttribute('aria-pressed',String(learnedPlacesVisible));event.currentTarget.textContent=learnedPlacesVisible?'hide learned places':'show learned places';updateNotebook(true);
});
// The previous aisle command is now a deliberate head turn, so a teacher can
// inspect discovery even while the simulation clock is paused.
document.querySelector('#walk-aisle').replaceWith(document.querySelector('#walk-aisle').cloneNode(true));
document.querySelector('#walk-aisle').addEventListener('click',()=>{
  const mind=selectedMind();if(!mind)return;mind.heading+=Math.PI/3;senseAgent(mind);mind.decision='Looking in another direction. New tiles become part of my map.';updateNotebook(true);
});
document.querySelector('#jam-dryer').addEventListener('click',()=>{
  const dryers=[...laundryMachines.values()].filter(m=>m.rect.kind==='dryer'&&!m.fault);
  const machine=dryers[0];if(!machine)return;machine.fault=true;
  note(`${machine.rect.label} needs repair. Each person will learn this only when they see it.`);updateNotebook(true);
});
document.querySelector('#agent-landmarks').addEventListener('click',event=>{
  const button=event.target.closest('[data-landmark]');if(!button)return;
  const mind=selectedMind(),mark=mind?.landmarks.get(button.dataset.landmark);if(!mark)return;
  walkTo(landmarkApproach(mind,mark));mind.decision=`You asked me to return to the remembered ${mark.name}.`;updateNotebook(true);
});
['#select-a','#select-b','#attention-register'].forEach(selector=>document.querySelector(selector).addEventListener(selector==='#attention-register'?'click':'change',()=>updateNotebook(true)));
canvas.addEventListener('pointerup',()=>updateNotebook(true));
document.querySelector('#reset').addEventListener('click',resetAgents);
window.addEventListener('resize',()=>updateNotebook(true));
resetAgents();
