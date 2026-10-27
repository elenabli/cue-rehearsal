/* Layout and play-format helpers, shared by the importer and tests. */
(function(root){
  function textItemsToLines(items){
    const rows=[];
    for(const item of items){
      if(typeof item.str!=='string'||!item.str.trim())continue;
      const x=item.transform?.[4]||0,y=item.transform?.[5]||0;
      const height=Math.max(Math.abs(item.transform?.[3]||0),item.height||0,1);
      let row=rows.find(r=>Math.abs(r.y-y)<Math.min(r.height,height)*.35);
      if(!row){row={y,height,items:[]};rows.push(row);}
      row.items.push({text:item.str,x,width:item.width||0});
    }
    return rows.sort((a,b)=>b.y-a.y).map(row=>{
      const ordered=row.items.sort((a,b)=>a.x-b.x);let text='',end=null;
      for(const i of ordered){if(end!==null&&i.x-end>1&&!text.endsWith(' ')&&!i.text.startsWith(' '))text+=' ';text+=i.text;end=i.x+i.width;}
      return text.trim();
    }).filter(Boolean).join('\n');
  }
  function isHeading(s){return /^(?:(?:ACT|SCENE|PART|CHAPTER|PAGE|АКТ|СЦЕНА|ДЕЙСТВИЕ|КАРТИНА)\b.*|[IVXLCDM]+\.?|\d+[.\s]*|DRAMATIS PERSONAE|CHARACTERS|CAST(?: OF CHARACTERS)?|THE END|CURTAIN|FINIS)$/iu.test(s);}
  function standaloneName(s){return s.length<=45&&/\p{L}/u.test(s)&&s===s.toLocaleUpperCase()&&!/[\[\]():!?;“”"0-9]/u.test(s)&&s.split(/\s+/).length<=4&&!isHeading(s);}
  function convertPlayText(text){
    const rows=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    const speechPattern=/^([\p{L}][\p{L}\p{M}\s'’.-]{0,44}?)(?:\s*[:：]\s*|[.\u2014\u2013]\s+)(.*)$/u;
    const candidates=new Set();
    for(const row of rows){const m=row.match(speechPattern);if(m&&m[1]===m[1].toLocaleUpperCase()&&!isHeading(m[1]))candidates.add(m[1].replace(/\.$/,'').trim());else if(standaloneName(row.replace(/\.$/,'')))candidates.add(row.replace(/\.$/,'').trim());}
    const out=[];let started=false;let stageDepth=0;
    for(const row of rows){if(isHeading(row))continue;
      const m=row.match(speechPattern);const name=m?.[1].replace(/\.$/,'').trim();
      if(m&&((candidates.has(name))||row.includes(':')||row.includes('：'))&&!isHeading(name)){out.push(`${name}: ${m[2]}`);started=true;continue;}
      const clean=row.replace(/\.$/,'');if(candidates.has(clean)){out.push(`${clean}:`);started=true;continue;}
      if(started){let dialogue='';for(const char of row){if(char==='('){stageDepth++;dialogue+='[';}else if(char===')'&&stageDepth){stageDepth--;dialogue+=']';}else dialogue+=char;}out.push(dialogue);}
    }
    return out.length?out.join('\n'):text;
  }
  const api={textItemsToLines,convertPlayText};root.CuePdf=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
