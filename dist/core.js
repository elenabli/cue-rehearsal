(function(root){
  // Stretched or stammered words («ну-у», «да-а-а», «н-нет», «нууу») are written for the actor; speech recognition hears the plain word.
  function unstretch(text){return text.replace(/(\p{L})(?:[-‐‑]\1+)+(?!\p{L})/gu,'$1').replace(/(?<!\p{L})(\p{L})[-‐‑](?=\1)/gu,'').replace(/(\p{L})\1{2,}/gu,'$1');}
  function normalize(text){return unstretch(text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[’‘]/g,"'")).replace(/[^\p{L}\p{N}\s']/gu,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();}
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
  function editDistance(a,b,same=(x,y)=>x===y){let prev=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(same(a[i-1],b[j-1])?0:1));prev=row;}return prev[b.length];}
  // Recognition often misses an ending («нормальна») or splits a word («все таки»), so long lines forgive a little.
  function closeWords(a,b){return a===b||(Math.min(a.length,b.length)>=4&&editDistance(a,b)<=1);}
  function matches(expected,actual){const a=normalize(expected),b=normalize(actual);if(!a||!b)return false;if(a===b||a.replace(/ /g,'')===b.replace(/ /g,''))return true;const words=a.split(' ');return editDistance(words,b.split(' '),closeWords)<=Math.floor(words.length/5);}
  // Word-by-word comparison for feedback (a substitution costs more than one skip, so matching words line up): same, missing (not said), extra (said, not in the line), changed (said something else).
  function diffWords(expected,actual){
    const want=expected.split(/\s+/).map(word=>({word,key:normalize(word)})).filter(w=>w.key),got=normalize(actual).split(' ').filter(Boolean);
    const cost=Array.from({length:want.length+1},(_,i)=>Array.from({length:got.length+1},(_,j)=>i+j));
    const same=(i,j)=>want[i].key.split(' ').join('')===got[j]||closeWords(want[i].key,got[j]);
    for(let i=1;i<=want.length;i++)for(let j=1;j<=got.length;j++)cost[i][j]=Math.min(cost[i-1][j]+1,cost[i][j-1]+1,cost[i-1][j-1]+(same(i-1,j-1)?0:1.5));
    const ops=[];let i=want.length,j=got.length;
    while(i||j){
      if(i&&j&&cost[i][j]===cost[i-1][j-1]+(same(i-1,j-1)?0:1.5)){ops.push(same(i-1,j-1)?{type:'same',expected:want[i-1].word,actual:got[j-1]}:{type:'changed',expected:want[i-1].word,actual:got[j-1]});i--;j--;}
      else if(i&&cost[i][j]===cost[i-1][j]+1){ops.push({type:'missing',expected:want[i-1].word});i--;}
      else{ops.push({type:'extra',actual:got[j-1]});j--;}
    }
    return ops.reverse();
  }
  const api={diffWords,flattenBrackets,pageNumberInfo,paginationTotals,cleanPaginationText,normalize,speakerKey,resolveSpeaker,isSpeakerName,parseScript,matches};root.CueCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
