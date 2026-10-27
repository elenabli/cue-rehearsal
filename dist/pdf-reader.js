/* Files are parsed locally; no PDF or extracted text is uploaded. */
(function(){
 const byId=id=>document.getElementById(id);let loading=null,pdf=null,pdfName='',generation=0,busy=false;
 const status=(message,error=false)=>{byId('pdf-status').textContent=message;byId('pdf-status').classList.toggle('import-error',error);};
 const controls=()=>{byId('pdf-extract').disabled=busy||!pdf;byId('pdf-file').disabled=busy;byId('pdf-from').disabled=busy;byId('pdf-to').disabled=busy;byId('save-script').disabled=busy;byId('file-input').disabled=busy;byId('script-input').readOnly=busy;byId('pdf-panel').setAttribute('aria-busy',String(busy));};
 const dispose=async()=>{pdf=null;if(loading){await loading.destroy().catch(()=>{});loading=null;}};
 byId('pdf-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;const token=++generation;busy=true;controls();byId('pdf-pages').hidden=true;byId('pdf-review').hidden=true;
  try{
   await dispose();if(file.size>25*1024*1024)throw Error('Choose a PDF smaller than 25 MB. Export a scene or compress your file first.');
   if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))throw Error('Please choose a PDF file.');
   status('Opening your PDF…');const lib=await import('./vendor/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
   const bytes=new Uint8Array(await file.arrayBuffer());if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error('This file does not appear to be a PDF. Choose another file.');
   loading=lib.getDocument({data:bytes,cMapUrl:new URL('./vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',document.baseURI).href,isEvalSupported:false});
   pdf=await loading.promise;if(token!==generation)return;pdfName=file.name.replace(/\.pdf$/i,'');byId('pdf-from').value=1;byId('pdf-to').value=Math.min(pdf.numPages,100);byId('pdf-from').max=pdf.numPages;byId('pdf-to').max=pdf.numPages;
   byId('pdf-page-count').textContent=`${file.name} · ${pdf.numPages} page${pdf.numPages===1?'':'s'}`;byId('pdf-pages').hidden=false;
   status('Choose the pages containing your scene, then extract. For longer plays, import up to 100 pages at a time.');
  }catch(error){await dispose();status(error.name==='PasswordException'?'This PDF is password-protected. Unlock it in your PDF app and save an unprotected copy to import.':error.message||'Couldn’t open the PDF. Try another file.',true);}
  finally{busy=false;controls();}
 };
 byId('pdf-extract').onclick=async()=>{
  if(!pdf||busy)return;const from=Number(byId('pdf-from').value),to=Number(byId('pdf-to').value);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>pdf.numPages){status(`Choose a valid page range between 1 and ${pdf.numPages}.`,true);return;}
  if(to-from+1>100){status('Import up to 100 pages at a time. Choose the scene you want to rehearse.',true);return;}
  busy=true;controls();let emptyPages=0;const pages=[];
  try{
   for(let p=from;p<=to;p++){status(`Reading page ${p} of ${to}…`);const page=await pdf.getPage(p);const content=await page.getTextContent();const text=CuePdf.textItemsToLines(content.items);if(!text.trim())emptyPages++;pages.push(text);page.cleanup();}
   const text=pages.join('\n');if(!text.trim())throw Error('No selectable text was found. This looks like a scanned PDF. Run text recognition (OCR) in your PDF app, save it as a searchable PDF, and try again. Your current script has been kept.');
   const converted=CuePdf.convertPlayText(text);byId('script-input').value=converted;byId('title-input').value=pdfName;byId('script-message').textContent='';
   let names=[];try{names=[...new Set(CueCore.parseScript(converted).map(l=>l.speaker))];}catch{}
   byId('pdf-review').hidden=false;byId('pdf-review').textContent=names.length?`Detected characters: ${names.join(', ')}. Review names, dialogue, and stage directions below; PDF layouts can change reading order. Remove any title or heading mistaken for a character. Then choose Save & rehearse.`:'Text extracted. Add NAME: before each speech below, remove any front matter, then choose Save & rehearse.';
   status(`Extracted ${to-from+1} page${to===from?'':'s'}.${emptyPages?` ${emptyPages} page(s) had no text and were omitted; review the PDF for missing dialogue.`:''} Review the draft below before saving.`);
  }catch(error){status(error.message||'Couldn’t extract this PDF. Your current script has been kept. Try another file.',true);}
  finally{busy=false;controls();}
 };
})();
