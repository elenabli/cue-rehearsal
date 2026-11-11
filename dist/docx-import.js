/* Word (.docx) import. A .docx file is a ZIP archive of XML parts; we unzip
   it in the browser and turn word/document.xml into the same plain text the
   PDF importer produces: one paragraph per line, italic runs as [stage
   directions]. Nothing is uploaded. Headers, footers and footnotes live in
   other parts and are ignored, so page numbers never reach the script. */
(function(root){
  async function inflateRaw(bytes){
    if(typeof DecompressionStream==='undefined')throw Error('This browser can’t open Word files. Update it, or save the play as PDF and import that.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  // Read one entry of a ZIP archive through its central directory.
  async function unzipEntry(bytes,wanted){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('This file does not appear to be a Word document. Choose another file.');
    const count=view.getUint16(end+10,true);let p=view.getUint32(end+16,true);const decoder=new TextDecoder();
    for(let n=0;n<count&&p+46<=bytes.length&&view.getUint32(p,true)===0x02014b50;n++){
      const method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
      const name=decoder.decode(bytes.subarray(p+46,p+46+nameLength));p+=46+nameLength+extra+comment;
      if(name!==wanted)continue;
      const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),data=bytes.subarray(start,start+size);
      if(method===0)return data;if(method===8)return inflateRaw(data);
      throw Error('This Word file uses an unsupported compression. Save it again in Word or Pages and retry.');
    }
    return null;
  }
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1))):entities[e]??m);
  const attr=(tag,name)=>{const m=tag.match(new RegExp('\\b'+name+'="([^"]*)"'));return m?decode(m[1]):null;};
  // <w:i/> turns italic on; w:val="0"/"false"/"none" turns it off.
  function toggle(props,name){const m=props.match(new RegExp('<w:'+name+'(?:\\s[^>]*)?/?>'));if(!m)return undefined;const v=attr(m[0],'w:val');return !(v==='0'||v==='false'||v==='off'||v==='none');}
  function runProps(xml){const m=xml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);const props=m?m[1]:'';return {italic:toggle(props,'i'),caps:toggle(props,'caps')??toggle(props,'smallCaps'),style:attr(props.match(/<w:rStyle\b[^>]*>/)?.[0]||'','w:val')};}
  // Styles may make whole paragraphs italic (e.g. a «Ремарка» style) or set
  // names in capitals. Resolve each style through its basedOn chain.
  function parseStyles(xml){
    const styles={};let defaults={};
    const dflt=xml.match(/<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/);if(dflt)defaults=runProps(dflt[1]);
    for(const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)){
      const id=attr(m[1],'w:styleId');if(!id)continue;const props=runProps(m[2]);
      styles[id]={...props,basedOn:attr(m[2].match(/<w:basedOn\b[^>]*>/)?.[0]||'','w:val')};
    }
    const resolve=(id,key,seen=new Set())=>{const s=styles[id];if(!s||seen.has(id))return undefined;seen.add(id);return s[key]??resolve(s.basedOn,key,seen);};
    return {get:(id,key)=>(id&&resolve(id,key))??defaults[key]};
  }
  function paragraphText(xml,styles,headingOf){
    const pPr=xml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1]||'';const pStyle=attr(pPr.match(/<w:pStyle\b[^>]*>/)?.[0]||'','w:val');
    const runs=[];
    // Runs, including those inside hyperlinks, fields and smart tags. Deleted
    // revisions (w:delText) and field codes (w:instrText) are skipped.
    for(const r of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)){
      const own=runProps(r[1]);const pick=key=>own[key]??styles.get(own.style,key)??styles.get(pStyle,key)??false;
      let text='';for(const t of r[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>|<w:(tab|br|cr|noBreakHyphen)\b[^>]*\/>/g)){
        if(t[2]==='tab')text+=' ';else if(t[2]==='br'||t[2]==='cr')text+='\n';else if(t[2]==='noBreakHyphen')text+='-';else if(t[1])text+=decode(t[1]);
      }
      if(!text)continue;if(pick('caps'))text=text.toLocaleUpperCase();
      const italic=!!pick('italic'),last=runs[runs.length-1];if(last&&last.italic===italic)last.text+=text;else runs.push({italic,text});
    }
    const plain=runs.map(r=>r.text).join('');
    return plain.split('\n').map(line=>line.trim()).filter(Boolean).length>1&&runs.every(r=>!r.italic)?plain:
      headingOf(plain.trim())?plain.trim():runs.map(run=>run.italic&&run.text.trim()?' ['+run.text.trim().replace(/^\(([^()]*)\)$/,'$1').replace(/\[/g,'(').replace(/\]/g,')')+'] ':run.text).join('');
  }
  // Scene headings stay plain even when set in italics, so they still split.
  const sceneHeading=s=>/^(?:сцена|scene|действие|акт|act|картина)(?=\s|[.:№\d]|$)/iu.test(s);
  function documentXmlToText(xml,stylesXml='',headingOf=sceneHeading){
    const styles=parseStyles(stylesXml);const body=(xml.match(/<w:body>([\s\S]*)<\/w:body>/)||[,xml])[1];const out=[];
    // Walk paragraphs and table rows in document order. A two-column table
    // row («ИМЯ | реплика») becomes «ИМЯ: реплика».
    for(const block of body.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>|<w:p\b(?:[^>]*\/>|[\s\S]*?<\/w:p>)/g)){
      if(block[0].startsWith('<w:tr')){
        const cells=[...block[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(c=>[...c[0].matchAll(/<w:p\b(?:[^>]*\/>|[\s\S]*?<\/w:p>)/g)].map(p=>paragraphText(p[0],styles,headingOf)).join(' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean);
        if(cells.length===2&&cells[0].length<=45&&!/[:：]$/.test(cells[0]))out.push(cells[0].replace(/\.$/,'')+': '+cells[1]);else if(cells.length)out.push(cells.join(' '));
        continue;
      }
      for(const line of paragraphText(block[0],styles,headingOf).split('\n'))out.push(line.replace(/ /g,' ').replace(/[ \t]+/g,' ').trim());
    }
    return out.filter(Boolean).join('\n');
  }
  async function docxToText(bytes,headingOf=sceneHeading){
    if(bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0)throw Error('This is an older Word .doc file. Open it in Word or Pages, save it as .docx or PDF, and import that.');
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('This file does not appear to be a Word document. Choose another file.');
    const doc=await unzipEntry(bytes,'word/document.xml');if(!doc)throw Error('This file does not appear to be a Word document. Choose another file.');
    const styles=await unzipEntry(bytes,'word/styles.xml');const decoder=new TextDecoder();
    return documentXmlToText(decoder.decode(doc),styles?decoder.decode(styles):'',headingOf);
  }
  const api={unzipEntry,documentXmlToText,docxToText};root.CueDocx=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
