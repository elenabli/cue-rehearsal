/* Layout and play-format helpers, shared by the importer and tests. */
(function(root){
  function textItemsToLines(items,styles={},pageBox=null){
    const rows=[];
    for(const item of items){
      if(typeof item.str!=='string'||!item.str.trim())continue;
      const x=item.transform?.[4]||0,y=item.transform?.[5]||0;
      const height=Math.max(Math.abs(item.transform?.[3]||0),item.height||0,1);
      let row=rows.find(r=>Math.abs(r.y-y)<Math.min(r.height,height)*.35);
      if(!row){row={y,height,items:[]};rows.push(row);}
      const style=styles[item.fontName]||{};
      const italic=style.italic===true||/italic|oblique|kursiv/i.test((style.fontFamily||'')+' '+(style.fontName||'')+' '+(style.fontSubstitution||''));
      row.items.push({text:item.str,x,width:item.width||0,italic});
    }
    return rows.sort((a,b)=>b.y-a.y).map(row=>{
      const ordered=row.items.sort((a,b)=>a.x-b.x);let plain='',end=null;const runs=[];
      for(const item of ordered){const gap=end!==null&&item.x-end>1&&!plain.endsWith(' ')&&!item.text.startsWith(' ')?' ':'';const text=gap+item.text;plain+=text;const last=runs[runs.length-1];if(last&&last.italic===item.italic)last.text+=text;else runs.push({italic:item.italic,text});end=item.x+item.width;}
      // Remove only isolated number-like rows in the page margins. Numeric
      // dialogue in the body (including fractions) must remain spoken text.
      const rowText=plain.trim();
      if(pageBox&&pageBox.length===4){const height=pageBox[3]-pageBox[1];const margin=row.y<=pageBox[1]+height*.08||row.y>=pageBox[3]-height*.08;
        const numbered=/^(?:(?:стр(?:аница)?\.?|page)\s*)?(?:[—–-]\s*)?(?:\d{1,4}|[IVXLCDM]+)[.\s]*(?:(?:[/／]|из|of)[.\s]*\d{1,4}[.\s]*)?(?:[—–-])?$/iu.test(rowText);
        if(margin&&numbered)return '';
      }
      // Scene headings must remain searchable even when typeset in italics.
      if(isHeading(plain.trim()))return plain.trim();
      return runs.map(run=>run.italic&&run.text.trim()?' ['+run.text.trim().replace(/^\(([^()]*)\)$/,'$1').replace(/\[/g,'(').replace(/\]/g,')')+'] ':run.text).join('').replace(/[ \t]+/g,' ').trim();
    }).filter(Boolean).join('\n');
  }
  function fontIsItalic(font){
    if(font.italic===true||/italic|oblique|kursiv/i.test(font.name||'')||Number(font.cssFontInfo?.italicAngle))return true;
    // Some subset fonts have opaque names. Consult their OpenType flags/angle.
    const data=font.data;if(!data||data.byteLength<12)return false;
    try{const view=new DataView(data.buffer,data.byteOffset,data.byteLength);const count=view.getUint16(4);
      for(let i=0;i<count&&12+(i+1)*16<=view.byteLength;i++){
        const base=12+i*16,tag=view.getUint32(base),offset=view.getUint32(base+8),length=view.getUint32(base+12);
        if(offset+length>view.byteLength)continue;
        if(tag===0x706f7374&&length>=8&&view.getInt32(offset+4)!==0)return true; // post: italic angle
        if(tag===0x68656164&&length>=46&&(view.getUint16(offset+44)&2))return true; // head: macStyle
        if(tag===0x4f532f32&&length>=64&&(view.getUint16(offset+62)&0x201))return true; // OS/2: italic or oblique
      }
    }catch{}return false;
  }
  async function extractPageText(page){
    const content=await page.getTextContent();if(!content.items.some(item=>item.str?.trim()))return '';
    // TextContent uses anonymous font IDs; load the pinned PDF.js font objects
    // so embedded italic fonts remain detectable even with subset font names.
    await page.getOperatorList({annotationMode:0});
    const styles={...content.styles};
    for(const name of new Set(content.items.map(item=>item.fontName).filter(Boolean))){
      if(page.commonObjs.has(name)){const font=page.commonObjs.get(name);styles[name]={...styles[name],fontName:font.name||'',italic:fontIsItalic(font)||styles[name]?.italic===true};}
    }
    return textItemsToLines(content.items,styles,page.view);
  }
  // A keyword only marks a heading when typeset in capitals or followed by a
  // number, so wrapped dialogue such as «действие лекарства…» is kept.
  function isHeading(s){
    if(headingKind(s))return true;
    if(/^(?:[IVXLCDM]+\.?|DRAMATIS PERSONAE|CHARACTERS|CAST(?: OF CHARACTERS)?|THE END|CURTAIN|FINIS|КОНЕЦ|ЗАНАВЕС)$/iu.test(s))return true;
    const m=s.match(/^(ACT|SCENE|PART|CHAPTER|PAGE|АКТ|СЦЕНА|ДЕЙСТВИЕ|КАРТИНА)(?=\s|[.:№]|$)(.*)$/iu);if(!m)return false;
    return m[1]===m[1].toLocaleUpperCase()||/^\s*[.:]?\s*(?:№\s*)?(?:\d+|[IVXLCDM]+)(?=$|[\s.:—–-])/u.test(m[2])||/^\s*(?:перв|втор|трет|четв[её]рт|пят|шест|one|two|three|four|five|first|second|third)\p{L}*\.?$/iu.test(m[2]);
  }
  // One-word sentences that open a line of dialogue but are never names.
  const NOT_NAMES=new Set('да нет ну ладно хорошо что как так вот все всё почему зачем конечно спасибо пожалуйста привет здравствуйте правда неправда никогда ничего тихо стой стоп yes no well oh ah what why how so okay ok sure right good fine nothing never please thanks hello nonsense quiet stop wait look listen come go indeed really perhaps certainly'.split(' '));
  const ordinaryWord=(label,lower)=>label.split(/\s+/).some(w=>lower.has(w.toLocaleLowerCase())||NOT_NAMES.has(w.toLocaleLowerCase()));
  function standaloneName(s){return s.length<=45&&/\p{L}/u.test(s)&&s===s.toLocaleUpperCase()&&!/[\[\]():!?;“”"0-9]/u.test(s)&&s.split(/\s+/).length<=4&&!isHeading(s);}
  function extractCast(text){
    const preamble=splitPlayScenes(text).preamble||(!splitPlayScenes(text).scenes.length?text:'');
    const rows=preamble.split(/\r?\n/).map(row=>row.replace(/[\[\]]/g,'').trim());let active=false;const names=[];
    const namePattern=/^[\p{Lu}][\p{L}\p{M}'’.-]*(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’.-]*){0,3}$/u;
    for(let row of rows){if(/^(?:действующие\s+лица(?:\s+и\s+исполнители)?|персонажи|герои|список\s+персонажей|роли|в\s+ролях|dramatis\s+personae|cast(?:\s+of\s+characters)?|characters)\s*[:.]?$/iu.test(row)){active=true;continue;}if(!active)continue;
      if(/^(?:место|время|действие|примечани|об авторе|содержание|акт|act|setting|notes)(?=\s|[.:]|$)/iu.test(row))break;
      row=row.replace(/^(?:[•*—–-]|\d+[.)])\s*/,'');const name=row.split(/\s+[—–-]\s*|[,:(]/)[0].replace(/[:.;]+$/,'').trim();
      if(namePattern.test(name)&&!isHeading(name)&&!names.some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase()))names.push(name);
    }
    if(!names.length&&!active){
      const speechLabels=splitPlayScenes(text).scenes.flatMap(scene=>scene.script.split('\n').map(row=>row.trim().split(/[:：.]|[—–]/)[0].trim()).filter(name=>namePattern.test(name)));
      for(let row of rows){const name=row.replace(/^(?:[•*—–-]|\d+[.)])\s*/,'').split(/\s+[—–-]\s*|[,:(]/)[0].replace(/[:.;]+$/,'').trim();if(namePattern.test(name)&&!isHeading(name)&&speechLabels.some(label=>castResolve(label,[name]))&&!names.includes(name))names.push(name);}
    }
    // Rosters often miss or misspell roles. Add all-caps labels that open at
    // least two speeches, so unlisted characters keep their own lines.
    const counts=new Map();
    for(const row of (splitPlayScenes(text).scenes.map(scene=>scene.script).join('\n')||text).split(/\r?\n/)){
      const m=row.trim().match(/^([\p{Lu}][\p{Lu}\p{M}\d'’ -]{1,44}?)\s*(?:\([^)]*\)\s*)?(?:[:：]|\.(?=\s))\s*(.*)$/u);
      if(!m||!/\p{Ll}/u.test(m[2])||!/\p{Lu}.*\p{Lu}/u.test(m[1]))continue;const label=m[1].trim();
      if(isHeading(label)||names.some(name=>castResolve(label,[name])))continue;counts.set(label,(counts.get(label)||0)+1);
    }
    // Labels not in capitals («Лопахин: …», “Ber: …”) count when the same name
    // opens at least three speeches and never appears as an ordinary word.
    const titled=new Map();for(const row of (splitPlayScenes(text).scenes.map(scene=>scene.script).join('\n')||text).split(/\r?\n/)){const m=row.trim().match(/^(\p{Lu}[\p{Ll}'’-]*(?:[ \t]+\p{Lu}[\p{Ll}'’-]*){0,2}):(?:\s|$)/u);if(m&&!isHeading(m[1])&&!names.some(name=>castResolve(m[1],[name])))titled.set(m[1],(titled.get(m[1])||0)+1);}
    if([...titled.values()].some(n=>n>=3)){const lower=new Set(text.match(/(?<![\p{L}])\p{Ll}[\p{Ll}'’-]*/gu)||[]);for(const [label,n] of titled)if(n>=3&&!ordinaryWord(label,lower))names.push(label);}
    // In a long play a character may speak only once («ДЖЕЙСОН: Прости.»).
    const speeches=[...counts.values()].reduce((a,b)=>a+b,0)+names.length;
    for(const [label,count] of counts)if(count>=2||(speeches>=20&&/^[\p{Lu}\p{M}\d'’ -]+$/u.test(label)&&/\p{Lu}{2}/u.test(label)))names.push(label);
    return names;
  }
  function convertWithCast(text,cast){
    const out=[];let started=false;const leading=[];let directionDepth=0;
    for(const raw of text.replace(/\r/g,'').split('\n')){const row=raw.trim();if(!row||isHeading(row))continue;
      let label=null,rest='',aside='';if(!directionDepth){
        const m=row.match(/^([^:\[\]]{1,60}?)(?:\s*\(([^)]*)\))?\s*([:：.]|[—–]|\s-(?=\s))\s*(.*)$/u);
        // «Джейсон. Он кладет цветы…» is a direction; a speech written with a
        // full stop has its name in capitals («ДЖЕЙСОН. Привет.»).
        if(m&&!(m[3]==='.'&&m[1]!==m[1].toLocaleUpperCase())){label=castResolve(m[1],cast);rest=m[4];aside=m[2]||'';}if(!label)label=castResolve(row.replace(/[:.]$/,''),cast);
        // «HIGGINS [laughing] Nonsense.» — a name in capitals, a direction, then the speech.
        if(!label){const d=row.match(/^([\p{Lu}][\p{Lu}\p{M}\d'’ .-]{1,44}?)\s+([\[(].*)$/u);if(d&&castResolve(d[1],cast)){label=castResolve(d[1],cast);rest=d[2];aside='';}}
      }
      if(label){if(!started)out.push(...leading);out.push(label+': '+(aside?'['+aside+'] ':'')+rest.replace(/\(([^)]*)\)/g,'[$1]'));started=true;continue;}
      let clean='';for(const char of row){if(char==='('){directionDepth++;clean+='[';}else if(char===')'&&directionDepth){directionDepth--;clean+=']';}else clean+=char;}
      if(started)out.push(clean);else leading.push(/^\[.*\]$/.test(clean)?clean:'['+clean+']');
    }return started?out.join('\n'):text;
  }
  function castResolve(label,cast){const key=name=>name.toLocaleLowerCase().replace(/ё/g,'е').replace(/[.\s]+/g,' ').trim();const value=key(label);const exact=cast.find(name=>key(name)===value);if(exact)return exact;const short=cast.filter(name=>key(name).split(' ')[0]===value);return short.length===1?short[0]:null;}
  function convertPlayText(text,cast=[]){
    if(cast.length)return convertWithCast(text,cast);
    const rows=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    const speechPattern=/^([\p{L}][\p{L}\p{M}\s'’.-]{0,44}?)(?:\s*[:：]\s*|[.\u2014\u2013]\s+)(.*)$/u;
    const candidates=new Set();
    for(const row of rows){const m=row.match(speechPattern);if(m&&m[1]===m[1].toLocaleUpperCase()&&!isHeading(m[1]))candidates.add(m[1].replace(/\.$/,'').trim());else if(standaloneName(row.replace(/\.$/,'')))candidates.add(row.replace(/\.$/,'').trim());}
    const out=[];const leading=[];let started=false;let stageDepth=0;
    for(const row of rows){if(isHeading(row))continue;
      const m=row.match(speechPattern);const name=m?.[1].replace(/\.$/,'').trim();
      if(m&&((candidates.has(name))||row.includes(':')||row.includes('：'))&&!isHeading(name)){if(!started)out.push(...leading);out.push(`${name}: ${m[2]}`);started=true;continue;}
      const clean=row.replace(/\.$/,'');if(candidates.has(clean)){if(!started)out.push(...leading);out.push(`${clean}:`);started=true;continue;}
      if(started){let dialogue='';for(const char of row){if(char==='('){stageDepth++;dialogue+='[';}else if(char===')'&&stageDepth){stageDepth--;dialogue+=']';}else dialogue+=char;}out.push(dialogue);}else if(/^\[.*\]$/.test(row))leading.push(row);
    }
    return out.length?out.join('\n'):text;
  }
  // Scene and act headings, in Russian and English: «Сцена 3», «СЦЕНА. 3
  // КВАРТИРА», «Явление первое», «Картина 2», «ДЕЙСТВИЕ ПЕРВОЕ», «Акт 2»,
  // «Scene I. Elsinore», «ACT ONE», «FIRST ACT», «Act 1, Scene 2». A number
  // (digits, Roman, or a word) is required, so dialogue that merely starts
  // with «действие» or “act” is never taken for a heading.
  const ORDINAL='(?:перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат|последн|заключительн)[\\p{L}]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final';
  const NUMBER='(?:№\\s*|no\\.?\\s*)?(?:\\(\\s*)?(?:\\d{1,3}(?:\\s?[a-zа-я](?![\\p{L}]))?|[IVXLCDM]+|'+ORDINAL+')(?:\\s*\\))?';
  const SCENE_WORD='сцена|явление|картина|эпизод|scene|episode',ACT_WORD='действие|акт|часть|act|part';
  const headingByWord=new RegExp('^((?:'+SCENE_WORD+'|'+ACT_WORD+')\\.?)\\s*[.:]?\\s*'+NUMBER+'(?=$|[\\s.,:;—–-])(.*)$','iu');
  const headingByOrdinal=new RegExp('^(?:the\\s+)?(?:'+ORDINAL+')\\s+('+SCENE_WORD+'|'+ACT_WORD+')\\.?\\s*(?:$|[.:—–-]\\s*(.*)$)','iu');
  function headingKind(row){
    const s=row.replace(/ /g,' ').trim();if(!s||s.length>120)return null;
    let m=s.match(headingByWord);
    if(m){const rest=m[2]||'';
      // «Действие 2 начинается…» is prose: lower-case words straight after the number.
      if(/^\s+\p{Ll}/u.test(rest)&&m[1]!==m[1].toLocaleUpperCase())return null;
      // «Act 1, Scene 2» is a scene inside an act.
      const word=m[1].replace(/\.$/,'').toLocaleLowerCase();const inner=rest.replace(/^[\s.,:;·—–-]+/,'');
      if(new RegExp('^(?:'+ACT_WORD+')$','iu').test(word))return headingByWord.test(inner)&&headingKind(inner)==='scene'?'scene':'act';return 'scene';}
    m=s.match(headingByOrdinal);if(m)return new RegExp('^(?:'+ACT_WORD+')$','iu').test(m[1])?'act':'scene';
    return null;
  }
  // Only headings at the beginning of a line delimit scenes. Numbering may
  // restart in a later act; each occurrence remains a separate scene. An act
  // heading followed by its first scene becomes part of that scene's title
  // («ACT I · Scene I. Elsinore»); an act without scenes is one scene.
  function splitPlayScenes(text){
    const rows=text.replace(/\r/g,'').split('\n');const scenes=[];const preamble=[];let current=null,act='';
    for(const row of rows){
      const kind=headingKind(row);
      // A table of contents lists headings with nothing between them; only
      // the real ones, followed by text, are kept.
      if(kind&&current&&!current.script.trim()&&(kind==='act'||!current.act))scenes.pop();
      if(kind==='act'){act=row.trim();current={title:act,script:'',act:true};scenes.push(current);continue;}
      if(kind==='scene'){const title=row.replace(/ /g,' ').trim();
        // An act heading with at most a short introduction folds into its first scene.
        if(current&&current.act&&current.script.trim().length<=400){scenes.pop();const intro=current.script.trim();current={title:current.title+' · '+title,script:intro?intro.split('\n').map(r=>r.trim()&&!/^\[.*\]$/.test(r.trim())?'['+r.trim()+']':r).join('\n'):''};}
        else current={title,script:''};
        scenes.push(current);continue;}
      if(current)current.script+=(current.script?'\n':'')+row;else preamble.push(row);
    }
    return {preamble:preamble.join('\n').trim(),scenes:scenes.map(({title,script})=>({title,script:script.trim()}))};
  }
  // Plays without «Сцена 1» headings often mark scenes another way: a
  // number on its own line («( 4 A )», «12.») or an all-caps place name
  // («ДОМ СЕМЬИ ЭЙСКОНЕН»). Rewrite those as «Сцена …» headings so the play
  // still splits into scenes, and the actor can edit them before saving.
  const capsLine=s=>{const head=s.replace(/\s*\([^()]*\)$/,'').replace(/[.\s]+$/,'');return head.length>=3&&head.length<=70&&/\p{L}.*\p{L}/u.test(head)&&head===head.toLocaleUpperCase()&&!/[:：!?"\[\]()]/u.test(head)&&!/^[\[(]/.test(s);};
  function markSceneHeadings(text,english=false){const word=english?'Scene ':'Сцена ';
    if(splitPlayScenes(text).scenes.length)return text;
    const rows=text.replace(/\r/g,'').split('\n').map(row=>row.trim());
    const speechRows=rows.filter(row=>/^[\p{Lu}][^:\[\]]{0,59}:\s*\S/u.test(row)).length;
    const marker=row=>row.match(/^\(\s*(\d{1,3}(?:\s*[\p{L}](?![\p{L}]))?(?:\s*[—–-][^()]*)?)\s*\)$/u)?.[1]||row.match(/^(\d{1,3})\.$/)?.[1];
    const markers=rows.filter(marker).length;const out=[];
    if(markers>=2){
      // Numbered scenes. A caps place line right after the number joins the
      // title. When numbering restarts («1.» after «30»), the caps line just
      // before it («ИНТЕРВЬЮ») names the new part.
      let lastCaps='',previous=-1;for(let i=0;i<rows.length;i++){const row=rows[i],number=marker(row);
        if(number){let title=word+number.replace(/\s+/g,' ');const value=parseInt(number,10);if(value<previous){if(lastCaps)title+=' · '+lastCaps;
            // A new part usually opens with a title page (author, title). Keep
            // those lines as directions so nobody has to say them.
            for(let j=out.length-1,k=0;j>=0&&k<5&&!out[j].startsWith(word)&&out[j].length<=60&&!/^[\[(]|:/.test(out[j]);j--,k++)if(out[j])out[j]='['+out[j]+']';}previous=value;lastCaps='';let next=i+1;while(next<rows.length&&!rows[next])next++;
          if(next<rows.length&&capsLine(rows[next])){title+='. '+rows[next].replace(/[.\s]+$/,'');i=next;}out.push(title);continue;}
        if(capsLine(row))lastCaps=row.replace(/[.\s]+$/,'');
        out.push(row);
      }
      return out.join('\n');
    }
    if(speechRows<5)return text;
    // Unnumbered caps headings. Names on their own line repeat; places
    // usually don't, so a repeated caps line is never taken for a scene.
    const cast=extractCast(text),seen=new Map();for(const row of rows)if(capsLine(row))seen.set(row,(seen.get(row)||0)+1);
    const headings=rows.map((row,i)=>i>0&&seen.get(row)===1&&!isHeading(row.replace(/[.!\s]+$/,''))&&!castResolve(row.replace(/\s*\([^()]*\)$/,''),cast)&&!/^[\p{Lu}][^:]{0,59}:/u.test(row));
    if(headings.filter(Boolean).length<2)return text;
    let n=0;return rows.map((row,i)=>headings[i]?`${word}${++n}. ${row.replace(/[.\s]+$/,'')}`:row).join('\n');
  }
  // Foreign phrases often carry a Russian transcription: «Tyst! [Тюст!]».
  // The actor says the transcription and a Russian recognizer writes it in
  // Cyrillic, so that becomes the line and the original a direction:
  // «Тюст! [Tyst!]». The first letters must correspond, so a direction after
  // an English word («OK [кивает]») is left alone.
  const translit={a:'а',b:'б',c:'кс',d:'д',e:'эе',f:'ф',g:'гйх',h:'х',i:'и',j:'йяюе',k:'кшч',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'сшз',t:'тч',u:'ую',v:'в',w:'в',x:'кз',y:'юий',z:'з',å:'о',ä:'эе',ö:'ёэе',é:'э',ü:'ю',æ:'э',ø:'ё'};
  function speakTranscriptions(text){
    // A bounded run of words before the bracket, with no nested repeats: an English
    // play has long runs of Latin words, and an open-ended pattern froze on them.
    return text.replace(/(\p{Script=Latin}[\p{Script=Latin}'’-]*(?:[\s,.!?…:;]+\p{Script=Latin}[\p{Script=Latin}'’-]*){0,40}[\s,.!?…:;]*)\[([^\[\]\p{Script=Latin}]*\p{Script=Cyrillic}[^\[\]\p{Script=Latin}]*)\]/gu,(all,latin,cyrillic)=>{
      const words=t=>t.split(/[\s,.!?…:;]+/).filter(w=>/\p{L}/u.test(w)),a=words(latin),b=words(cyrillic);
      if(Math.abs(a.length-b.length)>1||!(translit[a[0][0].toLowerCase()]||'').includes(b[0][0].toLocaleLowerCase()))return all;
      return cyrillic.trim()+' ['+latin.trim()+']';
    });
  }
  // Text from e-book sites carries a licence before and after the play.
  function stripBoilerplate(text){
    const rows=text.replace(/\r/g,'').split('\n');
    const start=rows.findIndex(r=>/^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG/i.test(r));
    let end=rows.findIndex(r=>/^\s*(?:\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg)/i.test(r));if(end<0)end=rows.length;
    return start>=0||end<rows.length?rows.slice(start+1,end).join('\n'):text;
  }
  const isLatin=text=>(text.match(/[a-z]/gi)||[]).length>(text.match(/[а-яё]/gi)||[]).length;
  // Words that open a stage direction written as plain text: «Входит Лопахин.»,
  // «Пауза.», “Enter Horatio.”, “Exit.”. Such a line is never spoken.
  const REMARK_START=/^(?:входит|входят|уходит|уходят|выходит|выходят|убегает|убегают|вбегает|вбегают|возвращается|возвращаются|появляется|появляются|(?:долгая\s+|небольшая\s+|короткая\s+)?пауза|молчание|занавес|затемнение|свет\s+(?:гаснет|меняется)|темнота|конец\s+(?:сцены|действия|акта)|enter|enters|re-enter|re-enters|exit|exits|exeunt|(?:a\s+|long\s+|short\s+)?pause|silence|curtain|blackout|lights\s+(?:up|down|fade|change)|end\s+of\s+(?:scene|act))(?=$|[\s.,:;!—–-])/iu;
  // Speaker labels that are not in capitals: «Лопахин. Пришел поезд», “Algernon.
  // Did you hear”, «Кулигин (поет). …», or “Ber.” on its own line. They count
  // only when the play is mostly written that way: the same name opens at
  // least three lines and never appears in lower case, so «Да. Конечно.» and
  // “Well. I see.” stay dialogue.
  const titleLabel=/^(\p{Lu}[\p{Ll}'’-]*(?:[ \t]+\p{Lu}[\p{Ll}'’-]*){0,2})[ \t]*(\([^()]{0,100}\))?\.(?:[ \t]+(\S.*))?$/u;
  function normalizeSpeakers(text){
    let rows=text.replace(/\r/g,'').split('\n');
    // «MRS. CHEVELEY.» — the dot after a title is not the end of the name.
    rows=rows.map(row=>row.replace(/^(\s*(?:THE\s+)?)(MRS|MR|MS|DR|ST|MME|MLLE|MESSRS|PROF|REV|CAPT|COL|GEN|SGT|LT)\.(?=[ \t]+\p{Lu})/iu,'$1$2'));
    const counts=new Map();for(const row of rows){const m=row.trim().match(titleLabel);if(m&&!REMARK_START.test(m[1]))counts.set(m[1],(counts.get(m[1])||0)+1);}
    const lower=new Set((text.match(/(?<![\p{L}])\p{Ll}[\p{Ll}'’-]*/gu)||[]));
    const labels=new Set([...counts].filter(([label,n])=>n>=3&&!ordinaryWord(label,lower)).map(([label])=>label));
    const titled=rows.filter(row=>{const m=row.trim().match(titleLabel);return m&&labels.has(m[1]);}).length;
    const capital=rows.filter(row=>/^[\p{Lu}][\p{Lu}\p{M}\d'’ -]{1,44}(?:\s*\([^)]*\))?\s*[:：.](?:\s|$)/u.test(row.trim())&&/\p{Lu}{2}/u.test(row)).length;
    if(titled>=10&&titled>capital)rows=rows.map(row=>{const m=row.trim().match(titleLabel);if(!m||!labels.has(m[1]))return row;return m[1]+':'+(m[2]?' ['+m[2].slice(1,-1)+']':'')+(m[3]?' '+m[3]:'');});
    // Plain-text directions. A wrapped one continues until a line that ends a sentence.
    const out=[];for(let i=0;i<rows.length;i++){const row=rows[i].trim();
      if(row.length<=200&&REMARK_START.test(row)&&!/^\[/.test(row)){const part=[row];while(!/[.!?…)\]»"]$/.test(part[part.length-1])&&part.length<4&&i+1<rows.length&&rows[i+1].trim()&&!/^[^\[\]:]{1,60}:/.test(rows[i+1])&&!headingKind(rows[i+1]))part.push(rows[++i].trim());out.push('['+part.join(' ').replace(/[\[\]]/g,'')+']');continue;}
      out.push(rows[i]);}
    return out.join('\n');
  }
  function preparePlayText(text){
    text=stripBoilerplate(text);const english=isLatin(text);
    text=speakTranscriptions(markSceneHeadings(normalizeSpeakers(text),english));
    const {scenes}=splitPlayScenes(text);let cast=extractCast(text);
    // A scene nobody speaks in is all stage directions.
    const silent=body=>cast.length&&!body.split('\n').some(row=>{const m=row.match(/^([^:\[\]]{1,60}):/);return m&&castResolve(m[1].trim(),cast);})?body.split('\n').map(row=>row.trim()&&!/^\[.*\]$/.test(row.trim())?'['+row.trim().replace(/[\[\]]/g,'')+']':row).join('\n'):body;
    const converted=scenes.map(scene=>scene.title+'\n'+silent(convertPlayText(scene.script,cast)));
    // A roster often lists people who never speak, or names a part differently
    // from its speech labels. Keep only the roles that have lines.
    if(cast.length&&scenes.length){const speaking=new Set();for(const scene of converted)for(const row of scene.split('\n')){const m=row.match(/^([^:\[\]]{1,60}):/);if(m)speaking.add(m[1].trim());}const kept=cast.filter(name=>speaking.has(name));if(kept.length)cast=kept;}
    const header=cast.length?(english?'CHARACTERS':'ДЕЙСТВУЮЩИЕ ЛИЦА')+'\n'+cast.join('\n')+'\n\n':'';
    return scenes.length?header+converted.join('\n\n'):convertPlayText(text);
  }
  const api={headingKind,normalizeSpeakers,stripBoilerplate,speakTranscriptions,markSceneHeadings,extractCast,fontIsItalic,textItemsToLines,extractPageText,convertPlayText,splitPlayScenes,preparePlayText};root.CuePdf=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
