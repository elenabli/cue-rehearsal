// The iPhone bridge: native plugin events must look like the Web Speech API to app.js.
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const calls=[];const listeners={};
const plugin={startListening:a=>{calls.push(['start',a]);return Promise.resolve()},stopListening:a=>{calls.push(['stop',a]);return Promise.resolve()},abortListening:a=>{calls.push(['abort',a]);return Promise.resolve()},speak:a=>{calls.push(['speak',a]);return Promise.resolve()},cancelSpeech:()=>{calls.push(['cancel']);return Promise.resolve()},getVoices:()=>Promise.resolve({voices:[{voiceURI:'ru.milena',name:'Milena',lang:'ru-RU'}]}),keepAwake:a=>{calls.push(['awake',a]);return Promise.resolve()},addListener:(name,fn)=>{listeners[name]=fn}};
const win={navigator:{},Capacitor:{isNativePlatform:()=>true,registerPlugin:name=>{assert.equal(name,'CueSpeech');return plugin}}};
vm.runInNewContext(fs.readFileSync('dist/native.js','utf8'),{window:win,Promise,Error,Object,Map,Number});
assert.equal(win.CueNative,true);
const rec=new win.SpeechRecognition();rec.lang='ru-RU';rec.phrases=['разит'];const got=[];rec.onstart=()=>got.push('start');rec.onresult=e=>got.push(e.results[0].isFinal+':'+e.results[0][0].transcript);rec.onend=()=>got.push('end');rec.start();
const id=calls.at(-1)[1].id;assert.equal(calls.at(-1)[1].lang,'ru-RU');assert.deepEqual(calls.at(-1)[1].phrases,['разит']);
listeners.recognition({id:'other',type:'start'});listeners.recognition({id,type:'start'});listeners.recognition({id,type:'result',transcripts:['господи'],isFinal:false});listeners.recognition({id,type:'result',transcripts:['господи перегарищем-то разит'],isFinal:true});listeners.recognition({id,type:'end'});listeners.recognition({id,type:'result',transcripts:['late'],isFinal:true});
assert.deepEqual(got,['start','false:господи','true:господи перегарищем-то разит','end'],'Events reach only their own session, and nothing after end');
assert.throws(()=>rec.start(),/already started/);
const u=new win.SpeechSynthesisUtterance('А водка ещё есть?');u.lang='ru-RU';let ended=0;u.onend=()=>ended++;win.speechSynthesis.speak(u);const uid=calls.at(-1)[1].id;assert.equal(win.speechSynthesis.speaking,true);listeners.speech({id:uid,type:'end'});assert.equal(ended,1);assert.equal(win.speechSynthesis.speaking,false);
const u2=new win.SpeechSynthesisUtterance('x');u2.onend=()=>ended++;win.speechSynthesis.speak(u2);win.speechSynthesis.cancel();listeners.speech({id:calls.at(-2)[1].id,type:'error'});assert.equal(ended,1,'A cancelled cue reports nothing');
setTimeout(()=>{assert.equal(win.speechSynthesis.getVoices()[0].name,'Milena');win.navigator.wakeLock.request('screen').then(lock=>{lock.release();assert.deepEqual(calls.filter(c=>c[0]==='awake').map(c=>c[1].on),[true,false]);console.log('Native bridge passed: recognition events, stale sessions, partner voice, cancel, voices, and screen wake.');});},0);
