const assert=require('node:assert/strict');const zlib=require('node:zlib');
const {docxToText,documentXmlToText}=require('../dist/docx-import.js');
const {preparePlayText,splitPlayScenes,extractCast,speakTranscriptions}=require('../dist/pdf-import.js');
const {parseScript,matches}=require('../dist/core.js');
// A minimal .docx: a ZIP with word/document.xml (deflated) and styles (stored).
function zip(files){const locals=[],central=[];let offset=0;
  for(const [name,text,deflate] of files){const raw=Buffer.from(text),data=deflate?zlib.deflateRawSync(raw):raw,n=Buffer.from(name);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(deflate?8:0,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(n.length,26);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(deflate?8:0,10);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(raw.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);
    locals.push(local,n,data);central.push(entry,n);offset+=30+n.length+data.length;}
  const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return new Uint8Array(Buffer.concat([...locals,dir,end]));}
const p=(runs,style='')=>`<w:p>${style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:''}${runs}</w:p>`;
const r=(text,props='')=>`<w:r>${props?`<w:rPr>${props}</w:rPr>`:''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const body=[p(r('Сцена 1','<w:i/>')),p(r('Сергей','<w:caps/>')+r(': Привет &amp; пока.')),p(r('Светлана нервно смотрит.'),'Remark'),p(r('СВЕТЛАНА: Подожди')+r(' (тихо)','<w:i/>')+r(' меня.')),
  '<w:tbl><w:tr><w:tc>'+p(r('СЕРГЕЙ'))+'</w:tc><w:tc>'+p(r('Нет.'))+'</w:tc></w:tr></w:tbl>',p('<w:r><w:delText>удалено</w:delText></w:r>'+r('Сцена 2')),p(r('СЕРГЕЙ: Да.'))].join('');
const styles='<w:styles><w:style w:styleId="Base"><w:rPr><w:i/></w:rPr></w:style><w:style w:styleId="Remark"><w:basedOn w:val="Base"/></w:style></w:styles>';
(async()=>{
  const text=await docxToText(zip([['word/document.xml',`<w:document><w:body>${body}</w:body></w:document>`,true],['word/styles.xml',styles,false]]));
  assert.equal(text,'Сцена 1\nСЕРГЕЙ: Привет & пока.\n[Светлана нервно смотрит.]\nСВЕТЛАНА: Подожди [тихо] меня.\nСЕРГЕЙ: Нет.\nСцена 2\nСЕРГЕЙ: Да.');
  const scenes=splitPlayScenes(preparePlayText(text)).scenes;assert.equal(scenes.length,2);assert.equal(parseScript(scenes[0].script)[1].text,'Подожди меня.');
  await assert.rejects(docxToText(new Uint8Array([0xd0,0xcf,0x11,0xe0,0,0])),/older Word \.doc/);
  await assert.rejects(docxToText(new Uint8Array([1,2,3,4])),/not appear to be a Word/);
  // Scenes marked «( 4 A )» or by all-caps place names become «Сцена …».
  const numbered='ДЕЙСТВУЮЩИЕ ЛИЦА:\nМеган Мейер — девочка.\nТина Мейер — мать.\n( 0 )\nПЕРЕД ДОМОМ. ВЕЧЕР.\nМеган и Тина.\nМЕГАН: Привет!\nТИНА: Привет.\n( 4 A )\nMYSPACE\nМЕГАН: Пишу.\nТуомас Тимонен\nИНТЕРВЬЮ\n1.\nТИНА: Мы уехали.';
  const n=splitPlayScenes(preparePlayText(numbered)).scenes;assert.deepEqual(n.map(s=>s.title),['Сцена 0. ПЕРЕД ДОМОМ. ВЕЧЕР','Сцена 4 A. MYSPACE','Сцена 1 · ИНТЕРВЬЮ']);
  assert.equal(parseScript(n[0].script,extractCast(preparePlayText(numbered)))[0].direction,'[Меган и Тина.]');assert.equal(parseScript(n[1].script,['Меган Мейер'])[0].text,'Пишу.','A title page between parts is not spoken');
  const places='САРА\nДОМ У ДОРОГИ\n'+'МАТЬ: Тише.\nСАРА: Мамма!\n'.repeat(3)+'ПОЕЗД (Станция)\nПАППА: Пора.\nПАППА: Идём.\nСАРА: Иду.\nПАППА - Не стоит.';
  const pl=splitPlayScenes(preparePlayText(places)).scenes;assert.deepEqual(pl.map(s=>s.title),['Сцена 1. ДОМ У ДОРОГИ','Сцена 2. ПОЕЗД (Станция)']);assert.equal(parseScript(pl[1].script,extractCast(preparePlayText(places))).pop().speaker,'ПАППА');
  assert.equal(splitPlayScenes(preparePlayText('ЕЛЕНА\nПривет.\nДЖЕЙМС\nПока.\nЕЛЕНА\nДа.')).scenes.length,0,'Names on their own line are not scene headings');
  // Transcribed foreign words are what the actor says.
  assert.equal(speakTranscriptions('САРА: Det är mitt! [Дэ эр митт!] Ура.'),'САРА: Дэ эр митт! [Det är mitt!] Ура.');
  assert.equal(speakTranscriptions('ЛЁХА: Окей, bro [смеётся].'),'ЛЁХА: Окей, bro [смеётся].');
  assert(matches('Ста́ккарс ли́лла Са́ра','стаккарс лилла сара'),'Stress marks are ignored when checking');
  console.log('Word import passed: unzip, italics and styles, caps, tables, tracked deletions, old .doc, numbered and place-name scenes, one-line characters, transcriptions.');
})().catch(e=>{console.error(e);process.exit(1);});
