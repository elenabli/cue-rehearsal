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

  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/gi,'[её]').replace(/\s+/g,'\\s+');
  // Remove the speaker's label from the first line of a speech: «ИВАН ПЕТРОВИЧ.», «Маша (тихо).», "HAMLET:".
  function stripLabel(first,names){
    for(const name of [...names].sort((a,b)=>b.length-a.length)){const m=first.match(new RegExp('^\\s*'+esc(name)+'(?=$|[\\s.:—–(-])','iu'));if(m)return {rest:first.slice(m[0].length),label:null};}
    const m=first.match(/^\s*([\p{Lu}][\p{Lu}\p{M}\d'’ -]{1,44}?)\s*(?=[.:]|\(|$)/u);
    if(m&&/\p{Lu}{2}/u.test(m[1]))return {rest:first.slice(m[0].length),label:m[1].trim()};
    return {rest:first,label:null};
  }

  // Turn the model's marks into Cue's script text (Сцена/Scene headings,
  // NAME: speech, [direction]) and list anything that looks wrong.
  function toScript(lines,labels){
    const en=labels.language==='en',warnings=[];
    const cast=(labels.cast||[]).map(c=>({...c,name:String(c.name||'').trim(),aliases:(c.aliases||[]).map(a=>String(a).trim()).filter(Boolean)}));
    const titles=new Map((labels.scenes||[]).map(s=>[s.line,String(s.title||'').trim()]));
    const marks=(labels.marks||[]).filter(m=>Array.isArray(m)&&m.length>=2&&Number.isInteger(m[0])&&Number.isInteger(m[1])&&m[0]>=1&&m[0]<=lines.length).sort((a,b)=>a[0]-b[0]).filter((m,i,a)=>!i||m[0]!==a[i-1][0]);
    if(!marks.length){warnings.push('The model marked nothing.');}
    else if(marks[0][0]>1)warnings.push(`${marks[0][0]-1} line(s) at the start were not marked and are left out.`);
    const out=[],scenes=[],speeches=new Map(),mismatch=new Map();let scene=null,badIndex=0;
    const startScene=title=>{const n=scenes.length+1;const heading=sceneHeading.test(title)?title:`${en?'Scene':'Сцена'} ${n}${title?'. '+title:''}`;scene={title:heading,speeches:0};scenes.push(scene);out.push('',heading);};
    marks.forEach(([from,code],i)=>{
      const to=i+1<marks.length?marks[i+1][0]-1:lines.length;const rows=lines.slice(from-1,to);
      if(code===-2)return;
      if(code===-3){startScene(titles.get(from)||flatten(rows[0]));return;}
      if(code===-1){if(!scene)return;const d=flatten(rows.join(' '));if(d)out.push('['+d+']');return;}
      const who=cast[code];if(!who||!who.name){badIndex++;return;}
      const {rest,label}=stripLabel(rows[0],[who.name,...who.aliases]);if(label)mismatch.set(label+' → '+who.name,(mismatch.get(label+' → '+who.name)||0)+1);
      // «Маша (тихо). Вот он» → «МАША: [тихо] Вот он»
      const first=rest.replace(/^\s*[:.—–-]\s*/,'').replace(/^\s*\(([^()]*)\)\s*[:.—–-]?\s*/,'[$1] ');
      const text=brackets([first,...rows.slice(1)].join(' ').replace(/\s+/g,' ').trim());
      if(!text)return;if(!scene)startScene('');
      out.push(`${who.name}: ${text}`);scene.speeches++;speeches.set(who.name,(speeches.get(who.name)||0)+1);
    });
    if(badIndex)warnings.push(`${badIndex} speech(es) pointed at a character that is not in the cast and were left out.`);
    for(const [pair,n] of mismatch)warnings.push(`Label differs from the chosen character: ${pair} (${n}×).`);
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

  const api={playLines,readStream,toScript,stripLabel,cost,smartImport,PRICES};root.CueAI=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
