// Whole rehearsal through the iPhone bridge with a simulated native recognizer (real timers, about 12 s):
// a wrong attempt, a deaf session that reports a microphone failure, then the right lines. The rehearsal must recover and finish.
const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm');const R=require('path').join(__dirname,'..')+'/';
const els=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...e){this.children=e},append(...e){this.children.push(...e)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
const log=[];const t0=Date.now();const L=(...a)=>log.push(((Date.now()-t0)/1000).toFixed(2)+' '+a.join(' '));
const listeners={};let starts=0;let current=null;let say=null;
const plugin={
 startListening(a){L('native start',a.id);starts++;setTimeout(()=>{if(current)endS(current);current={id:a.id,heard:false};emit(a.id,'start');if(starts===2){current.heard=true;const s=current;setTimeout(()=>{emit(a.id,'error',{error:'audio-capture',detail:'no microphone audio'});endS(s);},2000);return;}emit(a.id,'audiostart');if(say){const text=say;say=null;setTimeout(()=>speakInto(a.id,text),300);}},50);return Promise.resolve();},
 stopListening(a){L('native stop',a.id);if(current&&current.id===a.id)setTimeout(()=>finishS(a.id),100);return Promise.resolve();},
 abortListening(a){L('native abort',a.id);if(current&&current.id===a.id)endS(current);return Promise.resolve();},
 speak(a){L('native speak',JSON.stringify(a.text));setTimeout(()=>listeners.speech({id:a.id,type:'end'}),500);return Promise.resolve();},
 cancelSpeech(){return Promise.resolve()},getVoices(){return Promise.resolve({voices:[]})},keepAwake(){return Promise.resolve()},
 addListener(n,f){listeners[n]=f;}};
function emit(id,type,extra={}){L('ev',id,type,extra.transcripts?JSON.stringify(extra.transcripts)+(extra.isFinal?' final':''):(extra.error||''));listeners.recognition({id,type,...extra});}
function endS(s){if(current===s)current=null;emit(s.id,'end');}
function finishS(id){if(!current||current.id!==id)return;const s=current;if(s.last)emit(id,'result',{transcripts:[s.last],isFinal:true});endS(s);}
function speakInto(id,text){if(!current||current.id!==id)return;const s=current;s.last=text;s.heard=true;emit(id,'result',{transcripts:[text],isFinal:false});clearTimeout(s.sil);s.sil=setTimeout(()=>finishS(id),1400);}
const win={navigator:{},Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>plugin},scrollTo(){},addEventListener(){}};win.window=win;
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){},hidden:false},localStorage:{getItem(){return null},setItem(){}},navigator:win.navigator,window:win,setTimeout,clearTimeout,Blob,URL,Promise,Object,Map,Number,Error};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'dist/native.js','utf8').replace("typeof window!=='undefined'?window:globalThis","window"),ctx);
ctx.SpeechSynthesisUtterance=win.SpeechSynthesisUtterance;ctx.speechSynthesis=win.speechSynthesis;
vm.runInContext(fs.readFileSync(R+'dist/core.js','utf8'),ctx);ctx.CueCore=win.CueCore;vm.runInContext(fs.readFileSync(R+'dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=win.CuePdf;
vm.runInContext(fs.readFileSync(R+'dist/app.js','utf8'),ctx);
get('cast-input').value='';get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей — муж\nСветлана — жена\nСЦЕНА 1\nСВЕТЛАНА: Господи, перегарищем-то разит!\nСЕРГЕЙ: А водка ещё есть?\nСВЕТЛАНА: Какая водка? Ты всю ночь квасил!\nСЕРГЕЙ: Ну и что.';get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});vm.runInContext('data.autoMic=true;micReady=true',ctx);
const st=()=>vm.runInContext('`idx=${data.index} running=${running} rec=${!!recognition} speaking=${speaking}`',ctx);
const plan=['Господи как разит','Господи перегарищем-то разит','Какая водка ты всю ночь квасил'];
get('start').onclick();L('state',st());
let step=0;const iv=setInterval(()=>{if(current&&!current.heard&&!current.planned&&step<plan.length){current.planned=true;const text=plan[step++];setTimeout(()=>speakInto(current.id,text),400);}},50);
setTimeout(()=>{clearInterval(iv);const text=log.join('\n');
 try{assert.equal(vm.runInContext('data.index',ctx),4,'The scene finishes');assert(/r2 error audio-capture/.test(text),'The deaf session reported a microphone failure');assert(/native start r3/.test(text),'…and a fresh session replaced it');const spoken=log.filter(l=>l.includes('native speak'));assert.equal(spoken.length,3,'Both partner cues, then the end of scene, were spoken');assert(spoken[2].includes('Конец сцены.'),'The end of the scene is announced: '+spoken[2]);
 const lines=win.CueSpeechLog.lines().join('\n');assert(/r2 error audio-capture \(no microphone audio\)/.test(lines),'The speech log names the failure');assert(!/перегарищем/.test(lines),'The speech log holds no words');}
 catch(e){console.log(text);throw e;}
 console.log('Native rehearsal flow passed: wrong attempt, deaf session recovery, partner cues, scene completion, and a word-free speech log.');process.exit(0)},12500);
