/* Layout and play-format helpers, shared by the importer and tests. */
(function(root){
  function textItemsToLines(items,styles={}){
    const rows=[];
    for(const item of items){
      if(typeof item.str!=='string'||!item.str.trim())continue;
      const x=item.transform?.[4]||0,y=item.transform?.[5]||0;
      const height=Math.max(Math.abs(item.transform?.[3]||0),item.height||0,1);
      let row=rows.find(r=>Math.abs(r.y-y)<Math.min(r.height,height)*.35);
      if(!row){row={y,height,items:[]};rows.push(row);}
      const style=styles[item.fontName]||{};
      const italic=style.italic===true||/italic|oblique|kursiv/i.test((style.fontFamily||'')+' '+(style.fontName||'')+' '+(style.fontSubstitution||''));
      row.items.push({text:item.str,x,width:item.width||0,italic});
    }
    return rows.sort((a,b)=>b.y-a.y).map(row=>{
      const ordered=row.items.sort((a,b)=>a.x-b.x);let plain='',end=null;const runs=[];
      for(const item of ordered){const gap=end!==null&&item.x-end>1&&!plain.endsWith(' ')&&!item.text.startsWith(' ')?' ':'';const text=gap+item.text;plain+=text;const last=runs[runs.length-1];if(last&&last.italic===item.italic)last.text+=text;else runs.push({italic:item.italic,text});end=item.x+item.width;}
      // Scene headings must remain searchable even when typeset in italics.
      if(isHeading(plain.trim()))return plain.trim();
      return runs.map(run=>run.italic&&run.text.trim()?' ['+run.text.trim().replace(/\[/g,'(').replace(/\]/g,')')+'] ':run.text).join('').replace(/[ \t]+/g,' ').trim();
    }).filter(Boolean).join('\n');
  }
  function fontIsItalic(font){
    if(font.italic===true||/italic|oblique|kursiv/i.test(font.name||'')||Number(font.cssFontInfo?.italicAngle))return true;
    // Some subset fonts have opaque names. Consult their OpenType flags/angle.
    const data=font.data;if(!data||data.byteLength<12)return false;
    try{const view=new DataView(data.buffer,data.byteOffset,data.byteLength);const count=view.getUint16(4);
      for(let i=0;i<count&&12+(i+1)*16<=view.byteLength;i++){
        const base=12+i*16,tag=view.getUint32(base),offset=view.getUint32(base+8),length=view.getUint32(base+12);
        if(offset+length>view.byteLength)continue;
        if(tag===0x706f7374&&length>=8&&view.getInt32(offset+4)!==0)return true; // post: italic angle
        if(tag===0x68656164&&length>=46&&(view.getUint16(offset+44)&2))return true; // head: macStyle
        if(tag===0x4f532f32&&length>=64&&(view.getUint16(offset+62)&0x201))return true; // OS/2: italic or oblique
      }
    }catch{}return false;
  }
  async function extractPageText(page){
    const content=await page.getTextContent();if(!content.items.some(item=>item.str?.trim()))return '';
    // TextContent uses anonymous font IDs; load the pinned PDF.js font objects
    // so embedded italic fonts remain detectable even with subset font names.
    await page.getOperatorList({annotationMode:0});
    const styles={...content.styles};
    for(const name of new Set(content.items.map(item=>item.fontName).filter(Boolean))){
      if(page.commonObjs.has(name)){const font=page.commonObjs.get(name);styles[name]={...styles[name],fontName:font.name||'',italic:fontIsItalic(font)||styles[name]?.italic===true};}
    }
    return textItemsToLines(content.items,styles);
  }
  function isHeading(s){return /^(?:(?:ACT|SCENE|PART|CHAPTER|PAGE|АКТ|СЦЕНА|ДЕЙСТВИЕ|КАРТИНА)(?=\s|[.:№]|$).*|[IVXLCDM]+\.?|\d+[.\s]*|DRAMATIS PERSONAE|CHARACTERS|CAST(?: OF CHARACTERS)?|THE END|CURTAIN|FINIS)$/iu.test(s);}
  function standaloneName(s){return s.length<=45&&/\p{L}/u.test(s)&&s===s.toLocaleUpperCase()&&!/[\[\]():!?;“”"0-9]/u.test(s)&&s.split(/\s+/).length<=4&&!isHeading(s);}
  function convertPlayText(text){
    const rows=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    const speechPattern=/^([\p{L}][\p{L}\p{M}\s'’.-]{0,44}?)(?:\s*[:：]\s*|[.\u2014\u2013]\s+)(.*)$/u;
    const candidates=new Set();
    for(const row of rows){const m=row.match(speechPattern);if(m&&m[1]===m[1].toLocaleUpperCase()&&!isHeading(m[1]))candidates.add(m[1].replace(/\.$/,'').trim());else if(standaloneName(row.replace(/\.$/,'')))candidates.add(row.replace(/\.$/,'').trim());}
    const out=[];const leading=[];let started=false;let stageDepth=0;
    for(const row of rows){if(isHeading(row))continue;
      const m=row.match(speechPattern);const name=m?.[1].replace(/\.$/,'').trim();
      if(m&&((candidates.has(name))||row.includes(':')||row.includes('：'))&&!isHeading(name)){if(!started)out.push(...leading);out.push(`${name}: ${m[2]}`);started=true;continue;}
      const clean=row.replace(/\.$/,'');if(candidates.has(clean)){if(!started)out.push(...leading);out.push(`${clean}:`);started=true;continue;}
      if(started){let dialogue='';for(const char of row){if(char==='('){stageDepth++;dialogue+='[';}else if(char===')'&&stageDepth){stageDepth--;dialogue+=']';}else dialogue+=char;}out.push(dialogue);}else if(/^\[.*\]$/.test(row))leading.push(row);
    }
    return out.length?out.join('\n'):text;
  }
  // Only headings at the beginning of a line delimit scenes. Numbering may
  // restart in a later act; each occurrence remains a separate scene.
  function splitPlayScenes(text){
    const rows=text.replace(/\r/g,'').split('\n');const scenes=[];const preamble=[];let current=null;
    const heading=/^\s*((?:сцена|scene)\s*(?:№\s*|no\.?\s*)?(?:\(\s*)?(?:\d+|[IVXLCDM]+)(?:\s*\))?(?=$|[\s.:—–-]).*)$/iu;
    for(const row of rows){
      const match=row.replace(/\u00a0/g,' ').match(heading);
      if(match){current={title:match[1].trim(),script:''};scenes.push(current);}
      else if(current)current.script+=(current.script?'\n':'')+row;
      else preamble.push(row);
    }
    return {preamble:preamble.join('\n').trim(),scenes:scenes.map(scene=>({...scene,script:scene.script.trim()}))};
  }
  function preparePlayText(text){
    const {scenes}=splitPlayScenes(text);
    return scenes.length?scenes.map(scene=>scene.title+'\n'+convertPlayText(scene.script)).join('\n\n'):convertPlayText(text);
  }
  const api={fontIsItalic,textItemsToLines,extractPageText,convertPlayText,splitPlayScenes,preparePlayText};root.CuePdf=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
