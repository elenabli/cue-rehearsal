// Interface language: Russian translations, plural forms, and translation of the static page.
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function load(saved){const store={'cue-ui-lang':saved};const ctx={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}}};ctx.window=ctx;vm.runInNewContext(fs.readFileSync('dist/i18n.js','utf8'),ctx);return {I:ctx.CueI18n,store};}
const {I,store}=load(null);
assert.equal(I.lang,'en','English stays the default');
assert.equal(I.t('{n} lines in this scene',{n:1}),'1 line in this scene');
assert.equal(I.t('Something new'),'Something new','text without a translation passes through');
I.setLang('ru');assert.equal(store['cue-ui-lang'],'ru','the choice is saved');
assert.equal(load('ru').I.lang,'ru','the saved choice is used on the next visit');
assert.equal(I.t('Start rehearsal'),'Начать репетицию');
assert.equal(I.t('{n}% complete',{n:40}),'Пройдено 40%');
for(const [n,word] of [[1,'реплика'],[2,'реплики'],[5,'реплик'],[11,'реплик'],[21,'реплика'],[24,'реплики']])assert.equal(I.t('{n} lines in this scene',{n}),`${n} ${word} в этой сцене`);
assert.equal(I.t('{n} scenes in your play · Progress is saved for each scene',{n:22}),'22 сцены в пьесе · Прогресс сохраняется для каждой сцены');
assert.equal(I.t('Something new'),'Something new','untranslated text falls back to English');
// Every text the code passes to t() has a Russian translation.
const RU=I.dictionary.ru,norm=s=>s.replace(/\s+/g,' ').trim();const missing=[];
for(const file of ['dist/app.js','dist/pdf-reader.js','dist/review.js','dist/text-import.js','dist/docx-import.js']){const src=fs.readFileSync(file,'utf8');for(const call of src.matchAll(/\bt\(([^()]*)\)/g))for(const m of call[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)){const text=m[1].replace(/\\n/g,'\n');if(!(text in RU))missing.push(file+': '+text);}}
assert.deepEqual(missing,[],'every t() text has a Russian translation');
// Static page text: report what has no translation (new text from other changes stays English until added).
const html=fs.readFileSync('dist/index.html','utf8').replace(/<script[\s\S]*?<\/script>|<textarea[\s\S]*?<\/textarea>|<select id="(?:language|ui-language)"[\s\S]*?<\/select>/g,'');
const untranslated=[...html.matchAll(/>([^<]+)</g)].map(m=>norm(m[1].replace(/&nbsp;/g,' ').replace(/&amp;/g,'&'))).filter(s=>/\p{L}{2}/u.test(s)&&!(s in RU)&&!['cue','Cue'].includes(s));
if(untranslated.length)console.log('Interface text without a Russian translation (shown in English):\n  '+untranslated.join('\n  '));
console.log('Interface language passed: English default, saved choice, Russian plurals, and a translation for every app message.');
