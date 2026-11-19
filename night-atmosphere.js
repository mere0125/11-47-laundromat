import {Reflector} from './vendor/Reflector.js';

export function buildAtmosphere(T, scene) {
  scene.background = new T.Color('#0d1b31');
  scene.fog = new T.FogExp2('#0d1b31', .019);
  const ambient = new T.HemisphereLight('#a9bfd8', '#b78154', .35);
  const sky = new T.DirectionalLight('#8faacb', .31);
  sky.position.set(-7, 12, 9);
  scene.add(ambient, sky);
  const luminous = new T.DirectionalLight('#ffce8a', .40);
  luminous.position.set(0,6,1.6);
  luminous.target.position.set(1.3,0,-1);
  luminous.castShadow=true;
  luminous.shadow.mapSize.set(768,768);
  Object.assign(luminous.shadow.camera,{left:-10,right:10,top:7,bottom:-7,near:.1,far:18});
  luminous.shadow.normalBias=.033;
  scene.add(luminous,luminous.target);
  const warm = [-5.4, 0, 5.4].map(x => {
    const light = new T.PointLight('#ffce8f', 12.5, 10, 2);
    light.position.set(x, 2.92, 1.55);
    scene.add(light);
    return light;
  });
  for (const [x, y, z, color, intensity] of [[-11,5,9,'#769ed6',112],[12,4,7,'#efc69a',72],[-4,3.55,6.2,'#b7d7fc',26],[4,3.55,6.2,'#d1ecff',27],[0,4,-9,'#779ad1',70]]) {
    const light = new T.PointLight(color, intensity, 18);
    light.position.set(x,y,z);
    scene.add(light);
  }
  const neighborhood=buildNeighborhood(T);
  scene.add(neighborhood);

  const original = Reflector.ReflectorShader;
  const reflectedRoad = new Reflector(new T.PlaneGeometry(30, 7.5), {
    textureWidth: 600, textureHeight: 280, multisample: 0, clipBias: .003,
    color: '#6388b2',
    shader: {
      ...original,
      uniforms: {...original.uniforms, seconds:{value:0}},
      vertexShader: original.vertexShader
        .replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 roadUv;')
        .replace('vUv = textureMatrix','roadUv = uv; vUv = textureMatrix'),
      fragmentShader: original.fragmentShader
        .replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 roadUv; uniform float seconds;')
        .replace('vec4 base = texture2DProj( tDiffuse, vUv );',`
          vec2 uvp = vUv.xy / vUv.w;
          float small = sin(roadUv.y * 54.0 - seconds * 2.0 + sin(roadUv.x * 110.0)) * .003;
          vec3 a = texture2D(tDiffuse, uvp + vec2(small, -.006)).rgb;
          vec3 b = texture2D(tDiffuse, uvp + vec2(-small, .008)).rgb;
          vec4 base = vec4((a + b) * .5, 1.);
          float noise = fract(sin(dot(floor(roadUv * vec2(900.0, 300.0)), vec2(127.1,311.7))) * 43758.54);
          float damp = .61 + .13 * sin(roadUv.x * 63.0 + roadUv.y * 11.0) + .18 * noise;
          damp *= smoothstep(0.,.08,roadUv.x) * smoothstep(0.,.08,1.-roadUv.x);
          damp *= smoothstep(0.,.08,roadUv.y) * smoothstep(0.,.25,1.-roadUv.y);
          base.rgb = mix(vec3(.014,.025,.044) * (.92+noise*.24), base.rgb * vec3(.49,.61,.73), damp);
        `)
        .replace('blendOverlay( base.rgb, color )','base.rgb')
    }
  });
  reflectedRoad.rotation.x = -Math.PI / 2;
  reflectedRoad.position.set(0, .021, 13.42);
  scene.add(reflectedRoad);

  let seed = 14729;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const geometry = new T.BufferGeometry();
  const positions = [], timing = [];
  for (let i = 0; i < 2700; i++) {
    const x = random()*54-27, y = random()*16, z = random()*46-21;
    const speed = 7.1 + random()*5.2;
    positions.push(x,y,z,x,y,z);
    timing.push(0,speed,.11 + random()*.26,1,speed,.11 + random()*.26);
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('fall',new T.Float32BufferAttribute(timing,3));
  const rain = new T.LineSegments(geometry,new T.ShaderMaterial({
    uniforms:{seconds:{value:0}},
    vertexShader:`
      attribute vec3 fall;
      uniform float seconds;
      varying float opacity;
      void main(){
        vec3 p=position;
        p.y=mod(p.y-seconds*fall.y,16.);
        p.x+=p.y*.125;
        p.y+=fall.x*fall.z;
        p.x+=fall.x*fall.z*.125;
        vec4 view=modelViewMatrix*vec4(p,1.);
        bool indoors=abs(p.x)<8.1 && p.z<5.56 && p.z>-4.02 && p.y<4.55;
        opacity=indoors?0.:mix(.085,.30,1.-min(-view.z/31.,1.))*fall.x;
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader:'varying float opacity; void main(){ if(opacity<.007) discard; gl_FragColor=vec4(.60,.76,.92,opacity); }',
    transparent:true, depthWrite:false
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  return {
    update(time,street,scan,on,motion) {
      const seconds = motion ? time : 0;
      rain.visible = !scan && motion;
      reflectedRoad.visible = street && !scan;
      neighborhood.visible=!scan;
      rain.material.uniforms.seconds.value = seconds;
      reflectedRoad.material.uniforms.seconds.value = seconds;
      luminous.intensity=on?.40:.035;
      for (const lamp of warm) lamp.intensity = on ? 12.5 : 1.4;
    }
  };
}

function buildNeighborhood(T) {
  const block=new T.Group();
  const facades=['#202f46','#29374a','#27364b','#223148'].map(color=>new T.MeshStandardMaterial({color,roughness:.93}));
  const eaves=new T.MeshStandardMaterial({color:'#172335',roughness:.9});
  const shutters=new T.MeshStandardMaterial({color:'#36445a',roughness:.8});
  const windowOff=new T.MeshStandardMaterial({color:'#141e2a',roughness:.61});
  const windows=['#a9895c','#7d97aa','#ab9772'].map(color=>new T.MeshBasicMaterial({color,fog:true}));
  const cube=new T.BoxGeometry(1,1,1);
  function box(mat,x,y,z,w,h,d) {
    const mesh=new T.Mesh(cube,mat);
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    block.add(mesh);
  }
  for (let i=0;i<10;i++) {
    const x=-38+i*8.2+(i%3)*.3, z=-32-(i%2)*3.2, h=5.5+(i%4)*1.55;
    const width=7+(i%3)*.34;
    box(facades[i%facades.length],x,h/2,z,width,h,5.9);
    box(eaves,x,h+.21,z,width+.38,.42,6.3);
    box(shutters,x,1.28,z+3.007,width-.48,2.44,.084);
    box(eaves,x,2.57,z+3.24,width+.45,.15,.9);
    for (let floor=3.58, row=0;floor<h-.52;floor+=2,row++) {
      for (let column=-1;column<=1;column++) {
        const wx=x+column*2.1;
        box(eaves,wx,floor,z+2.997,1.35,1.13,.143);
        const open=(i*7+row*3+column+1)%8===0 || i===5&&column===1&&row===1;
        box(open?windows[(i+row)%windows.length]:windowOff,wx,floor,z+3.07,1.22,.98,.08);
        box(eaves,wx,floor,z+3.125,.053,.99,.025);
        box(shutters,wx,floor-.57,z+3.08,1.39,.074,.21);
      }
    }
    if (i%3===0) box(eaves,x+.68,h+.56,z-.48,1.3,1,.99);
  }
  const powerline=new T.LineBasicMaterial({color:'#182638'});
  const cableZ=-13.8, span=46;
  for (const side of [-1,1]) {
    box(eaves,side*span/2,3.5,cableZ,.17,7,.17);
    box(shutters,side*span/2,6.63,cableZ,1.03,.11,.13);
  }
  for (const lane of [-.22,.18,.56]) {
    const line=[];
    for (let i=0;i<=64;i++) {
      const t=i/64;
      line.push(new T.Vector3(t*span-span/2,6.73+lane-.95*Math.sin(t*Math.PI),cableZ+lane*.91));
    }
    block.add(new T.Line(new T.BufferGeometry().setFromPoints(line),powerline));
  }
  return block;
}

export function makeScan(T, sources) {
  const dots = [], shades = [];
  const up = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  const cross = new T.Vector3(), delta = new T.Vector3();
  const matrix = new T.Matrix4(), instance = new T.Matrix4();
  let state = 1147;
  const random = () => ((state = (Math.imul(state,1664525)+1013904223)>>>0) / 4294967296);
  const inside = p => Math.abs(p.x)<8.24 && p.z>-4.25 && p.z<5.68 && p.y>.015 && p.y<4.82;
  const shade = new T.Color();
  for (const source of sources) {
    source.updateWorldMatrix(true,true);
    source.traverse(model => {
      if (!model.isMesh || model.userData.noScan || !model.geometry?.attributes.position || model.material?.transparent || dots.length>=190000) return;
      const vertices = model.geometry.attributes.position;
      const indices = model.geometry.index;
      const end = indices ? indices.count : vertices.count;
      for (let n=0;n<(model.isInstancedMesh?Math.min(model.count,500):1);n++) {
        matrix.copy(model.matrixWorld);
        if (model.isInstancedMesh) {
          model.getMatrixAt(n,instance);
          matrix.multiply(instance);
        }
        for (let i=0;i+2<end && dots.length<190000;i+=3) {
          const index = step => indices ? indices.getX(i+step) : i+step;
          a.fromBufferAttribute(vertices,index(0)).applyMatrix4(matrix);
          b.fromBufferAttribute(vertices,index(1)).applyMatrix4(matrix);
          c.fromBufferAttribute(vertices,index(2)).applyMatrix4(matrix);
          if (!inside(a) && !inside(b) && !inside(c)) continue;
          const area = cross.subVectors(b,a).cross(delta.subVectors(c,a)).length() * .5;
          const count = Math.min(1500,Math.floor(area * 19 + random()));
          for(let j=0;j<count;j++) {
            let u = random(), v = random();
            if (u+v>1) {u=1-u;v=1-v;}
            up.copy(a).multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v);
            if (!inside(up)) continue;
            const grain = random();
            shade.setRGB(.17+grain*.2,.48+grain*.21,.66+grain*.23);
            if (up.y < .25) shade.multiplyScalar(.65);
            dots.push(up.x,up.y,up.z);
            shades.push(shade.r,shade.g,shade.b);
          }
        }
      }
    });
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(dots,3));
  geo.setAttribute('shade',new T.Float32BufferAttribute(shades,3));
  const mat = new T.ShaderMaterial({
    uniforms:{sweep:{value:0},resolution:{value:1}},
    vertexShader:`
      uniform float sweep;
      uniform float resolution;
      attribute vec3 shade;
      varying vec3 tint;
      void main() {
        vec4 v=modelViewMatrix*vec4(position,1.);
        float line=exp(-abs(position.x-sweep)*4.2);
        tint=shade*(.97+.95*line);
        gl_PointSize=clamp(38./max(1.,-v.z)*resolution,1.22,4.5);
        gl_Position=projectionMatrix*v;
      }`,
    fragmentShader:`varying vec3 tint; void main(){float d=length(gl_PointCoord-.5);if(d>.49)discard;gl_FragColor=vec4(tint*(1.-smoothstep(.23,.5,d)*.55),1.);}`
  });
  return new T.Points(geo,mat);
}
