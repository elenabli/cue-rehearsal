// In the iPhone app (Capacitor), speech goes through Apple's native recognizer and voice instead of Safari's.
// This file dresses the native plugin up as the Web Speech API, so app.js works the same on the web and in the app.
// On the web it does nothing.
(function(root){
  const cap=root.Capacitor;
  // registerPlugin comes from vendor/capacitor/capacitor.js (Capacitor's core), which must load before this file.
  const register=cap&&(cap.registerPlugin||(root.capacitorExports&&root.capacitorExports.registerPlugin));
  if(!cap||!cap.isNativePlatform||!cap.isNativePlatform()||!register)return;
  const Cue=register('CueSpeech');
  let seq=0;const sessions=new Map(),utterances=new Map();
  // Speech log for Settings: what the native recognizer did and what the page saw (no audio, no words).
  const logLines=[];const t0=Date.now();const note=line=>{logLines.push(line);if(logLines.length>600)logLines.splice(0,logLines.length-600);};
  const pageLog=text=>note('page '+((Date.now()-t0)/1000).toFixed(2)+' '+text);
  Cue.addListener('log',e=>note('ios  '+e.line));
  root.CueSpeechLog={lines:()=>logLines.slice(),note:pageLog};

  class NativeRecognition{
    constructor(){this.lang='en-US';this.interimResults=true;this.continuous=false;this.maxAlternatives=1;this.phrases=[];this.id=null;this.ended=false;this.onstart=this.onaudiostart=this.onresult=this.onerror=this.onend=null;}
    start(){if(this.id)throw new Error('InvalidStateError: already started');this.id='r'+(++seq);sessions.set(this.id,this);pageLog(this.id+' start');
      Cue.startListening({id:this.id,lang:this.lang,phrases:this.phrases||[]}).catch(()=>{this._event({type:'error',error:'audio-capture'});this._event({type:'end'});});}
    stop(){if(this.id&&!this.ended){pageLog(this.id+' stop');}if(this.id&&!this.ended)Cue.stopListening({id:this.id}).catch(()=>{});}
    // Mid-line thinking: wait this many seconds of quiet before ending the line (0 = the usual short pause).
    holdPause(seconds){if(this.id&&!this.ended){pageLog(this.id+' hold '+seconds);Cue.setPause({id:this.id,seconds:Number(seconds)||0}).catch(()=>{});}}
    abort(){if(this.id&&!this.ended){pageLog(this.id+' abort');}if(this.id&&!this.ended)Cue.abortListening({id:this.id}).catch(()=>{});}
    _event(e){if(this.ended)return;if(e.type!=='result')pageLog(this.id+' '+e.type+(e.error?' '+e.error:'')+(e.detail?' ('+e.detail+')':'')+(this['on'+e.type]?'':' [no handler]'));if(e.type==='end'){this.ended=true;sessions.delete(this.id);}
      const handler=this['on'+e.type];if(!handler)return;
      if(e.type==='result'){const alternatives=(e.transcripts||[]).map(transcript=>({transcript,confidence:1}));alternatives.isFinal=!!e.isFinal;handler.call(this,{results:[alternatives],resultIndex:0});}
      else if(e.type==='error')handler.call(this,{error:e.error,detail:e.detail});
      else handler.call(this,{});}
  }
  Cue.addListener('recognition',e=>{const s=sessions.get(e.id);if(s)s._event(e);});

  class NativeUtterance{constructor(text=''){this.text=text;this.lang='';this.rate=1;this.voice=null;this.onend=this.onerror=null;}}
  let voices=[];const voiceListeners=[];
  const synthesis={
    get speaking(){return utterances.size>0;},
    getVoices(){return voices;},
    addEventListener(type,fn){if(type==='voiceschanged')voiceListeners.push(fn);},
    speak(u){const id='u'+(++seq);utterances.set(id,u);Cue.speak({id,text:u.text,lang:u.lang,rate:Number(u.rate)||1,voice:u.voice?u.voice.voiceURI:''}).catch(()=>{if(utterances.delete(id))u.onerror?.({error:'synthesis-failed'});});},
    cancel(){utterances.clear();Cue.cancelSpeech().catch(()=>{});}
  };
  Cue.addListener('speech',e=>{const u=utterances.get(e.id);if(!u)return;utterances.delete(e.id);(e.type==='end'?u.onend:u.onerror)?.call(u,{});});
  Cue.getVoices().then(r=>{voices=r.voices||[];voiceListeners.forEach(fn=>{try{fn();}catch{}});}).catch(()=>{});

  // Keep the screen on during a rehearsal, as the web version does with the Wake Lock API.
  const wakeLock={request(){Cue.keepAwake({on:true}).catch(()=>{});const listeners=[];return Promise.resolve({release(){Cue.keepAwake({on:false}).catch(()=>{});listeners.forEach(fn=>fn());return Promise.resolve();},addEventListener(type,fn){if(type==='release')listeners.push(fn);}});}};

  root.SpeechRecognition=NativeRecognition;root.webkitSpeechRecognition=NativeRecognition;root.SpeechSynthesisUtterance=NativeUtterance;
  try{Object.defineProperty(root,'speechSynthesis',{value:synthesis,configurable:true});}catch{}
  try{Object.defineProperty(root.navigator,'wakeLock',{value:wakeLock,configurable:true});}catch{}
  root.CueNative=true;
})(typeof window!=='undefined'?window:globalThis);
