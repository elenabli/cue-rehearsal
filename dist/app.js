const $=id=>document.getElementById(id);
const demo={title:'The Last Light',script:`ELENA: I thought you might still be here.
JAMES: The last train doesn't leave until midnight. We have a little time.
ELENA: A little time is all we ever seem to have.
JAMES: Then let's not waste it on things we cannot change.
ELENA: What if I told you I wasn't going?
JAMES: I'd ask you to say it again.
ELENA: I'm staying. This time, I'm staying.`};
let data={...demo,role:'ELENA',index:0,hide:false,pace:'1',language:'en-GB',voice:'',autoMic:true};let storageFailed=false;
try{const saved=JSON.parse(localStorage.getItem('cue-v1'));if(saved&&typeof saved.script==='string')Object.assign(data,saved);}catch{storageFailed=true;}
// Migrate the original single-scene save without losing its current line.
if(!Array.isArray(data.scenes)||!data.scenes.length||data.scenes.some(scene=>typeof scene.script!=='string')){
 data.scenes=[{title:'Practice scene',script:data.script,index:data.index||0}];data.activeScene=0;
}
data.activeScene=Math.max(0,Math.min(Number(data.activeScene)||0,data.scenes.length-1));
data.script=data.scenes[data.activeScene].script;data.index=data.scenes[data.activeScene].index||0;
data.playText=typeof data.playText==='string'?data.playText:(data.scenes.length===1?data.script:data.scenes.map(scene=>scene.title+'\n'+scene.script).join('\n\n'));
// Older imports retained isolated footer rows. Repair them using the full
// document's repeated page totals; keep active scene, role, and line progress.
const paginationTotals=CueCore.paginationTotals(data.playText);
data.playText=CueCore.cleanPaginationText(data.playText,paginationTotals);
for(const scene of data.scenes)scene.script=CueCore.cleanPaginationText(scene.script,paginationTotals);
data.script=data.scenes[data.activeScene].script;
data.cast=Array.isArray(data.cast)&&data.cast.length?data.cast:CuePdf.extractCast(data.playText);
function inferLanguage(text){if(data.languageManual)return;const ru=(text.match(/[а-яё]/gi)||[]).length,latin=(text.match(/[a-z]/gi)||[]).length;const language=ru>latin?'ru-RU':latin>ru?'en-GB':data.language;if(language!==data.language){data.language=language;data.voice='';}}
inferLanguage(data.playText);
function playRoles(){if(data.cast.length)return [...data.cast];const names=[];for(const scene of data.scenes){try{for(const line of CueCore.parseScript(scene.script,data.cast))if(!names.includes(line.speaker))names.push(line.speaker);}catch{}}return names;}
function sceneLines(scene){return ['directions','review'].includes(scene.kind)?[]:CueCore.parseScript(scene.script,data.cast);}
let lines;try{lines=sceneLines(data.scenes[data.activeScene]);if(!lines.length&&!['directions','review'].includes(data.scenes[data.activeScene].kind))throw Error();}catch{lines=[];data.scenes[data.activeScene].kind='review';}
let roles=playRoles();if(!roles.length)roles=['ACTOR'];if(!roles.includes(data.role))data.role=roles[0];data.index=Math.max(0,Math.min(Number(data.index)||0,lines.length));
let running=false,recognition=null,speaking=false,runId=0,advanceTimer=null,voices=[],retryTimer=null,pendingAdvance=false,partialSpeech='',silenceRetries=0,activeUtterance=null;
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function persist(){if(data.scenes?.[data.activeScene])data.scenes[data.activeScene].index=data.index;try{localStorage.setItem('cue-v1',JSON.stringify(data));}catch{storageFailed=true;$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';}}
function feedback(message='',error=false){$('feedback').textContent=message;$('feedback').classList.toggle('error',error);}
function stopAudio(){runId++;clearTimeout(advanceTimer);clearTimeout(retryTimer);pendingAdvance=false;partialSpeech='';silenceRetries=0;if(recognition){const old=recognition;recognition=null;old.onend=null;old.onresult=null;old.onerror=null;old.abort();}window.speechSynthesis?.cancel();activeUtterance=null;speaking=false;document.body.classList.remove('listening');}
function pause(){running=false;stopAudio();render();}
function showView(name){pause();document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));$('crumb').textContent={rehearse:'Rehearse',script:'My script',settings:'Settings'}[name];window.scrollTo({top:0,behavior:'smooth'});}
function render(){const scene=data.scenes[data.activeScene],needsReview=scene.kind==='review',directionsOnly=['directions','review'].includes(scene.kind),line=lines[data.index],mine=line?.speaker===data.role,complete=!line&&!directionsOnly;
 $('play-title').textContent=data.title;$('scene-subtitle').textContent=`${data.scenes[data.activeScene].title} · ${data.activeScene+1} of ${data.scenes.length}`;
 $('scene-picker-wrap').hidden=data.scenes.length<2;$('scene-picker').replaceChildren(...data.scenes.map((scene,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=scene.title+(scene.kind==='review'?' · needs review':'');return o;}));$('scene-picker').value=String(data.activeScene);$('scene-summary').textContent=`${data.scenes.length} scenes in your play · Progress is saved for each scene`;$('line-count').textContent=needsReview?'REVIEW NEEDED':directionsOnly?'STAGE DIRECTIONS':complete?'SCENE COMPLETE':`${data.index+1} / ${lines.length}`;
 $('speaker').textContent=needsReview?'TEXT KEPT · NEEDS REVIEW':directionsOnly?'STAGE DIRECTIONS ONLY':complete?'TAKE A BOW':`${line.speaker}${mine?' · YOU':''}`;
 $('current-line').textContent=directionsOnly?(scene.script.replace(/[\[\]]/g,'')||'No text was extracted for this scene. Check the original PDF.'):complete?'A little more yours, every time.':line.text;$('current-line').classList.toggle('directions-only',directionsOnly);
 $('current-line').hidden=!!(mine&&data.hide);$('hidden-line').hidden=!(mine&&data.hide);$('stage-direction').textContent=line?.direction?'Stage direction\n'+line.direction.replace(/\]\s*\[/g,'\n').replace(/[\[\]]/g,''):'';
 $('stage-tag').textContent=needsReview?'CHECK THIS SCENE’S TEXT':directionsOnly?'NO DIALOGUE IN THIS SCENE':complete?'BEAUTIFULLY DONE':running?(recognition?'● LISTENING':mine?'YOUR TURN':'PARTNER SPEAKING'):'READY WHEN YOU ARE';
 const prev=mine&&data.index>0?lines[data.index-1]:null,showCue=!!prev&&prev.speaker!==data.role;$('cue-line').hidden=!showCue;$('cue-speaker').textContent=showCue?'CUE · '+prev.speaker:'';$('cue-text').textContent=showCue?prev.text:'';
 $('stage-card').dataset.turn=needsReview||directionsOnly?'idle':complete?'done':pendingAdvance?'correct':recognition?'listening':running?(mine?'mine':'partner'):'idle';
 $('start').disabled=directionsOnly&&data.activeScene===data.scenes.length-1;$('start').innerHTML=directionsOnly?(data.activeScene<data.scenes.length-1?'→ <span>Next scene</span>':'✓ <span>End of play</span>'):running?'Ⅱ <span>Pause</span>':`▶ <span>${complete?'Rehearse again':data.index?'Resume':'Start rehearsal'}</span>`;
 $('listen').disabled=!mine||!!recognition||speaking;$('listen').textContent=recognition?'● Listening…':'🎙 Speak';$('hear-line').disabled=complete||!!recognition;$('hear-line').textContent=needsReview?'♫ Hear text':directionsOnly?'♫ Hear direction':'♫ Hear line';$('typed').disabled=!mine;$('typed-form').querySelector('button').disabled=!mine;
 $('stage-caption').textContent=needsReview?'No lines were recognized. Fix the scene text in Script, or go to the next scene.':directionsOnly?'This scene has no dialogue. Read the direction, then move on.':complete?'Come back to the scene whenever you like.':running&&mine?(recognition?'Listening for your line…':data.autoMic?'Your turn. The mic turns on by itself; tap Speak if it doesn’t.':'Your turn. Tap Speak and say your line.'):'Your scene partner speaks. You take your cue.';
 $('role-name').textContent=data.role;$('role-initial').textContent=data.role[0];$('role-lines').textContent=`${lines.filter(l=>l.speaker===data.role).length} lines in this scene`;
 $('role').replaceChildren(...roles.map(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;return o;}));$('role').value=data.role;
 $('hide-toggle').setAttribute('aria-checked',String(data.hide));$('reveal-line').textContent=data.hide?'◌ Reveal my lines':'◌ Hide my lines';
 const percent=lines.length?Math.round(data.index/lines.length*100):0;$('progress').value=percent;$('progress-label').textContent=`${percent}% complete`;
 $('preview-lines').replaceChildren();for(const l of lines.slice(Math.min(data.index,lines.length-1),Math.min(data.index,lines.length-1)+3)){const el=document.createElement('div');el.className='preview-line'+(l.speaker===data.role?' mine':'');const label=document.createElement('b');label.textContent=l.speaker;if(l.speaker===data.role){const tag=document.createElement('span');tag.textContent='YOUR LINE';label.append(tag);}const p=document.createElement('p');p.textContent=data.hide&&l.speaker===data.role?'Your words, from memory.':l.text;el.append(label,p);if(l.direction){const direction=document.createElement('p');direction.className='preview-direction';direction.textContent='Direction: '+l.direction.replace(/\]\s*\[/g,' ').replace(/[\[\]]/g,'');el.append(direction);}$('preview-lines').append(el);}
 // While running, the page shows only the lines (see body.rehearsing in style.css).
 document.body.classList[running?'add':'remove']('rehearsing');persist();syncWakeLock();
}
// Keep the screen on while rehearsing: the page pauses itself when hidden,
// so iPhone auto-lock would otherwise end a hands-free run.
let wakeLock=null,wakeLockPending=false;
function syncWakeLock(){const want=running&&!document.hidden;if(want&&!wakeLock&&!wakeLockPending&&navigator.wakeLock){wakeLockPending=true;navigator.wakeLock.request('screen').then(lock=>{wakeLockPending=false;if(!running){lock.release().catch(()=>{});return;}wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;});}).catch(()=>{wakeLockPending=false;});}else if(!want&&wakeLock){const lock=wakeLock;wakeLock=null;lock.release().catch(()=>{});}}
function speak(text,onDone){if(!window.speechSynthesis){feedback('Spoken cues are unavailable in this browser. Read the cue on screen.',true);return false;}const id=runId;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);activeUtterance=u;u.lang=data.language;u.rate=Number(data.pace);const selected=voices.find(v=>v.voiceURI===data.voice)||voices.find(v=>v.lang===data.language)||voices.find(v=>v.lang.startsWith(data.language.split('-')[0]));if(selected)u.voice=selected;speaking=true;render();u.onend=()=>{if(id!==runId)return;activeUtterance=null;speaking=false;render();onDone?.();};u.onerror=()=>{if(id!==runId)return;activeUtterance=null;speaking=false;running=false;render();feedback('The voice stopped. Tap Resume to try again.',true);};window.speechSynthesis.speak(u);return true;}
function advance(){pendingAdvance=false;partialSpeech='';silenceRetries=0;data.index++;$('typed').value='';feedback();render();if(running)playCurrent();}
function playCurrent(){if(!running||data.index>=lines.length){running=false;render();return;}const l=lines[data.index];if(l.speaker!==data.role){if(!speak(l.text,()=>{if(running)advance();})){running=false;render();}}else{render();feedback('Your turn. Say your line.');if(data.autoMic)listen(true);}}
function check(transcripts){const l=lines[data.index];if(!l||l.speaker!==data.role)return;const correct=transcripts.some(t=>CueCore.matches(l.text,t));if(correct){pendingAdvance=true;partialSpeech='';feedback('Correct ✓');render();const token=runId;advanceTimer=setTimeout(()=>{if(token===runId)advance();},950);}else{feedback(`Not quite — stay with this line.\nHeard: “${transcripts[0]||'…'}”\nTry the whole line again.${data.hide?' Reveal the line if you need a prompt.':''}`,true);}}
function listen(automatic=false){
 if(!Recognition){feedback('Voice input isn’t available here. Open the app in Safari, or type your line.',true);return;}
 if(!lines[data.index]||lines[data.index].speaker!==data.role||recognition||speaking||pendingAdvance)return;
 if(!running&&!automatic)running=true;
 clearTimeout(retryTimer);const rec=new Recognition();recognition=rec;rec.lang=data.language;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=5;
 const token=runId,lineIndex=data.index;let finals=[],failed=false,retryAllowed=true,ended=false;
 rec.onstart=()=>{document.body.classList.add('listening');feedback(partialSpeech?'Keep going…':'Listening… Say your line, then pause.');render();};
 rec.onresult=e=>{if(token!==runId||lineIndex!==data.index)return;let interim='';finals=[];for(let i=0;i<e.results.length;i++){const result=e.results[i];if(result.isFinal)finals.push(Array.from(result).map(a=>a.transcript));else interim+=result[0].transcript;}
  feedback('Listening…\n“'+[partialSpeech,...finals.map(r=>r[0]),interim].filter(Boolean).join(' ')+'”');
  if(finals.length){let candidates=[partialSpeech];for(const row of finals)candidates=candidates.flatMap(prefix=>row.map(text=>(prefix+' '+text).trim())).slice(0,25);if(candidates.some(text=>CueCore.matches(lines[lineIndex].text,text)))rec.stop();}
 };
 rec.onerror=e=>{if(token!==runId)return;failed=true;retryAllowed=e.error==='no-speech';if(!retryAllowed){running=false;partialSpeech='';}
  const messages={'not-allowed':'Allow the microphone for this site in Safari settings, then tap Speak.','service-not-allowed':'Safari blocked automatic listening. Tap Speak, or type your line.','audio-capture':'The microphone isn’t available. Check it, then tap Speak.','network':'Check your internet connection, then tap Speak.','no-speech':'Didn’t catch that. Try again.','aborted':'Listening stopped. Tap Speak.'};feedback(messages[e.error]||'Couldn’t recognize speech. Tap Speak to try again.',true);
 };
 rec.onend=()=>{if(ended||recognition!==rec)return;ended=true;recognition=null;document.body.classList.remove('listening');if(token!==runId||lineIndex!==data.index)return;
  if(!failed&&finals.length){silenceRetries=0;let candidates=[partialSpeech];for(const row of finals)candidates=candidates.flatMap(prefix=>row.map(text=>(prefix+' '+text).trim())).slice(0,25);
   if(candidates.some(text=>CueCore.matches(lines[lineIndex].text,text)))check(candidates);
   else{const expected=CueCore.normalize(lines[lineIndex].text);const prefix=candidates.filter(text=>{const value=CueCore.normalize(text);return value&&expected.startsWith(value+' ');}).sort((a,b)=>b.length-a.length)[0];if(prefix){partialSpeech=prefix;feedback('Good start. Carry on from where you stopped.');}else{partialSpeech='';check(candidates);}}
  }else if(retryAllowed){silenceRetries++;if(!failed)feedback('Didn’t hear the whole line. Please say it again.',true);}
  render();if(running&&data.autoMic&&!pendingAdvance&&retryAllowed){if(silenceRetries>=3){running=false;render();feedback('I can’t hear you. Tap Speak when you’re ready to go on.',true);}else retryTimer=setTimeout(()=>{if(token===runId&&lineIndex===data.index&&running)listen(true);},450);}
 };
 try{rec.start();render();}catch{recognition=null;running=false;document.body.classList.remove('listening');feedback('Safari needs a tap to continue. Tap Speak.',true);render();}
}

$('start').onclick=()=>{if(['directions','review'].includes(data.scenes[data.activeScene].kind)){selectScene(data.activeScene+1);return;}if(running){pause();return;}stopAudio();if(data.index>=lines.length)data.index=0;running=true;feedback();render();window.scrollTo(0,0);playCurrent();};
$('listen').onclick=()=>listen(false);$('restart').onclick=()=>{pause();data.index=0;feedback();$('typed').value='';render();};
$('hear-line').onclick=()=>{const text=['directions','review'].includes(data.scenes[data.activeScene].kind)?data.script.replace(/[\[\]]/g,''):lines[data.index]?.text;if(text){pause();speak(text);}};
function toggleHide(){data.hide=!data.hide;render();}$('reveal-line').onclick=toggleHide;$('hide-toggle').onclick=toggleHide;
$('role').onchange=e=>{const selectedRole=e.target.value;if(!roles.includes(selectedRole))return;pause();data.role=selectedRole;data.index=0;feedback();render();};
$('typed-form').onsubmit=e=>{e.preventDefault();if(!recognition&&!speaking){clearTimeout(advanceTimer);check([$('typed').value]);}};
$('pace').value=data.pace;$('pace').onchange=e=>{pause();data.pace=e.target.value;persist();};
$('language').value=data.language;$('language').onchange=e=>{pause();data.language=e.target.value;data.languageManual=true;data.voice='';populateVoices();persist();};
function populateVoices(){voices=window.speechSynthesis?.getVoices()||[];const available=voices.filter(v=>v.lang.startsWith(data.language.split('-')[0]));$('voice').replaceChildren();const def=document.createElement('option');def.value='';def.textContent='Device default';$('voice').append(def);for(const v of available){const o=document.createElement('option');o.value=v.voiceURI;o.textContent=`${v.name} (${v.lang})`;$('voice').append(o);}$('voice').value=data.voice;}
$('auto-mic').checked=data.autoMic!==false;$('auto-mic').onchange=e=>{const enabled=e.target.checked;pause();data.autoMic=enabled;persist();};
$('voice').onchange=e=>{data.voice=e.target.value;persist();};$('test-voice').onclick=()=>{pause();speak(lines.find(l=>l.speaker!==data.role)?.text||lines[0]?.text||data.script);};
window.speechSynthesis?.addEventListener('voiceschanged',populateVoices);populateVoices();
for(const el of document.querySelectorAll('[data-view]'))el.onclick=()=>showView(el.dataset.view);
for(const id of ['edit-script','full-script'])$(id).onclick=()=>showView('script');
$('scene-edit').onclick=()=>{showView('script');const editor=$('script-input');let cursor=0,start=-1;for(let i=0;i<=data.activeScene;i++){start=editor.value.indexOf(data.scenes[i].title,cursor);if(start<0)break;cursor=start+data.scenes[i].title.length;}editor.focus?.();if(start>=0)editor.setSelectionRange?.(start,cursor);};
$('save-script').onclick=()=>{try{
 const fullText=CueCore.cleanPaginationText($('script-input').value);if(!fullText.trim())throw Error('Add a script or upload a PDF before saving.');const split=CuePdf.splitPlayScenes(fullText);
 const nextScenes=split.scenes.length?split.scenes:[{title:'Practice scene',script:fullText}];const cast=$('cast-input').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);// A cast left over from another play names nobody here; detect it afresh.
 const labels=fullText.split(/\r?\n/).map(row=>row.trim().match(/^([^:\[\]]{1,60}?)\s*(?:\([^)]*\)\s*)?(?:[:：.—–]|$)/u)?.[1]).filter(Boolean);
 if(!cast.some(name=>labels.some(label=>CueCore.resolveSpeaker(label,[name]))))cast.splice(0,cast.length,...CuePdf.extractCast(fullText));
 const validated=nextScenes.map(scene=>{
  if(!scene.script.trim())return {...scene,index:0,kind:'review'};
  let script=cast.length?CuePdf.convertPlayText(scene.script,cast):scene.script,parsed=[];try{parsed=CueCore.parseScript(script,cast);}catch{
   script=CuePdf.convertPlayText(script,cast);try{parsed=CueCore.parseScript(script,cast);}catch{}
  }
  if(parsed.length)return {...scene,script,index:0,kind:'dialogue'};
  // Plain narrative is a legitimate scene. Keep it verbatim and never ask
  // the actor to recite it. Malformed speaker labels still need review.
  const speakerLike=/^(?:[\p{Lu}][\p{L}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}'’.-]*){0,3}\s*[:：—–]|[\p{Lu}][\p{L}'’-]*\.[ \t]+\S|[\p{Lu} \t]{2,45}$)/mu;
  if(speakerLike.test(scene.script))return {...scene,index:0,kind:'review'};
  return {...scene,index:0,kind:'directions'};
 });
 pause();data.title=$('title-input').value.trim()||'Untitled play';data.playText=fullText;data.cast=[...new Set(cast)];$('cast-input').value=data.cast.join('\n');inferLanguage(fullText);$('language').value=data.language;populateVoices();data.scenes=validated;data.activeScene=0;data.script=data.scenes[0].script;data.index=0;lines=sceneLines(data.scenes[0]);roles=playRoles();if(!roles.length)roles=['ACTOR'];if(!roles.includes(data.role))data.role=roles[0];
 $('script-message').textContent='';feedback();render();showView('rehearse');const reviewCount=data.scenes.filter(scene=>scene.kind==='review').length;if(reviewCount)feedback(`Play saved. ${reviewCount} scene${reviewCount===1?'':'s'} need review; their text is kept and the other scenes are ready to rehearse.`);
 }catch(e){$('script-message').textContent=e.message;}};
function selectScene(next){if(!Number.isInteger(next)||!data.scenes[next]||next===data.activeScene)return;pause();data.activeScene=next;data.script=data.scenes[next].script;lines=sceneLines(data.scenes[next]);data.index=Math.max(0,Math.min(data.scenes[next].index||0,lines.length));feedback();$('typed').value='';render();}
$('scene-picker').onchange=e=>selectScene(Number(e.target.value));
$('file-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>500000){$('script-message').textContent='Please use a text file smaller than 500 KB.';return;}$('script-input').value=await file.text();$('cast-input').value=CuePdf.extractCast($('script-input').value).join('\n');if(!$('title-input').value.trim())$('title-input').value=file.name.replace(/\.txt$/i,'');e.target.value='';};
$('export-script').onclick=()=>{const blob=new Blob([$('script-input').value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=($('title-input').value||'scene')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function openHelp(){pause();$('help').showModal();}document.querySelectorAll('.install-help,.help-button').forEach(el=>el.onclick=openHelp);document.querySelectorAll('.dialog-close,.dialog-done').forEach(el=>el.onclick=()=>$('help').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
$('title-input').value=data.title;$('script-input').value=data.playText;$('cast-input').value=data.cast.join('\n');
if(storageFailed)$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';
render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
