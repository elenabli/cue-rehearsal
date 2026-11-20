// Fixes from the November review: a full device never loses a play, a broken or oversize backup changes nothing,
// saving or cancelling a reset keeps learning marks, slips stay in their own scene, and typing mode keeps the mic off.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function element(){return {value:'',textContent:'',hidden:false,disabled:false,checked:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){},scrollIntoView(){}};}
const store={};let full=null,confirmAnswer=true,reloaded=0;
function boot(){const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{if(full&&full(k,String(v)))throw Error('QuotaExceededError');store[k]=String(v)},removeItem:k=>{delete store[k]}},
  location:{reload(){reloaded++;}},
  navigator:{userAgent:'test'},window:{speechSynthesis:{cancel(){},getVoices(){return []},addEventListener(){},speak(){}},scrollTo(){},addEventListener(){},confirm:()=>confirmAnswer},SpeechSynthesisUtterance:class{},setTimeout(){return 0},clearTimeout(){},Blob,URL};
 ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
 return {get,run:code=>vm.runInContext(code,ctx)};}
let {get,run}=boot();
const save=(title,cast,script)=>{get('title-input').value=title;get('cast-input').value=cast;get('script-input').value=script;get('save-script').onclick();};
const playA='SCENE 1\nANNA: One.\nBORIS: Two.\nANNA: Three.\nSCENE 2\nBORIS: Four.\nANNA: Five.';
save('Play A','Anna\nBoris',playA);
assert.equal(run('data.role'),'Anna');

// Saving the same text keeps done ticks and hard lines.
run("data.scenes[0].done='Anna';setHard(2,true);persist()");
save('Play A','Anna\nBoris',playA);
assert.equal(run('data.scenes[0].done'),'Anna','Done tick kept');assert.deepEqual([...run('hardLines(data.scenes[0])')],[2],'Hard line kept');

// Cancelling Reset changes nothing.
confirmAnswer=false;get('reset-progress').onclick();confirmAnswer=true;
assert.deepEqual([...run('hardLines(data.scenes[0])')],[2],'Cancelled reset keeps hard lines');
get('reset-progress').onclick();assert.equal(run('hardLines(data.scenes[0]).length'),0,'Confirmed reset clears them');assert.equal(run('data.scenes[0].done'),undefined);

// A slip in scene 1 does not mark the same line number in scene 2.
run('data.activeScene=0;lines=sceneLines(data.scenes[0]);data.index=0;markTrouble(0)');
assert.equal(run('trouble.has(0)'),true);
run('data.activeScene=1;lines=sceneLines(data.scenes[1]);data.index=0');
assert.equal(run('trouble.has(0)'),false,'Slip stays in its scene');
run('data.activeScene=0;lines=sceneLines(data.scenes[0])');assert.equal(run('trouble.has(0)'),true);

// Typing mode: the mic never starts on its own, and Check works even if Speak was tapped.
get('type-lines').onchange({target:{checked:true}});
assert.equal(run('autoMic()'),false,'No automatic mic while typing');
run("data.index=0;running=true;recognition={stop(){},onresult:null,onerror:null};speaking=false;pendingAdvance=false");
get('typed').value='One.';get('typed-form').onsubmit({preventDefault(){}});
assert.equal(run('recognition'),null,'The mic stops');assert.ok(run('pendingAdvance')||run('data.index')>0,'The typed line counts');
run('running=false');get('type-lines').onchange({target:{checked:false}});assert.equal(run('autoMic()'),true);

// Adding a play when the device is full: the first play stays, nothing is replaced.
run('data.index=0;persist()');
get('add-play').onclick();
full=k=>k==='cue-plays';
save('Play B','Kate\nTom','SCENE 1\nKATE: Hello.\nTOM: Hi.');
full=null;
assert.equal(run('data.title'),'Play A','Open play kept');assert.equal(run('library.others.length'),0);
assert.match(get('script-message').textContent,/storage is full/);
({get,run}=boot());assert.equal(run('data.title'),'Play A','Still there after reload');

// Switching plays when the device is full keeps the open play open.
get('add-play').onclick();save('Play B','Kate\nTom','SCENE 1\nKATE: Hello.\nTOM: Hi.');
assert.equal(run('data.title'),'Play B');const aId=run('library.others[0].id');
full=k=>k==='cue-plays';run(`switchPlay('${aId}')`);full=null;
assert.equal(run('data.title'),'Play B','Switch refused, Play B stays open');assert.equal(run('library.others.length'),1);
({get,run}=boot());assert.equal(run('data.title'),'Play B');assert.equal(run('library.others[0].title'),'Play A','Play A still saved');

// Restore: a backup with a broken scene number is refused.
const restore=async backup=>{get('restore-backup').onchange({target:{files:[{text:async()=>JSON.stringify(backup)}],value:''}});await new Promise(r=>setImmediate(r));};
const good=()=>({app:'cue',version:1,current:{script:'KATE: Hi.',title:'Backup',activeScene:0,index:0,cast:['KATE'],scenes:[{title:'S',script:'KATE: Hi.',index:0}]},others:[]});
(async()=>{
 const before=[store['cue-v1'],store['cue-plays']];
 const bad=good();bad.current.activeScene=0.5;await restore(bad);
 assert.equal(get('backup-message').textContent,'This file is not a Cue backup.');assert.equal(reloaded,0);
 const bad2=good();bad2.current.scenes[0].hard={role:'KATE',lines:5};await restore(bad2);assert.equal(reloaded,0,'Bad hard lines refused');
 assert.deepEqual([store['cue-v1'],store['cue-plays']],before);
 // Startup also survives such a save.
 store['cue-v1']=JSON.stringify({...good().current,scenes:[{title:'a',script:'A: x'},{title:'b',script:'A: y'},{title:'c',script:'A: z'}],activeScene:0.5});
 ({get,run}=boot());assert.equal(run('data.activeScene'),0,'Scene number rounded at startup');
 store['cue-v1']=before[0];({get,run}=boot());
 // Restore when the device runs out of space halfway: both parts are put back and saving still works.
 full=(k,v)=>k==='cue-plays'&&v==='{"others":[]}';await restore(good());full=null;
 assert.equal(reloaded,0);assert.match(get('backup-message').textContent,/not enough space/);
 assert.deepEqual([store['cue-v1'],store['cue-plays']],before,'Nothing changed');
 assert.equal(run('restoring'),false,'Saving is back on');
 run("data.index=1;persist()");assert.equal(JSON.parse(store['cue-v1']).index,1);
 // A good backup restores.
 await restore(good());assert.equal(reloaded,1);assert.equal(JSON.parse(store['cue-v1']).title,'Backup');
 console.log('Review fixes passed: full storage keeps plays, broken backups refused, failed restore rolls back, marks kept on save and cancelled reset, slips stay in their scene, typing mode keeps the mic off.');
})().catch(e=>{console.error(e);process.exit(1);});
