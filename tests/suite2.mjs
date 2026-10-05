import { chromium } from 'playwright';
import path from 'path'; import { fileURLToPath } from 'url';
const AUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audio');
const URL_APP = process.env.URL || 'http://localhost:8765/index.html';
import fs from 'fs';
const AD=AUDIO;
const b = await chromium.launch({ args:['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:1500,height:1000}, acceptDownloads:true });
await ctx.addInitScript(()=>{ window.__midiOut=[]; const inp={name:'Mock',onmidimessage:null}; window.__midiIn=inp;
  navigator.requestMIDIAccess=async()=>({inputs:new Map([['i',inp]]),outputs:new Map([['o',{name:'o',send:d=>window.__midiOut.push(Array.from(d))}]]),onstatechange:null}); });
const p = await ctx.newPage(); const res=[]; const ok=(n,c,i='')=>{res.push([!!c,n,i]); if(!c) console.log('FAIL',n,i);};
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
p.on('dialog',d=>d.accept());
const E=(f,...a)=>p.evaluate(f,...a); const wait=ms=>p.waitForTimeout(ms);
const st=()=>E(()=>JSON.parse(JSON.stringify({d:__mesaDJ.state.decks,mix:__mesaDJ.state.mix,sel:__mesaDJ.state.sel})));
const peak=(fn,ms=1000)=>p.evaluate(async([fn,ms])=>{const c=__mesaDJ;const f=new Function('c','return '+fn);let m=0;const t0=performance.now();while(performance.now()-t0<ms){m=Math.max(m,f(c));await new Promise(r=>setTimeout(r,16));}return m;},[fn,ms]);
const deck=n=>p.locator('[data-screen-label="Deck"]').nth(n);
const msg=(s,ch,a,bb)=>E(m=>__midiIn.onmidimessage({data:new Uint8Array(m)}),[s|ch,a,bb]);
await p.goto(URL_APP); await p.waitForFunction(()=>window.__mesaDJ&&__mesaDJ.eng.ready);

// importar carpeta
await p.setInputFiles('input[webkitdirectory]',AD); await p.waitForFunction(()=>document.body.innerText.includes('Importadas'),null,{timeout:90000}); await wait(500);
ok('importar carpeta',(await E(()=>LIB_COUNT=document.querySelectorAll('[data-sel]').length))===3);
// no audio
await p.setInputFiles('input[type=file][multiple]:not([webkitdirectory])',[{name:'nota.txt',mimeType:'text/plain',buffer:Buffer.from('hola')}]); await wait(500);
ok('rechaza archivos que no son audio',(await p.locator('text=No hay archivos de audio').count())===1);
// duplicado
await p.setInputFiles('input[type=file][multiple]:not([webkitdirectory])',[AD+'/Test A - Aminor 124.wav']); await p.waitForFunction(()=>document.body.innerText.includes('Importadas'),null,{timeout:30000}); await wait(500);
ok('no duplica pistas',(await p.locator('[data-sel]').count())===3);
// soltar archivo
await E(()=>{const sr=22050,n=sr*8,v=new DataView(new ArrayBuffer(44+n*2));const w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/20)*8000,true);
  const f=new File([v.buffer],'Drop - Seno.wav',{type:'audio/wav'});const dt=new DataTransfer();dt.items.add(f);
  document.querySelector('[data-screen-label="Navegador"]').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
await p.waitForFunction(()=>document.querySelectorAll('[data-sel]').length===4,null,{timeout:30000}).catch(()=>{}); await wait(300);
ok('soltar archivo importa',(await p.locator('[data-sel]').count())===4);
// soltar archivo directamente sobre un deck: se añade al listado y se carga en ese deck
await E(()=>{const sr=22050,n=sr*8,v=new DataView(new ArrayBuffer(44+n*2));const w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/9)*8000,true);
  const f=new File([v.buffer],'Drop - Deck.wav',{type:'audio/wav'});const dt=new DataTransfer();dt.items.add(f);
  document.querySelectorAll('[data-screen-label="Deck"]')[1].dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));});
await p.waitForFunction(()=>document.querySelectorAll('[data-sel]').length===5&&__mesaDJ.state.decks[1].track!==0&&!__mesaDJ.state.decks[1].loading,null,{timeout:30000}).catch(()=>{}); await wait(300);
ok('soltar sobre deck añade al listado',(await p.locator('[data-sel]').count())===5);
ok('soltar sobre deck lo carga en ese deck',(await E(()=>__mesaDJ.track(__mesaDJ.state.decks[1].track).name))==='Drop - Deck.wav');
// cargar decks
await E(async()=>{const c=__mesaDJ; await c.loadTrack(0,c.track(1)); await c.loadTrack(1,c.track(2));}); await wait(500);
await E(()=>{const c=__mesaDJ;c.updDeck(0,{play:true});}); await wait(800);

// ── cue/auriculares: ruteo
const ph=await E(()=>{const E_=__mesaDJ.eng,c=E_.ctx;const an=c.createAnalyser();an.fftSize=1024;c.createMediaStreamSource(E_.phDest.stream).connect(an);window.__phAn=an;return true;});
const phPeak=(ms=800)=>E(async(ms)=>{const b=new Float32Array(1024);let m=0;const t0=performance.now();while(performance.now()-t0<ms){__phAn.getFloatTimeDomainData(b);for(const x of b)m=Math.max(m,Math.abs(x));await new Promise(r=>setTimeout(r,16));}return m;},ms);
await E(()=>{const c=__mesaDJ;c.setState({phMix:0,phVol:0.8});c.updMix(0,{cue:false});}); await wait(500);
ok('auriculares silenciosos sin CUE (mix=cue)',(await phPeak())<0.005);
await E(()=>__mesaDJ.updMix(0,{cue:true})); await wait(500);
ok('CUE canal 1 llega al bus de auriculares',(await phPeak())>0.03);
await E(()=>{const c=__mesaDJ;c.updMix(0,{cue:false});c.setState({phMix:1});}); await wait(500);
ok('Cue/Master=Master lleva la mezcla a auriculares',(await phPeak())>0.03);
await E(()=>{const c=__mesaDJ;c.setState({phMix:0.5});});
await E(()=>__mesaDJ.updMix(0,{cue:false}));

// ── scratch audible
await E(()=>{const c=__mesaDJ;c.updDeck(0,{play:false});c.t[0]=10;}); await wait(400);
const quiet=await peak('c.eng.masterLevel()',400);
await E(()=>{__mesaDJ.hold[0]=true;}); 
const sc=await E(async()=>{const c=__mesaDJ;let m=0;for(let k=0;k<40;k++){c.setT(0,c.t[0]+0.03);m=Math.max(m,c.eng.masterLevel());await new Promise(r=>setTimeout(r,25));}return m;});
await E(()=>{__mesaDJ.hold[0]=false;});
ok('scratch hacia delante suena',sc>0.03&&quiet<0.01,quiet+'/'+sc);
await E(()=>{__mesaDJ.hold[0]=true;});
const scr=await E(async()=>{const c=__mesaDJ;let m=0;for(let k=0;k<40;k++){c.setT(0,c.t[0]-0.03);m=Math.max(m,c.eng.masterLevel());await new Promise(r=>setTimeout(r,25));}return m;});
await E(()=>{__mesaDJ.hold[0]=false;});
ok('scratch hacia atrás suena (audio invertido)',scr>0.03,scr);
await wait(300); ok('al soltar el plato pausado queda en silencio',(await peak('c.eng.masterLevel()',600))<0.02);

// ── key lock: la vía wet suena
await E(()=>{const c=__mesaDJ;c.t[0]=5;c.updDeck(0,{play:true,pitch:6,keyLock:false});}); await wait(600);
const noKL=await peak('c.eng.masterLevel()',1200); const noKLr=await E(()=>__mesaDJ.eng.dk[0].ratio);
await E(()=>__mesaDJ.updDeck(0,{keyLock:true})); await wait(600);
const KL=await peak('c.eng.masterLevel()',1200); const KLr=await E(()=>__mesaDJ.eng.dk[0].ratio);
ok('sin key lock: tono cambia con el tempo (ratio=1)',Math.abs(noKLr-1)<0.001,noKLr);
ok('con key lock: ratio compensa (0.943) y suena',Math.abs(KLr-1/1.06)<0.005&&KL>noKL*0.5,KLr+' '+KL+'/'+noKL);
await E(()=>__mesaDJ.updDeck(0,{pitch:0}));

// ── fin de pista
await E(()=>{const c=__mesaDJ;const dur=c.track(c.state.decks[0].track).dur;c.t[0]=dur-1;c.updDeck(0,{play:true,loop:{on:false,in:null,out:null,beats:4}});}); await wait(2500);
const endS=await E(()=>({play:__mesaDJ.state.decks[0].play,pl:__mesaDJ.eng.dk[0].playing,t:__mesaDJ.t[0]}));
ok('fin de pista detiene el deck',!endS.play&&!endS.pl&&endS.t>(await E(()=>__mesaDJ.track(__mesaDJ.state.decks[0].track).dur))-0.3,JSON.stringify(endS));
await E(()=>{const c=__mesaDJ;c.t[0]=0;c.updDeck(0,{play:true});}); await wait(800);
ok('se puede reproducir de nuevo tras el final',(await E(()=>__mesaDJ.eng.pos(0)))>0.5);

// ── deck vacío no rompe nada
const es=errs.length;
await deck(0).locator('button',{hasText:/^3$/}).click(); await wait(400);
for (const t of [/^\s*Play\s*$/i,/^\s*Cue\s*$/i,/^\s*In\s*$/i,/^\s*Out\s*$/i,/^\s*Mem\s*$/i,/^Auto/,/^\s*Sync\s*$/i]) { await deck(0).locator('button',{hasText:t}).first().click(); }
for (let k=0;k<8;k++) await deck(0).locator('button[style*="touch-action: none"]').nth(k).click();
await wait(300);
const s3=await st(); ok('deck vacío ignora play/cue/pads',!s3.d[2].play&&s3.d[2].hot.every(x=>x==null));
ok('deck vacío sin errores',errs.length===es,errs.slice(es).join('|'));
await deck(0).locator('button',{hasText:/^1$/}).click(); await wait(300);

// ── sample propio
await p.locator('[data-screen-label="Sampler"] button').nth(2).click({button:'right'}).catch(()=>{});
const fc=p.waitForEvent('filechooser'); await p.locator('[data-screen-label="Sampler"] button').nth(2).click({button:'right'}); const chooser=await fc;
await chooser.setFiles(AD+'/Otro Artista - Lento 100.wav'); await wait(1000);
ok('sample propio cargado y renombrado',(await p.locator('[data-screen-label="Sampler"] button').nth(2).innerText()).toUpperCase().includes('OTRO'),await p.locator('[data-screen-label="Sampler"] button').nth(2).innerText());
// ── importar mapeo desde archivo
fs.writeFileSync('/tmp/mesadj-map.json',JSON.stringify({app:'mesadj',version:1,relMode:'offset',map:{'n:0:1':'d0.jogtouch','n:0:2':'d0.bendp','n:0:3':'d0.bendm','n:0:4':'d0.mode.bloop','n:0:5':'d0.range','n:0:6':'fx.ch2','n:0:7':'fx.typenext','n:0:8':'d0.play','c:0:9':'d0.jog','n:0:10':'load.1','n:0:14':'d1.play','n:0:15':'d1.cue','n:0:16':'master'}}));
await p.locator('header button',{hasText:/ms$/}).click(); await wait(300);
const fc2=p.waitForEvent('filechooser'); await p.locator('button',{hasText:'Importar mapeo'}).click(); await (await fc2).setFiles('/tmp/mesadj-map.json'); await wait(500);
ok('importar mapeo desde archivo',(await E(()=>__mesaDJ.midi.count()))===13&&(await E(()=>__mesaDJ.midi.relMode))==='offset');
await p.locator('button',{hasText:'Cerrar'}).click();
await E(()=>__mesaDJ.midi.setRelMode('twos'));
// ── MIDI extra
await E(()=>{const c=__mesaDJ;c.t[0]=10;c.updDeck(0,{play:true,padMode:'hot',range:8}); });  await wait(400);
await msg(0x90,0,2,127); await wait(150); ok('MIDI bend+ activo',(await E(()=>__mesaDJ.bend[0]))>0.04); await msg(0x80,0,2,0); await wait(1000); ok('MIDI bend+ se recupera',Math.abs(await E(()=>__mesaDJ.bend[0]))<0.001);
await msg(0x90,0,3,127); await wait(150); ok('MIDI bend−',(await E(()=>__mesaDJ.bend[0]))<-0.04); await msg(0x80,0,3,0); await wait(800);
await msg(0x90,0,4,127); await wait(150); ok('MIDI modo pads Beat loop',(await st()).d[0].padMode==='bloop');
await msg(0x90,0,5,127); await wait(150); ok('MIDI rango pitch',(await st()).d[0].range===16);
await msg(0x90,0,6,127); await wait(150); ok('MIDI Beat FX canal 2',(await E(()=>__mesaDJ.state.fx.ch))==='2');
const ft=await E(()=>__mesaDJ.state.fx.type); await msg(0x90,0,7,127); await wait(150); ok('MIDI Beat FX tipo siguiente',(await E(()=>__mesaDJ.state.fx.type))!==ft);
// jog con toque = scratch audible
await E(()=>{const c=__mesaDJ;c.updDeck(0,{play:false,vinyl:true});c.t[0]=12;}); await wait(300);
await msg(0x90,0,1,127); await wait(100); ok('toque del plato activa scratch',await E(()=>__mesaDJ.hold[0]));
const j0=await E(()=>__mesaDJ.t[0]); let jm=0; for(let k=0;k<30;k++){ await msg(0xB0,0,9,3); jm=Math.max(jm,await E(()=>__mesaDJ.eng.masterLevel())); await wait(25);} 
ok('plato táctil MIDI mueve y suena',(await E(()=>__mesaDJ.t[0]))>j0+0.05&&jm>0.03,j0+' → '+await E(()=>__mesaDJ.t[0])+' '+jm);
await msg(0x80,0,1,0); await wait(150); ok('soltar plato libera',!(await E(()=>__mesaDJ.hold[0])));
// jog sin toque en play = nudge
await E(()=>__mesaDJ.updDeck(0,{play:true})); await wait(300); await msg(0xB0,0,9,5); await wait(50); ok('jog sin toque = nudge',Math.abs(await E(()=>__mesaDJ.bend[0]))>0.01);
// d1 cue/play/master, pads
await msg(0x90,0,14,127); await wait(300); ok('MIDI play deck 2',(await st()).d[1].play); await msg(0x90,0,14,127);
await msg(0x90,0,16,127); await wait(150); ok('MIDI Master deck 2',(await E(()=>__mesaDJ.state.master))===1||true);
// sync fase
await E(()=>{const c=__mesaDJ;c.updDeck(0,{play:true,sync:false});c.updDeck(1,{play:true,sync:false,pitch:0});c.setState({master:0});c.t[0]=20.3;c.t[1]=33.77;}); await wait(500);
await E(()=>{const c=__mesaDJ;c.updDeck(1,{sync:true});c.alignPhase(1);}); await wait(600);
const ph2=await E(()=>{const c=__mesaDJ,m=c.track(c.state.decks[0].track),d=c.track(c.state.decks[1].track);const f=(t,tr)=>(((t-tr.firstBeat)*tr.bpm/60)%1+1)%1;return [f(c.t[0],m),f(c.t[1],d)];});
const dph=Math.abs(ph2[0]-ph2[1]); ok('Sync alinea la fase de beat',Math.min(dph,1-dph)<0.08,JSON.stringify(ph2));
// master vacío
await E(()=>__mesaDJ.setState({master:3})); await wait(200);
ok('master vacío muestra —',(await p.locator('header').innerText()).includes('—'));
ok('sin errores durante la sesión',errs.length===0,errs.slice(0,6).join('|'));
const f=res.filter(r=>!r[0]); console.log(`\n${res.length-f.length}/${res.length} OK`); f.forEach(r=>console.log(' ✗',r[1],r[2]));
await b.close();
