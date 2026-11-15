export function buildPeople(T, scene, patrons, world) {
  const group = new T.Group();
  scene.add(group);
  const shared = {
    ball:new T.SphereGeometry(1,16,12),
    limb:new T.CylinderGeometry(.84,1,1,10),
    shadow:new T.CircleGeometry(1,24)
  };
  function piece(parent,geometry,material,position,scale) {
    const mesh = new T.Mesh(geometry,material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }
  const cloth = color => new T.MeshStandardMaterial({color,roughness:.9});
  const trousers = ['#303844','#293441','#333b39','#283039','#3a3940','#363c48'];
  const skins = ['#ceb098','#c3a28c','#c6a18a','#b99278','#c9a794'];
  const actors = new Map();
  for (const [i,person] of patrons.entries()) {
    const actor = new T.Group();
    group.add(actor);
    const clothes = cloth(person.coat);
    const seams = cloth(new T.Color(person.coat).multiplyScalar(.74));
    const hair = cloth(person.hair);
    const skin = cloth(skins[i%skins.length]);
    const pants = cloth(trousers[i%trousers.length]);
    const shoes = cloth(i === 0 ? '#d0cdc0' : '#252a30');
    const torso = piece(actor,shared.limb,clothes,[0,1.195,0],[.245,.53,.139]);
    torso.geometry = torso.geometry.clone().rotateY(Math.PI/10);
    piece(actor,shared.ball,clothes,[0,1.404,-.003],[.222,.10,.126]);
    piece(actor,shared.ball,seams,[0,1.18,.127],[.012,.225,.023]);
    piece(actor,shared.limb,seams,[0,1.449,0],[.085,.065,.077]);
    piece(actor,shared.limb,skin,[0,1.477,.006],[.059,.12,.056]);
    const head = piece(actor,shared.ball,skin,[0,1.61,0],[.105,.133,.101]);
    piece(head,shared.ball,hair,[0,.38,-.14],[1.03,.69,.97]);
    piece(head,shared.ball,hair,[0,-.01,-.63],[.94,.89,.44]);
    piece(head,shared.ball,skin,[0,-.03,.93],[.16,.17,.23]);
    if (person.longHair) piece(actor,shared.ball,hair,[0,1.43,-.084],[.113,.205,.064]);
    if (person.hood) piece(actor,shared.ball,seams,[0,1.485,-.115],[.135,.122,.076]);
    if (person.apron) {
      piece(actor,shared.limb,cloth('#465656'),[0,1.104,.123],[.18,.51,.038]);
      piece(actor,shared.limb,seams,[0,1.17,.156],[.154,.044,.014]);
    }
    if (person.scarf) {
      const plaid = cloth('#a84640');
      piece(actor,shared.limb,plaid,[0,1.456,.014],[.109,.083,.105]);
      piece(actor,shared.ball,plaid,[.059,1.268,.142],[.052,.216,.023]);
    }
    if (person.backpack) {
      piece(actor,shared.ball,cloth('#54614d'),[0,1.16,-.166],[.168,.245,.109]);
    }

    const limbs = [-1,1].map(side=>{
      const arm = new T.Group();
      arm.position.set(side*.228,1.403,0);
      arm.rotation.z=side*.12;
      actor.add(arm);
      piece(arm,shared.limb,clothes,[0,-.145,0],[.071,.32,.074]);
      const elbow = new T.Group();
      elbow.position.y=-.295;
      arm.add(elbow);
      piece(elbow,shared.limb,clothes,[0,-.102,0],[.061,.23,.06]);
      piece(elbow,shared.ball,skin,[0,-.24,0],[.045,.062,.041]);

      const hip = new T.Group();
      hip.position.set(side*.097, .955, 0);
      actor.add(hip);
      piece(hip,shared.limb,pants,[0,-.232,0],[.09,.49,.091]);
      const knee = new T.Group();
      knee.position.y=-.438;
      hip.add(knee);
      piece(knee,shared.limb,pants,[0,-.20,0],[.073,.43,.074]);
      piece(knee,shared.ball,shoes,[0,-.46,.046],[.079,.049,.127]);
      if (person.prop==='phone' && side===1) {
        const screen = new T.MeshBasicMaterial({color:'#92bcd3'});
        piece(elbow,new T.BoxGeometry(.065,.119,.013),screen,[0,-.255,.024],[1,1,1]);
      }
      return {arm,elbow,hip,knee};
    });
    const shadow = piece(group,shared.shadow,new T.MeshBasicMaterial({color:'#171a21',transparent:true,opacity:.24,depthWrite:false}),[0,.092,0],[.27,.21,1]);
    shadow.rotation.x=-Math.PI/2;
    const size = .94 + (i%5)*.026;
    actor.scale.setScalar(size);
    actors.set(person.id,{person,actor,head,limbs,shadow,lastX:Infinity,lastZ:0,move:0});
  }

  return {
    group,
    actors,
    update(minds,time,dt) {
      for (const [id,figure] of actors) {
        const {person,actor,head,limbs,shadow} = figure;
        const mind = minds.get(id);
        const {x,z} = world(person.x,person.y);
        const moved = Number.isFinite(figure.lastX) && Math.hypot(x-figure.lastX,z-figure.lastZ) > .008;
        figure.lastX=x;
        figure.lastZ=z;
        figure.move += (Number(moved)-figure.move)*Math.min(1,dt*9);
        const walk = figure.move;
        const step = time*10.5+person.phase;
        const sway = Math.sin(step)*walk;
        const target = Math.PI/2-(mind?.heading ?? 0);
        const yaw = Math.atan2(Math.sin(target-actor.rotation.y),Math.cos(target-actor.rotation.y));
        actor.rotation.y += yaw * Math.min(1,dt*8);
        actor.position.set(x,.115+(.024*Math.sin(step*2)**2)*walk,z);
        shadow.position.x=x;
        shadow.position.z=z+.05;
        const working = ['loading','unloading','fold','folding','servicing'].includes(mind?.phase);
        const isPhone = person.prop==='phone' && walk<.16;
        head.rotation.x = working || isPhone ? -.18 + .035*Math.sin(time*2) : .036*Math.sin(time*1.44+person.phase);
        head.rotation.y = Math.sin(time*.57+person.phase)*.14*(1-walk);
        limbs.forEach(({arm,elbow,hip,knee},i)=>{
          const stride = sway * (i===1?1:-1);
          hip.rotation.x=stride*.55;
          knee.rotation.x=Math.max(0,stride)*.53;
          arm.rotation.x=-stride*.39 - (working?.41:0) - (isPhone && i===1?.52:0);
          elbow.rotation.x=-.09-(working?.49 + .1*Math.sin(time*6+person.phase):0)-(isPhone&&i===1?.82:0);
        });
      }
    }
  };
}
