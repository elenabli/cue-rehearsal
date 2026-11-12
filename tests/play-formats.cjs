// Wider import rules (acts, явления, title-case speakers, plain-text directions) and more file types.
const assert=require('node:assert/strict');const zlib=require('node:zlib');
const P=require('../dist/pdf-import.js');globalThis.CuePdf=P;globalThis.CueDocx=require('../dist/docx-import.js');
const T=require('../dist/text-import.js');const {parseScript}=require('../dist/core.js');
const scenesOf=text=>P.splitPlayScenes(P.preparePlayText(text)).scenes;
// Headings.
for(const h of ['ACT I.','Act II.','FIRST ACT','THE SECOND ACT','ACT ONE','ДЕЙСТВИЕ ПЕРВОЕ','Действие второе','Акт 2','ЯВЛЕНИЕ I','Явление 3','Картина первая','Act 1, Scene 2','Scene I. Elsinore. A platform','Сцена 4 а. Кухня','СЦЕНА. 3 КВАРТИРА.'])assert(P.headingKind(h),h);
for(const h of ['SCENE','act the part of a king','Действие 2 начинается ночью','Part of me','Сцена. Занавес.','АННА: Акт 2 мы пропустим.'])assert.equal(P.headingKind(h),null,h);
// An act followed by its first scene is one scene; an act without scenes is a scene.
const hamlet='ACT I.\n\nScene I. Elsinore.\nBERNARDO. Who is there?\nFRANCISCO. Nay, answer me.\nScene II. A room.\nKING. Though yet of Hamlet.\nACT II.\nScene I. Another room.\nPOLONIUS. Give him this money.';
assert.deepEqual(P.splitPlayScenes(hamlet).scenes.map(s=>s.title),['ACT I. · Scene I. Elsinore.','Scene II. A room.','ACT II. · Scene I. Another room.']);
assert.deepEqual(P.splitPlayScenes(P.preparePlayText(hamlet)).scenes.map(s=>s.title),['ACT I. · Scene I. Elsinore.','Scene II. A room.','ACT II. · Scene I. Another room.'],'merged titles survive a second split');
assert.deepEqual(P.splitPlayScenes('ACT I\nANNA: Yes.\nACT II\nANNA: No.').scenes.map(s=>s.title),['ACT I','ACT II']);
// A table of contents is not a list of empty scenes.
assert.deepEqual(P.splitPlayScenes('ACT I\nACT II\nACT I\nANNA: Yes.\nACT II\nANNA: No.').scenes.length,2);
// Chekhov: «Имя. Реплика», directions in plain text, roster with full names.
let body='';for(let i=0;i<6;i++)body+='Лопахин. Пришел поезд, слава богу. Который час?\nДуняша. Скоро два. (Тушит свечу.) Уже светло.\nВходит Епиходов с букетом.\nЕпиходов (поднимает букет). Вот садовник прислал.\nЛюбовь Андреевна. Да. Конечно.\nПауза.\n';
const chekhov='ВИШНЁВЫЙ САД\n\nДЕЙСТВУЮЩИЕ ЛИЦА\nРаневская Любовь Андреевна, помещица.\nЛопахин Ермолай Алексеевич, купец.\nДуняша, горничная.\nЕпиходов Семен Пантелеевич, конторщик.\nФирс, лакей.\n\nДЕЙСТВИЕ ПЕРВОЕ\nКомната, которая до сих пор называется детскою.\n'+body+'ДЕЙСТВИЕ ВТОРОЕ\nПоле.\n'+body;
{const prepared=P.preparePlayText(chekhov),cast=P.extractCast(prepared),scenes=P.splitPlayScenes(prepared).scenes;
 assert.deepEqual(scenes.map(s=>s.title),['ДЕЙСТВИЕ ПЕРВОЕ','ДЕЙСТВИЕ ВТОРОЕ']);
 assert.deepEqual(cast,['Лопахин Ермолай Алексеевич','Дуняша','Епиходов Семен Пантелеевич','Любовь Андреевна'],'silent Фирс is dropped, unlisted label added');
 const lines=parseScript(scenes[0].script,cast);assert.equal(lines.length,24);
 assert.equal(lines[1].text,'Скоро два. Уже светло.');assert(lines[1].direction.includes('Входит Епиходов с букетом.'));assert.equal(lines[2].direction,'[поднимает букет]');
 assert.equal(lines[3].text,'Да. Конечно.','«Да.» is not a speaker');assert.equal(lines[3].direction,'[Пауза.]');}
// A play in capitals keeps «Имя. Он делает…» as a direction (ПАЛЕЦ ГЕРОЯ, Мейер).
{const play='Сцена 1\n'+'ДЖЕЙСОН: Привет.\nМЕГАН: Привет.\n'.repeat(8)+'Джейсон. Он кладет цветы.\nДжейсон. Он уходит.\nДжейсон. Он молчит.\nМЕГАН: Пока.';
 const cast=P.extractCast(P.preparePlayText(play));assert.deepEqual(cast,['ДЖЕЙСОН','МЕГАН']);}
// Ostrovsky: явления inside a действие.
{const ost='ГРОЗА\nДЕЙСТВИЕ ПЕРВОЕ\nОбщественный сад.\nЯВЛЕНИЕ ПЕРВОЕ\nКулигин сидит на скамье.\n'+'Кулигин (поет). Среди долины ровныя.\nКудряш. Что?\nКулигин. Вид необыкновенный!\n'.repeat(5)+'ЯВЛЕНИЕ ВТОРОЕ\nТе же и Дикой.\n'+'Дикой. Баклуши ты бить приехал?\nКудряш. Нет.\nКулигин. Да что вы.\n'.repeat(5);
 const p=P.preparePlayText(ost);assert.deepEqual(P.splitPlayScenes(p).scenes.map(s=>s.title),['ДЕЙСТВИЕ ПЕРВОЕ · ЯВЛЕНИЕ ПЕРВОЕ','ЯВЛЕНИЕ ВТОРОЕ']);assert.deepEqual(P.extractCast(p),['Кулигин','Кудряш','Дикой']);}
// English: «MRS. HIGGINS.», Shaw's «NAME [direction] speech», “Enter”/“Exit”, abbreviated names on their own line.
{const shaw='ACT I\n'+'MRS. HIGGINS. Henry! What are you doing here?\nHIGGINS [kissing her] I know, mother.\nMRS. PEARCE. Mr. Higgins is in.\nEnter the parlor-maid.\nHIGGINS. Oh bother!\nExit.\n'.repeat(4);
 const p=P.preparePlayText(shaw),cast=P.extractCast(p);assert.deepEqual(cast,['MRS HIGGINS','MRS PEARCE','HIGGINS']);assert(p.startsWith('CHARACTERS\n'));
 const lines=parseScript(P.splitPlayScenes(p).scenes[0].script,cast);assert.equal(lines.length,16);assert.equal(lines[1].speaker,'HIGGINS');assert.equal(lines[1].text,'I know, mother.');assert.equal(lines[2].text,'Mr. Higgins is in.');assert.equal(lines[3].text,'Oh bother!');}
{const folio='Scene I. Elsinore.\n'+'Ber.\nWho is there?\nFran.\nNay, answer me: stand, and unfold yourself.\nHam.\nWell. I am here.\n'.repeat(5);
 const p=P.preparePlayText(folio),cast=P.extractCast(p);assert.deepEqual(cast,['Ber','Fran','Ham']);assert.equal(parseScript(P.splitPlayScenes(p).scenes[0].script,cast)[5].text,'Well. I am here.');}
// E-book licence text is cut away; generated headings follow the play's language.
{const book='The Project Gutenberg EBook\n*** START OF THIS PROJECT GUTENBERG EBOOK X ***\nACT I\nANNA: Yes.\nBORIS: No.\n*** END OF THIS PROJECT GUTENBERG EBOOK X ***\nLIMITED WARRANTY';const p=P.preparePlayText(book);assert(!/WARRANTY|START OF/.test(p));}
assert(scenesOf('My Play\nA HOUSE BY THE ROAD\nANNA: Yes.\nBORIS: No.\nANNA: Yes.\nBORIS: No.\nANNA: Yes.\nTHE TRAIN\nANNA: Go.\nBORIS: Stay.')[0].title.startsWith('Scene 1. '));
// A long English play must not freeze the importer (it once did, on the transcription pattern).
{const long='ACT I\n'+'ANNA: The quick brown fox jumps over the lazy dog and keeps on running through the field.\nBORIS: [smiling] And then what happened to the fox, my dear?\n'.repeat(1500);const t0=Date.now();P.preparePlayText(long);assert(Date.now()-t0<3000,'long English play imports quickly');}
assert.equal(P.speakTranscriptions('САРА: Nu är det Jul igen, nu är det Jul igen, nu är det Jul igen... [Ну эр дэ юль иген, ну эр дэ юль иген, ну эр дэ юль иген...] Ура.'),'САРА: Ну эр дэ юль иген, ну эр дэ юль иген, ну эр дэ юль иген... [Nu är det Jul igen, nu är det Jul igen, nu är det Jul igen...] Ура.');
console.log('Wider import rules passed: acts, явления, картины, contents lists, title-case and abbreviated speakers, Mrs./Dr., plain-text directions, licence text, long English plays.');
// ---- File types ----
const cp1251=s=>Uint8Array.from([...s].map(c=>{const n=c.charCodeAt(0);return n<128?n:c==='Ё'?0xa8:c==='ё'?0xb8:c==='—'?0x97:n-0x410+0xc0;}));
assert.equal(T.decodeText(cp1251('АННА: Привет — ёж.')),'АННА: Привет — ёж.');
assert.equal(T.decodeText(new TextEncoder().encode('\ufeffАННА: Привет.')),'АННА: Привет.');
assert.equal(T.decodeText(Uint8Array.from([0xff,0xfe,0x10,0x04,0x3a,0x00])),'А:');
const rtf=String.raw`{\rtf1\ansi\ansicpg1251\deff0{\fonttbl{\f0\fnil\fcharset204 Times New Roman;}}{\*\generator Riched20;}{\info{\title Secret}}\pard\f0 \'d1\'f6\'e5\'ed\'e0 1\par \'c0\'cd\'cd\'c0: \'cf\'f0\'e8\'e2\'e5\'f2. {\i (\'f2\'e8\'f5\'ee)} \u1044?\u1072?.\par {\i \'c2\'f5\'ee\'e4\'e8\'f2 \'c1\'ee\'f0\'e8\'f1.}\par BORIS: \{Hi\} \emdash  there\par}`;
assert.equal(T.rtfToText(rtf),'Сцена 1\nАННА: Привет. [тихо] Да.\n[Входит Борис.]\nBORIS: {Hi} — there');
assert.throws(()=>T.rtfToText('not rtf'));
const odt='<office:document-content><office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="P2" style:family="paragraph" style:parent-style-name="Remark"/></office:automatic-styles><office:body><office:text><text:h>Сцена 1</text:h><text:p>АННА: Привет.<text:s text:c="2"/><text:span text:style-name="T1">(тихо)</text:span> Да &amp; нет.</text:p><text:p text:style-name="P2">Входит Борис.</text:p><text:p>БОРИС:<text:line-break/>Пока.</text:p></office:text></office:body></office:document-content>';
const odtStyles='<office:document-styles><style:style style:name="Remark" style:family="paragraph"><style:text-properties fo:font-style="italic"/></style:style></office:document-styles>';
assert.equal(T.odtContentToText(odt,odtStyles),'Сцена 1\nАННА: Привет. [тихо] Да & нет.\n[Входит Борис.]\nБОРИС:\nПока.');
function zip(files){const locals=[],central=[];let offset=0;for(const [name,text] of files){const raw=Buffer.from(text),data=zlib.deflateRawSync(raw),n=Buffer.from(name);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(8,10);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(raw.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);locals.push(local,n,data);central.push(entry,n);offset+=30+n.length+data.length;}const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return new Uint8Array(Buffer.concat([...locals,dir,end]));}
(async()=>{assert.equal(await T.odtToText(zip([['content.xml',odt],['styles.xml',odtStyles]])),'Сцена 1\nАННА: Привет. [тихо] Да & нет.\n[Входит Борис.]\nБОРИС:\nПока.');
 await assert.rejects(T.odtToText(new Uint8Array([1,2,3])));
 console.log('File types passed: Windows-1251 and UTF-16 text, Rich Text (code pages, unicode, italics, skipped tables), OpenDocument (italic styles, spaces, line breaks).');})();
