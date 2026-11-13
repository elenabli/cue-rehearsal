// Several plays: adding a play keeps the first one with its role and progress, switching brings them back,
// deleting removes one, and the plays survive a reload.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){},scrollIntoView(){}};}
const store={};
function boot(){const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  navigator:{userAgent:'test'},window:{speechSynthesis:{cancel(){},getVoices(){return []},addEventListener(){},speak(){}},scrollTo(){},addEventListener(){},confirm:()=>true},SpeechSynthesisUtterance:class{},setTimeout(){return 0},clearTimeout(){},Blob,URL};
 ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
 return {get,run:code=>vm.runInContext(code,ctx)};}
let {get,run}=boot();
const save=(title,cast,script)=>{get('title-input').value=title;get('cast-input').value=cast;get('script-input').value=script;get('save-script').onclick();};
save('Пьеса А','Анна\nБорис','СЦЕНА 1\nАННА: Раз.\nБОРИС: Два.\nАННА: Три.\nСЦЕНА 2\nБОРИС: Четыре.\nАННА: Пять.');
get('role').value='Борис';get('role').onchange({target:get('role')});run('data.index=1;persist()');
assert.equal(run('data.activeScene'),0);
get('add-play').onclick();assert.equal(get('script-input').value,'','Add a play clears the editor');
save('Play B','Kate\nTom','SCENE 1\nKATE: Hello.\nTOM: Hi.');
assert.equal(run('data.title'),'Play B');assert.equal(run('data.language'),'en-GB');assert.equal(run('data.role'),'Kate');
assert.equal(run('library.others.length'),1);assert.equal(get('play-list').children.length,2);
const firstId=run('library.others[0].id');
run(`switchPlay('${firstId}')`);
assert.equal(run('data.title'),'Пьеса А');assert.equal(run('data.role'),'Борис','The role comes back');assert.equal(run('data.index'),1,'The line comes back');assert.equal(run('data.language'),'ru-RU');
assert.equal(get('script-input').value.includes('Четыре'),true,'The editor shows the open play');
// Reload: both plays are still there and the open one stays open.
({get,run}=boot());assert.equal(run('data.title'),'Пьеса А');assert.equal(run('library.others.length'),1);assert.equal(run('library.others[0].title'),'Play B');
// Cancel adding keeps the open play in the editor.
get('add-play').onclick();get('cancel-add').onclick();assert.equal(get('title-input').value,'Пьеса А');
// Delete the open play: the other one opens.
run(`deletePlay(data.playId)`);assert.equal(run('data.title'),'Play B');assert.equal(run('library.others.length'),0);assert.equal(get('change-play').hidden,true);
console.log('Plays passed: add, switch with role and progress, reload, cancel, delete.');
