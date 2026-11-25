// Learn by heart: choose a piece of a long line in the reading view and say it again and again; heard first, then from memory.
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
get('cast-input').value='Анна\nБорис';get('script-input').value='СЦЕНА 1\nБОРИС: Ну что?\nАННА: Я не знаю. Что делать? Уйти или остаться.\nБОРИС: Решай.';get('save-script').onclick();
run("data.autoMic=false");assert.equal(run('data.role'),'Анна');
assert.deepEqual([...run("CueCore.parts('Я не знаю. Что делать? Уйти или остаться.')")],['Я не знаю.','Что делать?','Уйти или остаться.']);
const longOne=run("CueCore.parts('Вот, например, когда я был маленьким, мы жили в деревне у реки, и каждый вечер отец брал меня на рыбалку, и это было счастье.')");
assert.ok(longOne.length>1,'A long sentence splits at commas');assert.equal(longOne.join(' '),'Вот, например, когда я был маленьким, мы жили в деревне у реки, и каждый вечер отец брал меня на рыбалку, и это было счастье.');
// Reading view: tap Анна's line, Learn by heart, choose pieces 2–3.
get('read-scene').onclick();const li=()=>get('reader-lines').children[1];
li().children[0].onclick();const learn=li().children.find(c=>c.textContent==='Learn by heart');assert.ok(learn,'Your own line offers Learn by heart');
learn.onclick();const box=()=>li().children[1];assert.equal(box().children.filter(c=>c.textContent&&c.textContent.trim()).length,3,'The line shows as 3 pieces');
const pieces=()=>box().children.filter(c=>c.className);pieces()[1].onclick();pieces()[2].onclick();
assert.match(pieces()[1].className,/on/);assert.match(pieces()[2].className,/on/);assert.doesNotMatch(pieces()[0].className,/on/);
const before=spoken.length;li().children[3].onclick();
assert.equal(run('running'),true);assert.equal(run('reading'),false);assert.equal(run('lines[data.index].text'),'Что делать? Уйти или остаться.');
// First time: heard first, shown.
assert.equal(spoken.length,before+1);assert.equal(spoken.at(-1).text,'Что делать? Уйти или остаться.');assert.equal(get('current-line').hidden,false);spoken.at(-1).onend();
type('Что делать? Уйти или остаться.');assert.equal(run('snip.reps'),1);assert.equal(run('data.index'),1,'It stays on the same line');
assert.equal(spoken.length,before+2,'Heard again the second time');spoken.at(-1).onend();
type('Что делать? Уйти.');assert.equal(run('snip.reps'),1,'A wrong try does not count');type('Что делать? Уйти или остаться.');assert.equal(run('snip.reps'),2);
// Third time: hidden, not read aloud.
assert.equal(spoken.length,before+2,'From memory now');assert.equal(get('current-line').hidden,true);assert.equal(get('hidden-line').hidden,false);assert.match(get('line-count').textContent,/2/);
assert.equal(run('data.hide'),false,'Hide my lines setting is untouched');
type('Что делать? Уйти или остаться.');assert.equal(run('snip.reps'),3);
// Pause: back to the reading view with the same piece chosen; the scene and its marks are as before.
get('start').onclick();assert.equal(run('running'),false);assert.equal(run('snip'),null);assert.equal(run('reading'),true);
assert.equal(run('lines[1].text'),'Я не знаю. Что делать? Уйти или остаться.');assert.equal(run('picking.from'),1);assert.equal(run('picking.to'),2);
assert.deepEqual([...run('hardLines()')],[],'Practice does not mark hard lines');
// One-piece lines start straight away.
get('reader-back').onclick();get('script-input').value='СЦЕНА 1\nБОРИС: Ну что?\nАННА: Остаюсь.';get('save-script').onclick();run("data.autoMic=false");
get('read-scene').onclick();get('reader-lines').children[1].children[0].onclick();get('reader-lines').children[1].children.find(c=>c.textContent==='Learn by heart').onclick();
assert.equal(run('running'),true);assert.equal(run('snip.text'),'Остаюсь.');
console.log('Learn by heart passed: pieces chosen, heard then from memory, repeats counted, pause returns to the reading view.');
