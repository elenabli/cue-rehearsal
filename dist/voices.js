/* Character voices: each character gets a natural Google voice of their own.
   Partner lines are made into audio through Cue's proxy before they are needed
   and kept on this phone (Cache Storage), so a line is only ever made once.
   When a line isn't ready (offline, daily limit, error) the app's device voice reads it. */
(function(root){
  const PROXY='https://cue-proxy.elena-blinova.workers.dev';
  const CACHE='cue-voices-v1',LIST_DAYS=7,MAX_CLIP=1400,PARALLEL=3;
  // Chirp 3 HD voices by how old they sound (Google describes them as youthful, bright, mature, gravelly…).
  // Voices not listed here (or other voice types) count as adult.
  const VOICE_AGE={
    f:{young:['Leda','Zephyr','Autonoe','Laomedeia','Pulcherrima'],adult:['Aoede','Kore','Callirrhoe','Despina','Erinome'],old:['Gacrux','Sulafat','Vindemiatrix','Achernar']},
    m:{young:['Puck','Fenrir','Sadachbia','Achird','Zubenelgenubi'],adult:['Charon','Orus','Iapetus','Alnilam','Algieba','Enceladus','Umbriel'],old:['Algenib','Rasalgethi','Sadaltager','Schedar']},
  };
  // Children's lines play a little higher and old people's a little lower and slower (pitch follows speed).
  const TUNE={child:1.08,old:0.96};
  const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
  const code=()=>(store.get('cue-ai-code')||'').trim();
  const on=()=>store.get('cue-voices-off')!=='1';
  let play={lang:'',cast:[],info:{}},list=null,listLang='',stopped=false,blocked='';
  const ready=new Map(),pending=new Map();
  const log=m=>{try{root.CueVoiceLog?.(m);}catch{}};

  // Russian patronymics and words like БАБУШКА say the gender when the play's reader didn't.
  function genderOf(name,info){
    const g=info&&info[name]&&info[name].gender;if(g==='f'||g==='m'||g==='group')return g;
    const n=name.trim().toUpperCase();if(/(?:ВНА|ИЧНА)$|БАБУШК|БАБКА|СТАРУХ|ДЕВОЧК|ВНУЧК|ЖЕНЩИН|GRAND(?:MA|MOTHER)|\b(?:GIRL|WOMAN|MOTHER|MRS)\b/u.test(n))return 'f';
    if(/(?:ВИЧ|ИЧ)$|ДЕДУШК|(?<!\p{L})ДЕД(?!\p{L})|СТАРИК|МАЛЬЧИК|ВНУК(?!\p{L})|МУЖЧИН|GRAND(?:PA|FATHER)|\b(?:BOY|MAN|FATHER|MR)\b/u.test(n))return 'm';return '?';
  }
  // Age from the play's reader; otherwise from words like БАБУШКА or BOY in the name.
  function ageOf(name,info){
    const a=info&&info[name]&&info[name].age;if(['child','young','adult','old'].includes(a))return a;
    const n=String(name).toUpperCase().replace(/Ё/g,'Е');
    if(/БАБУШК|БАБКА|ДЕДУШК|\bДЕД\b|СТАРИК|СТАРУХ|GRAND(?:MA|PA|MOTHER|FATHER)|OLD /u.test(n))return 'old';
    if(/МАЛЬЧИК|ДЕВОЧК|РЕБЕНОК|ВНУК|ВНУЧК|\bBOY\b|\bGIRL\b|CHILD/u.test(n))return 'child';
    return '?';
  }
  const short=v=>v.name.split('-').pop();
  // One voice per character, the same every time for the same cast, fitting gender and age. Best voices first (Chirp 3 HD), then Neural2/WaveNet.
  function assign(voices,cast,info){
    const tier=re=>voices.filter(v=>re.test(v.name));
    let pool=tier(/Chirp3-HD/);if(pool.length<4)pool=[...tier(/Neural2|Chirp-HD/),...tier(/Wavenet/)];if(pool.length<2)pool=voices.filter(v=>!/Studio|Polyglot|News/.test(v.name));
    const byGender={f:pool.filter(v=>v.gender==='FEMALE'),m:pool.filter(v=>v.gender==='MALE')};
    const bucket=(g,v)=>{const ages=VOICE_AGE[g];return ages.young.includes(short(v))?'young':ages.old.includes(short(v))?'old':ages.adult.includes(short(v))?'adult':'other';};
    // Voices for an age, best fit first: listed order for that age, then the neighbours, then anything.
    const near={young:['young','adult','other','old'],adult:['adult','other','young','old'],old:['old','adult','other','young']};
    const ranked=(g,age)=>{const of=byGender[g],ages=VOICE_AGE[g];const listed=b=>b==='other'?of.filter(v=>bucket(g,v)==='other'):ages[b].map(n=>of.find(v=>short(v)===n)).filter(Boolean);return near[age].flatMap(listed);};
    const map={},used=new Set();let other=0;
    for(const name of cast){
      let g=genderOf(name,info);if(g==='group'||g==='?')g=other++%2?'f':'m';if(!byGender[g].length)g=g==='f'?'m':'f';if(!byGender[g].length)continue;
      const a=ageOf(name,info),want=a==='child'||a==='young'?'young':a==='old'?'old':'adult';
      const choices=ranked(g,want),pick=choices.find(v=>!used.has(v.name))||choices[[...used].length%choices.length];
      used.add(pick.name);map[name]={voice:pick.name,tune:TUNE[a]||1};
    }
    return map;
  }
  let voiceMap={};
  function setPlay(next){
    play={lang:next.lang||'',cast:[...(next.cast||[])],info:next.info||{}};
    if(list&&listLang===play.lang)voiceMap=assign(list,play.cast,play.info);else{voiceMap={};loadList();}
  }
  async function loadList(){
    const lang=play.lang;if(!lang||!on())return;
    try{const saved=JSON.parse(store.get('cue-voice-list:'+lang)||'null');if(saved&&Date.now()-saved.at<LIST_DAYS*864e5&&saved.voices.length){list=saved.voices;listLang=lang;voiceMap=assign(list,play.cast,play.info);return;}}catch{}
    try{const r=await fetch(PROXY+'/voices?lang='+encodeURIComponent(lang));if(!r.ok)throw Error('status '+r.status);const body=await r.json();
      if(lang!==play.lang)return;list=body.voices||[];listLang=lang;store.set('cue-voice-list:'+lang,JSON.stringify({at:Date.now(),voices:list}));voiceMap=assign(list,play.cast,play.info);log('voices: '+list.length+' for '+lang);
    }catch(err){log('voices: list failed ('+err.message+')');}
  }

  // Long speeches go in pieces at sentence ends (the service takes about 2,500 Russian letters at most).
  function pieces(text){
    const out=[];let rest=String(text).trim();
    while(rest.length>MAX_CLIP){let cut=Math.max(rest.lastIndexOf('. ',MAX_CLIP),rest.lastIndexOf('! ',MAX_CLIP),rest.lastIndexOf('? ',MAX_CLIP),rest.lastIndexOf('… ',MAX_CLIP));if(cut<MAX_CLIP/3)cut=rest.lastIndexOf(' ',MAX_CLIP);if(cut<1)cut=MAX_CLIP;out.push(rest.slice(0,cut+1).trim());rest=rest.slice(cut+1).trim();}
    if(rest)out.push(rest);return out;
  }
  async function hash(s){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(d)].slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join('');}
  const keyOf=(voice,text)=>voice+'\n'+text;
  async function clip(voice,text){
    const k=keyOf(voice,text);if(ready.has(k))return ready.get(k);if(pending.has(k))return pending.get(k);
    const job=(async()=>{
      const url=PROXY+'/clip/'+voice+'/'+await hash(k);let cache=null;try{cache=await caches.open(CACHE);}catch{}
      let res=cache&&await cache.match(url).catch(()=>null);
      if(!res){
        if(blocked)throw Error(blocked);
        const r=await fetch(PROXY+'/speak',{method:'POST',headers:{'content-type':'application/json',...(code()?{'x-cue-code':code()}:{})},body:JSON.stringify({voice,lang:play.lang,text})});
        if(!r.ok){let msg='status '+r.status;try{msg=(await r.json()).error||msg;}catch{}if(r.status===429||r.status===503)blocked=msg;throw Error(msg);}
        const blob=await r.blob();res=new Response(blob,{headers:{'content-type':'audio/mpeg'}});if(cache)await cache.put(url,res.clone()).catch(()=>{});
      }
      const src=URL.createObjectURL(await res.blob());ready.set(k,src);return src;
    })();
    pending.set(k,job);try{return await job;}finally{pending.delete(k);}
  }
  // Make the audio for these lines ahead of time: [{who,text}], a few at once, in order.
  let queue=[],running=0;
  function warm(items){
    if(!on())return;
    if(!list){loadList().then(()=>list&&warm(items));return;}
    queue=[];for(const {who,text} of items){const voice=voiceMap[who]?.voice;if(!voice)continue;for(const p of pieces(text))if(!ready.has(keyOf(voice,p)))queue.push({voice,text:p});}
    pump();
  }
  function pump(){while(running<PARALLEL&&queue.length&&!blocked){const job=queue.shift();running++;clip(job.voice,job.text).catch(err=>log('voices: line failed ('+err.message+')')).finally(()=>{running--;pump();});}}
  // The audio ready for this line now, or null (then the device voice reads it).
  function readyFor(who,text){if(!on())return null;const voice=voiceMap[who]?.voice;if(!voice)return null;const parts=pieces(text).map(p=>ready.get(keyOf(voice,p)));return parts.length&&parts.every(Boolean)?parts:null;}

  // One audio element for everything: iPhone lets it play later only after it has played once in a tap.
  let audio=null,unlocked=false;
  const SILENCE='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function element(){if(!audio){audio=new Audio();audio.preload='auto';audio.setAttribute('playsinline','');}return audio;}
  function unlock(){if(unlocked||!on())return;const a=element();try{a.src=SILENCE;a.volume=0;const p=a.play();if(p)p.then(()=>{unlocked=true;a.volume=1;log('voices: unlocked by tap');}).catch(()=>{a.volume=1;});}catch{a.volume=1;}}
  // Play the pieces in turn. cb.start once sound begins, cb.end at the end, cb.fail(reason) if it can't play.
  function playClips(parts,rate,cb,tune=1){
    const a=element();stopped=false;let i=0,started=false,guard=null,done=false;
    const finish=(kind,why)=>{if(done)return;done=true;clearTimeout(guard);a.onplaying=a.onended=a.onerror=a.ontimeupdate=null;kind==='end'?cb.end?.():cb.fail?.(why);};
    const next=()=>{
      if(stopped)return;if(i>=parts.length)return finish('end');
      a.src=parts[i++];a.volume=1;const speed=rate*tune;a.playbackRate=speed;a.defaultPlaybackRate=speed;try{a.preservesPitch=tune===1;a.webkitPreservesPitch=tune===1;}catch{}
      clearTimeout(guard);guard=setTimeout(()=>{if(!started)finish('fail','did not start');},4000);
      a.onplaying=()=>{if(!started){started=true;cb.start?.();}clearTimeout(guard);const left=((a.duration||30)-(a.currentTime||0))/(rate*tune);guard=setTimeout(()=>{a.pause();next();},left*1000+3000);};
      a.onended=()=>{clearTimeout(guard);next();};a.onerror=()=>finish('fail','audio error');
      const p=a.play();if(p)p.catch(err=>finish('fail',err&&err.name||'blocked'));
    };
    next();
    return ()=>{done=true;clearTimeout(guard);};
  }
  function stop(){stopped=true;if(audio){try{audio.pause();}catch{}audio.onplaying=audio.onended=audio.onerror=null;}}
  function setOn(value){store.set('cue-voices-off',value?'0':'1');if(!value)stop();}

  const api={PROXY,setPlay,warm,readyFor,playClips,unlock,stop,on,setOn,assign,genderOf,ageOf,pieces,voiceOf:who=>voiceMap[who]?.voice||null,tuneOf:who=>voiceMap[who]?.tune||1};
  root.CueVoices=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
