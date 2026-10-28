(function(root){
  function normalize(text){return text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}\s']/gu,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();}
  function speakerKey(name){return name.normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[.\s]+/g,' ').trim();}
  function resolveSpeaker(label,cast=[]){
    const key=speakerKey(label);const exact=cast.find(name=>speakerKey(name)===key);if(exact)return exact;
    const aliases=cast.filter(name=>speakerKey(name).split(' ')[0]===key);return aliases.length===1?aliases[0]:null;
  }
  function isSpeakerName(name){return name.length<=60&&/^[\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*){0,3}$/u.test(name);}
  function parseScript(text,cast=[]){const lines=[];let current=null;const pending=[];for(const raw of text.split(/\r?\n/)){const s=raw.trim();if(!s)continue;const match=s.match(/^([^:\[\]]{1,60}):\s*(.*)$/u);const speaker=match?(cast.length?resolveSpeaker(match[1].trim(),cast):(isSpeakerName(match[1].trim())?match[1].trim():null)):null;
    if(speaker){current={speaker,text:[...pending,match[2].trim()].join(' ').trim()};pending.length=0;lines.push(current);}else if(current){current.text+=' '+s;}else if(/^\[.*\]$/.test(s)){pending.push(s);}else{throw new Error('Start each speech with CHARACTER: dialogue.');}}
    return lines.map(l=>({...l,text:l.text.replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim(),direction:(l.text.match(/\[[^\]]*\]/g)||[]).join(' ')})).filter(l=>l.text);
  }
  function matches(expected,actual){const a=normalize(expected),b=normalize(actual);return !!a&&a===b;}
  const api={normalize,speakerKey,resolveSpeaker,isSpeakerName,parseScript,matches};root.CueCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
