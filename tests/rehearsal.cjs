const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
let timer;let recognizer;let spoken=[];
class Recognition{constructor(){recognizer=this}start(){this.onstart?.()}stop(){this.onend?.()}abort(){}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){},getVoices(){return []},addEventListener(){},speak(u){spoken.push(u)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:Utterance,setTimeout(fn){timer=fn;return 1},clearTimeout(){timer=null},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/core.js','utf8'),ctx);ctx.CueCore=ctx.window.CueCore;vm.runInContext(fs.readFileSync('dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=ctx.window.CuePdf;vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);
function index(){return vm.runInContext('data.index',ctx)}function flush(){const t=timer;timer=null;t?.()}
function result(text,final=true){const r=[{transcript:text}];r.isFinal=final;recognizer.onresult({results:[r]});}
assert.equal(index(),0);get('typed').value='I thought you were here';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),0,'Wrong line must not advance');
get('typed').value='I thought you might still be here';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),1,'Correct typed line advances once');
get('restart').onclick();get('listen').onclick();result('I thought you might still be here',false);flush();assert.equal(index(),0,'Interim speech must not advance');result('I thought you were here');flush();assert.equal(index(),0,'Wrong final speech must not advance');
get('listen').onclick();result('I thought you might still be here');flush();assert.equal(index(),1,'Correct final speech advances');
get('restart').onclick();get('start').onclick();get('listen').onclick();result('I thought you might still be here');flush();assert.equal(index(),1);assert.equal(spoken.at(-1).text,"The last train doesn't leave until midnight. We have a little time.");spoken.at(-1).onend();assert.equal(index(),2,'Partner cue advances after spoken completion');
get('listen').onclick();result('A little time is all we ever seem to have');get('restart').onclick();flush();assert.equal(index(),0,'Restart cancels a pending advance');
get('start').onclick();get('listen').onclick();result('I thought you might still be here');flush();const stale=spoken.at(-1);get('restart').onclick();stale.onend();assert.equal(index(),0,'Stale voice callbacks cannot advance after restart');
console.log('Rehearsal integration passed: wrong/interim/correct speech, typed checks, partner cues, restart cancellation.');
// Import all scenes together, switch without losing progress, and preserve them on reload.
get('title-input').value='Вся пьеса';get('script-input').value=Array.from({length:25},(_,i)=>`Сцена ${i+1}\nELENA: My line ${i+1}.\nJAMES: Your cue ${i+1}.`).join('\n\n');get('save-script').onclick();
assert.equal(vm.runInContext('data.scenes.length',ctx),25);assert.equal(vm.runInContext('data.activeScene',ctx),0);assert.equal(get('scene-picker').children.length,25);assert.equal(vm.runInContext('lines.length',ctx),2,'Rehearsal contains only the selected scene');
get('typed').value='My line 1';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),1);
get('scene-picker').onchange({target:{value:'20'}});assert.equal(index(),0);assert.equal(get('current-line').textContent,'My line 21.');
get('typed').value='My line 21';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),1);
get('scene-picker').onchange({target:{value:'0'}});assert.equal(index(),1,'Scene 1 remembers its line');get('scene-picker').onchange({target:{value:'20'}});assert.equal(index(),1,'Scene 21 remembers its line');
vm.runInContext("showView('script')",ctx);assert(get('script-input').value.includes('Сцена 25'),'Editor keeps the full play, not just the selected scene');

let snapshot;ctx.localStorage.setItem=(key,value)=>{snapshot=value};vm.runInContext('persist()',ctx);assert.equal(JSON.parse(snapshot).scenes[20].index,1);
const newElements=new Map();ctx.document.getElementById=id=>{if(!newElements.has(id))newElements.set(id,element());return newElements.get(id)};ctx.localStorage.getItem=()=>snapshot;vm.runInNewContext(fs.readFileSync('dist/app.js','utf8'),{...ctx});assert.equal(newElements.get('current-line').textContent,'Your cue 21.','Reload restores the active scene and progress');
console.log('Scene rehearsal passed: all 25 scenes, isolated dialogue, independent progress, full-play editing and reload.');
// A scene with action but no dialogue must not prevent saving the whole play.
ctx.document.getElementById=get;
const scene12=`СЦЕНА 12. КВАРТИРА ГОРДЕЕВЫХ. НОЧЬ.
На кухне сидит Сергей в новых носках и трусах.
Один.
На столе бутылка водки.
Он наливает ее в стакан и пьет.
Наливает и пьет.
Снова наливает и снова пьет.`;
get('script-input').value=scene12+'\nСЦЕНА 13. КВАРТИРА ГОРДЕЕВЫХ. ДЕНЬ.\nСЕРГЕЙ: Доброе утро.\nАННА: Привет.';get('save-script').onclick();
assert.equal(get('script-message').textContent,'');assert.equal(vm.runInContext('data.scenes.length',ctx),2);assert.equal(vm.runInContext('data.scenes[0].kind',ctx),'directions');assert.equal(get('current-line').textContent,scene12.split('\n').slice(1).join('\n'),'Narration is preserved verbatim');assert.equal(get('listen').disabled,true);assert.equal(get('typed').disabled,true);assert.equal(get('start').disabled,false);assert(get('start').innerHTML.includes('Следующая сцена'));assert.equal(get('progress').value,0);
const beforeNarration=spoken.length;get('hear-line').onclick();assert.equal(spoken.length,beforeNarration+1);assert.equal(spoken.at(-1).text,vm.runInContext('data.scenes[0].script',ctx));spoken.at(-1).onend();assert.equal(vm.runInContext('data.activeScene',ctx),0,'Narration playback does not auto-advance');
get('start').onclick();assert.equal(vm.runInContext('data.activeScene',ctx),1);assert.equal(get('current-line').textContent,'Доброе утро.');assert.equal(get('start').disabled,false);get('typed').value='Неверная реплика';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),0,'Actual dialogue still requires the right words');
get('scene-picker').onchange({target:{value:'0'}});vm.runInContext('persist()',ctx);const stageElements=new Map();const stageCtx={...ctx,document:{...ctx.document,getElementById(id){if(!stageElements.has(id))stageElements.set(id,element());return stageElements.get(id)}}};vm.runInNewContext(fs.readFileSync('dist/app.js','utf8'),stageCtx);assert.equal(stageElements.get('current-line').textContent,scene12.split('\n').slice(1).join('\n'),'Direction-only scenes survive reload');
get('script-input').value=scene12;get('save-script').onclick();assert.equal(get('script-message').textContent,'');assert.equal(get('start').disabled,true,'A final direction-only scene ends the play');
console.log('Reported scene 12 passed: no dialogue required, exact text retained, optional narration, next-scene transition, reload, and speech gate unchanged for dialogue.');

// Unrecognized or empty scenes are retained for review without blocking a play.
const reviewText='СЦЕНА 18\nСЕРГЕЙ: Привет.\nСЦЕНА 19\nСЕРГЕЙ —\nСЦЕНА 20\nАННА: Здравствуй.\nСЦЕНА 21';
get('script-input').value=reviewText;get('save-script').onclick();assert.equal(get('script-message').textContent,'');assert.equal(vm.runInContext('data.scenes.length',ctx),4);assert.equal(vm.runInContext('data.scenes[1].kind',ctx),'review');assert.equal(vm.runInContext('data.scenes[1].script',ctx),'СЕРГЕЙ —');assert.equal(vm.runInContext('data.scenes[3].kind',ctx),'review');assert.equal(vm.runInContext('data.playText',ctx),reviewText);
get('scene-picker').onchange({target:{value:'1'}});assert.equal(get('listen').disabled,true);assert.equal(get('line-count').textContent,'REVIEW NEEDED');assert.equal(get('current-line').textContent,'СЕРГЕЙ —');assert(get('stage-tag').textContent.includes('ПРОВЕРЬТЕ'));assert(get('scene-picker').children[1].textContent.includes('проверить'));
get('start').onclick();assert.equal(get('current-line').textContent,'Здравствуй.');get('scene-picker').onchange({target:{value:'1'}});vm.runInContext('persist()',ctx);const reviewElements=new Map();vm.runInNewContext(fs.readFileSync('dist/app.js','utf8'),{...ctx,document:{...ctx.document,getElementById(id){if(!reviewElements.has(id))reviewElements.set(id,element());return reviewElements.get(id)}}});assert.equal(reviewElements.get('line-count').textContent,'REVIEW NEEDED');assert.equal(reviewElements.get('current-line').textContent,'СЕРГЕЙ —');
console.log('Review-scene checks passed: full-play saving, original text retention, explicit review labels, no speech completion, next-scene access, empty scenes, and reload.');

get('script-input').value='   ';get('save-script').onclick();assert.equal(vm.runInContext('data.scenes.length',ctx),4,'A completely blank editor must not replace the saved play');assert(get('script-message').textContent.includes('Add a script'));
