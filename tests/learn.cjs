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
// Home shows the Learn by heart card; it opens a view with only Анна's lines, already in pieces, and a bar at the bottom.
assert.equal(get('learn-open').hidden,false,'The card is on Home');get('learn-open').onclick();
assert.equal(run('reading&&learning'),true);assert.equal(get('learn-intro').hidden,false);assert.equal(get('learn-bar').hidden,false);assert.equal(get('learn-go').disabled,true,'Nothing chosen yet');
assert.equal(get('reader-lines').children.length,1,'Only her lines');const li=()=>get('reader-lines').children[0];
const box=()=>li().children.find(c=>c.className==='snip-parts');const pieces=()=>box().children.filter(c=>c.className);assert.equal(pieces().length,3,'The line shows as 3 pieces');
assert.match(li().children[0].textContent,/Борис: Ну что\?/i,'Her cue is shown above');
pieces()[1].onclick();assert.match(get('learn-picked').textContent,/last phrase/);pieces()[2].onclick();
assert.match(pieces()[1].className,/on/);assert.match(pieces()[2].className,/on/);assert.doesNotMatch(pieces()[0].className,/on/);
assert.equal(get('learn-go').disabled,false);assert.equal(get('learn-picked').textContent,'2 phrases chosen');
const before=spoken.length;get('learn-go').onclick();
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
// From the reading view: tap her line, Learn by heart opens the view with that line's first piece chosen.
get('reader-back').onclick();assert.equal(run('reading'),false);get('read-scene').onclick();assert.equal(run('learning'),false);
get('reader-lines').children[1].children[0].onclick();get('reader-lines').children[1].children.find(c=>c.textContent==='Learn by heart').onclick();
assert.equal(run('learning'),true);assert.equal(run('picking.at'),1);assert.equal(get('learn-go').disabled,false);
pieces()[2].onclick();assert.equal(run('picking.from'),2,'A first tap starts a new piece');get('learn-go').onclick();assert.equal(run('snip.text'),'Уйти или остаться.');
console.log('Learn by heart passed: pieces chosen, heard then from memory, repeats counted, card on Home, bar at the bottom, pause returns to the view.');
