/* Smart import: send the play's lines to Cue's proxy, which asks Claude to
   label them (scenes, speeches, directions, cast). The play itself is then
   rebuilt here from the original lines, so no line is ever rewritten. */
(function(root){
  const tr=(text,vars)=>root.CueI18n?root.CueI18n.t(text,vars):String(text).replace(/\{(\w+)\}/g,(m,k)=>vars&&k in vars?vars[k]:m);
  const PRICES={'claude-haiku-5-5':[0.10,0.50],'claude-sonnet-5-5':[2,10],'claude-opus-5-5':[4,20]};// $ per million tokens, in/out

  // The lines that go to the model: trimmed, blank lines dropped.
  function playLines(text){return String(text).replace(/\r/g,'').split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);}

  // Read Claude's server-sent events into one result.
  async function readStream(response,onProgress){
    if(!response.ok){let message=tr('The AI service answered with error {status}.',{status:response.status});try{const body=await response.json();message=body.error?.message||(typeof body.error==='string'?tr(body.error):'')||message;}catch{}throw Error(message);}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',usage={},stopReason=null,model=null;
    const handle=data=>{
      if(!data||data==='[DONE]')return;const event=JSON.parse(data);
      if(event.type==='message_start'){model=event.message?.model||model;Object.assign(usage,event.message?.usage||{});}
      else if(event.type==='content_block_delta'&&event.delta?.type==='text_delta'){text+=event.delta.text;onProgress&&onProgress(text.length);}
      else if(event.type==='message_delta'){stopReason=event.delta?.stop_reason||stopReason;Object.assign(usage,event.usage||{});}
      else if(event.type==='error')throw Error(event.error?.message||tr('The AI stopped with an error.'));
    };
    for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      let cut;while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
        handle(chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join(''));}
      if(done)break;}
    if(stopReason==='refusal')throw Error(tr('The AI declined to read this play.'));
    if(stopReason==='max_tokens')throw Error(tr('The play was too long for one answer.'));
    let labels;try{labels=JSON.parse(text);}catch{throw Error(tr('The answer was not complete. Try again.'));}
    return {labels,usage,stopReason,model};
  }

  function cost(usage,model){const p=PRICES[model];if(!p)return null;const input=(usage.input_tokens||0)+(usage.cache_creation_input_tokens||0)+(usage.cache_read_input_tokens||0);return (input*p[0]+(usage.output_tokens||0)*p[1])/1e6;}

  const flatten=s=>s.replace(/[\[\]]/g,'').replace(/[()]/g,'').trim();
  const brackets=s=>s.replace(/\(([^()]*)\)/g,'[$1]');
  const sceneHeading=/^\s*(?:сцена|scene)\s*[.:]?\s*(?:№\s*|no\.?\s*)?(?:\d+|[IVXLCDM]+)(?=$|[\s.:—–-])/iu;

  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/gi,'[её]').replace(/\s+/g,'\\s+');
  // Remove the speaker's label from the first line of a speech: «ИВАН ПЕТРОВИЧ.», «Маша (тихо).», "HAMLET:".
  function stripLabel(first,names){
    for(const name of [...names].sort((a,b)=>b.length-a.length)){const m=first.match(new RegExp('^\\s*'+esc(name)+'(?=$|[\\s.:—–(-])','iu'));if(m)return {rest:first.slice(m[0].length),label:null};}
    const m=first.match(/^\s*([\p{Lu}][\p{Lu}\p{M}\d'’ -]{1,44}?)\s*(?=[.:]|\(|$)/u);
    if(m&&/\p{Lu}{2}/u.test(m[1]))return {rest:first.slice(m[0].length),label:m[1].trim()};
    return {rest:first,label:null};
  }

  // A speaker label at the start of a line: «ЛЁХА. Привет», «КАБАН (смеётся): …», or a name alone on its line.
  function lineLabel(line){
    const m=line.match(/^\s*([\p{Lu}][\p{Lu}\p{M}\d'’-]*(?:[ ][\p{Lu}\d][\p{Lu}\p{M}\d'’-]*){0,3})/u);if(!m)return null;
    const name=m[1].trim();if(!/\p{Lu}.*\p{Lu}/u.test(name)||name.length>45)return null;
    const rest=line.slice(m[0].length);
    return /^\s*(?:\([^)]*\))?\s*[.:](?:\s|$)/u.test(rest)&&rest.replace(/^\s*(?:\([^)]*\))?\s*[.:]/u,'').trim()||!rest.trim()?name:null;
  }

  // Turn the model's marks into Cue's script text (Сцена/Scene headings,
  // NAME: speech, [direction]) and list anything that looks wrong.
  function toScript(lines,labels){
    const en=labels.language==='en',warnings=[];
    const cast=(labels.cast||[]).map(c=>({...c,name:String(c.name||'').trim(),aliases:(c.aliases||[]).map(a=>String(a).trim()).filter(Boolean)}));
    const titles=new Map((labels.scenes||[]).map(s=>[s.line,String(s.title||'').trim()]));
    const marks=(labels.marks||[]).filter(m=>Array.isArray(m)&&m.length>=2&&Number.isInteger(m[0])&&Number.isInteger(m[1])&&m[0]>=1&&m[0]<=lines.length).sort((a,b)=>a[0]-b[0]).filter((m,i,a)=>!i||m[0]!==a[i-1][0]);
    if(!marks.length){warnings.push(tr('The AI marked nothing.'));}
    else if(marks[0][0]>1)warnings.push(tr('{n} line(s) at the start were left out.',{n:marks[0][0]-1}));
    const out=[],scenes=[],speeches=new Map(),mismatch=new Map(),notes=[];let scene=null,badIndex=0;
    const startScene=title=>{const n=scenes.length+1;const heading=sceneHeading.test(title)?title:`${en?'Scene':'Сцена'} ${n}${title?'. '+title:''}`;scene={title:heading,speeches:0};scenes.push(scene);out.push('',heading);};
    // The text's own labels beat the model: a known name, or a capitalised label that opens two or more speeches.
    const key=v=>String(v).toLocaleLowerCase().replace(/ё/g,'е').replace(/[\s-]+/g,' ').replace(/[.:]+$/,'').trim();
    const byKey=new Map();for(const c of cast)for(const n of [c.name,...c.aliases])if(!byKey.has(key(n)))byKey.set(key(n),c);
    const stretches=marks.map(([from,code],i)=>({from,code,rows:lines.slice(from-1,i+1<marks.length?marks[i+1][0]-1:lines.length)}));
    const counts=new Map();for(const st of stretches)if(st.code>=0)for(const row of st.rows){const l=lineLabel(row);if(l)counts.set(key(l),(counts.get(key(l))||0)+1);}
    const added=[];
    const speakerFor=label=>{if(!label)return null;const k=key(label);if(byKey.has(k))return byKey.get(k);if((counts.get(k)||0)<2)return null;
      const c={name:label,aliases:[],gender:'?',age:'?'};cast.push(c);byKey.set(k,c);added.push(label);return c;};
    const speech=(who,rows,fromModel)=>{
      const {rest,label}=stripLabel(rows[0],[who.name,...who.aliases]);if(label&&fromModel){const k=label+'\u0000'+who.name;mismatch.set(k,(mismatch.get(k)||0)+1);}
      // «Маша (тихо). Вот он» → «МАША: [тихо] Вот он»
      const first=rest.replace(/^\s*[:.—–-]\s*/,'').replace(/^\s*\(([^()]*)\)\s*[:.—–-]?\s*/,'[$1] ');
      const text=brackets([first,...rows.slice(1)].join(' ').replace(/\s+/g,' ').trim());
      if(!text)return;if(!scene)startScene('');
      out.push(`${who.name}: ${text}`);scene.speeches++;speeches.set(who.name,(speeches.get(who.name)||0)+1);
    };
    for(const {from,code,rows} of stretches){
      if(code===-2)continue;
      if(code===-3){startScene(titles.get(from)||flatten(rows[0]));continue;}
      if(code===-1){if(!scene)continue;const d=flatten(rows.join(' '));if(d)out.push('['+d+']');continue;}
      // Split where a later line opens another speech the model missed.
      let start=0;const parts=[];
      for(let j=1;j<rows.length;j++)if(speakerFor(lineLabel(rows[j]))){parts.push(rows.slice(start,j));start=j;}
      parts.push(rows.slice(start));
      parts.forEach((part,n)=>{
        const byLabel=speakerFor(lineLabel(part[0]));
        const who=byLabel||(n===0?cast[code]:null);
        if(!who||!who.name){badIndex++;return;}
        speech(who,part,!byLabel);
      });
    }
    if(added.length)notes.push(tr('Added characters the AI missed: {names}.',{names:added.join(', ')}));
    if(badIndex)warnings.push(tr('{n} speech(es) had no known speaker and were left out.',{n:badIndex}));
    for(const [k,n] of mismatch){const [label,who]=k.split('\u0000');warnings.push(tr('A speech that starts with «{label}» was given to {who} ({n}×).',{label,who,n}));}
    const silent=cast.filter(c=>!speeches.has(c.name));if(silent.length)warnings.push(tr('In the cast but never speaks: {names}.',{names:silent.map(c=>c.name).join(', ')}));
    const once=[...speeches].filter(([,n])=>n===1).map(([s])=>s);if(once.length)warnings.push(tr('Speaks only once (maybe a misspelling): {names}.',{names:once.join(', ')}));
    const empty=scenes.filter(s=>!s.speeches).length;if(empty)notes.push(tr('{n} scene(s) without words.',{n:empty}));
    const speaking=cast.filter(c=>speeches.has(c.name));
    const script=((speaking.length?(en?'CHARACTERS':'ДЕЙСТВУЮЩИЕ ЛИЦА')+'\n'+speaking.map(c=>c.name).join('\n')+'\n':'')+out.join('\n')).trim();
    return {script,cast:speaking.map(c=>({...c,speeches:speeches.get(c.name)})),scenes,warnings,notes,title:labels.title||''};
  }

  // Cut a long play into parts that are read at the same time (one long answer takes ~40 s;
  // five short ones take ~10 s). Each cut falls where a scene or, failing that, a speech starts.
  const PART_CHARS=15000,MAX_PARTS=6;
  function splitParts(lines,parts){
    const total=lines.reduce((a,l)=>a+l.length+1,0);
    const n=Math.max(1,Math.min(MAX_PARTS,parts||Math.ceil(total/PART_CHARS)));if(n===1)return [{start:1,lines}];
    const target=total/n,cuts=[0];let size=0;
    for(let i=0;i<lines.length&&cuts.length<n;i++){
      size+=lines[i].length+1;if(size<target*cuts.length)continue;
      // Look ahead a little for a scene heading, else take the next speech.
      let cut=-1,ahead=0;for(let j=i+1;j<lines.length&&ahead<target*0.3;j++){ahead+=lines[j].length+1;if(sceneHeading.test(lines[j])){cut=j;break;}}
      if(cut<0)for(let j=i+1;j<lines.length;j++)if(lineLabel(lines[j])){cut=j;break;}
      if(cut<0||cut>=lines.length)break;cuts.push(cut);i=cut-1;size=lines.slice(0,cut).reduce((a,l)=>a+l.length+1,0);
    }
    return cuts.map((c,k)=>({start:c+1,lines:lines.slice(c,k+1<cuts.length?cuts[k+1]:lines.length)}));
  }

  // Join the parts' answers: one cast (matched by name and aliases), marks renumbered to it.
  function mergeLabels(results){
    const key=v=>String(v).toLocaleLowerCase().replace(/ё/g,'е').replace(/[\s-]+/g,' ').trim();
    const cast=[],byKey=new Map(),marks=[],scenes=[];
    for(const {labels} of results){
      const map=(labels.cast||[]).map(c=>{
        const names=[c.name,...(c.aliases||[])].filter(Boolean);let g=names.map(n=>byKey.get(key(n))).find(Boolean);
        if(!g){g={name:String(c.name||'').trim(),aliases:[],gender:c.gender||'?',age:c.age||'?',index:cast.length};cast.push(g);}
        for(const n of names){if(!byKey.has(key(n)))byKey.set(key(n),g);if(key(n)!==key(g.name)&&!g.aliases.some(a=>key(a)===key(n)))g.aliases.push(String(n).trim());}
        if(g.gender==='?')g.gender=c.gender||'?';if(g.age==='?')g.age=c.age||'?';return g.index;
      });
      for(const m of labels.marks||[])if(Array.isArray(m)&&m.length>=2)marks.push([m[0],m[1]>=0?(m[1]<map.length?map[m[1]]:-99):m[1]]);
      scenes.push(...(labels.scenes||[]));
    }
    const first=results[0].labels;
    return {language:first.language,title:first.title,cast:cast.map(({index,...c})=>c),scenes,marks:marks.filter(m=>m[1]!==-99)};
  }

  async function smartImport({proxy,code,model,text,onProgress,parts}){
    const lines=playLines(text);const started=Date.now();
    const pieces=splitParts(lines,parts),progress=pieces.map(()=>0);
    // Speech labels seen anywhere, so every part names the characters the same way.
    const seen=new Map();for(const l of lines){const n=lineLabel(l);if(n)seen.set(n,(seen.get(n)||0)+1);}
    const names=pieces.length>1?[...seen].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,80).map(([n])=>n):[];
    const readPart=async(piece,k,attempt=0)=>{
      try{
        const body={model,lines:piece.lines,...(pieces.length>1?{start:piece.start,part:k+1,of:pieces.length,names}:{})};
        const response=await fetch(proxy.replace(/\/+$/,'')+'/import',{method:'POST',headers:{'content-type':'application/json',...(code?{'x-cue-code':code}:{})},body:JSON.stringify(body)});
        if(response.status===429||response.status>=500){const e=Error();e.retry=response.status>=500||!/today/.test(await response.clone().text());if(!e.retry)return readStream(response);throw Object.assign(e,{response});}
        return await readStream(response,n=>{progress[k]=n;onProgress&&onProgress(progress.reduce((a,b)=>a+b,0));});
      }catch(error){
        if(attempt<1&&(error.retry||error instanceof TypeError||/not complete/.test(error.message||''))){await new Promise(r=>setTimeout(r,2000));return readPart(piece,k,attempt+1);}
        if(error.response)return readStream(error.response);throw error;
      }
    };
    const results=await Promise.all(pieces.map((p,k)=>readPart(p,k)));
    const usage={};for(const r of results)for(const [k,v] of Object.entries(r.usage||{}))if(typeof v==='number')usage[k]=(usage[k]||0)+v;
    const labels=mergeLabels(results),model_=results[0].model;
    return {labels,usage,model:model_,stopReason:results[0].stopReason,...toScript(lines,labels),parts:pieces.length,seconds:(Date.now()-started)/1000,cost:cost(usage,model_),lines:lines.length};
  }

  const api={playLines,readStream,toScript,stripLabel,lineLabel,splitParts,mergeLabels,cost,smartImport,PRICES};root.CueAI=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
