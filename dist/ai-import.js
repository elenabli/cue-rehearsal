/* Smart import: send the play's lines to Cue's proxy, which asks Claude to
   label them (scenes, speeches, directions, cast). The play itself is then
   rebuilt here from the original lines, so no line is ever rewritten. */
(function(root){
  const PRICES={'claude-haiku-5-5':[0.10,0.50],'claude-sonnet-5-5':[2,10],'claude-opus-5-5':[4,20]};// $ per million tokens, in/out

  // The lines that go to the model: trimmed, blank lines dropped.
  function playLines(text){return String(text).replace(/\r/g,'').split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);}

  // Read Claude's server-sent events into one result.
  async function readStream(response,onProgress){
    if(!response.ok){let message=`The proxy answered ${response.status}.`;try{const body=await response.json();message=body.error?.message||body.error||message;}catch{}throw Error(message);}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',usage={},stopReason=null,model=null;
    const handle=data=>{
      if(!data||data==='[DONE]')return;const event=JSON.parse(data);
      if(event.type==='message_start'){model=event.message?.model||model;Object.assign(usage,event.message?.usage||{});}
      else if(event.type==='content_block_delta'&&event.delta?.type==='text_delta'){text+=event.delta.text;onProgress&&onProgress(text.length);}
      else if(event.type==='message_delta'){stopReason=event.delta?.stop_reason||stopReason;Object.assign(usage,event.usage||{});}
      else if(event.type==='error')throw Error(event.error?.message||'The model stopped with an error.');
    };
    for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      let cut;while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
        handle(chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join(''));}
      if(done)break;}
    if(stopReason==='refusal')throw Error('The model declined to read this play.');
    if(stopReason==='max_tokens')throw Error('The play was too long for one answer.');
    let labels;try{labels=JSON.parse(text);}catch{throw Error('The answer was not complete. Try again.');}
    return {labels,usage,stopReason,model};
  }

  function cost(usage,model){const p=PRICES[model];if(!p)return null;const input=(usage.input_tokens||0)+(usage.cache_creation_input_tokens||0)+(usage.cache_read_input_tokens||0);return (input*p[0]+(usage.output_tokens||0)*p[1])/1e6;}

  const flatten=s=>s.replace(/[\[\]]/g,'').replace(/[()]/g,'').trim();
  const brackets=s=>s.replace(/\(([^()]*)\)/g,'[$1]');
  const sceneHeading=/^\s*(?:сцена|scene)\s*[.:]?\s*(?:№\s*|no\.?\s*)?(?:\d+|[IVXLCDM]+)(?=$|[\s.:—–-])/iu;

  // Turn the model's labels into Cue's script text (Сцена/Scene headings,
  // NAME: speech, [direction]) and list anything that looks wrong.
  function toScript(lines,labels){
    const en=labels.language==='en',warnings=[],cast=[];const names=new Map();
    const key=s=>String(s).toLocaleLowerCase().replace(/ё/g,'е').replace(/[.:\s]+/g,' ').trim();
    for(const c of labels.cast||[]){const name=String(c.name||'').trim();if(!name||names.has(key(name)))continue;cast.push({...c,name});names.set(key(name),name);for(const a of c.aliases||[])if(!names.has(key(a)))names.set(key(a),name);}
    const blocks=(labels.blocks||[]).filter(b=>Number.isInteger(b.from)&&Number.isInteger(b.to)&&b.from>=1&&b.to>=b.from&&b.to<=lines.length).sort((a,b)=>a.from-b.from);
    // Coverage: every line labelled once.
    let next=1,gaps=0,overlaps=0;for(const b of blocks){if(b.from>next)gaps+=b.from-next;if(b.from<next)overlaps++;next=Math.max(next,b.to+1);}if(next<=lines.length)gaps+=lines.length-next+1;
    if(gaps)warnings.push(`${gaps} line(s) were not labelled and are left out.`);if(overlaps)warnings.push(`${overlaps} block(s) overlap.`);
    const out=[],scenes=[],speeches=new Map();let scene=null,badCuts=0,last=0;
    const startScene=title=>{const n=scenes.length+1;const heading=sceneHeading.test(title)?title:`${en?'Scene':'Сцена'} ${n}${title?'. '+title:''}`;scene={title:heading,speeches:0};scenes.push(scene);out.push('',heading);};
    for(const b of blocks){
      const from=Math.max(b.from,last+1);if(from>b.to)continue;last=b.to;const rows=lines.slice(from-1,b.to);
      if(b.kind==='skip')continue;
      if(b.kind==='scene'){startScene(String(b.title||flatten(rows.join(' '))).trim());continue;}
      if(b.kind==='direction'){if(!scene)continue;const d=flatten(rows.join(' '));if(d)out.push('['+d+']');continue;}
      if(b.kind!=='speech')continue;
      let speaker=names.get(key(b.speaker))||String(b.speaker||'').trim();
      if(!speaker){warnings.push(`Line ${from}: a speech without a speaker.`);continue;}
      if(!names.has(key(speaker))){names.set(key(speaker),speaker);cast.push({name:speaker,aliases:[],gender:'unknown',age:'unknown'});warnings.push(`${speaker} speaks but was not in the cast list.`);}
      let first=rows[0];const cut=String(b.cut||'').trim();
      if(cut){if(first.startsWith(cut))first=first.slice(cut.length);else if(first.toLocaleLowerCase().startsWith(cut.toLocaleLowerCase()))first=first.slice(cut.length);else badCuts++;}
      // «Маша (тихо). Вот он» → «МАША: [тихо] Вот он»
      first=first.replace(/^\s*[:.—–-]\s*/,'').replace(/^\s*\(([^()]*)\)\s*[:.—–-]?\s*/,'[$1] ');
      const text=brackets([first,...rows.slice(1)].join(' ').replace(/\s+/g,' ').trim());
      if(!text)continue;if(!scene)startScene('');
      out.push(`${speaker}: ${text}`);scene.speeches++;speeches.set(speaker,(speeches.get(speaker)||0)+1);
    }
    if(badCuts)warnings.push(`${badCuts} speech label(s) did not match the text; those lines keep the name.`);
    const silent=cast.filter(c=>!speeches.has(c.name));if(silent.length)warnings.push(`In the cast but never speaks: ${silent.map(c=>c.name).join(', ')}.`);
    const once=[...speeches].filter(([,n])=>n===1).map(([s])=>s);if(once.length)warnings.push(`Speaks only once (maybe a misspelling): ${once.join(', ')}.`);
    const empty=scenes.filter(s=>!s.speeches).length;if(empty)warnings.push(`${empty} scene(s) have no speech.`);
    const speaking=cast.filter(c=>speeches.has(c.name));
    const script=((speaking.length?(en?'CHARACTERS':'ДЕЙСТВУЮЩИЕ ЛИЦА')+'\n'+speaking.map(c=>c.name).join('\n')+'\n':'')+out.join('\n')).trim();
    return {script,cast:speaking.map(c=>({...c,speeches:speeches.get(c.name)})),scenes,warnings,title:labels.title||''};
  }

  async function smartImport({proxy,code,model,text,onProgress}){
    const lines=playLines(text);const started=Date.now();
    const response=await fetch(proxy.replace(/\/+$/,'')+'/import',{method:'POST',headers:{'content-type':'application/json','x-cue-code':code},body:JSON.stringify({model,lines})});
    const result=await readStream(response,onProgress);
    return {...result,...toScript(lines,result.labels),seconds:(Date.now()-started)/1000,cost:cost(result.usage,result.model),lines:lines.length};
  }

  const api={playLines,readStream,toScript,cost,smartImport,PRICES};root.CueAI=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
