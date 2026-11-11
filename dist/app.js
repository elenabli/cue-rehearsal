const $=id=>document.getElementById(id);
const demo={title:'The Last Light',script:`ELENA: I thought you might still be here.
JAMES: The last train doesn't leave until midnight. We have a little time.
ELENA: A little time is all we ever seem to have.
JAMES: Then let's not waste it on things we cannot change.
ELENA: What if I told you I wasn't going?
JAMES: I'd ask you to say it again.
ELENA: I'm staying. This time, I'm staying.`};
let data={...demo,role:'ELENA',index:0,hide:false,pace:'1',language:'en-GB',voice:'',autoMic:true,pocket:false};let storageFailed=false;
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
let hint={key:'',words:0,open:false};
// Marker: words of your line heard so far, from the recognizer's interim results; the whole line once it's accepted.
// It follows long lines through misheard words: words passed over but not heard stay unmarked (missed).
let heard={key:'',count:0,missed:[]};
function heardPrefix(text,said){return CueCore.progress(text,said).heard;}
function paintHeard(){const line=lines[data.index];if(!running||!line||line.speaker!==data.role)return;const words=line.text.split(/\s+/),current=!pendingAdvance&&heard.key===data.activeScene+':'+data.index,said=pendingAdvance?words.length:current?heard.count:0,missed=new Set(current?heard.missed||[]:[]),shown=data.hide?Math.max(said,hint.words):words.length;if(!data.hide&&!said)return;
 // Hidden lines show as blanks shaped like the words; hints and correctly spoken words fill them in.
 const el=$(data.hide?'hint-text':'current-line');if(data.hide){el.hidden=false;$('hidden-copy').hidden=true;}el.replaceChildren();words.forEach((w,i)=>{const s=document.createElement('span'),miss=missed.has(i),open=i<shown&&!(data.hide&&miss&&i>=hint.words);s.textContent=open?w:w.replace(/[\p{L}\p{N}]/gu,'_');s.className=i<said&&!miss?'heard':open?'':'blank';el.append(s);if(i<words.length-1)el.append(' ');});}
// Hands-free mode (pocket.js): tones say right or wrong and a pause brings a spoken hint, so the phone can stay in a pocket. It always listens by itself.
const Pocket=()=>data.pocket&&window.CuePocket?window.CuePocket:null;const autoMic=()=>data.autoMic||!!Pocket();let pocketMisses={key:'',count:0},spokenHint={key:'',upTo:0};
let captureRetries=0,sessionCount=0,running=false,recognition=null,speaking=false,runId=0,advanceTimer=null,voices=[],retryTimer=null,pendingAdvance=false,partialSpeech='',silenceRetries=0,activeUtterance=null,primer=null,micReady=false,mismatchShown=false,lastSession=null,audioEventsSeen=false,deafRetries=0;
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
// Thinking time. A pause after the start of a line keeps listening (up to THINK_PAUSE seconds in one session, then fresh
// sessions that remember what was said) instead of judging half a line. After THINK_TRIES quiet sessions the line is checked as said.
// Before any words, SILENT_TRIES quiet sessions (about 9 s each) pass before the rehearsal stops to wait for a tap.
const THINK_PAUSE=6,THINK_TRIES=3,SILENT_TRIES=5;
try{navigator.permissions?.query({name:'microphone'}).then(status=>{micReady=status.state==='granted';status.onchange=()=>{micReady=status.state==='granted';};}).catch(()=>{});}catch{}
function persist(){if(data.scenes?.[data.activeScene])data.scenes[data.activeScene].index=data.index;try{localStorage.setItem('cue-v1',JSON.stringify(data));}catch{storageFailed=true;$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';}}
// Speech log: what the mic and voice did, kept across reloads so a stop on the iPhone can be traced. Settings → Speech log → Copy.
let speechLog=[];try{const saved=JSON.parse(localStorage.getItem('cue-speech-log'));if(Array.isArray(saved))speechLog=saved;}catch{}
function slog(message){const d=new Date();const stamp=d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0');speechLog.push(stamp+'  '+message);if(speechLog.length>500)speechLog=speechLog.slice(-500);try{localStorage.setItem('cue-speech-log',JSON.stringify(speechLog));}catch{}}
function feedback(message='',error=false){if(message)slog((error?'SCREEN (error): ':'screen: ')+message.split('\n')[0]);mismatchShown=false;$('feedback').textContent=message;$('feedback').classList.toggle('error',error);}
function stopAudio(){slog('stop audio');closeLong();spokenHint={key:'',upTo:0};runId++;clearTimeout(advanceTimer);clearTimeout(retryTimer);pendingAdvance=false;partialSpeech='';silenceRetries=0;deafRetries=0;captureRetries=0;if(recognition){const old=recognition;recognition=null;old.onresult=old.onerror=null;old.onend=()=>{if(lastSession&&lastSession.rec===old)lastSession.ended=true;};try{old.stop();}catch{}}quietVoice();activeUtterance=null;speaking=false;document.body.classList.remove('listening');}
function pause(){if(running)slog('pause');running=false;stopAudio();render();}
function showView(name){pause();document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));$('crumb').textContent={rehearse:'Rehearse',script:'My script',settings:'Settings'}[name];window.scrollTo({top:0,behavior:'smooth'});}
function render(){const scene=data.scenes[data.activeScene],needsReview=scene.kind==='review',directionsOnly=['directions','review'].includes(scene.kind),line=lines[data.index],mine=line?.speaker===data.role,complete=!line&&!directionsOnly;
 $('play-title').textContent=data.title;$('scene-subtitle').textContent=`${data.scenes[data.activeScene].title} · ${data.activeScene+1} of ${data.scenes.length}`;
 $('scene-picker-wrap').hidden=data.scenes.length<2;$('scene-picker').replaceChildren(...data.scenes.map((scene,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=scene.title+(scene.kind==='review'?' · needs review':'');return o;}));$('scene-picker').value=String(data.activeScene);$('scene-summary').textContent=`${data.scenes.length} scenes in your play · Progress is saved for each scene`;$('line-count').textContent=needsReview?'REVIEW NEEDED':directionsOnly?'STAGE DIRECTIONS':complete?'SCENE COMPLETE':`${data.index+1} / ${lines.length}`;
 $('speaker').textContent=needsReview?'TEXT KEPT · NEEDS REVIEW':directionsOnly?'STAGE DIRECTIONS ONLY':complete?'TAKE A BOW':`${line.speaker}${mine?' · YOU':''}`;
 $('current-line').textContent=directionsOnly?(scene.script.replace(/[\[\]]/g,'')||'No text was extracted for this scene. Check the original PDF.'):complete?'A little more yours, every time.':line.text;$('current-line').classList.toggle('directions-only',directionsOnly);
 // Hint: a stuck actor can reveal the first words or hear the cue again without leaving focus mode.
 const hintKey=data.activeScene+':'+data.index;if(hint.key!==hintKey)hint={key:hintKey,words:0,open:false};const cueBefore=mine&&data.index>0&&lines[data.index-1].speaker!==data.role?lines[data.index-1]:null,canHint=running&&mine&&!pendingAdvance&&!speaking&&(data.hide||!!cueBefore);
 $('hint').hidden=!canHint;$('hint').setAttribute('aria-expanded',String(canHint&&hint.open));$('hint-menu').hidden=!(canHint&&hint.open);$('hint-words').hidden=!data.hide;$('hint-words').textContent=hint.words?'More words':'First words';$('hint-cue').hidden=!cueBefore;
 const hintWords=mine&&hint.words?line.text.split(/\s+/):[];$('hint-text').hidden=!hintWords.length;$('hint-text').textContent=hintWords.slice(0,hint.words).join(' ')+(hint.words<hintWords.length?' …':'');$('hidden-copy').hidden=!!hintWords.length;
 $('current-line').hidden=!!(mine&&data.hide);$('hidden-line').hidden=!(mine&&data.hide);paintHeard();$('stage-direction').textContent=line?.direction?'Stage direction\n'+line.direction.replace(/\]\s*\[/g,'\n').replace(/[\[\]]/g,''):'';
 $('stage-tag').textContent=needsReview?'CHECK THIS SCENE’S TEXT':directionsOnly?'NO DIALOGUE IN THIS SCENE':complete?'BEAUTIFULLY DONE':running?(recognition?'● LISTENING':mine?'YOUR TURN':'PARTNER SPEAKING'):'READY WHEN YOU ARE';
 const prev=mine&&data.index>0?lines[data.index-1]:null,showCue=!!prev&&prev.speaker!==data.role;$('cue-line').hidden=!showCue;$('cue-speaker').textContent=showCue?'CUE · '+prev.speaker:'';$('cue-text').textContent=showCue?prev.text:'';
 $('stage-card').dataset.turn=needsReview||directionsOnly?'idle':complete?'done':pendingAdvance?'correct':recognition?'listening':running?(mine?'mine':'partner'):'idle';
 $('start').disabled=directionsOnly&&data.activeScene===data.scenes.length-1;$('start').innerHTML=directionsOnly?(data.activeScene<data.scenes.length-1?'→ <span>Next scene</span>':'✓ <span>End of play</span>'):running?'Ⅱ <span>Pause</span>':`▶ <span>${complete?'Rehearse again':data.index?'Resume':'Start rehearsal'}</span>`;
 $('listen').disabled=!mine||speaking||pendingAdvance;$('listen').textContent=recognition?'● Listening… ↻':'🎙 Speak';$('hear-line').disabled=complete||!!recognition;$('hear-line').textContent=needsReview?'♫ Hear text':directionsOnly?'♫ Hear direction':'♫ Hear line';$('typed').disabled=!mine||pendingAdvance;$('typed-form').querySelector('button').disabled=!mine||pendingAdvance;
 $('stage-caption').textContent=needsReview?'No lines were recognized. Fix the scene text in Script, or go to the next scene.':directionsOnly?'This scene has no dialogue. Read the direction, then move on.':complete?'Come back to the scene whenever you like.':running&&mine?(recognition?'Listening for your line…':autoMic()?'Your turn. The mic turns on by itself; tap Speak if it doesn’t.':'Your turn. Tap Speak and say your line.'):'Your scene partner speaks. You take your cue.';
 $('role-name').textContent=data.role;$('role-initial').textContent=data.role[0];$('role-lines').textContent=`${lines.filter(l=>l.speaker===data.role).length} lines in this scene`;
 $('role').replaceChildren(...roles.map(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;return o;}));$('role').value=data.role;
 $('hide-toggle').setAttribute('aria-checked',String(data.hide));$('pocket-toggle').setAttribute('aria-checked',String(!!data.pocket));$('reveal-line').textContent=data.hide?'◌ Reveal my lines':'◌ Hide my lines';
 const percent=lines.length?Math.round(data.index/lines.length*100):0;$('progress').value=percent;$('progress-label').textContent=`${percent}% complete`;
 $('preview-lines').replaceChildren();for(const l of lines.slice(Math.min(data.index,lines.length-1),Math.min(data.index,lines.length-1)+3)){const el=document.createElement('div');el.className='preview-line'+(l.speaker===data.role?' mine':'');const label=document.createElement('b');label.textContent=l.speaker;if(l.speaker===data.role){const tag=document.createElement('span');tag.textContent='YOUR LINE';label.append(tag);}const p=document.createElement('p');p.textContent=data.hide&&l.speaker===data.role?'Your words, from memory.':l.text;el.append(label,p);if(l.direction){const direction=document.createElement('p');direction.className='preview-direction';direction.textContent='Direction: '+l.direction.replace(/\]\s*\[/g,' ').replace(/[\[\]]/g,'');el.append(direction);}$('preview-lines').append(el);}
 // While running, the page shows only the lines (see body.rehearsing in style.css).
 document.body.classList[running?'add':'remove']('rehearsing');persist();syncWakeLock();syncPocket();
}
// Keep the screen on while rehearsing: the page pauses itself when hidden,
// so iPhone auto-lock would otherwise end a hands-free run.
let wakeLock=null,wakeLockPending=false;
function syncWakeLock(){const want=running&&!document.hidden;if(want&&!wakeLock&&!wakeLockPending&&navigator.wakeLock){wakeLockPending=true;navigator.wakeLock.request('screen').then(lock=>{wakeLockPending=false;if(!running){lock.release().catch(()=>{});return;}wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;});}).catch(()=>{wakeLockPending=false;});}else if(!want&&wakeLock){const lock=wakeLock;wakeLock=null;lock.release().catch(()=>{});}}
// Hands-free mode while running: a guard ignores stray taps in the pocket (press and hold pauses).
let pocketScreen=false;function syncPocket(){const want=running&&!!Pocket()&&!document.hidden;document.body.classList[want?'add':'remove']('pocket');if(want!==pocketScreen){pocketScreen=want;window.CuePocket?.screen(want);}}
function pocketTone(kind,then){const P=Pocket();if(!P){then?.();return;}slog('tone: '+kind);P.play(kind,then);}
function pocketFinale(){const P=Pocket();if(!P)return;pocketTone('done',()=>{const text=P.phrase('done',data.language);if(text&&!running)speak(text);});}
// Stuck for good (hints used up, or no sound at all): stop, and say so out loud.
function pocketPause(){const P=Pocket();pause();feedback('Paused. Tap Start when you’re ready to go on.',true);pocketTone('pause',()=>{const text=P?.phrase('pause',data.language);if(text&&!running)speak(text);});}
// Spoken hints: after a quiet spell the next few words of the line are spoken. Staying quiet makes the next hint longer, up to the whole line.

function nextHint(l,said){const key=data.activeScene+':'+data.index;if(spokenHint.key!==key)spokenHint={key,upTo:0};const words=l.text.split(/\s+/);if(spokenHint.upTo>=words.length)return '';const from=said?Math.min(CueCore.progress(l.text,said).heard,words.length-1):0;const to=Math.min(words.length,Math.max(from,spokenHint.upTo)+3);spokenHint.upTo=to;hint.words=Math.max(hint.words,to);return words.slice(from,to).join(' ');}
// A missed line in hands-free mode: 1st miss → the cue again, 2nd → your line read aloud, 3rd → read aloud and the scene moves on.
function pocketMiss(lineIndex,token,resume){const P=Pocket(),l=lines[lineIndex],key=data.activeScene+':'+lineIndex;const ok=()=>token===runId&&lineIndex===data.index&&running;const say=(text,then)=>{if(!speak(text,then))then();};
 spokenHint={key:'',upTo:0};if(pocketMisses.key!==key)pocketMisses={key,count:0};const step=P.afterMiss(++pocketMisses.count);slog('hands-free: miss '+pocketMisses.count+' → '+step);
 pocketTone('wrong',()=>{if(!ok())return;if(step==='cue')cueAgain(()=>{if(ok())resume();});else if(step==='say-line')say(l.text,()=>{if(ok())resume();});else say(l.text,()=>{if(ok())pocketTone('next',()=>{if(ok())advance();});});});}
// iPhone sometimes accepts an utterance and never plays it (no onstart). Then the scene stalled. Speak it once more, and if it's still silent, go on: the line is on screen.
function speak(text,onDone,attempt=0){if(!window.speechSynthesis){feedback('Spoken cues are unavailable in this browser. Read the cue on screen.',true);return false;}const id=runId;const waited=quietVoice();const u=new SpeechSynthesisUtterance(text);activeUtterance=u;u.lang=data.language;u.rate=Number(data.pace);const selected=voices.find(v=>v.voiceURI===data.voice)||voices.find(v=>v.lang===data.language)||voices.find(v=>v.lang.startsWith(data.language.split('-')[0]));if(selected)u.voice=selected;speaking=true;render();slog('voice: speak «'+text.slice(0,40)+'»'+(waited?' after 250 ms':'')+(attempt?' (again)':''));let started=false,late=null,t0=0;
 // iPhone sometimes reports the end of a short line many seconds late, and the rehearsal sat waiting. Go on once the line has had ample time; word events from the voice push that moment back.
 const done=()=>{clearTimeout(late);activeUtterance=null;speaking=false;render();onDone?.();},wait=ms=>{clearTimeout(late);late=setTimeout(()=>{if(id!==runId||activeUtterance!==u)return;slog('voice: no end reported, going on');activeUtterance=null;try{window.speechSynthesis.cancel();}catch{}setTimeout(()=>{if(id===runId)done();},250);},ms);};
 const silent=setTimeout(()=>{if(started||id!==runId||activeUtterance!==u)return;activeUtterance=null;if(!attempt){slog('voice: silent for 2.5 s, speaking again');window.speechSynthesis.cancel();setTimeout(()=>{if(id===runId)speak(text,onDone,1);},300);}else{slog('voice: still silent, going on');speaking=false;render();onDone?.();}},2500);
 u.onstart=()=>{t0=Date.now();started=true;voiceUnlocked=true;if(longRec)voicePlayed=true;slog('voice: onstart');wait(3000+text.length*120/(u.rate||1));};u.onboundary=()=>{if(started&&activeUtterance===u)wait(Math.max(3000,3000+text.length*120/(u.rate||1)-(Date.now()-t0)));};u.onend=()=>{slog('voice: onend'+(id!==runId||activeUtterance!==u?' (old)':''));clearTimeout(silent);if(id!==runId||activeUtterance!==u)return;done();};u.onerror=e=>{slog('voice: onerror '+(e&&e.error));clearTimeout(silent);clearTimeout(late);if(id!==runId||activeUtterance!==u)return;activeUtterance=null;speaking=false;running=false;render();feedback('The voice stopped. Tap Resume to try again.',true);};if(waited)setTimeout(()=>{if(id===runId&&activeUtterance===u)window.speechSynthesis.speak(u);},250);else window.speechSynthesis.speak(u);return true;}
// On iPhone, cancel() straight before speak() can make the next line silent. Cancel only when something is actually playing, and say whether the caller should wait a moment.
function quietVoice(){const s=window.speechSynthesis;if(!s||!(s.speaking||s.pending))return false;slog('voice: cancel (was playing)');s.cancel();return true;}
function advance(){pendingAdvance=false;partialSpeech='';silenceRetries=0;deafRetries=0;captureRetries=0;data.index++;$('typed').value='';feedback();render();if(running)playCurrent();}
function playCurrent(){if(!running||data.index>=lines.length){const finished=running&&lines.length>0&&data.index>=lines.length;running=false;render();if(finished)pocketFinale();return;}const l=lines[data.index];if(l.speaker!==data.role){if(!speak(l.text,()=>{if(running)advance();})){running=false;render();}}else{render();feedback('Your turn. Say your line.');if(autoMic()){if(longMode())beginTurn();else listen(true);}}}
function check(transcripts){const l=lines[data.index];if(!l||l.speaker!==data.role||pendingAdvance)return;const correct=transcripts.some(t=>CueCore.matches(l.text,t));if(correct){pendingAdvance=true;partialSpeech='';pocketTone('correct');feedback('Correct ✓');render();const token=runId;advanceTimer=setTimeout(()=>{if(token===runId)advance();},950);}else showMismatch(l.text,transcripts);}
// Mark what didn't match so an actor can tell a forgotten word from a misheard one. Hidden lines show blanks, not the missing words.
function showMismatch(expected,transcripts){const heard=transcripts.filter(t=>t&&t.trim());const prompt=data.hide?(running?' Tap Hint for the first words.':' Reveal the line if you need a prompt.'):'';
 const ops=heard.map(t=>CueCore.diffWords(expected,t)).sort((a,b)=>a.filter(o=>o.type!=='same').length-b.filter(o=>o.type!=='same').length)[0]||[];
 if(!ops.some(o=>o.type==='same')){feedback(`Not quite — stay with this line.\nHeard: “${heard[0]||'…'}”\nTry the whole line again.${prompt}`,true);if(running)$('feedback').append(countItButton());mismatchShown=true;return;}
 const words=ops.map(o=>{const el=document.createElement(o.type==='extra'?'s':'span');el.className='diff-'+o.type;if(o.type==='extra')el.textContent=o.actual;else{el.textContent=o.type!=='same'&&data.hide?'____':o.expected;if(o.type==='changed'){const said=document.createElement('s');said.textContent=o.actual;el.append(' ',said);}}return el;});
 const line=document.createElement('p');line.className='diff-line';for(const el of words)line.append(el,' ');const head=document.createElement('b');head.textContent='Not quite — stay with this line.';const legend=document.createElement('small');legend.textContent='Underlined: missed. Struck through: heard instead.'+prompt;
 feedback('',true);$('feedback').replaceChildren(head,line,legend);if(running)$('feedback').append(countItButton());mismatchShown=true;}
// Recognition sometimes can't hear a word right however clearly it's said («разит» → «рящий тормозит»). The actor knows they said it: let them count it and go on.
function countItButton(){const b=document.createElement('button');b.className='count-it';b.type='button';b.textContent='I said it right ✓ Count it';b.onclick=()=>{const l=lines[data.index];if(!running||!l||l.speaker!==data.role||pendingAdvance)return;stopAudio();feedback();advance();};return b;}
// Safari asks for the microphone the first time listening starts, after the partner's first cue. An earlier open-and-abort mic check at Start is gone: killing sessions is what broke listening on iPhone.
function askForMic(then){then();}
// One long listening session (iPhone). Opening and closing a session for every line makes Safari's mic go deaf and, with it, the partner's voice. Another rehearsal app that keeps its voice working on iPhone listens differently, so here the mic opens once per run and stays open: what's heard while the partner speaks is ignored, and a line is checked from what's heard on the actor's turn.
// iPhone plays speechSynthesis only after it has been started once from a tap. When the scene opens with the actor's own line, the first partner line used to be spoken later, outside any tap, and stayed silent. So a tap that doesn't speak anything itself plays a silent utterance to unlock the voice.
let voiceUnlocked=false;
function unlockVoice(){if(voiceUnlocked||speaking||!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance('а');u.volume=0;u.rate=2;u.lang=data.language;u.onstart=()=>{voiceUnlocked=true;slog('voice: unlocked by tap');};u.onerror=e=>slog('voice: unlock error '+(e&&e.error));slog('voice: unlocking (silent utterance in the tap)');window.speechSynthesis.speak(u);}catch(err){slog('voice: unlock threw '+(err&&err.message));}}
// Off by default everywhere: on Lena's iPhone (2026-11-11) a fresh session per line hears reliably once the voice is unlocked in the Start tap, while one open session goes deaf when the partner's voice plays.
function longMode(){return !!Recognition&&autoMic()&&data.longSession===true;}
let deafTimer=null,longRec=null,longText='',turnFrom=-1,turnStartedAt=0,quietTimer=null,longRestarts=0;
// Thinking time in the one-session mode. What was said earlier in the turn is kept in turnCarry when the mic restarts or a hint is
// spoken, so a pause never throws away the start of the line. A start that fits the line waits: in hands-free mode a spoken hint
// comes after HINT_AFTER ms of quiet; otherwise the half line is checked after JUDGE_AFTER ms so the missing words show.
let turnCarry='',thinkTimer=null;const HINT_AFTER=5000,JUDGE_AFTER=15000;
// On iPhone the partner's voice, once it really plays, can leave the open mic deaf without closing it (seen in Lena's log, 2026-11-11).
// voicePlayed: the voice has played over this session and nothing has been heard since. Then a quiet mic is reopened after DEAF_SOON
// instead of DEAF_LATE. A session we are closing is marked `closing`: iOS flushes its old words again on stop(), and they must not be judged.
let voicePlayed=false;const DEAF_SOON=2500,DEAF_LATE=10000;
function armDeaf(){clearTimeout(deafTimer);const token=runId,wait=voicePlayed?DEAF_SOON:DEAF_LATE;deafTimer=setTimeout(()=>{const rec=longRec;if(token!==runId||turnFrom<0||!rec||rec.closing||speaking)return;slog('no speech heard for '+wait/1000+' s'+(voicePlayed?' after the voice':'')+': reopening the mic');reopenLong();},wait);}
function reopenLong(){const rec=longRec;if(!rec||rec.closing)return;rec.closing=true;voicePlayed=false;try{rec.stop();}catch{}const token=runId;
 // A deaf session may never report that it ended: drop it and open a new one anyway.
 setTimeout(()=>{if(token!==runId||longRec!==rec)return;slog('the old session did not end: opening a new one anyway');rec.onresult=rec.onerror=rec.onend=null;longRec=null;longText='';if(turnFrom>=0)turnFrom=0;if(running&&!speaking)openLong();},1500);}
// Experimental, iPhone: ask Safari to keep one play-and-record audio session, so the voice doesn't take the audio away from the mic. Session changes go to the speech log.
let audioSessionWatched=false;
function holdAudioSession(){const a=navigator.audioSession;if(!a){slog('audio session: API not available');return;}if(!audioSessionWatched){audioSessionWatched=true;try{a.onstatechange=()=>slog('audio session: '+a.state);}catch{}}
 const want=data.holdAudio===false||!longMode()?'auto':'play-and-record';try{if(a.type!==want)a.type=want;slog('audio session: type '+a.type+', '+a.state);}catch(err){slog('audio session: could not set type ('+(err&&err.message)+')');}}
function turnSaid(){return (turnCarry+' '+(turnFrom>=0?longText.slice(Math.min(turnFrom,longText.length)):'')).replace(/\s+/g,' ').trim();}
function openLong(){if(longRec||!running||!longMode())return;const rec=new Recognition();longRec=rec;voicePlayed=false;const sid=++sessionCount;longText='';if(turnFrom>=0)turnFrom=0;rec.lang=data.language;rec.continuous=true;rec.interimResults=true;slog('#'+sid+' start (one session for the scene)');
 rec.onstart=()=>{slog('#'+sid+' onstart');micReady=true;if(turnFrom>=0&&!speaking)armDeaf();};rec.onaudiostart=()=>slog('#'+sid+' onaudiostart');rec.onspeechstart=()=>slog('#'+sid+' onspeechstart');
 rec.onresult=e=>{if(longRec!==rec)return;if(rec.closing){slog('#'+sid+' onresult (ignored, closing)');return;}longRestarts=0;voicePlayed=false;clearTimeout(deafTimer);let text='';for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript+' ';longText=text.replace(/\s+/g,' ').trim();const last=e.results[e.results.length-1];slog('#'+sid+' onresult '+(last.isFinal?'final':'interim')+(turnFrom<0?' (ignored, not your turn)':'')+': '+longText.slice(-60));onLongHeard();};
 rec.onerror=e=>{slog('#'+sid+' onerror '+e.error+(e.message?' ('+e.message+')':''));if(longRec!==rec)return;if(['not-allowed','service-not-allowed'].includes(e.error)){longRec=null;running=false;endTurn();render();feedback('Allow the microphone for this site in Safari settings, then tap Start.',true);}};
 rec.onend=()=>{slog('#'+sid+' onend');if(longRec!==rec)return;longRec=null;if(turnFrom>=0)turnCarry=turnSaid();longText='';if(turnFrom>=0)turnFrom=0;if(speaking){slog('mic closed while the partner speaks; it reopens on your turn');return;}if(running&&longMode()){if(++longRestarts>5){endTurn();feedback('The microphone keeps stopping. Tap Speak to go on.',true);return;}const token=runId;setTimeout(()=>{if(token===runId&&running&&!longRec)openLong();},300);}};
 try{rec.start();}catch(err){slog('#'+sid+' start() threw '+(err&&err.message));longRec=null;}}
function closeLong(){clearTimeout(quietTimer);clearTimeout(thinkTimer);clearTimeout(deafTimer);turnFrom=-1;if(!longRec)return;const rec=longRec;longRec=null;rec.onresult=rec.onerror=null;rec.onend=()=>slog('long session closed');try{rec.stop();}catch{}}
// keep: go on with the same attempt (after a spoken hint); otherwise a fresh attempt at the line.
function beginTurn(keep=false){clearTimeout(quietTimer);if(!keep){turnCarry='';spokenHint={key:'',upTo:0};}turnFrom=longText.length;turnStartedAt=Date.now();document.body.classList.add('listening');if(!mismatchShown)feedback(keep||partialSpeech?'Keep going…':'Listening… Say your line, then pause.');render();if(!longRec)openLong();if(Pocket())armThink();
 // An open mic that hears nothing on the actor's turn is deaf: close it, and it reopens.
 armDeaf();}
// The mic may still be catching the partner's last words when the turn starts. Try the heard text also without leading words from the partner's cue.
function withoutCue(said){const prev=data.index>0?lines[data.index-1]:null;if(!prev||prev.speaker===data.role)return [said];const cue=new Set(CueCore.normalize(prev.text).split(' '));const words=said.split(/\s+/);let i=0;while(i<words.length-1&&cue.has(CueCore.normalize(words[i])))i++;return i?[said,words.slice(i).join(' ')]:[said];}
function endTurn(){clearTimeout(quietTimer);clearTimeout(thinkTimer);clearTimeout(deafTimer);turnFrom=-1;document.body.classList.remove('listening');}
function onLongHeard(){if(turnFrom<0)return;const l=lines[data.index];if(!l||l.speaker!==data.role||speaking||pendingAdvance)return;
 // The partner's last words can arrive just after the voice ends: skip them.
 if(Date.now()-turnStartedAt<500){turnFrom=longText.length;return;}
 if(longText.length<turnFrom)turnFrom=0;clearTimeout(thinkTimer);const said=turnSaid();if(!said)return;const tries=withoutCue(said);
 heard={key:data.activeScene+':'+data.index,count:heardPrefix(l.text,said)};paintHeard();feedback('Listening…\n“'+said+'”');
 if(tries.some(t=>CueCore.matches(l.text,t))){endTurn();check(tries);return;}
 clearTimeout(quietTimer);const token=runId,lineIndex=data.index;quietTimer=setTimeout(()=>{if(token!==runId||lineIndex!==data.index||turnFrom<0)return;const now=withoutCue(turnSaid());
  // A fair start of the line (a misheard word allowed) is the actor thinking: wait, don't judge.
  if(now.some(t=>CueCore.progress(l.text,t).partial)){feedback('Keep going…');armThink();return;}
  missedTurn(now,token,lineIndex);},1800);}
function missedTurn(said,token,lineIndex){endTurn();check(said);if(pendingAdvance||!running)return;const again=()=>{if(token===runId&&running&&lineIndex===data.index)beginTurn();};if(Pocket())pocketMiss(lineIndex,token,again);else cueAgain(again);}
// After a quiet spell in the turn: a spoken hint (hands-free), or, after a long one, check the half line.
function armThink(){clearTimeout(thinkTimer);const token=runId,lineIndex=data.index;thinkTimer=setTimeout(()=>{const l=lines[lineIndex];if(token!==runId||lineIndex!==data.index||turnFrom<0||speaking||pendingAdvance||!l)return;const said=turnSaid();
  if(!Pocket()){if(said)missedTurn(withoutCue(said),token,lineIndex);return;}
  const text=nextHint(l,said);if(!text){pocketPause();return;}
  slog('hint: «'+text+'»');turnCarry=said;turnFrom=-1;clearTimeout(deafTimer);if(!speak(text,()=>{if(token===runId&&running&&lineIndex===data.index)beginTurn(true);}))beginTurn(true);},Pocket()?(spokenHint.key===data.activeScene+':'+lineIndex&&spokenHint.upTo>=(lines[lineIndex]?.text.split(/\s+/).length||0)?JUDGE_AFTER:HINT_AFTER):JUDGE_AFTER);}
// Start the next session only once the last one has really ended: on iOS a session started while the old one still holds the mic can't hear anything.
// iOS often goes deaf when listening restarts straight after a heard attempt, but listening after the partner's voice works. So after a wrong attempt the partner gives the cue again (or says «Ещё раз» on a first line), then the mic opens.
function cueAgain(then){const l=lines[data.index],cue=data.index>0&&lines[data.index-1].speaker!==data.role?lines[data.index-1].text:'';const lang=data.language.split('-')[0];const text=cue||({ru:'Ещё раз.',uk:'Ще раз.',en:'Again.'}[lang]||'');if(!l||!text||!speak(text,then))then();}
function startWhenFree(go,waited=0){const last=lastSession;if(!last||last.ended||waited>=1500){go();return;}const token=runId;retryTimer=setTimeout(()=>{if(token===runId)startWhenFree(go,waited+150);},150);}
// Hands-free mode, one session per line (not iPhone): after a miss or a quiet session the actor hears what to do next.
function pocketRetry(lineIndex,wrong,token){const l=lines[lineIndex],ok=()=>token===runId&&lineIndex===data.index&&running;const again=()=>{if(ok())listen(true);};const wait=go=>{retryTimer=setTimeout(()=>startWhenFree(()=>{if(ok())go();}),400);};
 if(wrong){partialSpeech='';pocketMiss(lineIndex,token,()=>wait(again));return;}
 // The first quiet session just listens again; after that each one brings a spoken hint, and what was said before is kept.
 const text=nextHint(l,partialSpeech);if(!text){pocketPause();return;}slog('hint: «'+text+'»');wait(()=>{if(!speak(text,again))again();});}
function listen(automatic=false,pinged=false){
 if(!Recognition){feedback('Voice input isn’t available here. Open the app in Safari, or type your line.',true);return;}
 if(longMode()&&running){const l=lines[data.index];if(l&&l.speaker===data.role&&!speaking&&!pendingAdvance){slog('tap: listen again (one session)');beginTurn();}return;}
 if(automatic&&!pinged&&!recognition&&!partialSpeech&&!silenceRetries&&Pocket()&&lines[data.index]?.speaker===data.role){const token=runId,lineIndex=data.index;pocketTone('ready',()=>{if(token===runId&&lineIndex===data.index&&running)listen(true,true);});return;}
 if(!lines[data.index]||lines[data.index].speaker!==data.role||speaking||pendingAdvance){slog('listen skipped'+(speaking?' (voice playing)':'')+(pendingAdvance?' (advancing)':''));return;}
 // A tap while listening starts over: stop the old session, then open a fresh one once it has ended.
 if(recognition){if(automatic){slog('listen skipped (already listening)');return;}slog('tap: stop the old session, then start again');const old=recognition;recognition=null;old.onresult=old.onerror=null;old.onend=()=>{if(lastSession&&lastSession.rec===old)lastSession.ended=true;};try{old.stop();}catch{}document.body.classList.remove('listening');clearTimeout(retryTimer);startWhenFree(()=>listen(false));return;}
 deafRetries=automatic?deafRetries:0;
 if(!running&&!automatic)running=true;
 clearTimeout(retryTimer);const rec=new Recognition();recognition=rec;const session={rec,ended:false};lastSession=session;const sid=++sessionCount;slog('#'+sid+' start ('+(automatic?'auto':'tap')+'), line '+(data.index+1));rec.onsoundstart=()=>slog('#'+sid+' onsoundstart');rec.onspeechstart=()=>slog('#'+sid+' onspeechstart');rec.lang=data.language;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=5;
 const token=runId,lineIndex=data.index;heard={key:'',count:0,missed:[]};let finals=[],interim='',failed=false,retryAllowed=true,ended=false,watchdog=null,audio=false,deaf=false,capture=false;
 const candidatesFor=rows=>{let combined=[partialSpeech],fresh=[''];for(const row of rows){combined=combined.flatMap(prefix=>row.map(text=>(prefix+' '+text).trim())).slice(0,25);fresh=fresh.flatMap(prefix=>row.map(text=>(prefix+' '+text).trim())).slice(0,25);}return [...new Set(partialSpeech?[...combined,...fresh]:combined)];};
 // iOS Safari can keep a session open without ever reporting results, which left the mic on but deaf. Stop a quiet session, and drop it if it won't stop.
 const arm=ms=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{if(ended||recognition!==rec)return;slog('#'+sid+' watchdog: stop()');try{rec.stop();}catch{}watchdog=setTimeout(()=>{if(ended||recognition!==rec)return;slog('#'+sid+' watchdog: no onend, abort()');rec.onresult=rec.onerror=null;rec.onend=()=>{session.ended=true;};try{rec.abort();}catch{}finish();},1500);},ms);};
 rec.onaudiostart=()=>{slog('#'+sid+' onaudiostart');audio=true;audioEventsSeen=true;};
 rec.onstart=()=>{slog('#'+sid+' onstart');micReady=true;
  arm(9000);document.body.classList.add('listening');if(!mismatchShown)feedback(partialSpeech?'Keep going…':'Listening… Say your line, then pause.');render();};
 rec.onresult=e=>{{const last=e.results[e.results.length-1];slog('#'+sid+' onresult '+(last.isFinal?'final':'interim')+': '+last[0].transcript);}if(token!==runId||lineIndex!==data.index)return;audio=true;deafRetries=0;captureRetries=0;const lineText=lines[lineIndex]?.text||'';interim='';finals=[];for(let i=0;i<e.results.length;i++){const result=e.results[i];if(result.isFinal)finals.push(Array.from(result).map(a=>a.transcript));else interim+=result[0].transcript;}
  const said=finals.map(a=>a[0]).join(' ')+' '+interim,progress=[CueCore.progress(lineText,said),...(partialSpeech?[CueCore.progress(lineText,partialSpeech+' '+said)]:[])].sort((a,b)=>b.heard-a.heard)[0];
  heard={key:data.activeScene+':'+lineIndex,count:progress.heard,missed:progress.missed};paintHeard();
  // Halfway through the line and pausing: the actor is remembering the rest, so wait longer before ending the attempt.
  arm(progress.partial?THINK_PAUSE*1000:3000);
  feedback('Listening…\n“'+[partialSpeech,...finals.map(r=>r[0]),interim].filter(Boolean).join(' ')+'”');
  // No stop() here: the session ends by itself a moment after a final result, and stopping it as it ends left the next voice line or session silent on iPhone.
 };
 rec.onerror=e=>{slog('#'+sid+' onerror '+e.error+(e.message?' ('+e.message+')':''));if(token!==runId||capture)return;failed=true;
  // Right after the app opens, iPhone can hand over a muted microphone ('Source is muted'). Open it again a moment later instead of stopping the rehearsal.
  if(e.error==='audio-capture'&&running&&captureRetries<2){capture=true;return;}
  // iOS reports a session that heard nothing as 'aborted' (No speech detected). Like no-speech, listen again instead of stopping the rehearsal.
  retryAllowed=['no-speech','aborted'].includes(e.error);if(!retryAllowed){running=false;partialSpeech='';}
  // Silence is thinking time, not a failure: keep the screen as it is and listen again.
  if(retryAllowed)return;
  const messages={'not-allowed':'Allow the microphone for this site in Safari settings, then tap Speak.','service-not-allowed':'Safari blocked automatic listening. Tap Speak, or type your line.','audio-capture':'The microphone isn’t available. Check it, then tap Speak.','network':'Check your internet connection, then tap Speak.','no-speech':'Didn’t catch that. Try again.','aborted':'Didn’t catch that. Try again.'};feedback(messages[e.error]||'Couldn’t recognize speech. Tap Speak to try again.',true);
 };
 const finish=()=>{slog('#'+sid+' onend'+(ended||recognition!==rec?' (ignored)':'')+', finals '+finals.length+(failed?', failed':''));if(ended||recognition!==rec)return;ended=true;if(!deaf&&rec.onend===finish)session.ended=true;recognition=null;clearTimeout(watchdog);document.body.classList.remove('listening');if(token!==runId||lineIndex!==data.index)return;
  // iOS sometimes ends a session without marking anything final; what it heard is still the actor's line.
  if(!finals.length&&interim.trim())finals=[[interim.trim()]];
  if(capture){captureRetries++;slog('microphone was not ready: opening it again');render();retryTimer=setTimeout(()=>startWhenFree(()=>{if(token===runId&&lineIndex===data.index&&running)listen(true,true);}),1000);return;}
  if(deaf){deafRetries++;if(deafRetries>=2||!autoMic()||!running){render();feedback('The microphone stopped hearing. Tap Speak to go on.',true);if(running)pocketTone('pause');return;}render();retryTimer=setTimeout(()=>startWhenFree(()=>{if(token===runId&&lineIndex===data.index&&running)listen(true);}),800);return;}
  let wrong=false;
  if(!failed&&finals.length){silenceRetries=0;const candidates=candidatesFor(finals);
   if(candidates.some(text=>CueCore.matches(lines[lineIndex].text,text)))check(candidates);
   else{const prefix=candidates.filter(text=>CueCore.progress(lines[lineIndex].text,text).partial).sort((a,b)=>b.length-a.length)[0];if(prefix){partialSpeech=prefix;if(!mismatchShown)feedback('Keep going…');}else{partialSpeech='';check(candidates);wrong=!pendingAdvance;}}
  }else if(retryAllowed){silenceRetries++;
   // Stopped partway and stayed quiet: after the thinking time, check what was said so the missing words show.
   if(!Pocket()&&partialSpeech&&silenceRetries>=THINK_TRIES){const said=partialSpeech;partialSpeech='';silenceRetries=0;check([said]);wrong=!pendingAdvance;}}
  if(!running&&!retryAllowed)pocketTone('pause');
  render();if(running&&autoMic()&&!pendingAdvance&&retryAllowed){if(Pocket()&&(wrong||silenceRetries))pocketRetry(lineIndex,wrong,token);else if(silenceRetries>=SILENT_TRIES){running=false;partialSpeech='';render();feedback('I can’t hear you. Tap Speak when you’re ready to go on.',true);}else{const again=()=>{if(token===runId&&lineIndex===data.index&&running)listen(true);};retryTimer=setTimeout(()=>startWhenFree(()=>{if(token!==runId||lineIndex!==data.index||!running)return;if(wrong)cueAgain(again);else again();}),600);}}
 };rec.onend=finish;
 try{rec.start();render();}catch(err){slog('#'+sid+' start() threw '+(err&&err.message));recognition=null;running=false;document.body.classList.remove('listening');feedback('Safari needs a tap to continue. Tap Speak.',true);render();}
}

slog('page loaded'+((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone?' from the Home Screen':' in a browser tab')+': '+navigator.userAgent);document.addEventListener('visibilitychange',()=>slog('page '+document.visibilityState));window.addEventListener('pagehide',()=>slog('page hidden/closed'));
$('copy-speech-log').onclick=async()=>{const text=speechLog.join('\n')||'(empty)';let ok=false;try{await navigator.clipboard.writeText(text);ok=true;}catch{}if(!ok){const area=$('speech-log-text');area.hidden=false;area.value=text;area.select();}$('speech-log-message').textContent=ok?'Copied. Paste it in your message to Claude.':'Select the text below and copy it.';};
$('clear-speech-log').onclick=()=>{speechLog=[];try{localStorage.removeItem('cue-speech-log');}catch{}$('speech-log-text').hidden=true;$('speech-log-message').textContent='Log cleared.';};
$('start').onclick=()=>{slog('Start tapped');if(['directions','review'].includes(data.scenes[data.activeScene].kind)){selectScene(data.activeScene+1);return;}if(running){pause();return;}stopAudio();if(data.pocket)window.CuePocket?.unlock();if(data.index>=lines.length)data.index=0;running=true;feedback();render();window.scrollTo(0,0);holdAudioSession();askForMic(playCurrent);unlockVoice();};
$('listen').onclick=()=>{listen(false);unlockVoice();};
$('hint').onclick=()=>{hint.open=!hint.open;render();};$('hint-words').onclick=()=>{hint.words+=3;hint.open=false;render();};
$('hint-cue').onclick=()=>{const cue=lines[data.index-1];hint.open=false;if(!running||!cue)return;stopAudio();if(!speak(cue.text,()=>{if(running)playCurrent();}))render();};$('restart').onclick=()=>{pause();data.index=0;feedback();$('typed').value='';render();};
$('hear-line').onclick=()=>{const text=['directions','review'].includes(data.scenes[data.activeScene].kind)?data.script.replace(/[\[\]]/g,''):lines[data.index]?.text;if(text){pause();speak(text);}};
function toggleHide(){data.hide=!data.hide;render();}$('pocket-toggle').onclick=()=>{pause();data.pocket=!data.pocket;render();};
// Hands-free mode ignores taps (the phone is in a pocket); press and hold anywhere to pause.
{const guard=$('pocket-guard');let hold=null;const cancel=()=>{clearTimeout(hold);guard.classList.remove('holding');};guard.onpointerdown=e=>{e.preventDefault?.();cancel();guard.classList.add('holding');hold=setTimeout(()=>{guard.classList.remove('holding');if(running)pause();},800);};guard.onpointerup=guard.onpointercancel=guard.onpointerleave=cancel;guard.oncontextmenu=e=>e.preventDefault?.();}$('reveal-line').onclick=toggleHide;$('hide-toggle').onclick=toggleHide;
$('role').onchange=e=>{const selectedRole=e.target.value;if(!roles.includes(selectedRole))return;pause();data.role=selectedRole;data.index=0;feedback();render();};
$('typed-form').onsubmit=e=>{e.preventDefault();if(!recognition&&!speaking&&!pendingAdvance)check([$('typed').value]);};
$('pace').value=data.pace;$('pace').onchange=e=>{pause();data.pace=e.target.value;persist();};
$('language').value=data.language;$('language').onchange=e=>{pause();data.language=e.target.value;data.languageManual=true;data.voice='';populateVoices();persist();};
function populateVoices(){voices=window.speechSynthesis?.getVoices()||[];const available=voices.filter(v=>v.lang.startsWith(data.language.split('-')[0]));$('voice').replaceChildren();const def=document.createElement('option');def.value='';def.textContent='Device default';$('voice').append(def);for(const v of available){const o=document.createElement('option');o.value=v.voiceURI;o.textContent=`${v.name} (${v.lang})`;$('voice').append(o);}$('voice').value=data.voice;}
$('hold-audio').checked=data.holdAudio!==false;$('hold-audio').onchange=e=>{pause();data.holdAudio=e.target.checked;persist();};$('long-session').checked=data.longSession===true;$('long-session').onchange=e=>{pause();data.longSession=e.target.checked;persist();};$('auto-mic').checked=data.autoMic!==false;$('auto-mic').onchange=e=>{const enabled=e.target.checked;pause();data.autoMic=enabled;persist();};
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
 // Scenes whose text is unchanged keep their progress, even if the title or other scenes changed. Reset all progress in Settings.
 pause();const before=data.scenes,activeBefore=before[data.activeScene],used=new Set();for(const scene of validated){const old=before.find(o=>!used.has(o)&&o.title===scene.title&&o.script===scene.script&&o.kind===scene.kind)||before.find(o=>!used.has(o)&&o.script===scene.script&&o.kind===scene.kind);if(old){used.add(old);scene.index=old.index||0;if(old===activeBefore)scene.wasActive=true;}}
 data.title=$('title-input').value.trim()||'Untitled play';data.playText=fullText;data.cast=[...new Set(cast)];$('cast-input').value=data.cast.join('\n');inferLanguage(fullText);$('language').value=data.language;populateVoices();data.scenes=validated;roles=playRoles();if(!roles.length)roles=['ACTOR'];if(!roles.includes(data.role)){data.role=roles[0];for(const scene of data.scenes)scene.index=0;}
 data.activeScene=Math.max(0,data.scenes.findIndex(scene=>scene.wasActive));for(const scene of data.scenes)delete scene.wasActive;data.script=data.scenes[data.activeScene].script;lines=sceneLines(data.scenes[data.activeScene]);data.index=Math.max(0,Math.min(data.scenes[data.activeScene].index||0,lines.length));$('typed').value='';
 $('script-message').textContent='';feedback();render();showView('rehearse');const reviewCount=data.scenes.filter(scene=>scene.kind==='review').length;if(reviewCount)feedback(`Play saved. ${reviewCount} scene${reviewCount===1?'':'s'} need review; their text is kept and the other scenes are ready to rehearse.`);
 }catch(e){$('script-message').textContent=e.message;}};
function selectScene(next){if(!Number.isInteger(next)||!data.scenes[next]||next===data.activeScene)return;pause();data.activeScene=next;data.script=data.scenes[next].script;lines=sceneLines(data.scenes[next]);data.index=Math.max(0,Math.min(data.scenes[next].index||0,lines.length));feedback();$('typed').value='';render();}
$('scene-picker').onchange=e=>selectScene(Number(e.target.value));
$('reset-progress').onclick=()=>{if(window.confirm&&!window.confirm('Start every scene from its first line?'))return;pause();for(const scene of data.scenes)scene.index=0;data.index=0;feedback();$('typed').value='';render();$('reset-message').textContent='Every scene starts from the first line again.';};
$('file-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>500000){$('script-message').textContent='Please use a text file smaller than 500 KB.';return;}$('script-input').value=await file.text();$('cast-input').value=CuePdf.extractCast($('script-input').value).join('\n');if(!$('title-input').value.trim())$('title-input').value=file.name.replace(/\.txt$/i,'');e.target.value='';};
$('export-script').onclick=()=>{const blob=new Blob([$('script-input').value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=($('title-input').value||'scene')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function openHelp(){pause();$('help').showModal();}document.querySelectorAll('.install-help,.help-button').forEach(el=>el.onclick=openHelp);document.querySelectorAll('.dialog-close,.dialog-done').forEach(el=>el.onclick=()=>$('help').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
$('title-input').value=data.title;$('script-input').value=data.playText;$('cast-input').value=data.cast.join('\n');
if(storageFailed)$('storage-notice').textContent='Browser storage is unavailable. Export your script to keep a copy.';
render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
