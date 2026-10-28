const assert=require('node:assert/strict');
const {textItemsToLines,convertPlayText}=require('../dist/pdf-import.js');
const {parseScript}=require('../dist/core.js');
const item=(str,x,y,width)=>({str,transform:[12,0,0,12,x,y],width,height:12});
assert.equal(textItemsToLines([item('world.',80,600,35),item('ELENA:',30,700,40),item('Hello',40,600,30)]),'ELENA:\nHello world.');
assert.equal(textItemsToLines([item('stay',30,700,20),item('ing',50,700,15)]),'staying');
const input='ACT I\nSCENE 2\nELENA\n(quietly)\nI thought you might still be here.\nJAMES\nWe have a little time.\n2\nELENA\nThen let us stay.\nCURTAIN';
const parsed=parseScript(convertPlayText(input));
assert.deepEqual(parsed,[{speaker:'ELENA',text:'I thought you might still be here.',direction:'[quietly]'},{speaker:'JAMES',text:'We have a little time.',direction:''},{speaker:'ELENA',text:'Then let us stay.',direction:''}]);
for(const separator of [': ','. ',' — ',' – '])assert.equal(parseScript(convertPlayText(`ELENA${separator}Hello.\nJAMES${separator}Goodbye.`)).length,2);
assert.deepEqual(parseScript(convertPlayText('ЕЛЕНА\nЯ остаюсь.\nДЖЕЙМС\nЯ тоже.')).map(l=>l.speaker),['ЕЛЕНА','ДЖЕЙМС']);
assert.equal(convertPlayText('Unstructured text without character names'),'Unstructured text without character names');
assert.equal(textItemsToLines([]),'');
console.log('PDF formatting checks passed: layout, split words, character headings, separators, page numbers, directions, Cyrillic, and unstructured text.');
const {splitPlayScenes,preparePlayText}=require('../dist/pdf-import.js');
const wholePlay='Название пьесы\nАвтор\n'+Array.from({length:25},(_,i)=>`Сцена ${i+1}\nЕЛЕНА: Реплика ${i+1}.\nДЖЕЙМС: Ответ ${i+1}.`).join('\n\n');
const split=splitPlayScenes(wholePlay);assert.equal(split.scenes.length,25);assert.equal(split.preamble,'Название пьесы\nАвтор');assert.equal(split.scenes[20].title,'Сцена 21');assert.equal(parseScript(split.scenes[24].script)[1].text,'Ответ 25.');
const prepared=preparePlayText(wholePlay);assert.equal(splitPlayScenes(prepared).scenes.length,25);assert(!prepared.includes('Автор'));
for(const heading of ['СЦЕНА 22. Поздний вечер','Сцена № 23','сцена 24 — Возвращение','Сцена (25)','Scene 26','SCENE XXVII','Сцена\u00a028'])assert.equal(splitPlayScenes(heading+'\nЕЛЕНА: Привет.').scenes.length,1,heading);
assert.equal(splitPlayScenes('ЕЛЕНА: Вспомни, как началась Сцена 1.\n(Сцена 2 — не заголовок)').scenes.length,0);
assert.equal(splitPlayScenes('Сцена 1\nЕЛЕНА: Да.\nАКТ 2\nСцена 1\nЕЛЕНА: Нет.').scenes.length,2,'Numbering can restart in another act');
assert.equal(splitPlayScenes('Сцена 1\nЕЛЕНА: Да.\nСцена 2').scenes[1].script,'','Empty scenes remain visible for validation');
assert.deepEqual(parseScript(convertPlayText('СЦЕНА 1\nЕЛЕНА\nПривет.\nДЖЕЙМС\nДобрый день.')).map(l=>l.speaker),['ЕЛЕНА','ДЖЕЙМС']);
console.log('Whole-play splitting passed: 25 scenes, heading variants, scene isolation, repeated numbering, empty scenes, and Cyrillic headings.');
// Preserve italic spans before converting PDF text into character dialogue.
const regular={fontName:'regular'},italic={fontName:'italic'};
const styles={regular:{fontFamily:'Arial'},italic:{fontFamily:'Arial-Italic',italic:true}};
const italicItems=[{...item('СЕРГЕЙ: Не хочу. Пойду уже.',30,700,200),...regular},{...item('Светлана нервно на',235,700,160),...italic},{...item('него смотрит.',30,680,110),...italic},{...item('СВЕТЛАНА: Подожди.',30,650,160),...regular}];
const italicScript=convertPlayText(textItemsToLines(italicItems,styles));const italicLines=parseScript(italicScript);assert.equal(italicLines[0].text,'Не хочу. Пойду уже.');assert(italicLines[0].direction.includes('Светлана нервно на'));assert(italicLines[0].direction.includes('него смотрит.'));assert.equal(italicLines[1].speaker,'СВЕТЛАНА');
assert.equal(parseScript('СЕРГЕЙ: Не [тихо] хочу.')[0].text,'Не хочу.');
assert.equal(parseScript(convertPlayText('[Светлана сидит.]\nСЕРГЕЙ: Привет.'))[0].direction,'[Светлана сидит.]','Opening directions must be preserved');
assert.equal(textItemsToLines([{...item('СЦЕНА 1',30,700,100),...italic}],styles),'СЦЕНА 1','Italic headings still split scenes');
console.log('Italic-span checks passed: mixed and wrapped text, separate stage directions, opening directions, dialogue-only text, and scene headings.');
const {fontIsItalic}=require('../dist/pdf-import.js');
const fontData=new Uint8Array(100),fontView=new DataView(fontData.buffer);fontView.setUint16(4,1);fontView.setUint32(12,0x706f7374);fontView.setUint32(20,32);fontView.setUint32(24,32);fontView.setInt32(36,-12*65536);
assert.equal(fontIsItalic({name:'ABCDEF+F1',data:fontData}),true,'An opaque subset name still exposes its italic angle');fontView.setInt32(36,0);assert.equal(fontIsItalic({name:'ABCDEF+F1',data:fontData}),false);assert.equal(fontIsItalic({cssFontInfo:{italicAngle:'12'}}),true);assert.equal(fontIsItalic({italic:true}),true);
const {extractCast}=require('../dist/pdf-import.js');
const rosterPlay=`Название пьесы
ДЕЙСТВУЮЩИЕ ЛИЦА:
Сергей — отец
Светлана, его жена
Тамара Петровна — соседка
Лёха (друг)
СЦЕНА 1
СЕРГЕЙ: Не хочу.
Причина гибели: неизвестна.
Надо к врачу: завтра.
СВЕТЛАНА: Подожди.
очереди, а кассирша: не пускает.
ТАМАРА ПЕТРОВНА. Здравствуйте.
ЛЁХА
Привет.`;
const cast=extractCast(rosterPlay);assert.deepEqual(cast,['Сергей','Светлана','Тамара Петровна','Лёха']);
const convertedRoster=preparePlayText(rosterPlay);assert.deepEqual(extractCast(convertedRoster),cast,'Roster survives PDF conversion');
const castLines=parseScript(splitPlayScenes(convertedRoster).scenes[0].script,cast);assert.deepEqual([...new Set(castLines.map(l=>l.speaker))],cast);assert(castLines[0].text.includes('Причина гибели: неизвестна.'));assert(castLines[1].text.includes('очереди, а кассирша: не пускает.'));
assert.equal(parseScript('ЛЕХА: Я здесь.',['Лёха'])[0].speaker,'Лёха');assert.equal(parseScript('СЕРГЕЙ: Да.',['Сергей Гордеев'])[0].speaker,'Сергей Гордеев');
assert.equal(parseScript('СЕРГЕЙ: Да.\nне надо, я как все. а она: Нет.')[0].speaker,'СЕРГЕЙ');assert.equal(parseScript('СЕРГЕЙ: Да.\nне надо, я как все. а она: Нет.').length,1);
console.log('Cast checks passed: front-matter roster, descriptions, patronymics, aliases, ё/е, preserved roster, and dialogue colons excluded from roles.');
assert.deepEqual(extractCast('Название Пьесы\nСергей — отец\nСветлана — жена\nСцена 1\nСЕРГЕЙ: Да.\nСВЕТЛАНА: Нет.'),['Сергей','Светлана'],'A roster before the scenes can be found without a section heading');
