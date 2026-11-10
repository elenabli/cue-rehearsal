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
  // Unusual word forms («перегарищем») often come back as a plainer form of the same word («перегаром»): same start, different ending. That counts as half a mistake.
  function sameStem(a,b){const n=Math.min(a.length,b.length);if(n<5)return false;let p=0;while(p<n&&a[p]===b[p])p++;return p>=5&&p>=0.6*n;}
  function wordCost(a,b){return closeWords(a,b)?0:sameStem(a,b)?0.5:1;}
  // Hyphenated particles («перегарищем-то», «дай-ка», «всё-таки») are often dropped or glued on by recognition, so a line also matches without them.
  const PARTICLE=/[-‐‑](?:то|ка|таки|де)(?!\p{L})/giu,PARTICLE_WORDS=new Set(['то','ка','таки','де']);
  function withoutParticles(text){return text.replace(PARTICLE,'');}
  function weightedDistance(a,b){let prev=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+wordCost(a[i-1],b[j-1]));prev=row;}return prev[b.length];}
  function matchesNormalized(a,b){if(!a||!b)return false;const ja=a.replace(/ /g,''),jb=b.replace(/ /g,'');if(a===b||ja===jb)return true;
    // Words split or glued differently («перегар ищем»), plus a letter or two misheard: compare the letters, about one slip per ten.
    if(editDistance(ja,jb)<=Math.floor(ja.length/10))return true;
    const words=a.split(' ');return weightedDistance(words,b.split(' '))<=words.length/5;}
  function matches(expected,actual){const b=normalize(actual);const variants=[...new Set([normalize(expected),normalize(withoutParticles(expected))])];return variants.some(a=>matchesNormalized(a,b))||(variants.length>1&&matchesNormalized(variants[1],normalize(withoutParticles(actual))));}
  // Word-by-word comparison for feedback (a substitution costs more than one skip, so matching words line up): same, missing (not said), extra (said, not in the line), changed (said something else).
  function diffWords(expected,actual){
    const want=expected.split(/\s+/).map(word=>({word,key:normalize(word),bare:normalize(withoutParticles(word))})).filter(w=>w.key);let got=normalize(actual).split(' ').filter(Boolean);
    // «перегарищем то» heard as two words is one word of the line: glue a particle back on when the line has one.
    if(want.some(w=>w.key!==w.bare))got=got.reduce((out,w)=>{if(out.length&&PARTICLE_WORDS.has(w))out[out.length-1]+=' '+w;else out.push(w);return out;},[]);
    const cost=Array.from({length:want.length+1},(_,i)=>Array.from({length:got.length+1},(_,j)=>i+j));
    const same=(i,j)=>{const w=want[i],g=got[j],gBare=g.split(' ').filter(x=>!PARTICLE_WORDS.has(x)).join(' ');return w.key.split(' ').join('')===g.split(' ').join('')||wordCost(w.bare,gBare||g)<1;};
    for(let i=1;i<=want.length;i++)for(let j=1;j<=got.length;j++)cost[i][j]=Math.min(cost[i-1][j]+1,cost[i][j-1]+1,cost[i-1][j-1]+(same(i-1,j-1)?0:1.5));
    const ops=[];let i=want.length,j=got.length;
    while(i||j){
      if(i&&j&&cost[i][j]===cost[i-1][j-1]+(same(i-1,j-1)?0:1.5)){ops.push(same(i-1,j-1)?{type:'same',expected:want[i-1].word,actual:got[j-1]}:{type:'changed',expected:want[i-1].word,actual:got[j-1]});i--;j--;}
      else if(i&&cost[i][j]===cost[i-1][j]+1){ops.push({type:'missing',expected:want[i-1].word});i--;}
      else{ops.push({type:'extra',actual:got[j-1]});j--;}
    }
    return ops.reverse();
  }
  // How far into a line the actor has got, for the live marker and for thinking pauses. Recognition mishears words in long lines,
  // so the speech is aligned to the line with the same tolerance as matching, instead of stopping at the first word that differs.
  // Returns heard: line words (split on spaces) reached so far; missed: indexes below heard that weren't said or were misheard;
  // partial: what was said so far is a fair start of the line but doesn't reach its end yet (the actor may be thinking).
  function progress(expected,actual){
    const words=expected.split(/\s+/),line=[];words.forEach((w,owner)=>{for(const key of normalize(withoutParticles(w)).split(' ').filter(Boolean))line.push({key,owner});});
    const said=normalize(withoutParticles(actual)).split(' ').filter(Boolean),n=line.length,m=said.length;
    const none={heard:0,missed:[],partial:false};if(!n||!m)return none;
    const extra=w=>PARTICLE_WORDS.has(w)?0:1,INF=1e9;
    const d=Array.from({length:n+1},()=>new Array(m+1).fill(INF)),how=Array.from({length:n+1},()=>new Array(m+1).fill(''));
    d[0][0]=0;for(let j=1;j<=m;j++){d[0][j]=d[0][j-1]+extra(said[j-1]);how[0][j]='x';}
    for(let i=1;i<=n;i++){d[i][0]=i;how[i][0]='m';for(let j=1;j<=m;j++){
      const a=line[i-1].key,options=[[d[i-1][j]+1,'m'],[d[i][j-1]+extra(said[j-1]),'x'],[d[i-1][j-1]+wordCost(a,said[j-1]),wordCost(a,said[j-1])<1?'s':'c']];
      // A word heard split in two («перегар ищем»), or two words heard glued together.
      if(j>=2&&closeWords(a,said[j-2]+said[j-1]))options.push([d[i-1][j-2],'g']);
      if(i>=2&&closeWords(line[i-2].key+a,said[j-1]))options.push([d[i-2][j-1],'j']);
      for(const [cost,step] of options)if(cost<d[i][j]){d[i][j]=cost;how[i][j]=step;}}}
    const matchedEnd=step=>step==='s'||step==='g'||step==='j';
    // The marker reaches the furthest line word that was actually said, as long as the way there has few slips.
    let reach=0,at=0;for(let i=n;i>=1&&!reach;i--)for(let j=1;j<=m;j++)if(matchedEnd(how[i][j])&&d[i][j]<=Math.max(1,i/4)){reach=i;at=j;break;}
    const said_=new Set();for(let i=reach,j=at;i>0||j>0;){const step=how[i][j];if(step==='s'){said_.add(i-1);i--;j--;}else if(step==='g'){said_.add(i-1);i--;j-=2;}else if(step==='j'){said_.add(i-1);said_.add(i-2);i-=2;j--;}else if(step==='c'){i--;j--;}else if(step==='m')i--;else j--;}
    const heard=reach?line[reach-1].owner+1:0,missed=[];for(let k=0;k<heard;k++){const own=line.map((t,x)=>t.owner===k?x:-1).filter(x=>x>=0);if(own.length&&!own.some(x=>said_.has(x)))missed.push(k);}
    // Everything said so far lines up with the start of the line (few slips), and the line goes on.
    let best=0;for(let i=1;i<=n;i++)if(d[i][m]<=d[best][m])best=i;
    const partial=best>0&&best<n&&d[best][m]<=Math.max(0.5,Math.floor(best/4));
    return {heard,missed,partial};
  }
  const api={diffWords,progress,flattenBrackets,pageNumberInfo,paginationTotals,cleanPaginationText,normalize,speakerKey,resolveSpeaker,isSpeakerName,parseScript,matches};root.CueCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
