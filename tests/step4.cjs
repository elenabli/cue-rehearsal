// Back one line, start from a chosen line, and lines to work on (marked on a miss, cleared when said cleanly, drilled with their cue).
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){},scrollIntoView(){}};}
const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;const spoken=[];
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},
 navigator:{userAgent:'test'},window:{speechSynthesis:{cancel(){},getVoices(){return []},addEventListener(){},speak(u){if(u.volume===0){u.onstart?.();return;}spoken.push(u);u.onstart?.();}},scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
 setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
const run=code=>vm.runInContext(code,ctx);const flush=()=>{for(const [id,t] of [...timers])if(timers.has(id)&&t.ms<2000){timers.delete(id);t.fn();}};
const type=text=>{get('typed').value=text;get('typed-form').onsubmit({preventDefault(){}});flush();};
get('cast-input').value='Анна\nБорис';get('script-input').value='СЦЕНА 1\nБОРИС: Один.\nАННА: Два.\nБОРИС: Три.\nАННА: Четыре.\nБОРИС: Пять.\nАННА: Шесть.';get('save-script').onclick();
run("data.autoMic=false");assert.equal(run('data.role'),'Анна');
// A run: miss line 1, say line 3 cleanly, use a hint on line 5.
get('start').onclick();spoken.at(-1).onend();assert.equal(run('data.index'),1);
type('Три');assert.equal(run('data.index'),1,'Wrong stays');type('Два');assert.equal(run('data.index'),2);spoken.at(-1).onend();
// Back one line: from Анна's line 3 back to Борис's cue, which is spoken again.
assert.equal(get('back-line').hidden,false);const before=spoken.length;get('back-line').onclick();assert.equal(run('data.index'),2);assert.equal(spoken.length,before+1,'The cue is spoken again');spoken.at(-1).onend();assert.equal(run('data.index'),3);
type('Четыре');spoken.at(-1).onend();run('hint.open=true');get('hint-cue').onclick();spoken.at(-1).onend();type('Шесть');
assert.equal(run('sceneEnd'),true,'The scene ends');assert.deepEqual([...run('hardLines()')],[1,5],'The missed line and the hinted line are marked');
assert.equal(get('end-hard').hidden,false);
// Hard-lines run: cue then line, only for the marked lines.
get('end-hard').onclick();assert.equal(run('data.index'),0,'Starts at the cue of line 1');assert.equal(spoken.at(-1).text,'Один.');spoken.at(-1).onend();
assert.equal(run('data.index'),1);type('Два');assert.equal(run('data.index'),4,'Jumps to the cue of the next hard line');spoken.at(-1).onend();type('Шесть');
assert.equal(run('sceneEnd'),true);assert.equal(run('drillDone'),true);assert.deepEqual([...run('hardLines()')],[],'Said cleanly, the marks clear');assert.equal(get('end-hard').hidden,true);
// Reading view: start from a chosen line.
get('end-done').onclick();get('read-scene').onclick();assert.equal(run('reading'),true);assert.equal(get('reader-lines').children.length,6);
get('reader-lines').children[3].children[0].onclick();const go=get('reader-lines').children[3].children[1];assert.match(go.textContent,/Start from here/);go.onclick();
assert.equal(run('reading'),false);assert.equal(run('running'),true);assert.equal(run('data.index'),3,'The run starts from the chosen line');
console.log('Step 4 passed: back one line, hard lines marked, drilled with cues and cleared, start from a chosen line.');
