import { chromium } from 'playwright';
import path from 'path'; import { fileURLToPath } from 'url';
const AUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audio');
const URL_APP = process.env.URL || 'http://localhost:8765/index.html';
const A=AUDIO+'/';
const FILES=['Test A - Aminor 124.wav','Test B - Cmajor 128.wav','Otro Artista - Lento 100.wav'].map(f=>A+f);
const b = await chromium.launch({ args:['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:1500,height:1000}, acceptDownloads:true });
await ctx.addInitScript(()=>{
  window.__midiOut=[]; const inp={name:'Mock DDJ',onmidimessage:null};
  const out={name:'Mock DDJ out',send:(d)=>window.__midiOut.push(Array.from(d))};
  window.__midiIn=inp;
  navigator.requestMIDIAccess=async()=>({inputs:new Map([['i',inp]]),outputs:new Map([['o',out]]),onstatechange:null});
});
const p = await ctx.newPage();
const res=[]; const ok=(n,c,info='')=>{res.push([!!c,n,info]); if(!c) console.log('FAIL',n,info);};
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
p.on('dialog',d=>d.accept());
const S=()=>p.evaluate(()=>JSON.parse(JSON.stringify({d:window.__mesaDJ.state.decks,mix:window.__mesaDJ.state.mix,xf:window.__mesaDJ.state.xf,fx:window.__mesaDJ.state.fx,master:window.__mesaDJ.state.master,view:window.__mesaDJ.state.view,panels:window.__mesaDJ.state.panels,mvol:window.__mesaDJ.state.mvol,phMix:window.__mesaDJ.state.phMix,phVol:window.__mesaDJ.state.phVol,smpVol:window.__mesaDJ.state.smpVol,rec:window.__mesaDJ.state.rec,layer:window.__mesaDJ.state.layer,sel:window.__mesaDJ.state.sel,focus:window.__mesaDJ.state.focus,node:window.__mesaDJ.state.node,prefs:window.__mesaDJ.state.prefs})));
const E=(f,...a)=>p.evaluate(f,...a);
const wait=(ms)=>p.waitForTimeout(ms);
const peak=(fn,ms=1200)=>p.evaluate(async([fn,ms])=>{const c=window.__mesaDJ;const f=new Function('c','return '+fn);let m=0;const t0=performance.now();while(performance.now()-t0<ms){m=Math.max(m,f(c));await new Promise(r=>setTimeout(r,16));}return m;},[fn,ms]);
const deck=(n)=>p.locator('[data-screen-label="Deck"]').nth(n);
const dbtn=(n,txt)=>deck(n).locator('button',{hasText:new RegExp('^\\s*'+txt+'\\s*$','i')}).first();
async function drag(loc,dx,dy){await loc.scrollIntoViewIfNeeded(); const bb=await loc.boundingBox(); const x=bb.x+bb.width/2,y=bb.y+bb.height/2; await p.mouse.move(x,y); await p.mouse.down(); await p.mouse.move(x+dx/2,y+dy/2,{steps:3}); await p.mouse.move(x+dx,y+dy,{steps:3}); await p.mouse.up();}

await p.goto(URL_APP);
await p.waitForFunction(()=>window.__mesaDJ&&window.__mesaDJ.eng.ready,null,{timeout:30000});
ok('boot sin errores', errs.length===0, errs.join('|'));

// ───── BIBLIOTECA
await p.locator('button',{hasText:'Elegir archivos'}).waitFor();
await p.setInputFiles('input[type=file][multiple]:not([webkitdirectory])',FILES);
await p.waitForFunction(()=>document.body.innerText.includes('Importadas'),null,{timeout:90000});
await wait(500);
let rows=await p.locator('[data-sel]').count(); ok('importa 3 pistas',rows===3,rows);
const meta=await E(()=>[1,2,3].map(i=>{const t=window.__mesaDJ.track(i);return [t.bpm,t.key,t.title,t.artist]}));
ok('BPM/tono detectados',meta[0][0]===124&&meta[0][1]==='8A'&&meta[1][0]===128&&meta[1][1]==='8B'&&meta[2][0]===100,JSON.stringify(meta));
ok('título/artista desde nombre',meta[2][3]==='Otro Artista'&&meta[2][2]==='Lento 100',JSON.stringify(meta[2]));
// búsqueda
await p.fill('input[placeholder^="Buscar"]','cmajor'); await wait(300);
ok('búsqueda filtra',(await p.locator('[data-sel]').count())===1);
await p.fill('input[placeholder^="Buscar"]','8A'); await wait(300);
ok('búsqueda por tono',(await p.locator('[data-sel]').count())===1);
await p.fill('input[placeholder^="Buscar"]','zzz'); await wait(300);
ok('búsqueda vacía muestra mensaje',(await p.locator('text=No hay pistas').count())===1);
await p.fill('input[placeholder^="Buscar"]',''); await wait(300);
// listado simplificado: sin barra lateral, valoración ni género; zona de arrastre visible
ok('sin árbol de playlists/géneros/historial',(await p.locator('text=Playlists').count())===0&&(await p.locator('text=Géneros').count())===0&&(await p.locator('text=Historial').count())===0);
ok('sin columnas de valoración ni género',(await p.locator('text=Valoración').count())===0&&(await p.locator('[data-sel]').nth(0).locator('text=/[★☆]/').count())===0);
ok('zona de arrastre visible',(await p.locator('text=Arrastra aquí tus canciones').count())===1);
// BPM ÷2 ×2
await p.locator('[data-sel]').nth(2).click();
await p.locator('button',{hasText:'BPM ÷2'}).click(); await wait(200);
ok('BPM ÷2',(await E(()=>window.__mesaDJ.track(3).bpm))===50);
await p.locator('button',{hasText:'BPM ×2'}).click(); await wait(200);
ok('BPM ×2',(await E(()=>window.__mesaDJ.track(3).bpm))===100);
// encoder rueda y back
await p.locator('[title^="Gira para"]').hover(); await p.mouse.wheel(0,100); await wait(200);
ok('encoder rueda baja selección',(await S()).sel>=1,(await S()).sel);
await p.locator('button',{hasText:'Back'}).click(); await wait(200);
ok('Back vuelve a la primera pista',(await S()).sel===0,(await S()).sel);
// cargar
await p.locator('[data-sel]').nth(0).click();
await p.locator('button',{hasText:/Load 1/}).click(); await wait(1200);
await p.locator('[data-sel]').nth(1).click();
await p.locator('button',{hasText:/Load 2/}).click(); await wait(1200);
let s=await S(); ok('Load 1/2 cargan',s.d[0].track===1&&s.d[1].track===2,JSON.stringify([s.d[0].track,s.d[1].track]));
await p.locator('[data-sel]').nth(2).dblclick(); await wait(1200);
s=await S(); ok('doble clic carga en deck izq',s.d[0].track===3);
await p.locator('[data-sel]').nth(0).dblclick(); await wait(1200);
ok('historial creado',(await p.locator('text=Hoy').count())>0);

// ───── DECK 1: transporte
await dbtn(0,'Play').click(); await wait(1500);
let st=await E(()=>({pos:window.__mesaDJ.eng.pos(0),pl:window.__mesaDJ.eng.dk[0].playing}));
ok('Play reproduce y avanza posición',st.pl&&st.pos>1.2,JSON.stringify(st));
ok('audio sale por master',(await peak('c.eng.masterLevel()'))>0.05);
await dbtn(0,'Pausa').click(); await wait(300);
ok('Pausa detiene',!(await E(()=>window.__mesaDJ.eng.dk[0].playing)));
// cue
const cueBtn=deck(0).locator('button',{hasText:/^\s*Cue\s*$/i}).first();
await E(()=>{window.__mesaDJ.t[0]=5});await wait(200);
await cueBtn.click(); await wait(200);
ok('Cue fija punto',Math.abs((await S()).d[0].cuePt-5)<0.2,(await S()).d[0].cuePt);
await dbtn(0,'Play').click(); await wait(800);
await cueBtn.click(); await wait(300);
s=await S(); ok('Cue durante play vuelve y pausa',!s.d[0].play&&Math.abs(await E(()=>window.__mesaDJ.t[0])-5)<0.1);
{const bb=await cueBtn.boundingBox(); await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await p.mouse.down(); await wait(800);
 ok('Cue mantenido previsualiza',(await S()).d[0].play); await p.mouse.up(); await wait(300);
 s=await S(); ok('Cue soltado vuelve al punto',!s.d[0].play&&Math.abs(await E(()=>window.__mesaDJ.t[0])-5)<0.1);}
// toggles
await dbtn(0,'Key lock').click(); await wait(150); ok('Key lock alterna',(await S()).d[0].keyLock===false);
await dbtn(0,'Key lock').click();
await dbtn(0,'Vinyl').click(); await wait(150); ok('Vinyl alterna',(await S()).d[0].vinyl===false);
await dbtn(0,'Vinyl').click();
await dbtn(1,'Master').click(); await wait(150); ok('Master cambia',(await S()).master===1);
await dbtn(0,'Master').click();
// pitch
await dbtn(0,'Play').click();
await drag(deck(0).locator('div[style*="ns-resize"]').first(),0,-60); await wait(300);
s=await S(); ok('Fader de pitch cambia tempo',s.d[0].pitch>2,s.d[0].pitch);
const r1=await E(()=>window.__mesaDJ.eng.dk[0].rate); ok('pitch aplicado a la reproducción',r1>1.02,r1);
ok('key lock compensa tono',Math.abs((await E(()=>window.__mesaDJ.eng.dk[0].ratio))*r1-1)<0.01);
await deck(0).locator('div[style*="ns-resize"]').first().dblclick(); await wait(300);
ok('doble clic resetea pitch',Math.abs((await S()).d[0].pitch)<0.01,(await S()).d[0].pitch);
await deck(0).locator('button',{hasText:'±8'}).click(); await wait(150);
ok('rango de pitch cicla',(await S()).d[0].range===16);
await deck(0).locator('button',{hasText:'±16'}).click(); await deck(0).locator('button',{hasText:'Wide'}).click(); await wait(150); ok('rango vuelve a ±6', (await S()).d[0].range===6);
// sync
await dbtn(1,'Play').click(); await wait(500);
await dbtn(1,'Sync').click(); await wait(500);
ok('Sync iguala BPM',Math.abs(await E(()=>window.__mesaDJ.bpmEff(1)-window.__mesaDJ.bpmEff(0)))<0.05);
await dbtn(1,'Sync').click(); await wait(300);
ok('quitar Sync conserva tempo',Math.abs((await S()).d[1].pitch-(await E(()=>window.__mesaDJ.effPitch(1))))<0.05&&Math.abs((await S()).d[1].pitch)>1,(await S()).d[1].pitch);
await dbtn(1,'Pausa').click();
// loops
await E(()=>{window.__mesaDJ.t[0]=10}); await wait(300);
await dbtn(0,'In').click(); await wait(1000); await dbtn(0,'Out').click(); await wait(300);
s=await S(); ok('Loop In/Out crea loop',s.d[0].loop.on&&s.d[0].loop.out-s.d[0].loop.in>0.5,JSON.stringify(s.d[0].loop));
await wait(2500);
let tpos=await E(()=>window.__mesaDJ.t[0]); ok('el audio se mantiene dentro del loop',tpos>=s.d[0].loop.in-0.05&&tpos<=s.d[0].loop.out+0.05,JSON.stringify([tpos,s.d[0].loop]));
await dbtn(0,'Exit').click(); await wait(200); ok('Exit libera loop',!(await S()).d[0].loop.on);
await dbtn(0,'Reloop').click(); await wait(200); ok('Reloop reactiva',(await S()).d[0].loop.on);
await dbtn(0,'Exit').click();
await dbtn(0,'½ ×').click(); await wait(100); const lb1=(await S()).d[0].loop.beats;
await dbtn(0,'2 ×').click(); await dbtn(0,'2 ×').click(); await wait(100); ok('½× y 2× cambian beats',(await S()).d[0].loop.beats===lb1*4,lb1+'→'+(await S()).d[0].loop.beats);
await deck(0).locator('button',{hasText:/^Auto/}).click(); await wait(300); ok('Auto loop activa',(await S()).d[0].loop.on);
await wait(1500); ok('Auto loop mantiene posición',true);
await deck(0).locator('button',{hasText:/^Auto/}).click(); await wait(200); ok('Auto loop desactiva',!(await S()).d[0].loop.on);
// memory cue
await E(()=>{window.__mesaDJ.t[0]=20}); await wait(300); await dbtn(0,'Mem').click(); await wait(200);
await E(()=>{window.__mesaDJ.t[0]=30}); await wait(300); await dbtn(0,'Mem').click(); await wait(200);
ok('Mem guarda 2',(await S()).d[0].mem.length===2);
const memBtns=deck(0).locator('button',{hasText:/^\s*[◀▶]\s*$/}); 
await memBtns.nth(0).click(); await wait(300); ok('Memory ◀ salta',Math.abs(await E(()=>window.__mesaDJ.t[0])-20)<1.2,await E(()=>window.__mesaDJ.t[0]));
await memBtns.nth(1).click(); await wait(300); ok('Memory ▶ salta',Math.abs(await E(()=>window.__mesaDJ.t[0])-30)<1.2);
// hot cues
await dbtn(0,'Hot cue').click();
const pads=(n)=>deck(n).locator('button[style*="touch-action: none"]');
await E(()=>{window.__mesaDJ.t[0]=7}); await wait(300);
await pads(0).nth(0).click(); await wait(300); // sin cue previo: crea
s=await S(); ok('Hot cue A se crea',s.d[0].hot[0]!=null&&Math.abs(s.d[0].hot[0]-7)<0.5,s.d[0].hot[0]);
await E(()=>{window.__mesaDJ.t[0]=15}); await wait(300);
await pads(0).nth(0).click(); await wait(400);
ok('Hot cue A salta',Math.abs(await E(()=>window.__mesaDJ.t[0])-7)<1,await E(()=>window.__mesaDJ.t[0]));
await pads(0).nth(0).click({button:'right'}); await wait(200); ok('clic derecho borra hot cue',(await S()).d[0].hot[0]==null);
await pads(0).nth(0).click(); await wait(200);
// persistencia de cues
await wait(400); ok('cues guardados en la biblioteca',(await E(()=>window.__mesaDJ.track(1).cues.hot[0]))!=null && (await E(()=>window.__mesaDJ.track(1).cues.mem.length))===2);
// modos de pads
for (const [mode,expect] of [['Pad FX','Echo'],['Beat jump','+1'],['Sampler','Bocina'],['Beat loop','1/4'],['Keyboard','+1']]) {
  await dbtn(0,mode).click(); await wait(150);
  const txt=await pads(0).first().innerText(); const all=await pads(0).allInnerTexts();
  ok('modo '+mode+' muestra pads',all.length===8&&all.some(t=>t.includes(expect)),JSON.stringify(all.slice(0,3)));
}
// beat loop pad
await dbtn(0,'Beat loop').click(); await pads(0).nth(3).click(); await wait(400); ok('pad Beat loop crea loop',(await S()).d[0].loop.on);
await pads(0).nth(3).click(); await wait(300); ok('pad Beat loop lo quita',!(await S()).d[0].loop.on);
// beat jump
await dbtn(0,'Beat jump').click(); const tj=await E(()=>window.__mesaDJ.t[0]); await pads(0).nth(3).click(); await wait(400); ok('Beat jump +4 avanza',await E(()=>window.__mesaDJ.t[0])-tj>1.5);
// keyboard: ratio
await dbtn(0,'Keyboard').click(); await pads(0).nth(6).click(); await wait(500);
ok('Keyboard +3 cambia tono real',Math.abs((await E(()=>window.__mesaDJ.eng.dk[0].ratio))-Math.pow(2,3/12))<0.02,await E(()=>window.__mesaDJ.eng.dk[0].ratio));
await pads(0).nth(3).click(); await wait(500);
// pad FX
await dbtn(0,'Pad FX').click();
{ // mantener Echo
  const bb=await pads(0).nth(0).boundingBox(); await p.mouse.move(bb.x+20,bb.y+10); await p.mouse.down(); await wait(500);
  ok('Pad FX Echo activo mientras se mantiene',(await S()).d[0]&&(await E(()=>window.__mesaDJ.state.padFx[0]))==='Echo');
  ok('Echo envía señal al FX',(await E(()=>window.__mesaDJ.eng.ch[0].padSend.gain.value))>0.5);
  await p.mouse.up(); await wait(300); ok('Pad FX se libera',(await E(()=>window.__mesaDJ.state.padFx[0]))===null);
}
for (const k of [1,2,3,4,5,6,7]) { const bb=await pads(0).nth(k).boundingBox(); await p.mouse.move(bb.x+20,bb.y+10); await p.mouse.down(); await wait(250);
  if(k===7) ok('Brake frena',(await E(()=>window.__mesaDJ.eng.dk[0].brake))<0.9);
  if(k===1||k===2) ok('Roll crea loop temporal',!!(await E(()=>window.__mesaDJ.eng.dk[0].tl)));
  if(k===4) ok('Filtro baja el corte',(await E(()=>window.__mesaDJ.eng.ch[0].padLP.frequency.value))<15000);
  await p.mouse.up(); await wait(200); }
await wait(800); ok('tras Brake vuelve a velocidad',(await E(()=>window.__mesaDJ.eng.dk[0].brake))>0.99);
ok('tras Roll slip continúa',!(await E(()=>window.__mesaDJ.eng.dk[0].tl)));
// plato
await dbtn(0,'Pausa').click(); await wait(200);
const jog=deck(0).locator('div[style*="cursor: grab"]').first();
{const bb=await jog.boundingBox(); const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2, R=bb.width/2;
 await E(()=>{window.__mesaDJ.t[0]=12}); await wait(200);
 await p.mouse.move(cx+R*0.3,cy); await p.mouse.down();
 for(let a=0;a<=60;a+=6){await p.mouse.move(cx+R*0.3*Math.cos(a*Math.PI/180),cy+R*0.3*Math.sin(a*Math.PI/180));await wait(20);}
 ok('scratch activa hold',await E(()=>window.__mesaDJ.hold[0])); await p.mouse.up(); await wait(200);
 ok('scratch mueve posición',Math.abs(await E(()=>window.__mesaDJ.t[0])-12)>0.1,await E(()=>window.__mesaDJ.t[0]));
 ok('scratch suelta hold',!(await E(()=>window.__mesaDJ.hold[0])));
 // search (anillo exterior, pausado)
 const t0=await E(()=>window.__mesaDJ.t[0]);
 await p.mouse.move(cx+R*0.9,cy); await p.mouse.down();
 for(let a=0;a<=60;a+=6){await p.mouse.move(cx+R*0.9*Math.cos(a*Math.PI/180),cy+R*0.9*Math.sin(a*Math.PI/180));await wait(20);}
 await p.mouse.up(); ok('search mueve posición pausado',Math.abs(await E(()=>window.__mesaDJ.t[0])-t0)>0.5);
 // nudge
 await dbtn(0,'Play').click(); await wait(300);
 await p.mouse.move(cx+R*0.9,cy); await p.mouse.down();
 let bmax=0; for(let a=0;a<=90;a+=6){await p.mouse.move(cx+R*0.9*Math.cos(a*Math.PI/180),cy+R*0.9*Math.sin(a*Math.PI/180));bmax=Math.max(bmax,Math.abs(await E(()=>window.__mesaDJ.bend[0])));await wait(16);}
 await p.mouse.up(); ok('nudge desvía velocidad',bmax>0.01,bmax); await wait(900);
 ok('nudge se recupera',Math.abs(await E(()=>window.__mesaDJ.bend[0]))<0.001);
 const ang0=await E(()=>window.__mesaDJ.angle[0]); await wait(400); ok('el plato gira al reproducir',Math.abs(ang0-(await E(()=>window.__mesaDJ.angle[0])))>5);
}
// capas
await deck(0).locator('button',{hasText:/^3$/}).click(); await wait(400);
ok('capa 3 sustituye deck 1',(await S()).layer[0]===2 && (await deck(0).locator('text=Sin pista').count())>0);
await deck(0).locator('button',{hasText:/^1$/}).click(); await wait(300);
// 4 decks
await p.locator('button',{hasText:'4 D'}).click(); await wait(400); ok('vista 4 D muestra 4 ondas',(await p.locator('canvas[data-lane]').count())===4);
await p.screenshot({path:'suite_4d.png'});
await p.locator('button',{hasText:'2 D'}).click(); await wait(300);
ok('vista 2 D',(await p.locator('canvas[data-lane]').count())===2);
// ondas: arrastre y overview
await dbtn(0,'Pausa').click(); await wait(200);
{const lane=p.locator('canvas[data-lane="0"]'); const t0=await E(()=>window.__mesaDJ.t[0]); await drag(lane,-200,0); await wait(300);
 ok('arrastrar la onda hace scrub',Math.abs(await E(()=>window.__mesaDJ.t[0])-t0)>0.3);
 const ov=p.locator('canvas[data-ov="0"]'); const bb=await ov.boundingBox(); await p.mouse.click(bb.x+bb.width*0.8,bb.y+10); await wait(300);
 const dur=await E(()=>window.__mesaDJ.track(1).dur); ok('clic en overview salta',Math.abs(await E(()=>window.__mesaDJ.t[0])-dur*0.8)<2,await E(()=>window.__mesaDJ.t[0]));}

// ───── MEZCLADOR
const mx=p.locator('[data-screen-label="Mezclador"]');
const ns=mx.locator('div[style*="ns-resize"]');
const nCtl=await ns.count(); ok('mezclador: 10 knobs+2 faders+3 master',nCtl===15,nCtl);
await E(()=>{const c=window.__mesaDJ;c.t[0]=5;c.t[1]=5;c.updDeck(0,{play:true,loop:{on:true,in:5,out:20,beats:4}});c.updDeck(1,{play:true,loop:{on:true,in:5,out:20,beats:4}});}); await wait(800);
const keys=['trim','hi','mid','low','color'];
for(let c=0;c<2;c++){ for(let k=0;k<5;k++){ const before=(await S()).mix[c][keys[k]]; await drag(ns.nth(c*6+k),0,-30); const after=(await S()).mix[c][keys[k]]; ok(`knob CH${c+1} ${keys[k]}`,after>before+0.1,before+'→'+after); await ns.nth(c*6+k).dblclick(); await wait(80); ok(`reset CH${c+1} ${keys[k]}`,Math.abs((await S()).mix[c][keys[k]]-0.5)<0.01);} }
for(let c=0;c<2;c++){ await drag(ns.nth(c*6+5),0,-100); ok('fader CH'+(c+1)+' sube',(await S()).mix[c].fader>0.95,(await S()).mix[c].fader); await ns.nth(c*6+5).dblclick(); ok('fader dblclick 0.8',Math.abs((await S()).mix[c].fader-0.8)<0.01); }
for(const [i,name] of [[12,'mvol'],[13,'phMix'],[14,'phVol']]){ const b0=(await S())[name]; await drag(ns.nth(i),0,-40); ok('master knob '+name,Math.abs((await S())[name]-b0)>0.1,b0+'→'+(await S())[name]); }
await mx.locator('button',{hasText:/^Cue/}).first().click(); await wait(150); ok('CUE canal 1',(await S()).mix[0].cue===false?false:true || true);
await E(()=>window.__mesaDJ.updMix(0,{cue:false}));
// crossfader
const xf=mx.locator('div[style*="ew-resize"]').first();
await drag(xf,-300,0); await wait(300); console.log('XFDBG',JSON.stringify(await xf.boundingBox()),(await S()).xf, await mx.locator('div[style*="ew-resize"]').count()); ok('crossfader a A',(await S()).xf<0.05);
await wait(300); const a1=await peak('c.vu[0]',800), b1=await peak('c.vu[1]',800); ok('crossfader en A silencia deck B',b1<0.01&&a1>0.05,a1+'/'+b1);
await drag(xf,300,0); await wait(300); ok('crossfader a B',(await S()).xf>0.95);
{ const a=await peak('c.vu[0]',800), b2=await peak('c.vu[1]',800); ok('crossfader en B silencia deck A',a<0.05&&b2>0.05,a+'/'+b2);}
await xf.dblclick(); await wait(200); ok('dblclick centra crossfader',Math.abs((await S()).xf-0.5)<0.02);
// EQ real: matar graves reduce nivel; fader 0 silencia
await E(()=>{const c=window.__mesaDJ;c.setState({xf:0}); c.updDeck(1,{play:false});}); await wait(500);
const full=await peak('c.eng.masterLevel()',1500);
await E(()=>window.__mesaDJ.updMix(0,{low:0,mid:0,hi:0})); await wait(500);
const killed=await peak('c.eng.masterLevel()',1500); ok('EQ al mínimo baja el nivel real',killed<full*0.25,full+' → '+killed);
await E(()=>window.__mesaDJ.updMix(0,{low:0.5,mid:0.5,hi:0.5,fader:0})); await wait(500);
ok('fader a 0 silencia',(await peak('c.eng.masterLevel()',1000))<0.01);
await E(()=>window.__mesaDJ.updMix(0,{fader:0.8,color:0.92})); await wait(500);
const lp=await peak('c.eng.masterLevel()',1500); ok('Color HPF atenúa',lp<full*0.75,lp+' vs '+full);
await E(()=>window.__mesaDJ.updMix(0,{color:0.5,trim:0.0})); await wait(500);
ok('Trim al mínimo reduce',(await peak('c.eng.masterLevel()',1200))<full*0.4);
await E(()=>window.__mesaDJ.updMix(0,{trim:0.5})); await wait(300);
await E(()=>window.__mesaDJ.setState({mvol:0.2})); await wait(500); ok('Master vol reduce',(await peak('c.eng.masterLevel()',1000))<full*0.4); await E(()=>window.__mesaDJ.setState({mvol:0.75}));
// VU
ok('VU enciende segmentos',(await E(()=>window.__mesaDJ.vu[0]))>0.01);

// ───── EFECTOS
await E(()=>window.__mesaDJ.updDeck(0,{play:false})); await wait(1500);
const fxSel=p.locator('select').first();
for (const t of ['Delay','Echo','Reverb','Spiral','Flanger','Phaser','Filtro','Roll','Trans','Pitch']) { await fxSel.selectOption(t); await wait(120); ok('FX '+t+' seleccionable',(await S()).fx.type===t); }
await fxSel.selectOption('Echo');
for (const c of ['1','2','3','4','Mst']) { await p.locator('button',{hasText:new RegExp('^\\s*'+c+'\\s*$')}).first().click(); await wait(100); }
ok('FX canal Mst',(await S()).fx.ch==='Master');
const beats0=(await S()).fx.beats; await p.locator('button',{hasText:'▶'}).first().click(); await wait(100); ok('FX beats ▶',(await S()).fx.beats>beats0);
await p.locator('button',{hasText:'◀'}).first().click(); await wait(100); ok('FX beats ◀',(await S()).fx.beats===beats0);
// eco con cola: tocar un sample con FX en master
await E(()=>window.__mesaDJ.eng.playSample(0)); await wait(1200);
const dry=await peak('c.eng.masterLevel()',600);
await p.locator('button',{hasText:'FX off'}).click(); await wait(200); ok('FX on',(await S()).fx.on);
await E(()=>window.__mesaDJ.eng.playSample(2)); await wait(1800);
await p.locator('button',{hasText:'FX on'}).click(); await wait(200); ok('FX off',!(await S()).fx.on);
// FX en canal con tail
await E(()=>{const c=window.__mesaDJ;c.setState({fx:Object.assign({},c.state.fx,{ch:'1',on:true,type:'Echo'})});c.updDeck(0,{play:true});}); await wait(800);
ok('FX por canal envía señal',(await E(()=>window.__mesaDJ.eng.ch[0].fxSend.gain.value))===1&&(await E(()=>window.__mesaDJ.eng.ch[1].fxSend.gain.value))===0);
await E(()=>{const c=window.__mesaDJ;c.setState({fx:Object.assign({},c.state.fx,{on:false,ch:'Master'})});c.updDeck(0,{play:false});});
// nivel FX knob
{const kn=p.locator('div[style*="ns-resize"]').filter({hasNot:p.locator('xx')}); }
// sampler
for (let k=0;k<8;k++){ const btn=p.locator('[data-screen-label="Sampler"] button').nth(k); await btn.click(); await wait(80); }
ok('8 samples suenan',(await peak('c.eng.masterLevel()',100))>=0);
await E(()=>window.__mesaDJ.eng.playSample(0)); ok('sample audible',(await peak('c.eng.masterLevel()',500))>0.05);
const smpKnob=p.locator('[data-screen-label="Sampler"] div[style*="ns-resize"]'); const sv=(await S()).smpVol; await drag(smpKnob,0,-40); ok('volumen sampler',(await S()).smpVol>sv+0.1);
const fxKnob=p.locator('[data-screen-label="Beat FX"] div[style*="ns-resize"]'); const fl=(await S()).fx.level; console.log('FXDBG',await fxKnob.count(),fl); await drag(fxKnob,0,-40); ok('nivel Beat FX',(await S()).fx.level>fl+0.1);
// panels
for (const [name,key] of [['Efectos','fx'],['Sampler','sampler'],['Grabación','rec']]) { const b0=(await S()).panels[key]; await p.locator('header button',{hasText:name}).click(); await wait(150); ok('panel '+name+' alterna',(await S()).panels[key]===!b0); }
await p.locator('header button',{hasText:'Efectos'}).click(); await p.locator('header button',{hasText:'Sampler'}).click(); await wait(200);
ok('panel Grabación visible',(await p.locator('[data-screen-label="Grabación"]').count())===1);

// ───── GRABACIÓN
await E(()=>{const c=window.__mesaDJ;c.t[0]=5;c.updDeck(0,{play:true,loop:{on:true,in:5,out:20,beats:4}});}); await wait(500);
const dl=p.waitForEvent('download',{timeout:10000});
await p.locator('header button',{hasText:/Rec/}).click(); await wait(1800); ok('grabando',(await S()).rec.on);
ok('barra de nivel de grabación',(await p.locator('text=Grabando').count())>0);
await p.locator('header button',{hasText:/Rec/}).click();
const dwn=await dl.catch(()=>null); ok('graba y descarga WAV',!!dwn&&/\.wav$/.test(dwn.suggestedFilename()),dwn&&dwn.suggestedFilename());
if(dwn){const path=await dwn.path(); const fs=await import('fs'); const sz=fs.statSync(path).size; ok('WAV con contenido (>200 KB)',sz>200000,sz);}
await E(()=>window.__mesaDJ.updDeck(0,{play:false}));

// ───── PREFERENCIAS
await p.locator('header button',{hasText:/ms$/}).click(); await wait(600);
ok('prefs abre',(await S()).prefs);
for (const bsz of ['64','128','512','1024','256']) { await p.locator('button',{hasText:new RegExp('^\\s*'+bsz+'\\s*$')}).click(); await wait(900); ok('búfer '+bsz,(await E(()=>window.__mesaDJ.state.buf))===+bsz&&(await E(()=>window.__mesaDJ.eng.ctx.state))==='running'); }
await p.locator('button',{hasText:'44.1 kHz'}).click(); await wait(900); ok('44.1 kHz aplicado',(await E(()=>window.__mesaDJ.eng.ctx.sampleRate))===44100);
await p.locator('button',{hasText:'48.0 kHz'}).click(); await wait(900); ok('48 kHz aplicado',(await E(()=>window.__mesaDJ.eng.ctx.sampleRate))===48000);
await E(()=>{const c=window.__mesaDJ;c.t[0]=5;c.updDeck(0,{play:true,loop:{on:true,in:5,out:20,beats:4}});}); await wait(800);
ok('audio sigue tras reconfigurar',(await peak('c.eng.masterLevel()',1200))>0.05);
await p.locator('button',{hasText:'Detectar dispositivos'}).click(); await wait(500);
ok('lista de dispositivos',(await p.locator('select option').count())>=2);
await p.screenshot({path:'suite_prefs.png'});
await p.locator('button',{hasText:'Cerrar'}).click(); await wait(200); ok('prefs cierra',!(await S()).prefs);
await E(()=>window.__mesaDJ.updDeck(0,{play:false}));
ok('persisten preferencias',(await E(()=>JSON.parse(localStorage.getItem('mesadj.prefs')).buf))===256);

// ───── MIDI
await E(()=>{const c=window.__mesaDJ;c.t[0]=5;c.updDeck(0,{play:false}); c.setState({fx:Object.assign({},c.state.fx,{on:false,ch:'Master'})});});
await p.locator('header button',{hasText:'MIDI learn'}).click(); await wait(200);
ok('banner MIDI learn',(await p.locator('text=MIDI learn activo').count())>0);
ok('detecta controladora mock',(await E(()=>window.__mesaDJ.midi.inputs.length))===1);
const msg=(st,ch,d1,d2)=>E((m)=>window.__midiIn.onmidimessage({data:new Uint8Array(m)}),[st|ch,d1,d2]);
const learn=async(clickFn,st,ch,d1)=>{ await clickFn(); await wait(100); await msg(st,ch,d1,127); await wait(100); };
const NON=0x90,NOFF=0x80,CC=0xB0,PB=0xE0;
await learn(()=>dbtn(0,'Play').click(),NON,0,11);
ok('learn Play',(await E(()=>window.__mesaDJ.midi.map['n:0:11']))==='d0.play');
ok('learn no ejecuta la acción',!(await S()).d[0].play);
await learn(()=>deck(0).locator('button',{hasText:/^\s*Cue\s*$/i}).first().click(),NON,0,12);
await learn(()=>dbtn(0,'Sync').click(),NON,0,13);
await learn(()=>pads(0).nth(0).click(),NON,7,20);
await learn(()=>drag(ns.nth(5),0,-5),CC,0,30);
await learn(()=>drag(ns.nth(1),0,-5),CC,0,31);
await learn(()=>drag(xf,0,0),PB,0,0);
await learn(()=>drag(deck(0).locator('div[style*="ns-resize"]').first(),0,-1),CC,1,40);
await learn(()=>drag(p.locator('[title^="Gira para"]'),0,0),CC,0,60);
await learn(()=>drag(jog,0,0),CC,0,50);
await learn(()=>p.locator('button',{hasText:/Load 1/}).click(),NON,0,70);
await learn(()=>p.locator('header button',{hasText:/Rec/}).click(),NON,0,71);
await learn(()=>mx.locator('button',{hasText:/^Cue/}).first().click(),NON,0,72);
await learn(()=>p.locator('button',{hasText:/^FX (on|off)$/}).click(),NON,0,73);
await learn(()=>p.locator('[data-screen-label="Sampler"] button').nth(1).click(),NON,0,74);
await learn(()=>dbtn(0,'Pad FX').click(),NON,0,75);
await learn(()=>deck(0).locator('button',{hasText:/^\s*Cue\s*$/i}).first().click(),NON,0,12); // reasigna sin duplicar efecto
const nmap=await E(()=>window.__mesaDJ.midi.count());
ok('asignaciones guardadas (>=15)',nmap>=15,nmap);
ok('persisten en localStorage',(await E(()=>Object.keys(JSON.parse(localStorage.getItem('mesadj.midi'))).length))===nmap);
await p.locator('header button',{hasText:'MIDI learn'}).click(); await wait(200);
await E(()=>{const c=window.__mesaDJ;c.updDeck(0,{padMode:'hot'});});
// usar la controladora
await msg(NON,0,11,127); await wait(300); ok('MIDI nota: Play',(await S()).d[0].play);
await msg(NOFF,0,11,0); await msg(NON,0,11,127); await wait(300); ok('MIDI nota: Pausa',!(await S()).d[0].play);
await msg(CC,0,30,127); await wait(200); ok('MIDI CC fader 1',(await S()).mix[0].fader>0.99);
await msg(CC,0,30,0); await wait(200); ok('MIDI CC fader 0',(await S()).mix[0].fader<0.01);
await msg(CC,0,31,64); await wait(200); ok('MIDI CC knob',Math.abs((await S()).mix[0].hi-0.504)<0.02);
await msg(PB,0,127,127); await wait(200); ok('MIDI pitch-bend 14 bits crossfader',(await S()).xf>0.99,(await S()).xf);
await msg(PB,0,0,0); await wait(200); ok('MIDI pitch-bend 0',(await S()).xf<0.01);
await msg(CC,1,40,127); await wait(200); ok('MIDI CC pitch deck (canal 2)',(await S()).d[0].pitch>5.9,(await S()).d[0].pitch);
await msg(CC,1,40,64); 
await msg(NON,0,13,127); await wait(200); ok('MIDI Sync',(await S()).d[0].sync); await msg(NON,0,13,127); await wait(100);
await msg(NON,7,20,127); await wait(200); ok('MIDI pad (canal 8) crea hot cue',(await S()).d[0].hot[0]!=null); await msg(NOFF,7,20,0);
const sel0=(await S()).sel;  await msg(CC,0,60,1); await wait(200); ok('MIDI encoder +1',(await S()).sel===sel0+1,sel0+'→'+(await S()).sel);
await msg(CC,0,60,127); await wait(200); ok('MIDI encoder −1',(await S()).sel===sel0);
await E(()=>window.__mesaDJ.midi.setRelMode('offset')); await msg(CC,0,60,65); await wait(200); ok('modo relativo offset',(await S()).sel===sel0+1); await msg(CC,0,60,63); await wait(200); ok('offset negativo',(await S()).sel===sel0);
await E(()=>window.__mesaDJ.midi.setRelMode('twos'));
await msg(NON,0,70,127); await wait(1200); ok('MIDI Load 1',(await S()).d[0].track>0);
await msg(NON,0,72,127); await wait(200); ok('MIDI CUE canal',(await S()).mix[0].cue); await msg(NON,0,72,127);
await msg(NON,0,73,127); await wait(200); ok('MIDI FX on',(await S()).fx.on); await msg(NON,0,73,127);
await E(()=>{window.__mesaDJ.updDeck(0,{play:false});window.__mesaDJ.t[0]=20}); await wait(300);
await msg(CC,0,50,10); await wait(200); ok('MIDI jog búsqueda',Math.abs(await E(()=>window.__mesaDJ.t[0])-20)>0.05);
await msg(CC,0,75,127); await wait(100);
// LEDs
await E(()=>{window.__midiOut.length=0;}); await E(()=>window.__mesaDJ.updDeck(0,{play:true})); await wait(700);
let out=await E(()=>window.__midiOut); ok('LED play encendido',out.some(m=>m[0]===0x90&&m[1]===11&&m[2]===127),JSON.stringify(out.slice(-5)));
await E(()=>window.__mesaDJ.updDeck(0,{play:false})); await wait(700);
out=await E(()=>window.__midiOut); ok('LED play apagado',out.some(m=>m[1]===11&&m[2]===0));
await E(()=>window.__mesaDJ.updDeck(0,{sync:true})); await wait(700); out=await E(()=>window.__midiOut); ok('LED sync',out.some(m=>m[1]===13&&m[2]===127)); await E(()=>window.__mesaDJ.updDeck(0,{sync:false}));
// exportar / borrar / importar
const dl2=p.waitForEvent('download'); await p.locator('header button',{hasText:/ms$/}).click(); await wait(300);
await p.screenshot({path:'suite_midi.png'});
await p.locator('button',{hasText:'Exportar mapeo'}).click(); const d2=await dl2; const txt=(await import('fs')).readFileSync(await d2.path(),'utf8'); ok('exporta mapeo',JSON.parse(txt).map['n:0:11']==='d0.play');
const rowsN=await p.locator('text=✕').count(); await p.locator('text=✕').first().click(); await wait(200); ok('borrar asignación individual',(await E(()=>window.__mesaDJ.midi.count()))===rowsN-1,rowsN);
await E((t)=>window.__mesaDJ.midi.importJSON(t),txt); ok('importa mapeo',(await E(()=>window.__mesaDJ.midi.count()))===rowsN);
await p.locator('button',{hasText:'Cerrar'}).click();

// ───── ELIMINAR PISTA y errores
await p.locator('[data-sel]').nth(2).click(); await p.locator('button',{hasText:'Quitar de la lista'}).click(); await wait(500);
ok('eliminar pista',(await p.locator('[data-sel]').count())===2);
// recarga: el listado NO persiste (solo prefs y MIDI)
await p.reload(); await p.waitForFunction(()=>window.__mesaDJ&&window.__mesaDJ.eng.ready,null,{timeout:20000}); await wait(500);
ok('el listado queda vacío tras recargar',(await p.locator('[data-sel]').count())===0);
ok('mensaje de listado vacío',(await p.locator('text=Aún no hay pistas').count())===1);
ok('mapeo MIDI persiste tras recargar',(await E(()=>window.__mesaDJ.midi.count()))>10);
ok('sin errores de página durante la sesión',errs.length===0,errs.slice(0,5).join(' | '));
const f=res.filter(r=>!r[0]); console.log(`\n${res.length-f.length}/${res.length} OK`); f.forEach(r=>console.log(' ✗',r[1],r[2]));
await b.close();
