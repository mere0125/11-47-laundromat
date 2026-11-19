export function makeNightFilm(T, renderer) {
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1,1,1,-1,0,1);
  const quad = new T.Mesh(new T.PlaneGeometry(2,2));
  quad.frustumCulled=false;
  scene.add(quad);
  const frame = new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true});
  frame.samples=Math.min(4,renderer.capabilities.maxSamples||0);
  const glowA = new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
  const glowB = new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
  const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const filter = new T.ShaderMaterial({
    uniforms:{image:{value:frame.texture},direction:{value:new T.Vector2()},extract:{value:1}},
    vertexShader,
    fragmentShader:`
      uniform sampler2D image;
      uniform vec2 direction;
      uniform float extract;
      varying vec2 vUv;
      vec3 bright(vec2 p){
        vec3 color=texture2D(image,p).rgb;
        float peak=max(color.r,max(color.g,color.b));
        return mix(color,color*smoothstep(.92,2.45,peak),extract);
      }
      void main(){
        vec3 sum=bright(vUv)*.227027;
        sum+=bright(vUv+direction*1.384615)*.316216;
        sum+=bright(vUv-direction*1.384615)*.316216;
        sum+=bright(vUv+direction*3.230769)*.070270;
        sum+=bright(vUv-direction*3.230769)*.070270;
        gl_FragColor=vec4(sum,1.);
      }`
  });
  const finish = new T.ShaderMaterial({
    uniforms:{image:{value:frame.texture},glow:{value:glowB.texture},grain:{value:0},strength:{value:.21},scan:{value:0}},
    vertexShader,
    fragmentShader:`
      uniform sampler2D image;
      uniform sampler2D glow;
      uniform float grain;
      uniform float strength;
      uniform float scan;
      varying vec2 vUv;
      void main(){
        vec3 color=texture2D(image,vUv).rgb+texture2D(glow,vUv).rgb*strength*(1.-scan);
        float luma=dot(color,vec3(.2126,.7152,.0722));
        color=mix(vec3(luma),color,.97);
        color=mix(color,color*vec3(.94,1.01,1.055),.13*(1.-smoothstep(.1,.8,luma))*(1.-scan));
        float noise=fract(sin(dot(gl_FragCoord.xy+grain,vec2(12.9898,78.233)))*43758.5453)-.5;
        color+=noise*.0018;
        color*=1.-.13*smoothstep(.27,.8,length((vUv-.5)*vec2(1.,.82)));
        gl_FragColor=vec4(max(color,0.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  let width=0,height=0;
  function render(mainScene, mainCamera, time, scan=false) {
    const size=renderer.getDrawingBufferSize(new T.Vector2());
    if(size.x!==width || size.y!==height) {
      width=size.x;
      height=size.y;
      frame.setSize(width,height);
      glowA.setSize(Math.max(1,Math.floor(width*.36)),Math.max(1,Math.floor(height*.36)));
      glowB.setSize(glowA.width,glowA.height);
    }
    renderer.setRenderTarget(frame);
    renderer.render(mainScene,mainCamera);
    if (!scan) {
      quad.material=filter;
      filter.uniforms.image.value=frame.texture;
      filter.uniforms.extract.value=1;
      filter.uniforms.direction.value.set(2.5/width,0);
      renderer.setRenderTarget(glowA);
      renderer.render(scene,camera);
      filter.uniforms.image.value=glowA.texture;
      filter.uniforms.extract.value=0;
      filter.uniforms.direction.value.set(0,1.7/glowA.height);
      renderer.setRenderTarget(glowB);
      renderer.render(scene,camera);
    }
    quad.material=finish;
    finish.uniforms.scan.value=Number(scan);
    finish.uniforms.grain.value=Math.floor(time*24);
    renderer.setRenderTarget(null);
    renderer.render(scene,camera);
  }
  return {render,dispose(){
    frame.dispose();
    glowA.dispose();
    glowB.dispose();
    filter.dispose();
    finish.dispose();
    quad.geometry.dispose();
  }};
}

export function makeLaundryEnvironment(T,renderer) {
  const room=new T.Scene();
  room.background=new T.Color('#52606d');
  const box=new T.Mesh(
    new T.BoxGeometry(12,7,9),
    new T.MeshBasicMaterial({color:'#6c695d',side:T.BackSide})
  );
  room.add(box);
  const cards=[];
  function card(w,h,color,p,rotation) {
    const material=new T.MeshBasicMaterial({color,side:T.DoubleSide});
    material.color.multiplyScalar(3.1);
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);
    mesh.position.set(...p);
    mesh.rotation.set(...rotation);
    cards.push(mesh);
    room.add(mesh);
  }
  card(7,.55,'#ffe6bd',[0,3.2,.9],[-Math.PI/2,0,0]);
  card(5,.4,'#f2debd',[-1,3.2,-2],[-Math.PI/2,0,0]);
  card(9,2.3,'#7198bd',[0,.6,4.4],[0,0,0]);
  const pmrem=new T.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(room,.035);
  pmrem.dispose();
  box.geometry.dispose();box.material.dispose();
  for(const mesh of cards){mesh.geometry.dispose();mesh.material.dispose();}
  return environment;
}
