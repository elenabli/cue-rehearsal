(function(root){
  function normalize(text){return text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}\s']/gu,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();}
  function speakerKey(name){return name.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[.\s]+/g,' ').trim();}
  function resolveSpeaker(label,cast=[]){
    const key=speakerKey(label);const exact=cast.find(name=>speakerKey(name)===key);if(exact)return exact;
    const aliases=cast.filter(name=>speakerKey(name).split(' ')[0]===key);return aliases.length===1?aliases[0]:null;
  }
  function isSpeakerName(name){return name.length<=60&&/^[\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*){0,3}$/u.test(name);}
  function pageNumberInfo(row){
    const text=row.trim().replace(/^\[([^\]]*)\]$/,'$1').trim();
    const match=text.match(/^(?:(стр(?:аница)?\.?|page)\s*)?(\d{1,4})[.\s]*(?:[/／]|из|of)[.\s]*(\d{1,4})[.\s]*$/iu);
    if(!match){const solo=text.match(/^(?:стр(?:аница)?\.?|page)\s*(\d{1,4})\.?$/iu);return solo?{current:Number(solo[1]),total:null,explicit:true}:null;}const current=Number(match[2]),total=Number(match[3]);
    return current>0&&current<=total?{current,total,explicit:!!match[1]||/\d\.\s*[/／]/u.test(text)}:null;
  }
  function paginationTotals(text){const seen=new Map();for(const row of text.split(/\r?\n/)){const info=pageNumberInfo(row);if(info&&info.total!==null){if(!seen.has(info.total))seen.set(info.total,new Set());seen.get(info.total).add(info.current);}}return [...seen].filter(([total,pages])=>total>=10&&pages.size>=2).map(([total])=>total);}
  function cleanPaginationText(text,totals=paginationTotals(text)){
    return text.split(/\r?\n/).filter(row=>{const info=pageNumberInfo(row);return !info||(!info.explicit&&!totals.includes(info.total));}).join('\n').replace(/(?:^|[ \t])\d{1,4}\.[ \t]*[/／][ \t]*\d{1,4}\.?(?=[ \t]*(?:$|\[))/gm,marker=>pageNumberInfo(marker.trim())?'':marker);
  }
  function parseScript(text,cast=[]){const lines=[];let current=null;const pending=[];for(const raw of cleanPaginationText(text).split(/\r?\n/)){const s=raw.trim();if(!s)continue;const match=s.match(/^([^:\[\]]{1,60}):\s*(.*)$/u);const speaker=match?(cast.length?resolveSpeaker(match[1].trim(),cast):(isSpeakerName(match[1].trim())?match[1].trim():null)):null;
    if(speaker){current={speaker,text:[...pending,match[2].trim()].join(' ').trim()};pending.length=0;lines.push(current);}else if(current){current.text+=' '+s;}else if(/^\[.*\]$/.test(s)){pending.push(s);}else{throw new Error('Start each speech with CHARACTER: dialogue.');}}
    return lines.map(l=>({...l,text:flattenBrackets(l.text)})).map(l=>({...l,text:l.text.replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim(),direction:(l.text.match(/\[[^\]]*\]/g)||[]).join(' ')})).filter(l=>l.text);
  }
  // Nested or unbalanced brackets, e.g. «[[кричит]]», collapse to one level.
  function flattenBrackets(text){let depth=0,out='';for(const char of text){if(char==='['){if(!depth++)out+=char;}else if(char===']'){if(depth&&!--depth)out+=char;}else out+=char;}return depth?out+']':out;}
  function matches(expected,actual){const a=normalize(expected),b=normalize(actual);return !!a&&a===b;}
  const api={flattenBrackets,pageNumberInfo,paginationTotals,cleanPaginationText,normalize,speakerKey,resolveSpeaker,isSpeakerName,parseScript,matches};root.CueCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
