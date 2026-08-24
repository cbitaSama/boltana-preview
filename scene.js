// Boltana — escena del descenso (Three.js). Cada "modelo" está armado por separado:
// cielo, nubes, campo de trigo con viento, polen, suelo, estratos, raíces (tubos),
// piedras, gránulos con nutrientes, flujo de absorción y gránulo héroe que se disuelve.
import * as T from './vendor/three.module.js';

const NUT_COLORS=[0xe8c547,0xe0d6c3,0xd98b5b,0x7d8fb6,0x9bc39e,0x9aa5ab,0xb26a8a];
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function seeded(s){return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646}}
const rnd=seeded(42);

const canvas=document.getElementById('scene');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.0;
renderer.localClippingEnabled=true;
const scene=new T.Scene();
const SKY=new T.Color('#cfe0ea'),SOIL=new T.Color('#1a120b'),SOILMID=new T.Color('#2c1d12'),AMBER=new T.Color('#c08a4e');
scene.background=SKY.clone();scene.fog=new T.FogExp2(SKY.clone(),0.028);
const cam=new T.PerspectiveCamera(42,1,0.05,140);
const uTime={value:0};
const LOW=matchMedia('(pointer:coarse)').matches||innerWidth<720;
renderer.setPixelRatio(Math.min(devicePixelRatio,LOW?1.5:2));

// ---------- luces ----------
const hemi=new T.HemisphereLight(0xe6efee,0x3d4423,0.62);scene.add(hemi);
const sunL=new T.DirectionalLight(0xffdca4,1.95);sunL.position.set(7,9,5);scene.add(sunL);
if(!LOW){renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  sunL.castShadow=true;sunL.shadow.mapSize.set(2048,2048);
  const sc=sunL.shadow.camera;sc.left=-16;sc.right=16;sc.top=16;sc.bottom=-16;sc.near=1;sc.far=45;
  sunL.shadow.bias=-0.001;sunL.shadow.normalBias=.02}
// entorno IBL sencillo (cielo+piso) para materiales mas ricos
{const pm=new T.PMREMGenerator(renderer);const es=new T.Scene();
 es.add(new T.Mesh(new T.SphereGeometry(10,16,8),new T.MeshBasicMaterial({side:T.BackSide,color:0xc3d6e2})));
 const top=new T.Mesh(new T.CircleGeometry(6,16),new T.MeshBasicMaterial({color:0xfff3d8}));top.position.y=8;top.rotation.x=Math.PI/2;es.add(top);
 const bot=new T.Mesh(new T.CircleGeometry(8,16),new T.MeshBasicMaterial({color:0x715e40}));bot.position.y=-6;bot.rotation.x=-Math.PI/2;es.add(bot);
 scene.environment=pm.fromScene(es,.05).texture;pm.dispose();
 if('environmentIntensity' in scene)scene.environmentIntensity=.32}
const lamp=new T.PointLight(0xffd9a0,0,16,1.5);scene.add(lamp);

// ---------- helper: fusionar geometrías (no indexadas) con grupos ----------
function mergeGeoms(parts){ // parts: [{geo, mat: index}]
  const gs=parts.map(p=>p.geo.index?p.geo.toNonIndexed():p.geo);
  const total=gs.reduce((a,g)=>a+g.attributes.position.count,0);
  const out=new T.BufferGeometry();
  for(const name of ['position','normal','uv','color']){
    const item=gs[0].attributes[name];if(!item)continue;const sz=item.itemSize;
    const arr=new Float32Array(total*sz);let o=0;
    gs.forEach(g=>{arr.set(g.attributes[name].array,o);o+=g.attributes[name].array.length});
    out.setAttribute(name,new T.BufferAttribute(arr,sz));
  }
  let start=0;gs.forEach((g,i)=>{const c=g.attributes.position.count;out.addGroup(start,c,parts[i].mat);start+=c});
  return out;
}
// ---------- helper: viento en GPU ----------
function windify(mat){
  mat.onBeforeCompile=s=>{s.uniforms.uTime=uTime;
    s.vertexShader='uniform float uTime;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vec4 wpos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
    float gust = smoothstep(0.15,1.0,sin(uTime*0.55 + wpos.x*0.14 + wpos.z*0.2))*0.42;
    float sway = sin(uTime*1.7 + wpos.x*0.5 + wpos.z*0.33)*(0.09+gust);
    float bend = pow(clamp(transformed.y+0.5,0.0,1.0),1.7)*0.55;
    transformed.x += sway*bend;
    transformed.z += cos(uTime*1.25 + wpos.x*0.4 + wpos.z*0.27)*(0.05+gust*0.7)*bend;`)};
  mat.customProgramCacheKey=()=>'wind1';
  return mat;
}

// ---------- sprite redondo para particulas ----------
function dotTex(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const rg=g.createRadialGradient(32,32,0,32,32,30);rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.7,'rgba(255,255,255,.9)');rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.beginPath();g.arc(32,32,30,0,7);g.fill();
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
const DOT=dotTex();

// ---------- CIELO (esfera con gradiente + sol) ----------
const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
  uniforms:{uDark:{value:0},uWarm:{value:0},uSun:{value:new T.Vector3(7,9,5).normalize()}},
  vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 vDir;uniform float uDark;uniform float uWarm;uniform vec3 uSun;
  void main(){float h=clamp(vDir.y,0.0,1.0);
    vec3 c=mix(vec3(0.975,0.94,0.85),vec3(0.60,0.76,0.86),pow(h,0.55));
    c=mix(c,vec3(0.55,0.72,0.83),pow(clamp(vDir.y-0.35,0.0,1.0),0.8));
    float s=pow(max(dot(vDir,uSun),0.0),180.0)*1.2+pow(max(dot(vDir,uSun),0.0),8.0)*0.28;
    c+=vec3(1.0,0.93,0.72)*s;
    vec3 warm=mix(vec3(0.86,0.62,0.36),vec3(0.72,0.47,0.26),pow(h,0.5));
    c=mix(c,warm+vec3(1.0,0.85,0.6)*s*0.6,uWarm);
    c=mix(c,vec3(0.102,0.070,0.043),uDark);
    gl_FragColor=vec4(c,1.0);}`});
const sky=new T.Mesh(new T.SphereGeometry(70,32,16),skyMat);scene.add(sky);

// ---------- NUBES (sprites suaves) ----------
function cloudTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  const r=seeded(9);for(let i=0;i<14;i++){const x=40+r()*176,y=90+r()*70,rad=22+r()*38;
    const rg=g.createRadialGradient(x,y,0,x,y,rad);rg.addColorStop(0,'rgba(255,255,255,.75)');rg.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=rg;g.beginPath();g.arc(x,y,rad,0,7);g.fill()}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
const clouds=[];const ct=cloudTex();
for(let i=0;i<7;i++){const m=new T.Sprite(new T.SpriteMaterial({map:ct,transparent:true,opacity:.8,depthWrite:false,fog:false}));
  m.position.set((rnd()-.5)*70,7+rnd()*8,-20-rnd()*25);const s=10+rnd()*14;m.scale.set(s,s*.45,1);m.userData.v=.05+rnd()*.12;clouds.push(m);scene.add(m)}

// ---------- CAMPO DE TRIGO HD (espiga de granos reales, vertex colors, viento GPU) ----------
function bakeColor(geo,fn){const p=geo.attributes.position;const arr=new Float32Array(p.count*3);const c=new T.Color();
  for(let i=0;i<p.count;i++){fn(c,p.getX(i),p.getY(i),p.getZ(i));arr.set([c.r,c.g,c.b],i*3)}
  geo.setAttribute('color',new T.BufferAttribute(arr,3));return geo}
const wparts=[];
// tallo: cilindro fino con gradiente verde
{const g=new T.CylinderGeometry(0.009,0.017,1,6);
 bakeColor(g,(c,x,y)=>{c.setHSL(.24,.5,lerp(.16,.34,y+.5))});wparts.push({geo:g,mat:0})}
// espiga: 11 granos alternados + corona
{for(let i=0;i<11;i++){const y=0.50+i*0.028;const side=i%2?1:-1;
  const g=new T.SphereGeometry(0.024,6,5);g.scale(1,1.85,.82);g.rotateZ(side*0.48);
  g.translate(side*0.026,y,(i%3-1)*0.008);
  const tint=.86+((i*37)%10)*.012;
  bakeColor(g,(c)=>{c.setRGB(.82*tint,.66*tint,.3*tint)});wparts.push({geo:g,mat:0})}
 const top=new T.SphereGeometry(0.022,6,5);top.scale(1,1.9,.8);top.translate(0,0.80,0);
 bakeColor(top,(c)=>{c.setRGB(.8,.64,.28)});wparts.push({geo:top,mat:0})}
// aristas (pelitos de la espiga)
{for(let i=0;i<6;i++){const g=new T.ConeGeometry(0.0035,0.34,3);const a=(i/6)*6.28;
  g.rotateZ(Math.sin(a)*.22);g.rotateX(Math.cos(a)*.22);g.translate(Math.sin(a)*.03,0.86,Math.cos(a)*.03);
  bakeColor(g,(c)=>{c.setRGB(.82,.7,.38)});wparts.push({geo:g,mat:0})}}
// hojas con curva y gradiente
function leafHD(sign){const g=new T.PlaneGeometry(0.13,0.55,1,5);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);
    p.setX(i,p.getX(i)*(1-Math.abs(y+.27)*.9)+sign*Math.pow(y+0.27,2)*1.0);
    p.setZ(i,Math.pow(y+0.27,2)*0.42)}
  g.rotateZ(sign*-0.55);g.translate(sign*0.05,0.0,0);if(sign<0)g.rotateY(Math.PI*0.65);
  bakeColor(g,(c,x,y)=>{c.setHSL(.25,.48,lerp(.18,.36,clamp(y+.5,0,1)))});return g}
wparts.push({geo:leafHD(1),mat:0},{geo:leafHD(-1),mat:0});
const wheatGeo=mergeGeoms(wparts);
const wheatMat=windify(new T.MeshStandardMaterial({vertexColors:true,roughness:.78,side:T.DoubleSide}));
const NB=LOW?950:1800;const wheat=new T.InstancedMesh(wheatGeo,wheatMat,NB);
{const m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),ps=new T.Vector3(),sc=new T.Vector3(),col=new T.Color();
 let i=0,guard=0;
 while(i<NB&&guard++<40000){const x=(rnd()-.5)*30,z=-16+rnd()*23,h=.9+rnd()*.7;
  if((Math.abs(x-0.35)<1.7&&z>0.6&&z<8.6)||Math.hypot(x-0.35,z-3.4)<2.4)continue; // sendero por donde baja la camara
  e.set((rnd()-.5)*.14,rnd()*6.28,(rnd()-.5)*.14);q.setFromEuler(e);ps.set(x,h/2-.02,z);sc.set(1,h,1);
  m.compose(ps,q,sc);wheat.setMatrixAt(i,m);
  const l=.78+rnd()*.32;col.setRGB(l,l*(0.96+rnd()*.08),l);wheat.setColorAt(i,col);i++}
 wheat.instanceColor.needsUpdate=true}
if(!LOW){wheat.castShadow=true}
scene.add(wheat);

// ---------- COLINAS lejanas + RESPLANDOR de sol ----------
const hills=[];
[[-38,-58,26,0x8fa383],[6,-64,34,0x9aab8c],[42,-56,24,0x87997c]].forEach(([x,z,r,c])=>{
  const h=new T.Mesh(new T.SphereGeometry(r,24,12),new T.MeshBasicMaterial({color:c}));
  h.scale.set(1,.18,1);h.position.set(x,0,z);hills.push(h);scene.add(h)});
function glowTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  const rg=g.createRadialGradient(128,128,0,128,128,128);rg.addColorStop(0,'rgba(255,240,200,.9)');rg.addColorStop(.4,'rgba(255,225,160,.28)');rg.addColorStop(1,'rgba(255,225,160,0)');
  g.fillStyle=rg;g.fillRect(0,0,256,256);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
const sunGlow=new T.Sprite(new T.SpriteMaterial({map:glowTex(),transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,fog:false}));
sunGlow.position.set(28,36,-52);sunGlow.scale.set(46,46,1);sunGlow.material.opacity=.7;scene.add(sunGlow);
// ---------- POLEN / aire ----------
const NPOL=LOW?200:420;const polP=new Float32Array(NPOL*3),polD=[];
for(let i=0;i<NPOL;i++){polP.set([(rnd()-.5)*26,.3+rnd()*4.5,-14+rnd()*18],i*3);polD.push(rnd()*6.28)}
const polG=new T.BufferGeometry();polG.setAttribute('position',new T.BufferAttribute(polP,3));
const pollen=new T.Points(polG,new T.PointsMaterial({map:DOT,depthWrite:false,alphaTest:.05,color:0xfff3c4,size:.05,transparent:true,opacity:.85,sizeAttenuation:true}));scene.add(pollen);

// ---------- SUELO + costra ----------
function groundTex(){const c=document.createElement('canvas');c.width=c.height=1024;const g=c.getContext('2d');
  g.fillStyle='#49521f';g.fillRect(0,0,1024,1024);const r=seeded(77);
  for(let i=0;i<2600;i++){const hue=r();g.fillStyle=hue<.55?`rgba(${70+r()*40|0},${80+r()*40|0},${30+r()*25|0},${.25+r()*.3})`:`rgba(${95+r()*50|0},${72+r()*35|0},${42+r()*25|0},${.18+r()*.25})`;
    g.beginPath();g.ellipse(r()*1024,r()*1024,3+r()*26,2+r()*14,r()*3.14,0,7);g.fill()}
  for(let i=0;i<4000;i++){g.fillStyle=`rgba(${40+r()*40|0},${52+r()*30|0},${20+r()*18|0},${.3+r()*.4})`;g.fillRect(r()*1024,r()*1024,1.5,1.5+r()*3)}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(5,5);return t}
const ground=new T.Mesh(new T.CircleGeometry(45,48),new T.MeshStandardMaterial({map:groundTex(),roughness:1,side:T.DoubleSide}));
ground.rotation.x=-Math.PI/2;if(!LOW)ground.receiveShadow=true;scene.add(ground);
const crust=new T.Mesh(new T.BoxGeometry(90,0.5,90),new T.MeshStandardMaterial({color:0x3a2718,roughness:1}));crust.position.y=-0.27;scene.add(crust);

// ---------- ESTRATOS (telón de fondo bajo tierra) ----------
function strataTex(){const c=document.createElement('canvas');c.width=512;c.height=1024;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,1024);grad.addColorStop(0,'#6a4a2e');grad.addColorStop(.3,'#4c3320');grad.addColorStop(.7,'#2e2015');grad.addColorStop(1,'#1a120b');
  g.fillStyle=grad;g.fillRect(0,0,512,1024);
  const r=seeded(31);
  for(let b=0;b<9;b++){const y=60+b*105+r()*40;g.strokeStyle=`rgba(${120+r()*60|0},${85+r()*40|0},${55+r()*30|0},${.12+r()*.1})`;g.lineWidth=2+r()*5;
    g.beginPath();g.moveTo(0,y);for(let x=0;x<=512;x+=32)g.lineTo(x,y+Math.sin(x*.02+b)*8+r()*6);g.stroke()}
  for(let i=0;i<1400;i++){const d=r();g.fillStyle=`rgba(${150+r()*70|0},${110+r()*50|0},${70+r()*40|0},${.05+d*.14})`;
    g.beginPath();g.arc(r()*512,r()*1024,.6+r()*2.6,0,7);g.fill()}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
const strata=new T.Mesh(new T.PlaneGeometry(95,52),new T.MeshBasicMaterial({map:strataTex()}));
strata.position.set(0,-25.5,-14);scene.add(strata);

// ---------- RAYOS DE LUZ (entrando por la costra) ----------
function beamTex(){const c=document.createElement('canvas');c.width=64;c.height=256;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'rgba(255,236,190,.9)');gr.addColorStop(.6,'rgba(255,236,190,.25)');gr.addColorStop(1,'rgba(255,236,190,0)');
  g.fillStyle=gr;g.fillRect(0,0,64,256);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
const beams=[];{const bt=beamTex();
 [[-2.6,-.15],[0.4,.08],[2.9,-.05],[-5.2,.2]].forEach(([x,rot])=>{
  const b=new T.Mesh(new T.PlaneGeometry(1.6,5.5),new T.MeshBasicMaterial({map:bt,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));
  b.position.set(x,-2.9,-4.6);b.rotation.z=rot;beams.push(b);scene.add(b)})}

// ---------- MARIPOSAS ----------
const butterflies=[];
{const wg=new T.PlaneGeometry(0.14,0.085,1,1);wg.rotateX(-Math.PI/2);wg.translate(0.075,0,0);
 const wmatA=new T.MeshBasicMaterial({color:0xfdf6e0,side:T.DoubleSide,transparent:true,opacity:.95});
 const wmatB=new T.MeshBasicMaterial({color:0xf0d98f,side:T.DoubleSide,transparent:true,opacity:.95});
 for(let i=0;i<(LOW?4:7);i++){const g=new T.Group();const mat=i%2?wmatA:wmatB;
  const L=new T.Mesh(wg,mat),R=new T.Mesh(wg,mat);R.scale.x=-1;
  const body=new T.Mesh(new T.SphereGeometry(0.025,5,4),new T.MeshBasicMaterial({color:0x3a2c18}));body.scale.set(.7,.7,2.2);
  g.add(L,R,body);g.userData={L,R,c:new T.Vector3((rnd()-.5)*12,1.15+rnd()*.9,-7+rnd()*7),r:1.2+rnd()*2,sp:.25+rnd()*.3,ph:rnd()*6.28,fl:14+rnd()*6};
  butterflies.push(g);scene.add(g)}}
const _bfPrev=new T.Vector3();
function updateButterflies(t){butterflies.forEach(b=>{const u=b.userData;const a=t*u.sp+u.ph;
  _bfPrev.copy(b.position);
  b.position.set(u.c.x+Math.cos(a)*u.r,u.c.y+Math.sin(a*2.3)*.5,u.c.z+Math.sin(a)*u.r*.7);
  if(_bfPrev.lengthSq()>0){_bfPrev.sub(b.position).multiplyScalar(-1).add(b.position);b.lookAt(_bfPrev)}
  const f=Math.sin(t*u.fl)*.95;u.L.rotation.z=f;u.R.rotation.z=-f})}

// ---------- GUSANOS (vida del suelo: cadena que sigue a la cabeza + peristalsis) ----------
const worms=[];const _wv=new T.Vector3();
{const skin=new T.MeshStandardMaterial({color:0xb27a68,roughness:.5});
 const band=new T.MeshStandardMaterial({color:0xd49d8c,roughness:.45});
 for(let w=0;w<4;w++){const g=new T.Group();const segs=[];const N=14;
  const base=new T.Vector3((rnd()-.5)*9,-2.1-rnd()*3.4,-6+rnd()*3.2);
  for(let i=0;i<N;i++){
    const r=0.055*(i<3?(.6+.14*i):1)*(1-Math.max(0,i-6)/N*.65);
    const m=new T.Mesh(new T.SphereGeometry(1,9,8),(i===4||i===5)?band:skin);
    m.position.copy(base);m.position.x-=i*.08;
    g.add(m);segs.push({m,p:m.position.clone(),r})}
  g.userData={segs,theta:rnd()*6.28,speed:.22+rnd()*.12,ph:rnd()*6.28,seed:rnd()*100,base};
  worms.push(g);scene.add(g)}}
function updateWorms(t,dt){worms.forEach(g=>{const u=g.userData,s=u.segs;
  // rumbo errante suave + retorno si se aleja de su zona
  u.theta+=(Math.sin(t*.45+u.seed)+Math.sin(t*.17+u.seed*2.7)*.6)*.5*dt;
  const dx=s[0].p.x-u.base.x,dz=s[0].p.z-u.base.z,away=Math.hypot(dx,dz);
  if(away>2){const back=Math.atan2(-dz,-dx);u.theta+=(((back-u.theta+Math.PI*3)%(Math.PI*2))-Math.PI)*1.2*dt}
  // avance peristaltico (empuja en pulsos, como lombriz real)
  const pulse=Math.max(0,Math.sin(t*2.6+u.ph))+.25;
  s[0].p.x+=Math.cos(u.theta)*u.speed*pulse*dt;
  s[0].p.z+=Math.sin(u.theta)*u.speed*pulse*dt;
  s[0].p.y=u.base.y+Math.sin(t*.6+u.ph)*.16+Math.sin(s[0].p.x*1.7+u.seed)*.05;
  // el cuerpo sigue a la cabeza manteniendo distancia
  for(let i=1;i<s.length;i++){const a2=s[i-1].p,b2=s[i].p;
    _wv.subVectors(b2,a2);const L=_wv.length()||1e-4;
    b2.copy(a2).addScaledVector(_wv,.078/L)}
  // aplicar: orientacion a lo largo del cuerpo + onda de contraccion
  for(let i=0;i<s.length;i++){const seg=s[i];seg.m.position.copy(seg.p);
    const look=i<s.length-1?s[i+1].p:s[i-1].p;seg.m.lookAt(look);
    const wv2=Math.sin(t*2.6+u.ph-i*.55);
    const rad=seg.r*(1+.24*Math.max(0,wv2));
    const len=seg.r*1.5*(1-.18*Math.max(0,wv2));
    seg.m.scale.set(rad,rad,len)}})}

// ---------- PIEDRAS ----------// ---------- PIEDRAS ----------
const NR=LOW?90:170;const rocks=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x4a3221,roughness:1,flatShading:true}),NR);
{const m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),ps=new T.Vector3(),sc=new T.Vector3();
 for(let i=0;i<NR;i++){ps.set((rnd()-.5)*26,-0.8-rnd()*14.5,-12+rnd()*10);e.set(rnd()*6,rnd()*6,rnd()*6);q.setFromEuler(e);
  const s=.05+rnd()*.17;sc.set(s*1.5,s,s*1.1);m.compose(ps,q,sc);rocks.setMatrixAt(i,m)}}
scene.add(rocks);

// ---------- RAÍCES (tubos con crecimiento por plano de recorte) ----------
const clipPlane=new T.Plane(new T.Vector3(0,1,0),0);
const rootMat=new T.MeshStandardMaterial({color:0xf0e6d2,roughness:.8,clippingPlanes:[clipPlane]});
const rootGeos=[],tips=[];
function branch(p0,dir,depth){
  const pts=[p0.clone()];let p=p0.clone(),d=dir.clone();
  const len=1.7*Math.pow(.64,depth)*(0.8+rnd()*.4);
  for(let i=0;i<4;i++){d.add(new T.Vector3((rnd()-.5)*.55,-(.12+rnd()*.22),(rnd()-.5)*.55)).normalize();
    p=p.clone().addScaledVector(d,len/4);pts.push(p.clone())}
  rootGeos.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts),10,0.02+0.075*Math.pow(.6,depth),5,false));
  if(depth>=4){tips.push(p.clone());return}
  const k=depth===0?3:2;
  for(let i=0;i<k;i++)branch(p,d.clone().add(new T.Vector3((rnd()-.5)*1.3,-rnd()*.35,(rnd()-.5)*1.3)).normalize(),depth+1)
}
[[-3.4,-2.2],[-.2,-3.4],[3,-1.8],[6.2,-4.5],[-6.6,-4.2]].forEach(([x,z])=>branch(new T.Vector3(x,.06,z),new T.Vector3(0,-1,0),0));
const roots=new T.Mesh(mergeGeoms(rootGeos.map(g=>({geo:g,mat:0}))),rootMat);scene.add(roots);

// ---------- GRÁNULOS con nutrientes ----------
const NG=56,NS=12;
const grains=new T.InstancedMesh(new T.SphereGeometry(1,28,18),new T.MeshStandardMaterial({color:0xd9d0bd,roughness:.92}),NG);
const specks=new T.InstancedMesh(new T.SphereGeometry(1,8,6),new T.MeshStandardMaterial({roughness:.55}),NG*NS);
const gd=[];{const col=new T.Color();
 for(let i=0;i<NG;i++){gd.push({x:(rnd()-.5)*12,y:-4.2-rnd()*6.5,z:-8+rnd()*6,r:.15+rnd()*.3,ph:rnd()*6.28,sp:[]});
  for(let j=0;j<NS;j++){const u=rnd()*6.28,v=Math.acos(2*rnd()-1);
   gd[i].sp.push(new T.Vector3(Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)));
   col.setHex(NUT_COLORS[(i+j)%7]);specks.setColorAt(i*NS+j,col)}}
 specks.instanceColor.needsUpdate=true}
scene.add(grains,specks);
const M=new T.Matrix4(),Q=new T.Quaternion(),E=new T.Euler(),PS=new T.Vector3(),SC=new T.Vector3(),Q0=new T.Quaternion();
function updateGrains(t,a){for(let i=0;i<NG;i++){const g=gd[i];const r=g.r*a;
  const cx=g.x+Math.sin(t*.5+g.ph)*.25,cy=g.y+Math.cos(t*.4+g.ph)*.25,cz=g.z;
  E.set(t*.1+g.ph,t*.15,0);Q.setFromEuler(E);PS.set(cx,cy,cz);SC.set(r,r,r);M.compose(PS,Q,SC);grains.setMatrixAt(i,M);
  for(let j=0;j<NS;j++){const s=gd[i].sp[j].clone().applyQuaternion(Q).multiplyScalar(r*.98);
   PS.set(cx+s.x,cy+s.y,cz+s.z);const ss=r*.11;SC.set(ss,ss,ss);M.compose(PS,Q0,SC);specks.setMatrixAt(i*NS+j,M)}}
  grains.instanceMatrix.needsUpdate=true;specks.instanceMatrix.needsUpdate=true}

// ---------- FLUJO DE ABSORCIÓN (gránulo → raíz) ----------
const NF=260;const flowP=new Float32Array(NF*3),flowC=new Float32Array(NF*3),flow=[];
{const col=new T.Color();for(let i=0;i<NF;i++){const g=gd[(rnd()*NG)|0],tp=tips[(rnd()*tips.length)|0];
  flow.push({g,tp,off:rnd()});col.setHex(NUT_COLORS[i%7]);flowC.set([col.r,col.g,col.b],i*3)}}
const flowG=new T.BufferGeometry();flowG.setAttribute('position',new T.BufferAttribute(flowP,3));flowG.setAttribute('color',new T.BufferAttribute(flowC,3));
const flowPts=new T.Points(flowG,new T.PointsMaterial({map:DOT,depthWrite:false,alphaTest:.05,size:.09,vertexColors:true,transparent:true,opacity:.9,sizeAttenuation:true}));scene.add(flowPts);
function updateFlow(t){const p=flowG.attributes.position.array;
  for(let i=0;i<NF;i++){const f=flow[i];let e=(t*.13+f.off)%1;e=e*e*(3-2*e);
    p[i*3]=lerp(f.g.x,f.tp.x,e);p[i*3+1]=lerp(f.g.y,f.tp.y,e)+Math.sin(e*9+i)*.12;p[i*3+2]=lerp(f.g.z,f.tp.z,e)}
  flowG.attributes.position.needsUpdate=true}

// ---------- MOTAS bajo tierra ----------
const NM=LOW?300:650;const motP=new Float32Array(NM*3),motD=[];
for(let i=0;i<NM;i++){motP.set([(rnd()-.5)*24,-1-rnd()*14,-11+rnd()*9],i*3);motD.push(rnd()*6.28)}
const motG=new T.BufferGeometry();motG.setAttribute('position',new T.BufferAttribute(motP,3));
const motes=new T.Points(motG,new T.PointsMaterial({map:DOT,depthWrite:false,alphaTest:.05,color:0xc9a86a,size:.035,transparent:true,opacity:.5}));scene.add(motes);

// ---------- GRÁNULO HÉROE + disolución ----------
const hero=new T.Mesh(new T.SphereGeometry(1,64,40),new T.MeshStandardMaterial({color:0xe3dac6,roughness:.88}));
hero.position.set(1.15,-13.6,-2.6);scene.add(hero);
const NP=900;const pp=new Float32Array(NP*3),pc=new Float32Array(NP*3),pdir=[];
{const col=new T.Color();for(let i=0;i<NP;i++){const u=rnd()*6.28,v=Math.acos(2*rnd()-1);
  pdir.push({d:new T.Vector3(Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)),sp:.6+rnd()*2.2});
  col.setHex(NUT_COLORS[i%7]);pc.set([col.r,col.g,col.b],i*3)}}
const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(pp,3));pg.setAttribute('color',new T.BufferAttribute(pc,3));
const parts=new T.Points(pg,new T.PointsMaterial({map:DOT,depthWrite:false,alphaTest:.05,size:.055,vertexColors:true,transparent:true,sizeAttenuation:true}));scene.add(parts);
function updateHero(t,diss){const R=1.25*(1-diss*.9);hero.scale.setScalar(Math.max(R,.001));hero.rotation.y=t*.15;
  const p=pg.attributes.position.array;
  for(let i=0;i<NP;i++){const {d,sp}=pdir[i];const r=1.25*.99+diss*sp*3.6;const gy=-diss*diss*sp*1.6;
    p[i*3]=hero.position.x+d.x*r;p[i*3+1]=hero.position.y+d.y*r+gy;p[i*3+2]=hero.position.z+d.z*r}
  pg.attributes.position.needsUpdate=true;parts.material.opacity=1-smooth(.8,1,diss)}

// ---------- cámara + atmósfera por progreso ----------
let mx=0,my=0,smx=0,smy=0;
addEventListener('pointermove',e=>{mx=e.clientX/innerWidth*2-1;my=e.clientY/innerHeight*2-1});
const target=new T.Vector3();
function camAt(p,t){
  smx=lerp(smx,mx,.04);smy=lerp(smy,my,.04);
  const y=lerp(2.7,-14.3,smooth(0,.95,p));
  const z=lerp(7.5,2.2,smooth(0,.3,p));
  const par=1-smooth(.06,.18,p)*.75;cam.position.set(lerp(0,.4,p)+smx*.45*par+Math.sin(t*.23)*.06,y-smy*.3*par+Math.sin(t*.31)*.05,z);
  const tyA=lerp(1.25,-2.6,smooth(.01,.13,p));
  const ty=lerp(tyA,y-1.2,smooth(.12,.3,p));
  target.set(smx*.8,ty,-3);cam.lookAt(target);
  const k1=smooth(.09,.2,p),k2=smooth(.18,.34,p),k3=smooth(.4,.8,p);
  scene.background.copy(SKY).lerp(AMBER,k1).lerp(SOILMID,k2).lerp(SOIL,k3);scene.fog.color.copy(scene.background);
  scene.fog.density=lerp(.028,.062,k2);
  skyMat.uniforms.uWarm.value=k1*(1.0-k2);skyMat.uniforms.uDark.value=k2;sky.visible=p<.45;
  clouds.forEach(c=>{c.material.opacity=.8*(1-k1)});hills.forEach(h=>h.visible=p<.2);
  sunGlow.material.opacity=.7*(1-k2);sunGlow.material.color.setRGB(1,lerp(1,.75,k1),lerp(1,.55,k1));
  hemi.intensity=lerp(.62,.28,k2);hemi.color.setRGB(lerp(.9,.85,k1),lerp(.94,.72,k1),lerp(.93,.5,k1));
  sunL.intensity=lerp(1.95,.15,k2);sunL.color.setRGB(1,lerp(.86,.68,k1),lerp(.64,.42,k1));
  lamp.intensity=lerp(0,46,k2);lamp.position.set(cam.position.x+1.4,cam.position.y+.9,cam.position.z-.4);
  clipPlane.constant=smooth(.1,.42,p)*4.4;
}

// ---------- loop ----------
const section=document.getElementById('descent'),heroCopy=document.getElementById('heroCopy');
const depthEl=document.getElementById('depth'),depthM=document.getElementById('depthM'),depthZone=document.getElementById('depthZone');
let lastZone='';
const timed=[...document.querySelectorAll('[data-at]')];
const tagEls=[...document.querySelectorAll('.tag')];const TAGIDX=[3,10,17,24,31,38];const _v=new T.Vector3();
let W=0,H=0,pS=0,lastT=0;
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;
  if(w!==W||h!==H){W=w;H=h;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}}
function frame(ts){const t=ts/1000;const dt=Math.min(.05,t-lastT||.016);lastT=t;uTime.value=t;
  const r=section.getBoundingClientRect();
  const onScreen=r.bottom>0&&r.top<innerHeight;
  if(!onScreen&&document.documentElement.classList.contains('scene-on')){requestAnimationFrame(frame);return}
  resize();
  const pT=clamp(-r.top/(r.height-innerHeight),0,1);
  if(window.__snap){pS=pT;window.__snap=false}
  pS+=(pT-pS)*(1-Math.exp(-dt*5.5));
  if(Math.abs(pT-pS)<.0004)pS=pT;
  const p=pS;
  camAt(p,t);
  wheat.visible=p<.34;if(wheat.visible)updateButterflies(t);butterflies.forEach(b=>b.visible=p<.28);clouds.forEach(c=>{c.visible=p<.3;c.position.x+=c.userData.v*.016;if(c.position.x>40)c.position.x=-40});
  pollen.visible=p<.3;
  if(pollen.visible){const a=polG.attributes.position.array;
    for(let i=0;i<NPOL;i++){a[i*3]+=Math.sin(t*.6+polD[i])*.004+.006;a[i*3+1]+=Math.cos(t*.5+polD[i])*.003;if(a[i*3]>13)a[i*3]=-13}
    polG.attributes.position.needsUpdate=true}
  roots.visible=p>.08&&p<.75;
  const bk=smooth(.09,.17,p)*(1-smooth(.3,.42,p));beams.forEach((b,i)=>{b.material.opacity=bk*(.16+i*.03);b.visible=bk>0;b.rotation.z+=Math.sin(t*.3+i)*.0004});
  worms.forEach(w=>w.visible=p>.13&&p<.55);if(p>.13&&p<.55)updateWorms(t,dt);
  motes.visible=p>.12;
  if(motes.visible){const a=motG.attributes.position.array;
    for(let i=0;i<NM;i++){a[i*3]+=Math.sin(t*.4+motD[i])*.0025;a[i*3+1]+=Math.cos(t*.33+motD[i])*.002}
    motG.attributes.position.needsUpdate=true}
  const ga=smooth(.35,.5,p);grains.visible=specks.visible=ga>0&&p<.9;
  if(grains.visible)updateGrains(t,ga);
  flowPts.visible=p>.45&&p<.72;if(flowPts.visible){updateFlow(t);flowPts.material.opacity=.9*smooth(.45,.5,p)*(1-smooth(.66,.72,p))}
  const hv=p>.62;hero.visible=parts.visible=hv;if(hv)updateHero(t,smooth(.8,.97,p));
  renderer.render(scene,cam);
  document.documentElement.classList.add('scene-on');
  heroCopy.style.opacity=1-smooth(0,.07,p);heroCopy.style.transform=`translateY(${-p*500}px)`;
  if(depthEl){const on=p>.09&&p<.97;depthEl.classList.toggle('on',on);
    if(on){const d=Math.max(0,-cam.position.y);depthM.textContent=d.toFixed(1).replace('.',',')+' m';
      const z=p<.35?'Raíces':p<.62?'Gránulos':p<.8?'Absorción':'Liberación';
      if(z!==lastZone){lastZone=z;depthZone.textContent=z}}}
  timed.forEach(el=>{const[a,b]=el.dataset.at.split(',').map(Number);el.classList.toggle('on',p>a&&p<b)});
  if(grains.visible)tagEls.forEach((el,i)=>{const g=gd[TAGIDX[i]];if(!g)return;
    _v.set(g.x+Math.sin(t*.5+g.ph)*.25,g.y+Math.cos(t*.4+g.ph)*.25,g.z).project(cam);
    if(_v.z<1){const x=(_v.x*.5+.5)*100,y=(-_v.y*.5+.5)*100;
      if(x>4&&x<96&&y>6&&y<94){el.style.left=x+'%';el.style.top=y+'%'}}});
  requestAnimationFrame(frame)}
requestAnimationFrame(frame);

// deep link ?p=0.55 (fracción del descenso) o ?p=4200 (px)
const qp=new URLSearchParams(location.search).get('p');
if(qp){document.documentElement.style.scrollBehavior='auto';addEventListener('load',()=>{scrollTo(0,qp<=1?(section.offsetHeight-innerHeight)*qp:+qp);window.__snap=true})}
