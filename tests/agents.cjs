const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const nodes=new Map(),handlers=new Map();
const gradient={addColorStop(){}};
const drawing=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(object,key)=>object[key]||(()=>{})});
function node(id){
  if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',style:{},dataset:{},width:460,height:270,clientWidth:id==='#belief-map'?460:1280,clientHeight:578,
    classList:{add(){},remove(){},toggle(){}},setAttribute(){},getContext:()=>drawing,
    cloneNode(){return this;},replaceWith(){},
    addEventListener(type,fn){const key=id+':'+type;if(!handlers.has(key))handlers.set(key,[]);handlers.get(key).push(fn);}
  });return nodes.get(id);
}
const sandbox={console,performance:{now:()=>1000},devicePixelRatio:1,requestAnimationFrame(){},
  document:{querySelector:node,querySelectorAll:()=>[],body:{classList:{add(){},remove(){},toggle(){}}}},
  window:{addEventListener(){}},matchMedia:()=>({matches:false})};
vm.createContext(sandbox);
for(const file of ['app.js','scene.js','agents.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
function check(code){return vm.runInContext(code,sandbox);}
assert.equal(check('minds.size'),9);
assert.equal(check("[...minds.values()].filter(m=>m.role==='attendant').length"),1);
assert.equal(check("[...minds.values()].filter(m=>m.role==='customer').length"),8);
assert(check('[...minds.values()].every(m=>m.belief.filter(Boolean).length<m.belief.length*.45)'));
assert(check('new Set([...minds.values()].map(m=>m.belief)).size===9'));

assert(check(`(()=>{
  const probe=makeMind({id:'probe',x:450,y:260,homeX:450,homeY:260},0);probe.heading=0;
  if(!sensorSees(probe,{x:500,y:260})||sensorSees(probe,{x:400,y:260}))return false;
  probe.heading=Math.PI/2;if(sensorSees(probe,{x:450,y:400}))return false;
  // An ignorant planner may propose crossing an unseen table. A global-map
  // planner would silently avoid it, which would fail this information test.
  const route=beliefPath(probe,{x:450,y:440});if(!route)return false;
  return route.some((p,i)=>lineIntersectsRect(i?route[i-1]:probe.person,p,obstacles.find(o=>o.label==='FOLD 2')));
})()`));
assert(check(`(()=>{
  const person=occupants.find(p=>p.id==='bluecoat'),probe=makeMind(person,4);probe.heading=Math.PI;senseAgent(probe);
  const before=probe.landmarks.get('machine-1');if(!before||before.status!=='running')return false;
  laundryMachines.get(1).running=false;activeMachines.delete(1);probe.heading=0;senseAgent(probe);
  if(probe.landmarks.get('machine-1').status!=='running')return false;
  probe.heading=Math.PI;senseAgent(probe);return probe.landmarks.get('machine-1').status==='available';
})()`));
console.log('PASS: two roles, private partial maps, forward cone, occlusion, no hidden-map route knowledge, stale observations');

check('resetAgents(); walkingPath=()=>{throw new Error("full-map planner was called");};');
const report=check(`(()=>{
  let nearest=Infinity,maxContacts=0;
  for(let step=0;step<Number(${Number(process.env.AGENT_TEST_STEPS)||6000});step++){
    elapsed+=${Number(process.env.AGENT_TEST_DT)||100};updateOccupants(${Number(process.env.AGENT_TEST_DT)||100});
    for(const person of occupants){if(pointBlocked(person))throw Error('penetrated obstacle: '+person.id);}
    for(const [a,b] of occupantPairs()){nearest=Math.min(nearest,distance(a,b));if(distance(a,b)<22.5)throw Error('agent body overlap');}
    if(step%1000===999)console.log('simulation',Math.round(elapsed/1000),'s',JSON.stringify([...minds.values()].map(m=>({id:m.person.id,phase:m.phase,inspected:m.inspected.size,done:[...m.completed],known:m.landmarks.size}))));
  }
  const staff=minds.get('attendant');
  return {seconds:elapsed/1000,minimumSeparation:nearest,staffInspected:staff.inspected.size,repairs:staff.repairs,
    people:[...minds.values()].map(m=>({id:m.person.id,phase:m.phase,steps:[...m.completed],distance:Math.round(m.distance),contacts:m.contacts,known:m.landmarks.size,position:[Math.round(m.person.x),Math.round(m.person.y)],decision:m.decision,target:m.target,path:m.path.length,remaining:m.role==='attendant'?[...m.landmarks.values()].filter(l=>['washer','dryer'].includes(l.kind)&&!m.inspected.has(l.id)).map(l=>l.name):undefined}))};
})()`);
console.log(JSON.stringify(report,null,2));
assert(report.people.every(p=>p.distance>0));
assert(report.people.some(p=>p.steps.includes('fold')),'At least one customer must wash, dry and fold without manual help');
assert.equal(report.staffInspected,14,'Attendant must inspect the entire discovered machine bank');
assert(report.repairs>=1,'Attendant must repair a discovered fault');
for(const fn of handlers.get('#reset:click')||[])fn();
assert(check('occupants.every(p=>p.x===p.homeX&&p.y===p.homeY)&&roomWalks.size===0&&[...minds.values()].every(m=>m.distance===0&&m.inspected.size===0)'));
assert(check(`(()=>{
  addLateCrowd();if(occupants.length!==18||minds.size!==18||new Set(occupants.map(p=>p.id)).size!==18)return false;
  if([...minds.values()].filter(m=>m.role==='customer').length!==17)return false;
  if(occupants.some(p=>pointBlocked(p)))return false;
  for(let i=0;i<300;i++){elapsed+=100;updateOccupants(100);if(occupants.some(p=>pointBlocked(p)))return false;for(const [a,b]of occupantPairs())if(distance(a,b)<22.5)return false;}
  return sharedFootprints.size>0&&[...sharedLandmarks.values()].some(people=>people.size>1);
})()`),'18-person crowd must preserve bodies, private minds and aggregate evidence');
for(const fn of handlers.get('#reset:click')||[])fn();
assert.equal(check('occupants.length'),9);assert.equal(check('sharedFootprints.size'),0);
console.log('PASS: independent goals, obstacle avoidance, agent avoidance, task completion, repair, nine-person reset');
