/* Check the play after import. The script text stays the single source of
   truth: this file reads it into roles, scenes and lines, lets the actor fix
   what the importer got wrong, and writes plain text back to the editor.
   The first half is pure logic (also used by tests); the second half is the
   screen. Nothing is uploaded. */
(function(root){
  const Core=()=>root.CueCore,Pdf=()=>root.CuePdf;
  const CAST_HEADING=/^(?:действующие\s+лица|characters)\s*[:.]?$/iu;
  const isRemarkRow=row=>/^\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]$/.test(row);
  const unbracket=text=>text.replace(/^\[/,'').replace(/\]$/,'');

  // Text → {cast, scenes:[{title, blocks:[{speaker|null, text}]}]}. A block
  // with a speaker is a speech; without one it is a stage direction.
  function parseDraft(text,cast=[]){
    const split=Pdf().splitPlayScenes(text);
    const scenes=(split.scenes.length?split.scenes:[{title:'',script:text}]).map(scene=>({title:scene.title,blocks:parseBlocks(scene.script,cast)}));
    return {cast:[...cast],scenes};
  }
  function parseBlocks(script,cast){
    const blocks=[];let current=null,inCast=false;
    for(const raw of script.replace(/\r/g,'').split('\n')){
      const row=raw.trim();if(!row){inCast=false;continue;}
      // The roster the importer writes above the first scene is not a line.
      if(CAST_HEADING.test(row)&&!blocks.length){inCast=true;continue;}if(inCast)continue;
      const m=row.match(/^([^:\[\]]{1,60}):\s*(.*)$/u);
      const speaker=m?(cast.length?Core().resolveSpeaker(m[1].trim(),cast):(Core().isSpeakerName(m[1].trim())?m[1].trim():null)):null;
      if(speaker){current={speaker,text:m[2].trim()};blocks.push(current);}
      else if(isRemarkRow(row)){blocks.push({speaker:null,text:unbracket(row)});current=null;}
      else if(current)current.text+=(current.text?'\n':'')+row;
      else blocks.push({speaker:null,text:row});
    }
    return blocks;
  }
  function serialize(model){
    return model.scenes.map(scene=>(scene.title?scene.title+'\n':'')+scene.blocks.map(block=>block.speaker?block.speaker+': '+block.text:block.text.split('\n').map(row=>'['+row.replace(/[\[\]]/g,'')+']').join('\n')).join('\n')).join('\n\n');
  }
  // What an actor would say: the text without [directions].
  const spoken=text=>Core().flattenBrackets(text).replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
  const isLine=block=>!!block.speaker&&!!spoken(block.text);
  function roleCounts(model){const counts=new Map(model.cast.map(name=>[name,0]));for(const scene of model.scenes)for(const block of scene.blocks)if(isLine(block))counts.set(block.speaker,(counts.get(block.speaker)||0)+1);return counts;}
  const sceneLineCount=scene=>scene.blocks.filter(isLine).length;
  const sameName=(a,b)=>Core().speakerKey(a)===Core().speakerKey(b);
  function eachBlock(model,fn){for(const scene of model.scenes)for(const block of scene.blocks)fn(block);}

  function renameRole(model,from,to){
    to=to.replace(/[:\[\]\n]/g,' ').replace(/\s+/g,' ').trim();if(!to||to===from)return;
    const existing=model.cast.find(name=>name!==from&&sameName(name,to));if(existing){mergeRole(model,from,existing);return;}
    eachBlock(model,block=>{if(block.speaker===from)block.speaker=to;});model.cast=model.cast.map(name=>name===from?to:name);
  }
  function mergeRole(model,from,into){if(from===into)return;eachBlock(model,block=>{if(block.speaker===from)block.speaker=into;});model.cast=model.cast.filter(name=>name!==from);}
  // Not a character at all: its "speeches" were stage directions.
  function dropRole(model,name){eachBlock(model,block=>{if(block.speaker===name){block.speaker=null;block.text=(name+'. '+block.text).trim();}});model.cast=model.cast.filter(n=>n!==name);}
  function setBlock(model,sceneIndex,blockIndex,speaker,text){
    const block=model.scenes[sceneIndex]?.blocks[blockIndex];if(!block)return;
    text=text.replace(/\r/g,'').split('\n').map(row=>row.trim()).filter(Boolean).join('\n');
    if(!text){model.scenes[sceneIndex].blocks.splice(blockIndex,1);return;}
    if(speaker){speaker=speaker.replace(/[:\[\]\n]/g,' ').replace(/\s+/g,' ').trim();const known=model.cast.find(name=>sameName(name,speaker));if(known)speaker=known;else model.cast.push(speaker);}
    block.speaker=speaker||null;block.text=speaker?text:text.replace(/[\[\]]/g,'');
  }
  function deleteBlock(model,sceneIndex,blockIndex){model.scenes[sceneIndex]?.blocks.splice(blockIndex,1);}
  // A title must read as a scene heading, or the saved text would not split there.
  function sceneTitle(model,title,number){
    title=title.replace(/\s+/g,' ').trim();const english=isEnglish(model);const word=english?'Scene':'Сцена';
    if(!title)return word+' '+number;return Pdf().headingKind(title)?title:word+' '+number+'. '+title;
  }
  function isEnglish(model){let latin=0,cyrillic=0;eachBlock(model,block=>{latin+=(block.text.match(/[a-z]/gi)||[]).length;cyrillic+=(block.text.match(/[а-яё]/gi)||[]).length;});return latin>cyrillic;}
  function renameScene(model,sceneIndex,title){const scene=model.scenes[sceneIndex];if(scene)scene.title=sceneTitle(model,title,sceneIndex+1);}
  function splitScene(model,sceneIndex,blockIndex,title=''){
    const scene=model.scenes[sceneIndex];if(!scene||blockIndex<=0||blockIndex>=scene.blocks.length)return;
    if(!scene.title)scene.title=sceneTitle(model,'',sceneIndex+1);
    model.scenes.splice(sceneIndex+1,0,{title:sceneTitle(model,title,sceneIndex+2),blocks:scene.blocks.splice(blockIndex)});
  }
  function joinScene(model,sceneIndex){if(sceneIndex<=0||!model.scenes[sceneIndex])return;const [scene]=model.scenes.splice(sceneIndex,1);model.scenes[sceneIndex-1].blocks.push(...scene.blocks);}
  function deleteScene(model,sceneIndex){if(model.scenes.length>1)model.scenes.splice(sceneIndex,1);}
  const logic={parseDraft,serialize,roleCounts,sceneLineCount,renameRole,mergeRole,dropRole,setBlock,deleteBlock,renameScene,splitScene,joinScene,deleteScene,spoken};
  root.CueReview=logic;if(typeof module!=='undefined')module.exports=logic;
  if(typeof document==='undefined'||!document.getElementById('review-panel'))return;

  // ---- Screen ----
  const $=id=>document.getElementById(id);const t=(text,vars)=>root.CueI18n?root.CueI18n.t(text,vars):String(text).replace(/\{(\w+)\}/g,(m,k)=>vars&&k in vars?vars[k]:m);
  const el=(tag,props={},...children)=>{const node=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')node.className=v;else if(k.startsWith('on'))node[k]=v;else if(k==='text')node.textContent=v;else node.setAttribute(k,v);}node.append(...children.filter(c=>c!==null&&c!==undefined));return node;};
  let model=null,openScene=-1,editing=null,showAllRoles=false;
  const castFromInput=()=>$('cast-input').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  function read(){
    const text=$('script-input').value;if(!text.trim()){model=null;return;}
    let cast=castFromInput();if(!cast.length)cast=Pdf().extractCast(text);
    model=parseDraft(text,cast);
  }
  // Every change goes back into the two text boxes, which Save reads.
  function commit(){$('script-input').value=serialize(model);$('cast-input').value=model.cast.join('\n');$('script-message').textContent=t('Changed. Save the play to keep it.');render();}
  function render(){
    read();const panel=$('review-panel');panel.hidden=!model;if(!model)return;
    const counts=roleCounts(model),lines=[...counts.values()].reduce((a,b)=>a+b,0);
    $('review-summary').textContent=t('{s} scenes · {r} roles · {n} lines',{s:model.scenes.length,r:model.cast.length,n:lines});
    const roles=[...counts].sort((a,b)=>b[1]-a[1]);const shown=showAllRoles?roles:roles.slice(0,8);
    $('review-roles').replaceChildren(...shown.map(([name,n])=>el('button',{class:'review-row'+(n?'':' review-warn'),type:'button',onclick:()=>editRole(name)},el('b',{text:name}),el('span',{text:n?t('{n} lines',{n}):t('no lines')}))));
    $('review-roles-more').hidden=roles.length<=8;$('review-roles-more').textContent=showAllRoles?t('Show fewer'):t('Show all {n} roles',{n:roles.length});
    $('review-scenes').replaceChildren(...model.scenes.map((scene,i)=>{const n=sceneLineCount(scene);return el('button',{class:'review-row'+(n?'':' review-warn'),type:'button',onclick:()=>showScene(i)},el('b',{text:scene.title||t('Whole text')}),el('span',{text:n?t('{n} lines',{n}):t('no lines')}));}));
    if($('review-scene').open)renderScene();
  }
  // ---- One role ----
  function editRole(name){
    editing={role:name};$('role-rename').value=name;const others=model.cast.filter(n=>n!==name);
    $('role-merge').replaceChildren(el('option',{value:'',text:t('Choose a role…')}),...others.map(n=>el('option',{value:n,text:n})));$('role-merge-wrap').hidden=!others.length;
    $('review-role').showModal();
  }
  $('role-save').onclick=()=>{const into=$('role-merge').value;if(into)mergeRole(model,editing.role,into);else renameRole(model,editing.role,$('role-rename').value);$('review-role').close();commit();};
  $('role-drop').onclick=()=>{dropRole(model,editing.role);$('review-role').close();commit();};
  // ---- One scene ----
  function showScene(index){openScene=index;renderScene();if(!$('review-scene').open)$('review-scene').showModal();$('review-scene').scrollTop=0;}
  function renderScene(){
    const scene=model.scenes[openScene];if(!scene){$('review-scene').close();return;}
    $('scene-title').value=scene.title;$('scene-join').hidden=openScene===0;$('scene-delete').hidden=model.scenes.length<2;
    $('scene-blocks').replaceChildren(...scene.blocks.map((block,i)=>el('button',{class:'review-block'+(block.speaker?'':' review-remark'),type:'button',onclick:()=>editBlock(i)},block.speaker?el('b',{text:block.speaker}):null,el('span',{text:block.text}))));
    if(!scene.blocks.length)$('scene-blocks').append(el('p',{class:'muted',text:t('This scene has no text.')}));
  }
  $('scene-title').onchange=()=>{renameScene(model,openScene,$('scene-title').value);commit();};
  $('scene-join').onclick=()=>{joinScene(model,openScene);openScene--;commit();};
  $('scene-delete').onclick=()=>{if(root.confirm&&!root.confirm(t('Delete this scene and its text?')))return;deleteScene(model,openScene);$('review-scene').close();commit();};
  // ---- One line ----
  const NEW='\u0001new',REMARK='';
  function editBlock(index){
    const block=model.scenes[openScene].blocks[index];editing={block:index};
    $('block-who').replaceChildren(el('option',{value:REMARK,text:t('Nobody: a stage direction')}),...model.cast.map(n=>el('option',{value:n,text:n})),el('option',{value:NEW,text:t('A new role…')}));
    $('block-who').value=block.speaker||REMARK;$('block-new').value='';$('block-new').hidden=true;$('block-text').value=block.text;$('block-split').hidden=index===0;
    $('review-block').showModal();
  }
  $('block-who').onchange=()=>{$('block-new').hidden=$('block-who').value!==NEW;if(!$('block-new').hidden)$('block-new').focus();};
  const blockSpeaker=()=>$('block-who').value===NEW?$('block-new').value.trim():$('block-who').value;
  $('block-save').onclick=()=>{setBlock(model,openScene,editing.block,blockSpeaker(),$('block-text').value);$('review-block').close();commit();};
  $('block-delete').onclick=()=>{deleteBlock(model,openScene,editing.block);$('review-block').close();commit();};
  $('block-split').onclick=()=>{setBlock(model,openScene,editing.block,blockSpeaker(),$('block-text').value);splitScene(model,openScene,editing.block);$('review-block').close();openScene++;commit();showScene(openScene);};
  for(const button of document.querySelectorAll('.review-close'))button.onclick=()=>button.closest('dialog').close();
  $('review-roles-more').onclick=()=>{showAllRoles=!showAllRoles;render();};
  let timer=0;for(const id of ['script-input','cast-input'])$(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,400);});
  $('ui-language')?.addEventListener('change',()=>setTimeout(render,0));
  root.CueReviewUI={render,showScene};render();
})(typeof window!=='undefined'?window:globalThis);
