/* Layout and play-format helpers, shared by the importer and tests. */
(function(root){
  function textItemsToLines(items,styles={},pageBox=null){
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
      // Remove only isolated number-like rows in the page margins. Numeric
      // dialogue in the body (including fractions) must remain spoken text.
      const rowText=plain.trim();
      if(pageBox&&pageBox.length===4){const height=pageBox[3]-pageBox[1];const margin=row.y<=pageBox[1]+height*.08||row.y>=pageBox[3]-height*.08;
        const numbered=/^(?:(?:стр(?:аница)?\.?|page)\s*)?(?:[—–-]\s*)?(?:\d{1,4}|[IVXLCDM]+)[.\s]*(?:(?:[/／]|из|of)[.\s]*\d{1,4}[.\s]*)?(?:[—–-])?$/iu.test(rowText);
        if(margin&&numbered)return '';
      }
      // Scene headings must remain searchable even when typeset in italics.
      if(isHeading(plain.trim()))return plain.trim();
      return runs.map(run=>run.italic&&run.text.trim()?' ['+run.text.trim().replace(/^\(([^()]*)\)$/,'$1').replace(/\[/g,'(').replace(/\]/g,')')+'] ':run.text).join('').replace(/[ \t]+/g,' ').trim();
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
    return textItemsToLines(content.items,styles,page.view);
  }
  // A keyword only marks a heading when typeset in capitals or followed by a
  // number, so wrapped dialogue such as «действие лекарства…» is kept.
  function isHeading(s){
    if(/^(?:[IVXLCDM]+\.?|DRAMATIS PERSONAE|CHARACTERS|CAST(?: OF CHARACTERS)?|THE END|CURTAIN|FINIS)$/iu.test(s))return true;
    const m=s.match(/^(ACT|SCENE|PART|CHAPTER|PAGE|АКТ|СЦЕНА|ДЕЙСТВИЕ|КАРТИНА)(?=\s|[.:№]|$)(.*)$/iu);if(!m)return false;
    return m[1]===m[1].toLocaleUpperCase()||/^\s*[.:]?\s*(?:№\s*)?(?:\d+|[IVXLCDM]+)(?=$|[\s.:—–-])/u.test(m[2])||/^\s*(?:перв|втор|трет|четв[её]рт|пят|шест|one|two|three|four|five|first|second|third)\p{L}*\.?$/iu.test(m[2]);
  }
  function standaloneName(s){return s.length<=45&&/\p{L}/u.test(s)&&s===s.toLocaleUpperCase()&&!/[\[\]():!?;“”"0-9]/u.test(s)&&s.split(/\s+/).length<=4&&!isHeading(s);}
  function extractCast(text){
    const preamble=splitPlayScenes(text).preamble||(!splitPlayScenes(text).scenes.length?text:'');
    const rows=preamble.split(/\r?\n/).map(row=>row.replace(/[\[\]]/g,'').trim());let active=false;const names=[];
    const namePattern=/^[\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*){0,3}$/u;
    for(let row of rows){if(/^(?:действующие\s+лица(?:\s+и\s+исполнители)?|персонажи|герои|список\s+персонажей|роли|в\s+ролях|dramatis\s+personae|cast(?:\s+of\s+characters)?|characters)\s*[:.]?$/iu.test(row)){active=true;continue;}if(!active)continue;
      if(/^(?:место|время|действие|примечани|об авторе|содержание|акт|act|setting|notes)(?=\s|[.:]|$)/iu.test(row))break;
      row=row.replace(/^(?:[•*—–-]|\d+[.)])\s*/,'');const name=row.split(/\s+[—–-]\s*|[,:(]/)[0].replace(/[:.;]+$/,'').trim();
      if(namePattern.test(name)&&!isHeading(name)&&!names.some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase()))names.push(name);
    }
    if(!names.length&&!active){
      const speechLabels=splitPlayScenes(text).scenes.flatMap(scene=>scene.script.split('\n').map(row=>row.trim().split(/[:：.]|[—–]/)[0].trim()).filter(name=>namePattern.test(name)));
      for(let row of rows){const name=row.replace(/^(?:[•*—–-]|\d+[.)])\s*/,'').split(/\s+[—–-]\s*|[,:(]/)[0].replace(/[:.;]+$/,'').trim();if(namePattern.test(name)&&!isHeading(name)&&speechLabels.some(label=>castResolve(label,[name]))&&!names.includes(name))names.push(name);}
    }
    // Rosters often miss or misspell roles. Add all-caps labels that open at
    // least two speeches, so unlisted characters keep their own lines.
    const counts=new Map();
    for(const row of (splitPlayScenes(text).scenes.map(scene=>scene.script).join('\n')||text).split(/\r?\n/)){
      const m=row.trim().match(/^([\p{Lu}][\p{Lu}\p{M}\d'’ -]{1,44}?)\s*(?:\([^)]*\)\s*)?(?:[:：]|\.(?=\s))\s*(.*)$/u);
      if(!m||!/\p{Ll}/u.test(m[2])||!/\p{Lu}.*\p{Lu}/u.test(m[1]))continue;const label=m[1].trim();
      if(isHeading(label)||names.some(name=>castResolve(label,[name])))continue;counts.set(label,(counts.get(label)||0)+1);
    }
    for(const [label,count] of counts)if(count>=2)names.push(label);
    return names;
  }
  function convertWithCast(text,cast){
    const out=[];let started=false;const leading=[];let directionDepth=0;
    for(const raw of text.replace(/\r/g,'').split('\n')){const row=raw.trim();if(!row||isHeading(row))continue;
      let label=null,rest='',aside='';if(!directionDepth){
        const m=row.match(/^([^:\[\]]{1,60}?)(?:\s*\(([^)]*)\))?\s*(?:[:：.]\s*|[—–]\s*)(.*)$/u);
        if(m){label=castResolve(m[1],cast);rest=m[3];aside=m[2]||'';}if(!label)label=castResolve(row.replace(/[:.]$/,''),cast);
      }
      if(label){if(!started)out.push(...leading);out.push(label+': '+(aside?'['+aside+'] ':'')+rest.replace(/\(([^)]*)\)/g,'[$1]'));started=true;continue;}
      let clean='';for(const char of row){if(char==='('){directionDepth++;clean+='[';}else if(char===')'&&directionDepth){directionDepth--;clean+=']';}else clean+=char;}
      if(started)out.push(clean);else leading.push(/^\[.*\]$/.test(clean)?clean:'['+clean+']');
    }return started?out.join('\n'):text;
  }
  function castResolve(label,cast){const key=name=>name.toLocaleLowerCase().replace(/ё/g,'е').replace(/[.\s]+/g,' ').trim();const value=key(label);const exact=cast.find(name=>key(name)===value);if(exact)return exact;const short=cast.filter(name=>key(name).split(' ')[0]===value);return short.length===1?short[0]:null;}
  function convertPlayText(text,cast=[]){
    if(cast.length)return convertWithCast(text,cast);
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
    const heading=/^\s*((?:сцена|scene)\s*[.:]?\s*(?:№\s*|no\.?\s*)?(?:\(\s*)?(?:\d+|[IVXLCDM]+)(?:\s*\))?(?=$|[\s.:—–-]).*)$/iu;
    for(const row of rows){
      const match=row.replace(/\u00a0/g,' ').match(heading);
      if(match){current={title:match[1].trim(),script:''};scenes.push(current);}
      else if(current)current.script+=(current.script?'\n':'')+row;
      else preamble.push(row);
    }
    return {preamble:preamble.join('\n').trim(),scenes:scenes.map(scene=>({...scene,script:scene.script.trim()}))};
  }
  function preparePlayText(text){
    const {scenes}=splitPlayScenes(text),cast=extractCast(text);const header=cast.length?'ДЕЙСТВУЮЩИЕ ЛИЦА\n'+cast.join('\n')+'\n\n':'';
    return scenes.length?header+scenes.map(scene=>scene.title+'\n'+convertPlayText(scene.script,cast)).join('\n\n'):convertPlayText(text);
  }
  const api={extractCast,fontIsItalic,textItemsToLines,extractPageText,convertPlayText,splitPlayScenes,preparePlayText};root.CuePdf=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
