// Armador: gránulo 3D con relieve, inclusiones incrustadas y luz de estudio.
// Lee window.__granState (mutado por index.html) y window.__granDirty.
import * as T from './vendor/three.module.js';
const lerp=(a,b,t)=>a+(b-a)*t;
function seeded(s){return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646}}
const canvas=document.getElementById('gran');
if(canvas){
const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new T.Scene();
const cam=new T.PerspectiveCamera(34,1,.1,50);cam.position.set(0,.35,4.6);cam.lookAt(0,-.05,0);

// luz de estudio: key calida + fill + rim
scene.add(new T.HemisphereLight(0xfff4e0,0x2a1c10,.55));
const key=new T.DirectionalLight(0xffe9c4,2.6);key.position.set(-3,4,3);scene.add(key);
const rim=new T.DirectionalLight(0xcfe0ff,1.1);rim.position.set(4,2,-4);scene.add(rim);
const fill=new T.PointLight(0xffd9a0,8,12,1.8);fill.position.set(2.5,-1,3);scene.add(fill);

// ruido determinista para el relieve
const rr=seeded(1234);const G=[];for(let i=0;i<64;i++)G.push([rr()*2-1,rr()*2-1,rr()*2-1]);
function noise(x,y,z){let v=0,f=1,a=1;
  for(let o=0;o<3;o++){const s=Math.sin(x*2.1*f+G[o*3][0]*7)*Math.cos(y*2.3*f+G[o*3][1]*7)*Math.sin(z*1.9*f+G[o*3][2]*7);v+=s*a;a*=.5;f*=2.2}
  return v}
function bumpR(nx,ny,nz){return 1+noise(nx,ny,nz)*.05}

// esfera con relieve
const geo=new T.SphereGeometry(1,128,86);
{const p=geo.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i)).normalize();const r=bumpR(v.x,v.y,v.z);p.setXYZ(i,v.x*r,v.y*r,v.z*r)}
 geo.computeVertexNormals()}
const gran=new T.Mesh(geo,new T.MeshPhysicalMaterial({color:0xded4bd,roughness:.6,clearcoat:.28,clearcoatRoughness:.5,sheen:.3,sheenColor:0xfff4dd}));
const spin=new T.Group();spin.add(gran);scene.add(spin);

// inclusiones incrustadas en la superficie
const NSP=170;const specks=new T.InstancedMesh(new T.SphereGeometry(1,10,8),new T.MeshStandardMaterial({roughness:.45}),NSP);
const sd=[];{const r2=seeded(99);const M=new T.Matrix4(),PS=new T.Vector3(),SC=new T.Vector3(),Q=new T.Quaternion();
 for(let i=0;i<NSP;i++){const u=r2()*6.283,vv=Math.acos(2*r2()-1);
  const n=new T.Vector3(Math.sin(vv)*Math.cos(u),Math.cos(vv),Math.sin(vv)*Math.sin(u));
  const sz=.028+r2()*.05;const rad=bumpR(n.x,n.y,n.z)-sz*.45;
  sd.push({n,sz});PS.copy(n).multiplyScalar(rad);SC.set(sz,sz,sz);M.compose(PS,Q,SC);specks.setMatrixAt(i,M)}}
spin.add(specks);

// sombra de contacto
function shadowTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  const rg=g.createRadialGradient(128,128,10,128,128,120);rg.addColorStop(0,'rgba(0,0,0,.55)');rg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=rg;g.fillRect(0,0,256,256);return new T.CanvasTexture(c)}
const shadow=new T.Mesh(new T.PlaneGeometry(3,3),new T.MeshBasicMaterial({map:shadowTex(),transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.45;scene.add(shadow);

// polvo: pila + nube
const NPW=1600;const pwP=new Float32Array(NPW*3),pwC=new Float32Array(NPW*3),pwSeed=[];
{const r3=seeded(7);for(let i=0;i<NPW;i++){pwSeed.push([r3(),r3(),r3(),r3()])}}
function dotTex(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const rg=g.createRadialGradient(32,32,0,32,32,30);rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.beginPath();g.arc(32,32,30,0,7);g.fill();return new T.CanvasTexture(c)}
const pwG=new T.BufferGeometry();pwG.setAttribute('position',new T.BufferAttribute(pwP,3));pwG.setAttribute('color',new T.BufferAttribute(pwC,3));
const powder=new T.Points(pwG,new T.PointsMaterial({map:dotTex(),size:.085,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.02,opacity:.95}));
powder.visible=false;scene.add(powder);
const pileY=r=>-1.4+Math.max(0,1.05-r*.75);
const falling=[];
{ // pila gaussiana + chorro que cae + neblina
 for(let i=0;i<NPW;i++){const[a,b,c2,d]=pwSeed[i];
  if(i<NPW*.72){const ang=a*6.283,rad=Math.pow(b,.5)*1.5;const hh=Math.max(0,1.05-rad*.75)*(0.72+c2*.32);
   pwP.set([Math.cos(ang)*rad,-1.4+hh*d,Math.sin(ang)*rad*.8],i*3)}
  else if(i<NPW*.88){const rad=b*.16;const ang=a*6.283;
   pwP.set([Math.cos(ang)*rad,1.7-c2*3.1,Math.sin(ang)*rad],i*3);falling.push([i,.018+d*.03])}
  else pwP.set([(a-.5)*2.8,-.6+b*1.9,(c2-.5)*2.2],i*3)}}

// distribución de colores por composición
function colorList(comp,NUT){const entries=Object.entries(comp).filter(([k,v])=>v>0&&NUT[k]);
  const total=entries.reduce((a,[,v])=>a+v,0);const cols=[];
  entries.forEach(([k,v])=>{const n=Math.max(1,Math.round(v/Math.max(total,1)*100));for(let i=0;i<n;i++)cols.push(NUT[k][1])});
  if(!cols.length)cols.push('#8a7a5f');return cols}
function recolor(){const st=window.__granState,NUT=window.__granNut;if(!st||!NUT)return;
  const cols=colorList(st.comp,NUT);const c=new T.Color();const r4=seeded(5);
  for(let i=0;i<NSP;i++){c.set(cols[(r4()*cols.length)|0]);specks.setColorAt(i,c)}
  specks.instanceColor.needsUpdate=true;
  for(let i=0;i<NPW;i++){const base=(i%9===0);c.set(base?cols[(r4()*cols.length)|0]:'#cfc4a8');
   pwC.set([c.r,c.g,c.b],i*3)}
  pwG.attributes.color.needsUpdate=true}

// interaccion: drag para rotar, con inercia
let vx=0,vy=0,dragging=false,lx=0,ly=0;
canvas.style.touchAction='pan-y';
canvas.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture(e.pointerId)});
addEventListener('pointermove',e=>{if(!dragging)return;vx=(e.clientX-lx)*.006;vy=(e.clientY-ly)*.006;lx=e.clientX;ly=e.clientY});
addEventListener('pointerup',()=>dragging=false);

// ---------- fotos 3D para las tarjetas del catálogo ----------
function snapshotCards(){const cards=window.__CARDS;if(!cards||!cards.length)return;
  const off=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  off.setSize(620,540);off.outputColorSpace=T.SRGBColorSpace;off.toneMapping=T.ACESFilmicToneMapping;off.toneMappingExposure=1.12;
  const oc=new T.PerspectiveCamera(34,620/540,.1,50);oc.position.set(0,.4,4.3);oc.lookAt(0,-.1,0);
  const c2=new T.Color();const r5=seeded(17);
  powder.visible=false;spin.visible=shadow.visible=true;spin.rotation.set(0,0,0);spin.scale.setScalar(1);shadow.scale.setScalar(1);
  cards.forEach(cd=>{
    gran.material.color.set(cd.col);
    const cols=colorList(cd.comp,window.__granNut||{});
    for(let i=0;i<NSP;i++){c2.set(cols[(r5()*cols.length)|0]);specks.setColorAt(i,c2)}
    specks.instanceColor.needsUpdate=true;
    spin.rotation.y=r5()*6.28;
    off.render(scene,oc);
    const cv=cd.canvas;cv.width=620;cv.height=540;
    cv.getContext('2d').drawImage(off.domElement,0,0)});
  off.dispose();
  gran.material.color.set(0xded4bd);window.__granDirty=true}
let snapped=false;

let W=0,H=0;
let didFirst=false;
function frame(ts){const t=ts/1000;
  const rb=canvas.getBoundingClientRect();
  if(didFirst&&(rb.bottom<-100||rb.top>innerHeight+100)&&window.__CARDS===undefined){requestAnimationFrame(frame);return}
  if(didFirst&&(rb.bottom<-100||rb.top>innerHeight+100)&&snapped){requestAnimationFrame(frame);return}
  didFirst=true;
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(w&&h&&(w!==W||h!==H)){W=w;H=h;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
  if(!snapped&&window.__CARDS){snapped=true;snapshotCards()}
  const st=window.__granState;
  if(st){if(window.__granDirty){recolor();window.__granDirty=false}
    const isP=st.fmt==='polvo';
    spin.visible=shadow.visible=!isP;powder.visible=isP;
    if(!isP){const sc=lerp(.72,1.18,(st.size-2)/3);
      spin.scale.setScalar(lerp(spin.scale.x||sc,sc,.12));
      shadow.scale.setScalar(spin.scale.x);
      spin.rotation.y+=.0035+vx;spin.rotation.x+= vy;vx*=.94;vy*=.94;
      spin.rotation.x=Math.max(-.9,Math.min(.9,spin.rotation.x));
      spin.position.y=Math.sin(t*.8)*.04;}
    else{powder.rotation.y=t*.05;const arr=pwG.attributes.position.array;
      for(const[i,sp]of falling){let y=arr[i*3+1]-sp;const r=Math.hypot(arr[i*3],arr[i*3+2]);
        if(y<pileY(r)){y=1.7;const s2=Math.random()*.16;const a2=Math.random()*6.283;arr[i*3]=Math.cos(a2)*s2;arr[i*3+2]=Math.sin(a2)*s2}
        arr[i*3+1]=y}
      pwG.attributes.position.needsUpdate=true}}
  renderer.render(scene,cam);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
}
