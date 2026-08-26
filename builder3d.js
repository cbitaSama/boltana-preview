// Armador: gránulo 3D (relieve + inclusiones + drag) y POLVO v2 (montículo con
// relieve, polvillo superficial, chorro con dispersión, impacto y finos en el aire).
// Lee window.__granState (mutado por index.html) y window.__granDirty.
import * as T from './vendor/three.module.min.js';
const lerp=(a,b,t)=>a+(b-a)*t;
function seeded(s){return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646}}
const canvas=document.getElementById('gran');
if(canvas){
const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
const LOW=matchMedia('(pointer:coarse)').matches||innerWidth<720;
renderer.setPixelRatio(Math.min(devicePixelRatio,LOW?1.5:2));
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.05;
const scene=new T.Scene();
const cam=new T.PerspectiveCamera(34,1,.1,50);cam.position.set(0,.35,4.6);cam.lookAt(0,-.05,0);

// luz de estudio
scene.add(new T.HemisphereLight(0xfff4e0,0x2a1c10,.6));
const key=new T.DirectionalLight(0xffe9c4,2.4);key.position.set(-3,4,3);scene.add(key);
const rim=new T.DirectionalLight(0xcfe0ff,1.0);rim.position.set(4,2,-4);scene.add(rim);
const fill=new T.PointLight(0xffd9a0,7,12,1.8);fill.position.set(2.5,-1,3);scene.add(fill);

// ruido determinista
const rr=seeded(1234);const G=[];for(let i=0;i<12;i++)G.push([rr()*7,rr()*7,rr()*7]);
function noise(x,y,z){let v=0,f=1,a=1;
  for(let o=0;o<3;o++){v+=Math.sin(x*2.1*f+G[o][0])*Math.cos(y*2.3*f+G[o][1])*Math.sin(z*1.9*f+G[o][2])*a;a*=.5;f*=2.2}
  return v}
function dotTex(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const rg=g.createRadialGradient(32,32,0,32,32,30);rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.beginPath();g.arc(32,32,30,0,7);g.fill();return new T.CanvasTexture(c)}
const DOT=dotTex();
function mottleTex(){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle='#e9e1cd';g.fillRect(0,0,512,512);const r=seeded(21);
  for(let i=0;i<900;i++){const t=r();g.fillStyle=t<.5?`rgba(160,148,120,${.05+r()*.09})`:`rgba(190,178,150,${.05+r()*.08})`;
    g.beginPath();g.ellipse(r()*512,r()*512,2+r()*22,2+r()*14,r()*3.14,0,7);g.fill()}
  for(let i=0;i<1600;i++){g.fillStyle=`rgba(90,80,62,${.08+r()*.14})`;g.fillRect(r()*512,r()*512,1.2,1.2)}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;return t}

// ---------- GRÁNULO ----------
function bumpR(nx,ny,nz){return 1+noise(nx,ny,nz)*.05}
const geo=new T.SphereGeometry(1,LOW?72:128,LOW?48:86);
{const p=geo.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i)).normalize();const r=bumpR(v.x,v.y,v.z);p.setXYZ(i,v.x*r,v.y*r,v.z*r)}
 geo.computeVertexNormals()}
const gran=new T.Mesh(geo,new T.MeshPhysicalMaterial({map:mottleTex(),color:0xffffff,roughness:.86,clearcoat:.06,clearcoatRoughness:.8,sheen:.12,sheenColor:0xfff4dd}));
const spin=new T.Group();spin.add(gran);scene.add(spin);
const NSP=LOW?170:260;const specks=new T.InstancedMesh(new T.SphereGeometry(1,10,8),new T.MeshStandardMaterial({roughness:.8}),NSP);
const sd=[];{const r2=seeded(99);const M=new T.Matrix4(),PS=new T.Vector3(),SC=new T.Vector3(),Q=new T.Quaternion();
 for(let i=0;i<NSP;i++){const u=r2()*6.283,vv=Math.acos(2*r2()-1);
  const n=new T.Vector3(Math.sin(vv)*Math.cos(u),Math.cos(vv),Math.sin(vv)*Math.sin(u));
  const sz=.015+r2()*.024;const rad=bumpR(n.x,n.y,n.z)-sz*.72;
  sd.push({n,sz});PS.copy(n).multiplyScalar(rad);SC.set(sz,sz,sz);M.compose(PS,Q,SC);specks.setMatrixAt(i,M)}}
spin.add(specks);
function shadowTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  const rg=g.createRadialGradient(128,128,10,128,128,120);rg.addColorStop(0,'rgba(0,0,0,.55)');rg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=rg;g.fillRect(0,0,256,256);return new T.CanvasTexture(c)}
const shadow=new T.Mesh(new T.PlaneGeometry(3,3),new T.MeshBasicMaterial({map:shadowTex(),transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.45;scene.add(shadow);

// ---------- POLVO v2 ----------
const powderG=new T.Group();powderG.visible=false;scene.add(powderG);
const R=1.5,SQ=.58,BASE=-1.45;
const heapH=(x,z)=>{const d=Math.hypot(x,z);return d>=R?BASE:BASE+SQ*Math.sqrt(Math.max(0,1-(d/R)*(d/R)))*(1+noise(x*.9,0,z*.9)*.06)}
// monticulo con relieve y vertex colors
const heapGeo=new T.SphereGeometry(R,LOW?40:64,LOW?20:30,0,Math.PI*2,0,Math.PI/2);
{const p=heapGeo.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i)).normalize();
  const r2=R*(1+noise(v.x*2.4,v.y*2.4,v.z*2.4)*.07+noise(v.x*7,v.y*7,v.z*7)*.02);
  p.setXYZ(i,v.x*r2,v.y*r2,v.z*r2)}
 heapGeo.computeVertexNormals();
 const n=p.count;const col=new Float32Array(n*3);const r3=seeded(55);
 for(let i=0;i<n;i++){const l=.78+r3()*.14;col.set([l,l*.965,l*.9],i*3)}
 heapGeo.setAttribute('color',new T.BufferAttribute(col,3))}
const heap=new T.Mesh(heapGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,color:0xf3e9d2}));
heap.scale.set(1,SQ,1);heap.position.y=BASE;powderG.add(heap);
// polvillo superficial (granulado fino sobre el monticulo)
const NSF=LOW?1300:2600;const sfP=new Float32Array(NSF*3),sfC=new Float32Array(NSF*3),sfSeed=seeded(7);
for(let i=0;i<NSF;i++){const a=sfSeed()*6.283,d=Math.pow(sfSeed(),.6)*R*.99;
  const x=Math.cos(a)*d,z=Math.sin(a)*d;sfP.set([x,heapH(x,z)+.008+sfSeed()*.015,z],i*3)}
const sfG=new T.BufferGeometry();sfG.setAttribute('position',new T.BufferAttribute(sfP,3));sfG.setAttribute('color',new T.BufferAttribute(sfC,3));
const surf=new T.Points(sfG,new T.PointsMaterial({map:DOT,size:.035,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.05}));
powderG.add(surf);
// chorro cayendo con dispersion
const NST=LOW?150:260;const stP=new Float32Array(NST*3),stC=new Float32Array(NST*3),stD=[];
{const r4=seeded(31);for(let i=0;i<NST;i++){stD.push({a:r4()*6.283,r0:r4()*.09,spd:.9+r4()*.9,off:r4()*3,wob:r4()*6.283});stP.set([0,10,0],i*3)}}
const stG=new T.BufferGeometry();stG.setAttribute('position',new T.BufferAttribute(stP,3));stG.setAttribute('color',new T.BufferAttribute(stC,3));
const stream=new T.Points(stG,new T.PointsMaterial({map:DOT,size:.055,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.05}));
powderG.add(stream);
// nubecitas de impacto
const puffs=[];for(let i=0;i<6;i++){const sp=new T.Sprite(new T.SpriteMaterial({map:DOT,color:0xd8cbb0,transparent:true,opacity:0,depthWrite:false}));
  powderG.add(sp);puffs.push(sp)}
// tolva de donde cae el chorro
{const fmat=new T.MeshStandardMaterial({color:0x2e241a,roughness:.55,side:T.DoubleSide});
 const cone=new T.Mesh(new T.CylinderGeometry(.4,.075,.44,24,1,true),fmat);cone.position.y=1.42;powderG.add(cone);
 const lip=new T.Mesh(new T.TorusGeometry(.4,.026,8,28),new T.MeshStandardMaterial({color:0x453728,roughness:.5}));
 lip.rotation.x=Math.PI/2;lip.position.y=1.64;powderG.add(lip)}
// finos flotando
const NFN=LOW?140:280;const fnP=new Float32Array(NFN*3),fnD=[];const fnSeed=seeded(13);
for(let i=0;i<NFN;i++){fnP.set([(fnSeed()-.5)*3,BASE+.1+fnSeed()*2.4,(fnSeed()-.5)*2.4],i*3);fnD.push(fnSeed()*6.283)}
const fnG=new T.BufferGeometry();fnG.setAttribute('position',new T.BufferAttribute(fnP,3));
const fines=new T.Points(fnG,new T.PointsMaterial({map:DOT,color:0xcfc2a4,size:.022,transparent:true,opacity:.35,depthWrite:false}));
powderG.add(fines);

// ---------- colores por composicion ----------
function colorList(comp,NUT){const entries=Object.entries(comp).filter(([k,v])=>v>0&&NUT[k]);
  const total=entries.reduce((a,[,v])=>a+v,0);const cols=[];
  entries.forEach(([k,v])=>{const n=Math.max(1,Math.round(v/Math.max(total,1)*100));for(let i=0;i<n;i++)cols.push(NUT[k][1])});
  if(!cols.length)cols.push('#8a7a5f');return cols}
const bodyCol=new T.Color('#e9e1cd');
function recolor(){const st=window.__granState,NUT=window.__granNut;if(!st||!NUT)return;
  // el CUERPO del gránulo mezcla su color según la fórmula (pedido de Rommel):
  // más yeso→blanco, más azufre→amarillo, más MO/roca→oscuro
  {const entries=Object.entries(st.comp).filter(([k,v])=>v>0&&NUT[k]);
   const total=entries.reduce((a,[,v])=>a+v,0);
   const base=new T.Color('#e9e1cd');const tmp=new T.Color();
   let wr=Math.max(0,100-total),r=base.r*wr,g=base.g*wr,b=base.b*wr,w=wr;
   entries.forEach(([k,v])=>{tmp.set(NUT[k][1]);r+=tmp.r*v;g+=tmp.g*v;b+=tmp.b*v;w+=v});
   if(w>0)bodyCol.setRGB(r/w,g/w,b/w).lerp(base,.28);else bodyCol.copy(base);
   gran.material.color.copy(bodyCol);
   heap.material.color.copy(bodyCol).lerp(base,.25)}
  const cols=colorList(st.comp,NUT);const c=new T.Color();const r5=seeded(5);
  for(let i=0;i<NSP;i++){c.set(cols[(r5()*cols.length)|0]);specks.setColorAt(i,c)}
  specks.instanceColor.needsUpdate=true;
  for(let i=0;i<NSF;i++){if(r5()<.2)c.set(cols[(r5()*cols.length)|0]);else{const l=.9+r5()*.2;c.copy(bodyCol).multiplyScalar(l)}
    sfC.set([c.r,c.g,c.b],i*3)}
  sfG.attributes.color.needsUpdate=true;
  for(let i=0;i<NST;i++){if(r5()<.35)c.set(cols[(r5()*cols.length)|0]);else{const l=.92+r5()*.18;c.copy(bodyCol).multiplyScalar(l)}
    stC.set([c.r,c.g,c.b],i*3)}
  stG.attributes.color.needsUpdate=true}

// ---------- drag con inercia ----------
let vx=0,vy=0,dragging=false,lx=0,ly=0;
canvas.style.touchAction='pan-y';
canvas.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture(e.pointerId)});
addEventListener('pointermove',e=>{if(!dragging)return;vx=(e.clientX-lx)*.006;vy=(e.clientY-ly)*.006;lx=e.clientX;ly=e.clientY});
addEventListener('pointerup',()=>dragging=false);

// ---------- fotos 3D para el catalogo ----------
function snapshotCards(){const cards=window.__CARDS;if(!cards||!cards.length)return;
  const off=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  off.setSize(620,540);off.outputColorSpace=T.SRGBColorSpace;off.toneMapping=T.NeutralToneMapping;off.toneMappingExposure=1.05;
  const oc=new T.PerspectiveCamera(34,620/540,.1,50);oc.position.set(0,.4,4.3);oc.lookAt(0,-.1,0);
  const c2=new T.Color();const r6=seeded(17);
  powderG.visible=false;spin.visible=shadow.visible=true;spin.rotation.set(0,0,0);spin.scale.setScalar(1);shadow.scale.setScalar(1);
  cards.forEach(cd=>{gran.material.color.set(cd.col);
    const cols=colorList(cd.comp,window.__granNut||{});
    for(let i=0;i<NSP;i++){c2.set(cols[(r6()*cols.length)|0]);specks.setColorAt(i,c2)}
    specks.instanceColor.needsUpdate=true;spin.rotation.y=r6()*6.28;
    off.render(scene,oc);
    const cv=cd.canvas;cv.width=620;cv.height=540;cv.getContext('2d').drawImage(off.domElement,0,0)});
  off.dispose();gran.material.color.set(0xffffff);window.__granDirty=true}
let snapped=false,didFirst=false;

// ---------- loop ----------
let W=0,H=0;
function frame(ts){const t=ts/1000;
  const rb=canvas.getBoundingClientRect();
  if(didFirst&&snapped&&(rb.bottom<-100||rb.top>innerHeight+100)){requestAnimationFrame(frame);return}
  didFirst=true;
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(w&&h&&(w!==W||h!==H)){W=w;H=h;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
  if(!snapped&&window.__CARDS){snapped=true;snapshotCards()}
  const st=window.__granState;
  if(st){if(window.__granDirty){recolor();window.__granDirty=false}
    const isP=st.fmt==='polvo';
    spin.visible=shadow.visible=!isP;powderG.visible=isP;
    if(!isP){const sc=lerp(.72,1.18,(st.size-2)/3);
      spin.scale.setScalar(lerp(spin.scale.x||sc,sc,.12));shadow.scale.setScalar(spin.scale.x);
      spin.rotation.y+=.0035+vx;spin.rotation.x+=vy;vx*=.94;vy*=.94;
      spin.rotation.x=Math.max(-.9,Math.min(.9,spin.rotation.x));
      spin.position.y=Math.sin(t*.8)*.04}
    else{
      powderG.rotation.y=t*.045+vx*2;vx*=.94;
      // chorro
      const p=stG.attributes.position.array;
      for(let i=0;i<NST;i++){const d=stD[i];
        let e=((t*d.spd*.35+d.off)%1);
        const y=lerp(1.18,heapH(0,0)-.02,e);
        const spread=d.r0+Math.pow(e,2.2)*.5;
        const wob=Math.sin(t*3+d.wob)*.03*e;
        p[i*3]=Math.cos(d.a)*spread+wob;p[i*3+1]=y;p[i*3+2]=Math.sin(d.a)*spread+wob}
      stG.attributes.position.needsUpdate=true;
      // impacto
      const apex=heapH(0,0);
      puffs.forEach((sp,i)=>{const e=(t*.55+i/6)%1;
        sp.position.set(Math.cos(i*1.05)*.28*(1+e),apex+.05+e*.16,Math.sin(i*1.05)*.28*(1+e));
        const s=lerp(.22,.85,e);sp.scale.set(s,s*.7,1);sp.material.opacity=(1-e)*(1-e)*.32});
      // finos a la deriva
      const f=fnG.attributes.position.array;
      for(let i=0;i<NFN;i++){f[i*3]+=Math.sin(t*.4+fnD[i])*.0015;f[i*3+1]+=Math.cos(t*.3+fnD[i])*.001;f[i*3+2]+=Math.sin(t*.35+fnD[i]*2)*.0012}
      fnG.attributes.position.needsUpdate=true}}
  renderer.render(scene,cam);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
}
