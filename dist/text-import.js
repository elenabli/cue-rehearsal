/* More file types for the play importer: OpenDocument (.odt), Rich Text
   (.rtf) and plain text in older encodings. Each becomes the same plain
   text the PDF and Word importers produce: one paragraph per line, italic
   runs as [stage directions]. Nothing is uploaded. */
(function(root){
  const t=text=>root.CueI18n?root.CueI18n.t(text):text;
  const isHeading=s=>root.CuePdf?!!root.CuePdf.headingKind(s):/^(?:сцена|scene|действие|акт|act|картина|явление)(?=\s|[.:№\d]|$)/iu.test(s);
  // Runs [{italic,text}] → one line, italic parts in [brackets]. Headings
  // stay plain even when set in italics, so the play still splits there.
  function runsToLine(runs){
    const plain=runs.map(r=>r.text).join('').replace(/[ \t\u00a0]+/g,' ').trim();if(!plain)return '';if(isHeading(plain))return plain;
    const merged=[];for(const run of runs){const last=merged[merged.length-1];if(last&&last.italic===run.italic)last.text+=run.text;else merged.push({...run});}
    return merged.map(run=>run.italic&&run.text.trim()?' ['+run.text.trim().replace(/^\(([^()]*)\)$/,'$1').replace(/\[/g,'(').replace(/\]/g,')')+'] ':run.text).join('').replace(/[ \t\u00a0]+/g,' ').trim();
  }
  // ---- Plain text ----
  // UTF-8 first; a file that is not valid UTF-8 is read as UTF-16 when it
  // says so, otherwise as Windows-1251, the usual encoding of older Russian
  // text files (its punctuation matches Western Windows-1252).
  function decodeText(bytes){
    if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\ufeff/,'');}catch{}
    try{return new TextDecoder('windows-1251').decode(bytes);}catch{return new TextDecoder().decode(bytes);}
  }
  // ---- OpenDocument ----
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decodeXml=s=>s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1))):entities[e]??m);
  const attr=(tag,name)=>{const m=tag.match(new RegExp('\\b'+name+'="([^"]*)"'));return m?decodeXml(m[1]):null;};
  function odtStyles(...xmls){
    const styles={};for(const xml of xmls)for(const m of xml.matchAll(/<style:style\b([^>]*)(?:\/>|>([\s\S]*?)<\/style:style>)/g)){
      const name=attr(m[1],'style:name');if(!name)continue;const props=(m[2]||'').match(/<style:text-properties\b[^>]*>/)?.[0]||'';const font=attr(props,'fo:font-style');
      styles[name]={italic:font?font==='italic'||font==='oblique':undefined,parent:attr(m[1],'style:parent-style-name')};
    }
    const italic=(name,seen=new Set())=>{const s=styles[name];if(!s||seen.has(name))return undefined;seen.add(name);return s.italic??italic(s.parent,seen);};
    return name=>name?italic(name):undefined;
  }
  function odtContentToText(xml,stylesXml=''){
    const italicOf=odtStyles(stylesXml,xml);const body=(xml.match(/<office:text\b[^>]*>([\s\S]*)<\/office:text>/)||[,xml])[1];const out=[];
    for(const p of body.matchAll(/<text:(p|h)\b([^>]*)(?:\/>|>([\s\S]*?)<\/text:\1>)/g)){
      const base=!!italicOf(attr(p[2],'text:style-name'));const runs=[];const stack=[base];let line=[];
      const flush=()=>{out.push(runsToLine(line));line=[];};
      for(const token of (p[3]||'').matchAll(/<text:span\b([^>]*)>|<\/text:span>|<text:s\b([^>]*)\/>|<text:(tab|line-break)\b[^>]*\/>|<text:(?:note|annotation|tracked-changes)\b[\s\S]*?<\/text:(?:note|annotation|tracked-changes)>|<[^>]+>|([^<]+)/g)){
        const now=stack[stack.length-1];
        if(token[0].startsWith('<text:span'))stack.push(italicOf(attr(token[1],'text:style-name'))??now);
        else if(token[0]==='</text:span>'){if(stack.length>1)stack.pop();}
        else if(token[0].startsWith('<text:s'))line.push({italic:now,text:' '.repeat(Number(attr(token[2]||'','text:c'))||1)});
        else if(token[3]==='tab')line.push({italic:now,text:' '});
        else if(token[3]==='line-break')flush();
        else if(token[4])line.push({italic:now,text:decodeXml(token[4])});
      }
      flush();
    }
    return out.filter(Boolean).join('\n');
  }
  async function odtToText(bytes){
    const bad=()=>Error(t('This file does not appear to be an OpenDocument text. Choose another file.'));
    if(bytes[0]!==0x50||bytes[1]!==0x4b||!root.CueDocx)throw bad();
    const content=await root.CueDocx.unzipEntry(bytes,'content.xml');if(!content)throw bad();
    const styles=await root.CueDocx.unzipEntry(bytes,'styles.xml');const decoder=new TextDecoder();
    return odtContentToText(decoder.decode(content),styles?decoder.decode(styles):'');
  }
  // ---- Rich Text ----
  const SKIP=new Set(['fonttbl','colortbl','stylesheet','info','pict','header','headerl','headerr','headerf','footer','footerl','footerr','footerf','footnote','object','themedata','colorschememapping','latentstyles','datastore','generator','listtable','listoverridetable','rsidtbl','xmlnstbl','fldinst','filetbl','revtbl','mmathPr','pgdsctbl','wgrffmtfilter','bkmkstart','bkmkend','comment','annotation']);
  const CODEPAGES={1250:'windows-1250',1251:'windows-1251',1252:'windows-1252',1253:'windows-1253',1254:'windows-1254',1257:'windows-1257',10007:'x-mac-cyrillic',10000:'macintosh',866:'ibm866',65001:'utf-8'};
  // Font charsets name the code page of \'hh bytes for text set in that font.
  const CHARSETS={0:1252,204:1251,238:1250,161:1253,162:1254,186:1257,77:10000};
  function rtfToText(source){
    const rtf=typeof source==='string'?source:new TextDecoder('latin1').decode(source);
    if(!/^\s*\{\\rtf/.test(rtf))throw Error(t('This file does not appear to be a Rich Text document. Choose another file.'));
    let page=1252;const fonts={};const lines=[];let line=[];let pending=[];let pendingPage=0;
    let state={italic:false,skip:false,uc:1,font:null,table:false};const stack=[];let toSkip=0;
    const decoderFor=code=>{try{return new TextDecoder(CODEPAGES[code]||'windows-1252');}catch{return new TextDecoder('windows-1252');}};
    const emit=text=>{if(state.skip||state.table||!text)return;const last=line[line.length-1];if(last&&last.italic===state.italic)last.text+=text;else line.push({italic:state.italic,text});};
    const flushBytes=()=>{if(!pending.length)return;const text=decoderFor(pendingPage).decode(new Uint8Array(pending));pending=[];emit(text);};
    const endLine=()=>{flushBytes();if(!state.skip&&!state.table){lines.push(runsToLine(line));line=[];}};
    let currentFont=null;
    for(let i=0;i<rtf.length;){
      const c=rtf[i];
      if(c==='{'){flushBytes();stack.push({...state});i++;continue;}
      if(c==='}'){flushBytes();state=stack.pop()||state;i++;continue;}
      if(c==='\\'){
        const next=rtf[i+1];
        if(next==="'"){const byte=parseInt(rtf.substr(i+2,2),16);i+=4;if(toSkip){toSkip--;continue;}if(state.table||state.skip)continue;const code=fonts[state.font]||page;if(pending.length&&pendingPage!==code)flushBytes();pendingPage=code;pending.push(byte);continue;}
        if(next==='*'){state.skip=true;i+=2;continue;}
        if(next==='\\'||next==='{'||next==='}'){flushBytes();if(toSkip)toSkip--;else emit(next);i+=2;continue;}
        if(next==='~'){flushBytes();emit(' ');i+=2;continue;}if(next==='_'){flushBytes();emit('-');i+=2;continue;}
        if(next==='\n'||next==='\r'){endLine();i+=2;continue;}
        const m=/^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i,i+40));if(!m){i+=2;continue;}
        i+=m[0].length;const word=m[1],number=m[2]===undefined?null:Number(m[2]);flushBytes();
        if(SKIP.has(word)){if(word==='fonttbl'){state.table=true;}else state.skip=true;continue;}
        if(state.table){if(word==='f')currentFont=number;else if(word==='fcharset'&&currentFont!==null&&CHARSETS[number])fonts[currentFont]=CHARSETS[number];continue;}
        switch(word){
          case 'ansicpg':if(CODEPAGES[number])page=number;break;
          case 'mac':page=10000;break;
          case 'par':case 'line':case 'sect':case 'page':case 'row':endLine();break;
          case 'tab':case 'cell':emit(' ');break;
          case 'i':state.italic=number!==0;break;
          case 'plain':state.italic=false;break;
          case 'pard':break;
          case 'f':state.font=number;break;
          case 'uc':state.uc=number??1;break;
          case 'u':if(number!==null){emit(String.fromCharCode(number<0?number+65536:number));toSkip=state.uc;}break;
          case 'emdash':emit('—');break;case 'endash':emit('–');break;case 'bullet':emit('•');break;
          case 'lquote':emit('‘');break;case 'rquote':emit('’');break;case 'ldblquote':emit('“');break;case 'rdblquote':emit('”');break;
        }
        continue;
      }
      if(c==='\r'||c==='\n'){i++;continue;}
      if(toSkip){toSkip--;i++;continue;}
      flushBytes();
      // Plain characters run until the next control character.
      let end=i;while(end<rtf.length&&!'\\{}\r\n'.includes(rtf[end]))end++;emit(rtf.slice(i,end));i=end;
    }
    endLine();
    return lines.filter(Boolean).join('\n');
  }
  const api={decodeText,odtContentToText,odtToText,rtfToText,runsToLine};root.CueText=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
