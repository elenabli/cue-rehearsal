const $=id=>document.getElementById(id);
const demo={title:'The Last Light',script:`ELENA: I thought you might still be here.
JAMES: The last train doesn't leave until midnight. We have a little time.
ELENA: A little time is all we ever seem to have.
JAMES: Then let's not waste it on things we cannot change.
ELENA: What if I told you I wasn't going?
JAMES: I'd ask you to say it again.
ELENA: I'm staying. This time, I'm staying.`};
let data={...demo,role:'ELENA',index:0,hide:false,pace:'1',language:'en-GB',voice:''};let storageFailed=false;
try{const saved=JSON.parse(localStorage.getItem('cue-v1'));if(saved&&typeof saved.script==='string')Object.assign(data,saved);}catch{storageFailed=true;}
// Migrate the original single-scene save without losing its current line.
if(!Array.isArray(data.scenes)||!data.scenes.length||data.scenes.some(scene=>typeof scene.script!=='string')){
 data.scenes=[{title:'Practice scene',script:data.script,index:data.index||0}];data.activeScene=0;
}
data.activeScene=Math.max(0,Math.min(Number(data.activeScene)||0,data.scenes.length-1));
data.script=data.scenes[data.activeScene].script;data.index=data.scenes[data.activeScene].index||0;
data.playText=typeof data.playText==='string'?data.playText:(data.scenes.length===1?data.script:data.scenes.map(scene=>scene.title+'\n'+scene.script).join('\n\n'));
function playRoles(){const names=[];for(const scene of data.scenes){try{for(const line of CueCore.parseScript(scene.script))if(!names.includes(line.speaker))names.push(line.speaker);}catch{}}return names;}
function sceneLines(scene){return ['directions','review'].includes(scene.kind)?[]:CueCore.parseScript(scene.script);}
let lines;try{lines=sceneLines(data.scenes[data.activeScene]);if(!lines.length&&!['directions','review'].includes(data.scenes[data.activeScene].kind))throw Error();}catch{data={...data,...demo,index:0,role:'ELENA'};lines=CueCore.parseScript(demo.script);data.scenes=[{title:'Practice scene',script:demo.script,index:0}];data.activeScene=0;data.playText=demo.script;}
let roles=playRoles();if(!roles.length)roles=['ACTOR'];if(!roles.includes(data.role))data.role=roles[0];data.index=Math.max(0,Math.min(Number(data.index)||0,lines.length));
let running=false,recognition=null,speaking=false,runId=0,advanceTimer=null,voices=[];
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function persist(){if(data.scenes?.[data.activeScene])data.scenes[data.activeScene].index=data.index;try{localStorage.setItem('cue-v1',JSON.stringify(data));}catch{storageFailed=true;$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';}}
function feedback(message='',error=false){$('feedback').textContent=message;$('feedback').classList.toggle('error',error);}
function stopAudio(){runId++;clearTimeout(advanceTimer);if(recognition){const old=recognition;recognition=null;old.onend=null;old.onresult=null;old.onerror=null;old.abort();}window.speechSynthesis?.cancel();speaking=false;document.body.classList.remove('listening');}
function pause(){running=false;stopAudio();render();}
function showView(name){pause();document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));$('crumb').textContent={rehearse:'Rehearse',script:'My script',settings:'Settings'}[name];window.scrollTo({top:0,behavior:'smooth'});}
function render(){const scene=data.scenes[data.activeScene],needsReview=scene.kind==='review',directionsOnly=['directions','review'].includes(scene.kind),line=lines[data.index],mine=line?.speaker===data.role,complete=!line&&!directionsOnly;
 $('play-title').textContent=data.title;$('scene-subtitle').textContent=`${data.scenes[data.activeScene].title} · ${data.activeScene+1} of ${data.scenes.length}`;
 $('scene-picker-wrap').hidden=data.scenes.length<2;$('scene-picker').replaceChildren(...data.scenes.map((scene,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=scene.title+(scene.kind==='review'?' · проверить текст':'');return o;}));$('scene-picker').value=String(data.activeScene);$('scene-summary').textContent=`${data.scenes.length} scenes in your play · Progress is saved for each scene`;$('line-count').textContent=needsReview?'REVIEW NEEDED':directionsOnly?'STAGE DIRECTIONS':complete?'SCENE COMPLETE':`${data.index+1} / ${lines.length}`;
 $('speaker').textContent=needsReview?'ТЕКСТ СОХРАНЁН · НУЖНА ПРОВЕРКА':directionsOnly?'РЕМАРКА · БЕЗ РЕПЛИК':complete?'TAKE A BOW':`${line.speaker}${mine?' · YOU':''}`;
 $('current-line').textContent=directionsOnly?(scene.script||'В этой сцене не извлечён текст. Проверьте исходный PDF.'):complete?'A little more yours, every time.':line.text;$('current-line').classList.toggle('directions-only',directionsOnly);
 $('current-line').hidden=!!(mine&&data.hide);$('hidden-line').hidden=!(mine&&data.hide);$('stage-direction').textContent=line?.direction||'';
 $('stage-tag').textContent=needsReview?'ПРОВЕРЬТЕ ТЕКСТ СЦЕНЫ':directionsOnly?'СЦЕНА БЕЗ ДИАЛОГА':complete?'BEAUTIFULLY DONE':running?(mine?'YOUR MOMENT':'YOUR PARTNER’S CUE'):'READY WHEN YOU ARE';
 $('start').disabled=directionsOnly&&data.activeScene===data.scenes.length-1;$('start').innerHTML=directionsOnly?(data.activeScene<data.scenes.length-1?'→ <span>Следующая сцена</span>':'✓ <span>Конец пьесы</span>'):running?'Ⅱ <span>Pause rehearsal</span>':`▶ <span>${complete?'Rehearse again':data.index?'Resume rehearsal':'Start rehearsal'}</span>`;
 $('listen').disabled=!mine||!!recognition||speaking;$('hear-line').disabled=complete||!!recognition;$('hear-line').textContent=needsReview?'♫ Прослушать текст':directionsOnly?'♫ Прослушать ремарку':'♫ Hear line';$('typed').disabled=!mine;$('typed-form').querySelector('button').disabled=!mine;
 $('stage-caption').textContent=needsReview?'Реплики не распознаны. Исправьте текст сцены в My script или перейдите к следующей.':directionsOnly?'В этой сцене нет реплик. Прочитайте ремарку и переходите дальше.':complete?'Come back to the scene whenever you like.':running&&mine?'Tap the microphone, then say your whole line.':'Your scene partner speaks. You take your cue.';
 $('role-name').textContent=data.role;$('role-initial').textContent=data.role[0];$('role-lines').textContent=`${lines.filter(l=>l.speaker===data.role).length} lines in this scene`;
 $('role').replaceChildren(...roles.map(r=>{const o=document.createElement('option');o.value=r;o.textContent=r.charAt(0)+r.slice(1).toLowerCase();return o;}));$('role').value=data.role;
 $('hide-toggle').setAttribute('aria-checked',String(data.hide));$('reveal-line').textContent=data.hide?'◌ Reveal my lines':'◌ Hide my lines';
 const percent=lines.length?Math.round(data.index/lines.length*100):0;$('progress').value=percent;$('progress-label').textContent=`${percent}% complete`;
 $('preview-lines').replaceChildren();for(const l of lines.slice(Math.min(data.index,lines.length-1),Math.min(data.index,lines.length-1)+3)){const el=document.createElement('div');el.className='preview-line'+(l.speaker===data.role?' mine':'');const label=document.createElement('b');label.textContent=l.speaker;if(l.speaker===data.role){const tag=document.createElement('span');tag.textContent='YOUR LINE';label.append(tag);}const p=document.createElement('p');p.textContent=data.hide&&l.speaker===data.role?'Your words, from memory.':l.text;el.append(label,p);$('preview-lines').append(el);}
 persist();
}
function speak(text,onDone){if(!window.speechSynthesis){feedback('Spoken cues are unavailable in this browser. Read the cue on screen.',true);return false;}const id=runId;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=data.language;u.rate=Number(data.pace);const selected=voices.find(v=>v.voiceURI===data.voice)||voices.find(v=>v.lang===data.language)||voices.find(v=>v.lang.startsWith(data.language.split('-')[0]));if(selected)u.voice=selected;speaking=true;render();u.onend=()=>{if(id!==runId)return;speaking=false;render();onDone?.();};u.onerror=()=>{if(id!==runId)return;speaking=false;running=false;render();feedback('The voice stopped. Tap Resume rehearsal to try again.',true);};window.speechSynthesis.speak(u);return true;}
function advance(){data.index++;$('typed').value='';feedback();render();if(running)playCurrent();}
function playCurrent(){if(!running||data.index>=lines.length){running=false;render();return;}const l=lines[data.index];if(l.speaker!==data.role){if(!speak(l.text,()=>{if(running)advance();})){running=false;render();}}else{render();feedback('Your turn. Tap the microphone and say the whole line.');}}
function check(transcripts){const l=lines[data.index];if(!l||l.speaker!==data.role)return;const correct=transcripts.some(t=>CueCore.matches(l.text,t));if(correct){feedback('That’s your line. ✓');const token=runId;advanceTimer=setTimeout(()=>{if(token===runId)advance();},950);}else{feedback(`Not quite — stay with this line.\nHeard: “${transcripts[0]||'…'}”\nTry the whole line again.${data.hide?' Reveal the line if you need a prompt.':''}`,true);}}
function listen(){if(!Recognition){feedback('Voice input is unavailable here. Open this app in Safari on iPhone, or type your line below.',true);return;}if(!lines[data.index]||lines[data.index].speaker!==data.role||recognition||speaking)return;
 clearTimeout(advanceTimer);const rec=new Recognition();recognition=rec;rec.lang=data.language;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=5;let finalHeard=false;const token=runId;
 rec.onstart=()=>{document.body.classList.add('listening');feedback('Listening… Say the whole line, then pause.');render();};
 rec.onresult=e=>{if(token!==runId)return;let finalResults=[];let interim='';for(let i=0;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)finalResults.push(r);else interim+=r[0].transcript;}if(finalResults.length&&!finalHeard){finalHeard=true;let alternatives=[''];for(const result of finalResults){alternatives=alternatives.flatMap(prefix=>Array.from(result).map(a=>(prefix+' '+a.transcript).trim())).slice(0,25);}check(alternatives);rec.stop();}else if(!finalHeard&&interim)feedback(`Listening…\n“${interim}”`);};
 rec.onerror=e=>{if(token!==runId)return;const messages={'not-allowed':'Microphone permission was denied. Allow microphone access in Safari’s website settings, then try again.','service-not-allowed':'Speech recognition is unavailable. Try Safari with Siri and Dictation enabled, or type your line.','audio-capture':'No microphone is available. Check your microphone and try again.','network':'Speech recognition needs a connection. Reconnect and try again.','no-speech':'I didn’t hear a line. Tap the microphone to try again.','aborted':'Listening stopped. Tap the microphone to try again.'};feedback(messages[e.error]||'Couldn’t recognize your line. Tap the microphone to try again.',true);};
 rec.onend=()=>{if(recognition!==rec)return;recognition=null;document.body.classList.remove('listening');render();if(!finalHeard&&$('feedback').textContent.startsWith('Listening'))feedback('No complete line was recognized. Tap the microphone and try again.',true);};
 try{rec.start();render();}catch{recognition=null;feedback('Couldn’t start the microphone. Try again, or use the typed line check.',true);render();}}
$('start').onclick=()=>{if(['directions','review'].includes(data.scenes[data.activeScene].kind)){selectScene(data.activeScene+1);return;}if(running){pause();return;}stopAudio();if(data.index>=lines.length)data.index=0;running=true;feedback();render();playCurrent();};
$('listen').onclick=listen;$('restart').onclick=()=>{pause();data.index=0;feedback();$('typed').value='';render();};
$('hear-line').onclick=()=>{const text=['directions','review'].includes(data.scenes[data.activeScene].kind)?data.script:lines[data.index]?.text;if(text){pause();speak(text);}};
function toggleHide(){data.hide=!data.hide;render();}$('reveal-line').onclick=toggleHide;$('hide-toggle').onclick=toggleHide;
$('role').onchange=e=>{pause();data.role=e.target.value;data.index=0;feedback();render();};
$('typed-form').onsubmit=e=>{e.preventDefault();if(!recognition&&!speaking){clearTimeout(advanceTimer);check([$('typed').value]);}};
$('pace').value=data.pace;$('pace').onchange=e=>{pause();data.pace=e.target.value;persist();};
$('language').value=data.language;$('language').onchange=e=>{pause();data.language=e.target.value;data.voice='';populateVoices();persist();};
function populateVoices(){voices=window.speechSynthesis?.getVoices()||[];const available=voices.filter(v=>v.lang.startsWith(data.language.split('-')[0]));$('voice').replaceChildren();const def=document.createElement('option');def.value='';def.textContent='Device default';$('voice').append(def);for(const v of available){const o=document.createElement('option');o.value=v.voiceURI;o.textContent=`${v.name} (${v.lang})`;$('voice').append(o);}$('voice').value=data.voice;}
$('voice').onchange=e=>{data.voice=e.target.value;persist();};$('test-voice').onclick=()=>{pause();speak(lines.find(l=>l.speaker!==data.role)?.text||lines[0]?.text||data.script);};
window.speechSynthesis?.addEventListener('voiceschanged',populateVoices);populateVoices();
for(const el of document.querySelectorAll('[data-view]'))el.onclick=()=>showView(el.dataset.view);
for(const id of ['edit-script','full-script'])$(id).onclick=()=>showView('script');
$('scene-edit').onclick=()=>{showView('script');const editor=$('script-input');let cursor=0,start=-1;for(let i=0;i<=data.activeScene;i++){start=editor.value.indexOf(data.scenes[i].title,cursor);if(start<0)break;cursor=start+data.scenes[i].title.length;}editor.focus?.();if(start>=0)editor.setSelectionRange?.(start,cursor);};
$('save-script').onclick=()=>{try{
 const fullText=$('script-input').value;if(!fullText.trim())throw Error('Add a script or upload a PDF before saving.');const split=CuePdf.splitPlayScenes(fullText);
 const nextScenes=split.scenes.length?split.scenes:[{title:'Practice scene',script:fullText}];
 const validated=nextScenes.map(scene=>{
  if(!scene.script.trim())return {...scene,index:0,kind:'review'};
  let script=scene.script,parsed=[];try{parsed=CueCore.parseScript(script);}catch{
   script=CuePdf.convertPlayText(script);try{parsed=CueCore.parseScript(script);}catch{}
  }
  if(parsed.length)return {...scene,script,index:0,kind:'dialogue'};
  // Plain narrative is a legitimate scene. Keep it verbatim and never ask
  // the actor to recite it. Malformed speaker labels still need review.
  const speakerLike=/^(?:[\p{Lu}][\p{L}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}'’.-]*){0,3}\s*[:：—–]|[\p{Lu}][\p{L}'’-]*\.[ \t]+\S|[\p{Lu} \t]{2,45}$)/mu;
  if(speakerLike.test(scene.script))return {...scene,index:0,kind:'review'};
  return {...scene,index:0,kind:'directions'};
 });
 pause();data.title=$('title-input').value.trim()||'Untitled play';data.playText=fullText;data.scenes=validated;data.activeScene=0;data.script=data.scenes[0].script;data.index=0;lines=sceneLines(data.scenes[0]);roles=playRoles();if(!roles.length)roles=['ACTOR'];if(!roles.includes(data.role))data.role=roles[0];
 $('script-message').textContent='';feedback();render();showView('rehearse');const reviewCount=data.scenes.filter(scene=>scene.kind==='review').length;if(reviewCount)feedback(`Пьеса сохранена целиком. Сцен для проверки: ${reviewCount}. Их исходный текст сохранён; остальные сцены доступны для репетиции.`);
 }catch(e){$('script-message').textContent=e.message;}};
function selectScene(next){if(!Number.isInteger(next)||!data.scenes[next]||next===data.activeScene)return;pause();data.activeScene=next;data.script=data.scenes[next].script;lines=sceneLines(data.scenes[next]);data.index=Math.max(0,Math.min(data.scenes[next].index||0,lines.length));feedback();$('typed').value='';render();}
$('scene-picker').onchange=e=>selectScene(Number(e.target.value));
$('file-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>500000){$('script-message').textContent='Please use a text file smaller than 500 KB.';return;}$('script-input').value=await file.text();if(!$('title-input').value.trim())$('title-input').value=file.name.replace(/\.txt$/i,'');e.target.value='';};
$('export-script').onclick=()=>{const blob=new Blob([$('script-input').value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=($('title-input').value||'scene')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function openHelp(){pause();$('help').showModal();}document.querySelectorAll('.install-help,.help-button').forEach(el=>el.onclick=openHelp);document.querySelectorAll('.dialog-close,.dialog-done').forEach(el=>el.onclick=()=>$('help').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
$('title-input').value=data.title;$('script-input').value=data.playText;
if(storageFailed)$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';
render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
