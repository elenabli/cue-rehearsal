// Long lines on the iPhone bridge (real timers, about 15 s): the marker follows a long line through a misheard word,
// and a pause partway through a line is thinking time, not the end of the attempt. Also covers Apple's recognizer
// starting its transcript afresh after the pause, and the web path where each pause ends a session.
const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm');const R=require('path').join(__dirname,'..')+'/';
const els=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...e){this.children=e},append(...e){this.children.push(...e)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
const log=[];const t0=Date.now();const L=(...a)=>log.push(((Date.now()-t0)/1000).toFixed(2)+' '+a.join(' '));
const listeners={};let current=null;
// A simulated Apple recognizer: ends the line after the pause the page asked for (1.4 s by default).
const plugin={
 startListening(a){L('native start',a.id);setTimeout(()=>{if(current)endS(current);current={id:a.id,pause:1.4,text:''};emit(a.id,'start');emit(a.id,'audiostart');},50);return Promise.resolve();},
 stopListening(a){L('native stop',a.id);if(current&&current.id===a.id)setTimeout(()=>finishS(a.id),100);return Promise.resolve();},
 abortListening(a){L('native abort',a.id);if(current&&current.id===a.id)endS(current);return Promise.resolve();},
 setPause(a){L('native pause',a.id,a.seconds);if(current&&current.id===a.id){current.pause=a.seconds||1.4;quiet(current);}return Promise.resolve();},
 speak(a){L('native speak',JSON.stringify(a.text));setTimeout(()=>listeners.speech({id:a.id,type:'end'}),300);return Promise.resolve();},
 cancelSpeech(){return Promise.resolve()},getVoices(){return Promise.resolve({voices:[]})},keepAwake(){return Promise.resolve()},
 addListener(n,f){listeners[n]=f;}};
function emit(id,type,extra={}){L('ev',id,type,extra.transcripts?JSON.stringify(extra.transcripts)+(extra.isFinal?' final':''):(extra.error||''));listeners.recognition({id,type,...extra});}
function endS(s){clearTimeout(s.sil);if(current===s)current=null;emit(s.id,'end');}
function finishS(id){if(!current||current.id!==id)return;const s=current;if(s.text)emit(id,'result',{transcripts:[s.text],isFinal:true});endS(s);}
function quiet(s){clearTimeout(s.sil);s.sil=setTimeout(()=>{L('silence end',s.id);finishS(s.id);},s.pause*1000);}
// Words arrive one by one; fresh=true starts the transcript over (as Apple sometimes does after a pause).
function say(words,fresh,done){const s=current;if(!s)throw new Error('not listening');if(fresh)s.text='';let k=0;const next=()=>{if(current!==s)return done&&done();if(k>=words.length)return done&&done();s.text=(s.text+' '+words[k++]).trim();emit(s.id,'result',{transcripts:[s.text],isFinal:false});quiet(s);setTimeout(next,120);};next();}
const win={navigator:{},Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>plugin},scrollTo(){},addEventListener(){}};win.window=win;
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){},hidden:false},localStorage:{getItem(){return null},setItem(){}},navigator:win.navigator,window:win,setTimeout,clearTimeout,Blob,URL,Promise,Object,Map,Number,Error,Set};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'dist/native.js','utf8').replace("typeof window!=='undefined'?window:globalThis","window"),ctx);
ctx.SpeechSynthesisUtterance=win.SpeechSynthesisUtterance;ctx.speechSynthesis=win.speechSynthesis;
vm.runInContext(fs.readFileSync(R+'dist/core.js','utf8'),ctx);ctx.CueCore=win.CueCore;vm.runInContext(fs.readFileSync(R+'dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=win.CuePdf;
vm.runInContext(fs.readFileSync(R+'dist/app.js','utf8'),ctx);
const LONG='Я гуляла по набережной до самого утра, а потом сидела на скамейке и смотрела, как просыпается город.';
get('cast-input').value='';get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей — муж\nСветлана — жена\nСЦЕНА 1\nСЕРГЕЙ: Ты где была всю ночь?\nСВЕТЛАНА: '+LONG+'\nСЕРГЕЙ: Ну и что.\nСВЕТЛАНА: '+LONG+'\nСЕРГЕЙ: Конец.';
get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});vm.runInContext('data.autoMic=true;micReady=true',ctx);
const idx=()=>vm.runInContext('data.index',ctx);const marked=()=>get('current-line').children.filter(c=>c&&c.className==='heard').length;
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async(test,ms=4000)=>{const end=Date.now()+ms;while(!test()){if(Date.now()>end)return false;await wait(50);}return true;};
const first='я гуляла по берегу до самого утра а потом'.split(' '),rest='сидела на скамейке и смотрела как просыпается город'.split(' ');
(async()=>{try{
 get('start').onclick();assert(await until(()=>idx()===1&&current),'Listening on the long line');
 // 1. The marker follows as words arrive, past «берегу» (misheard), which stays unmarked.
 await new Promise(r=>say(first,false,r));
 assert.equal(marked(),8,'Nine words reached, the misheard one unmarked: '+marked());
 assert(get('current-line').children.some(c=>c&&c.textContent==='набережной'&&c.className===''),'The misheard word is passed but not marked');
 // 2. Thinking: 4 s of quiet (well past the usual 1.4 s) doesn't end the attempt.
 assert(log.some(l=>/native pause r\d+ 6/.test(l)),'The page asked for thinking time');
 await wait(4000);assert.equal(idx(),1,'Still on the line after a 4 s pause');assert(current,'…and still listening in the same session');assert(!/Не|didn|Didn/.test(get('feedback').textContent),'No complaint during the pause: '+get('feedback').textContent);
 // …and Apple starts its transcript over: the words from before the pause still count.
 await new Promise(r=>say(rest,true,r));assert(log.some(l=>/native pause r\d+ 0/.test(l)),'Back to the usual pause at the end of the line');
 assert(await until(()=>idx()>=2),'The line said in two parts with a thinking pause is accepted');
 // 3. A pause longer than the session holds: the next session remembers the start, and the line is accepted.
 assert(await until(()=>idx()===3&&current,5000),'Listening on the second long line');
 await new Promise(r=>say(first,false,r));const firstSession=current.id;
 assert(await until(()=>current&&current.id!==firstSession,12000),'After 6 s of quiet a fresh session listens on');assert.equal(idx(),3);
 assert.equal(marked(),8,'The marker keeps the words from before');
 await new Promise(r=>say(rest,false,r));assert(await until(()=>idx()>=4),'The rest of the line completes it');
 console.log('Thinking time passed: live marker through misheard words, a mid-line pause in one session, a fresh transcript after the pause, and a pause across sessions.');process.exit(0);
}catch(e){console.log(log.join('\n'));console.error(e);process.exit(1);}})();
