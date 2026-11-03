const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer;let spoken=[];
const started=[];class Recognition{constructor(){recognizer=this;this.ended=false}start(){started.push(this);this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){},getVoices(){return []},addEventListener(){},speak(u){spoken.push(u)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:Utterance,setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/core.js','utf8'),ctx);ctx.CueCore=ctx.window.CueCore;vm.runInContext(fs.readFileSync('dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=ctx.window.CuePdf;vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);vm.runInContext('data.autoMic=false',ctx);
function index(){return vm.runInContext('data.index',ctx)}// flush() runs the short app timers (advance, retry); watchdog() runs the long listening watchdogs.
function runTimers(test){for(const [id,t] of [...timers])if(timers.has(id)&&test(t.ms)){timers.delete(id);t.fn();}}function flush(){runTimers(ms=>ms<2000)}function watchdog(){runTimers(ms=>ms>=2000)}
function result(text,final=true){const r=[{transcript:text}];r.isFinal=final;const active=recognizer;active.onresult({results:[r]});if(final&&!active.ended)active.stop();}
// End of scene: a run that finishes a scene shows the end page, says so aloud, and offers the next scene with your lines.
const body=[];ctx.document.body.classList={add(c){if(!body.includes(c))body.push(c)},remove(c){const i=body.indexOf(c);if(i>=0)body.splice(i,1)}};
get('cast-input').value='';get('script-input').value='СЦЕНА 1. КУХНЯ.\nАННА: Доброе утро.\nСЕРГЕЙ: Привет.\nСЦЕНА 2. УЛИЦА.\nСЕРГЕЙ: Один.\nСЦЕНА 3. ДВОР.\nСЕРГЕЙ: Кто там?\nАННА: Это я.\nАННА: Открывай.';get('save-script').onclick();
get('role').onchange({target:{value:'АННА'}});assert.equal(vm.runInContext('data.role',ctx),'АННА');assert.equal(vm.runInContext('data.language',ctx),'ru-RU');
get('start').onclick();get('typed').value='Доброе утро';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(spoken.at(-1).text,'Привет.');spoken.at(-1).onend();
assert.equal(index(),2);assert.equal(get('scene-end').hidden,false,'The end page shows');assert.equal(get('current-line').hidden,true);assert(get('stage-tag').textContent.includes('SCENE COMPLETE'));
assert(body.includes('rehearsing')&&body.includes('scene-ended'),'The end page stays in focus mode');assert.equal(get('stage-card').dataset.turn,'done');
assert.equal(get('end-stats').textContent,'You said your line.');assert.equal(get('next-title').textContent,'СЦЕНА 3. ДВОР.','Scenes without your lines are skipped');assert.equal(get('next-lines').textContent,'2 lines for you');assert.equal(get('next-scene').hidden,false);
flush();assert.equal(spoken.at(-1).text,'Конец сцены. Дальше: Сцена 3. двор.','Spoken in the play language');assert.equal(spoken.at(-1).lang,'ru-RU');
assert(get('scene-picker').children[0].textContent.endsWith('✓'),'Finished scenes are ticked');
get('next-scene').onclick();assert.equal(vm.runInContext('data.activeScene',ctx),2);assert.equal(vm.runInContext('running',ctx),true,'Next scene starts right away');assert(!body.includes('scene-ended'));assert.equal(spoken.at(-1).text,'Кто там?');spoken.at(-1).onend();
get('typed').value='Это я';get('typed-form').onsubmit({preventDefault(){}});flush();get('typed').value='Открывай';get('typed-form').onsubmit({preventDefault(){}});flush();flush();
assert.equal(get('end-stats').textContent,'You said all 2 of your lines.');assert(get('next-label').textContent.includes('END OF YOUR PART'),'After the last scene, offer the first one');assert.equal(get('next-title').textContent,'СЦЕНА 1. КУХНЯ.');assert.equal(spoken.at(-1).text,'Конец сцены. Это была ваша последняя сцена.');
get('again').onclick();assert.equal(vm.runInContext('data.activeScene',ctx),2);assert.equal(index(),0,'Run again starts the same scene from the top');assert.equal(vm.runInContext('running',ctx),true);assert.equal(get('scene-end').hidden,true);
get('restart').onclick();get('start').onclick();spoken.at(-1).onend();get('typed').value='Это я';get('typed-form').onsubmit({preventDefault(){}});flush();get('typed').value='Открывай';get('typed-form').onsubmit({preventDefault(){}});flush();
get('end-close').onclick();assert(!body.includes('rehearsing'),'Done for now leaves focus mode');assert.equal(get('scene-end').hidden,false,'The scene still reads as complete');
// Finishing by typing without a run shows the end card but doesn't announce or take over the screen.
get('restart').onclick();vm.runInContext('data.index=1;render()',ctx);const before=spoken.length;get('typed').value='Это я';get('typed-form').onsubmit({preventDefault(){}});flush();get('typed').value='Открывай';get('typed-form').onsubmit({preventDefault(){}});flush();flush();
assert.equal(get('scene-end').hidden,false);assert.equal(spoken.length,before,'No announcement without a run');assert(!body.includes('rehearsing'));
console.log('Scene end passed: end page, focus mode, spoken announcement, skipping scenes without your lines, wrap to first scene, run again, done for now.');
