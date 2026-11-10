// Hands-free mode: rehearse with the phone in a pocket. Short tones (and haptics in the iPhone app)
// say what happened, so the actor never has to look at the screen.
// In the iPhone app the tones and haptics are played natively (see CuePocketNative in native.js),
// because web audio in the app's web view could take over the audio session the microphone uses.
(function(root){
  // Each tone is a list of [frequency Hz, seconds, loudness 0–1]. Haptic: success, error, buzz, light or none.
  const tones={
    ready:{notes:[[880,.09,.22]],haptic:'light'},              // the mic is open: say your line
    correct:{notes:[[660,.09,.3],[990,.17,.3]],haptic:'success'},
    wrong:{notes:[[311,.14,.35],[233,.26,.35]],haptic:'buzz'},
    next:{notes:[[523,.09,.25],[523,.09,.25]],haptic:'light'},  // moving on without the line
    done:{notes:[[523,.12,.28],[659,.12,.28],[784,.12,.28],[1047,.34,.3]],haptic:'success'},
    pause:{notes:[[440,.12,.3],[330,.22,.3]],haptic:'error'}
  };
  const gap=.03;
  const length=kind=>{const t=tones[kind];return t?t.notes.reduce((s,n)=>s+n[1]+gap,0):0;};
  let ctx=null;
  // Safari plays web audio only after a tap has unlocked it: call this from the Start tap.
  function unlock(){if(root.CuePocketNative)return;try{const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;ctx=ctx||new AC();if(ctx.state==='suspended')ctx.resume().catch(()=>{});}catch{ctx=null;}}
  function playWeb(t){if(!ctx)unlock();if(!ctx)return;let at=ctx.currentTime+.02;for(const [f,d,g] of t.notes){const o=ctx.createOscillator(),v=ctx.createGain();o.type='sine';o.frequency.value=f;v.gain.setValueAtTime(0,at);v.gain.linearRampToValueAtTime(g,at+.01);v.gain.exponentialRampToValueAtTime(.001,at+d);o.connect(v);v.connect(ctx.destination);o.start(at);o.stop(at+d+.02);at+=d+gap;}
    // Phones that support web vibration (not iPhone Safari) get a buzz on a wrong line.
    try{if(t.haptic==='buzz')root.navigator?.vibrate?.(300);else if(t.haptic==='success')root.navigator?.vibrate?.(40);}catch{}}
  // Play a tone, then call `then` once it has finished, so the next sound or the microphone doesn't overlap it.
  function play(kind,then){const t=tones[kind];if(!t){then?.();return;}
    try{if(root.CuePocketNative)root.CuePocketNative.tone(t.notes,t.haptic,gap);else playWeb(t);}catch{}
    if(then)setTimeout(then,Math.round(length(kind)*1000)+80);}
  // Short spoken phrases in the play's language. Unknown languages fall back to the tone alone.
  const phrases={
    done:{ru:'Сцена пройдена.',uk:'Сцену пройдено.',en:'Scene complete.',fr:'Scène terminée.',de:'Szene geschafft.',es:'Escena terminada.',it:'Scena finita.',fi:'Kohtaus valmis.'},
    pause:{ru:'Пауза.',uk:'Пауза.',en:'Paused.',fr:'Pause.',de:'Pause.',es:'Pausa.',it:'Pausa.',fi:'Tauko.'}
  };
  const phrase=(name,language)=>phrases[name]?.[String(language||'').split('-')[0]]||'';
  // How a missed line goes on in hands-free mode: 1st miss → hear the cue again, 2nd → hear your line, 3rd → hear it and move on.
  function afterMiss(count){return count>=3?'move-on':count===2?'say-line':'cue';}
  // Turn proximity screen-off on or off (iPhone app only).
  function screen(on){try{root.CuePocketNative?.proximity(on);}catch{}}
  root.CuePocket={play,unlock,phrase,afterMiss,screen,length,tones};
})(typeof window!=='undefined'?window:globalThis);
