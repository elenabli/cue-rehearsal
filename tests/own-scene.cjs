// Choosing a role (or saving a play) opens the role's first scene when the open scene has no lines for it.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){this.open=true},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},
 navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},
 window:{speechSynthesis:{cancel(){},getVoices(){return []},addEventListener(){},speak(){}},scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
 setTimeout(){return 0},clearTimeout(){},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
const run=code=>vm.runInContext(code,ctx);
get('cast-input').value='Анна\nБорис\nВера';
get('script-input').value='СЦЕНА 1\nАННА: Ты здесь?\nБОРИС: Здесь.\nСЦЕНА 2\nБОРИС: Кто там?\nВЕРА: Это я.\nСЦЕНА 3\nВЕРА: Пора.\nАННА: Иду.';
get('save-script').onclick();
assert.equal(run('data.role'),'Анна');assert.equal(run('data.activeScene'),0);
const pick=name=>{get('role').value=name;get('role').onchange({target:get('role')});};
pick('Вера');assert.equal(run('data.activeScene'),1,'Вера is silent in scene 1, so her first scene opens');
pick('Анна');assert.equal(run('data.activeScene'),0,'Анна is silent in scene 2, so her first scene opens');
get('scene-picker').onchange({target:{value:'2'}});pick('Борис');assert.equal(run('data.activeScene'),0,'Борис is silent in scene 3');
run('data.index=1');pick('Борис');get('scene-picker').onchange({target:{value:'0'}});run('data.index=1');pick('Вера');
assert.equal(run('data.activeScene'),1);
console.log('Own-scene checks passed: a role opens on its first scene with lines.');
