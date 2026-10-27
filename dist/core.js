(function(root){
  function normalize(text){return text.normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}\s']/gu,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();}
  function parseScript(text){const lines=[];let current=null;for(const raw of text.split(/\r?\n/)){const s=raw.trim();if(!s)continue;const match=s.match(/^([^:\[\]]{1,60}):\s*(.*)$/u);if(match){const speaker=match[1].trim();current={speaker,text:match[2].trim()};lines.push(current);}else if(current){current.text+=' '+s;}else if(!/^\[.*\]$/.test(s)){throw new Error('Start each speech with CHARACTER: dialogue.');}}
    return lines.map(l=>({...l,text:l.text.replace(/\[[^\]]*\]/g,'').trim(),direction:(l.text.match(/\[[^\]]*\]/g)||[]).join(' ')})).filter(l=>l.text);
  }
  function matches(expected,actual){const a=normalize(expected),b=normalize(actual);return !!a&&a===b;}
  const api={normalize,parseScript,matches};root.CueCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
