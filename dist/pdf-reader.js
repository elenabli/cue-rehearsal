/* Files are parsed locally; no PDF, Word file or extracted text is uploaded. */
(function(){
 const byId=id=>document.getElementById(id);const t=(text,vars)=>window.CueI18n?window.CueI18n.t(text,vars):String(text).replace(/\{(\w+)\}/g,(m,k)=>vars&&k in vars?vars[k]:m);let loading=null,pdf=null,pdfName='',generation=0,busy=false;
 const status=(message,error=false)=>{byId('pdf-status').textContent=message;byId('pdf-status').classList.toggle('import-error',error);};
 const controls=()=>{byId('pdf-extract').disabled=busy||!pdf;byId('pdf-file').disabled=busy;byId('pdf-from').disabled=busy;byId('pdf-to').disabled=busy;byId('save-script').disabled=busy;byId('file-input').disabled=busy;byId('script-input').readOnly=busy;byId('cast-input').readOnly=busy;byId('pdf-panel').setAttribute('aria-busy',String(busy));};
 const dispose=async()=>{pdf=null;if(loading){await loading.destroy().catch(()=>{});loading=null;}};
 // Put the converted play in the editor for review before saving.
 function showDraft(text,name){
  const converted=CuePdf.preparePlayText(text);byId('script-input').value=converted;byId('cast-input').value=CuePdf.extractCast(converted).join('\n');byId('title-input').value=name;byId('script-message').textContent='';
  const sceneCount=CuePdf.splitPlayScenes(converted).scenes.length,roleCount=CuePdf.extractCast(converted).length;
  byId('pdf-review').hidden=false;byId('pdf-review').textContent=sceneCount?t('Found {s} scenes and {r} roles. Check them below, then choose Save play & rehearse.',{s:sceneCount,r:roleCount}):t('No scene headings were found. Check the roles and lines below. To divide the play, tap the line where a scene begins.');
  window.CueReviewUI?.render();
 }
 const isDocx=file=>/\.docx$/i.test(file.name)||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 async function openDocx(file){
  status(t('Reading your Word file…'));const text=await CueDocx.docxToText(new Uint8Array(await file.arrayBuffer()));
  if(!text.trim())throw Error(t('No text was found in this Word file. Choose another file.'));
  showDraft(text,file.name.replace(/\.docx$/i,''));status(t('Read the whole Word file. Review the draft below before saving.'));
 }
 byId('pdf-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;const token=++generation;busy=true;controls();byId('pdf-pages').hidden=true;byId('pdf-review').hidden=true;
  try{
   await dispose();if(file.size>25*1024*1024)throw Error(t('Choose a file smaller than 25 MB. Export a scene or compress your file first.'));
   if(/\.doc$/i.test(file.name)||file.type==='application/msword')throw Error(t('This is an older Word .doc file. Open it in Word or Pages, save it as .docx or PDF, and import that.'));
   if(isDocx(file)){await openDocx(file);return;}
   // OpenDocument, Rich Text and plain text are read whole, like Word files.
   const kind=/\.odt$/i.test(file.name)?'odt':/\.rtf$/i.test(file.name)||/rtf/.test(file.type)?'rtf':/\.(?:txt|text|md|fountain)$/i.test(file.name)||file.type.startsWith('text/')?'txt':'';
   if(kind){status(t('Reading your file…'));const bytes=new Uint8Array(await file.arrayBuffer());const text=kind==='odt'?await CueText.odtToText(bytes):kind==='rtf'?CueText.rtfToText(bytes):CueText.decodeText(bytes);
    if(!text.trim())throw Error(t('No text was found in this file. Choose another file.'));showDraft(text,file.name.replace(/\.[^.]+$/,''));status(t('Read the whole file. Check the play below before saving.'));return;}
   if(/\.pages$/i.test(file.name))throw Error(t('This is a Pages file. In Pages, choose Export To → Word or PDF, and import that.'));
   if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))throw Error(t('Please choose a PDF, Word (.docx), OpenDocument (.odt), Rich Text (.rtf) or text (.txt) file.'));
   status(t('Opening your PDF…'));const lib=await import('./vendor/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
   const bytes=new Uint8Array(await file.arrayBuffer());if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error(t('This file does not appear to be a PDF. Choose another file.'));
   loading=lib.getDocument({data:bytes,cMapUrl:new URL('./vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',document.baseURI).href,fontExtraProperties:true,isEvalSupported:false});
   pdf=await loading.promise;if(token!==generation)return;pdfName=file.name.replace(/\.pdf$/i,'');byId('pdf-from').value=1;byId('pdf-to').value=pdf.numPages;byId('pdf-from').max=pdf.numPages;byId('pdf-to').max=pdf.numPages;
   byId('pdf-page-count').textContent=t('{file} · {n} pages',{file:file.name,n:pdf.numPages});byId('pdf-pages').hidden=false;
   status(t('The whole play is selected. Extract it to split automatically at headings such as «Сцена 1». You can also choose a page range.'));
  }catch(error){await dispose();status(error.name==='PasswordException'?t('This PDF is password-protected. Unlock it in your PDF app and save an unprotected copy to import.'):error.message||t('Couldn’t open this file. Try another file.'),true);}
  finally{busy=false;controls();}
 };
 byId('pdf-extract').onclick=async()=>{
  if(!pdf||busy)return;const from=Number(byId('pdf-from').value),to=Number(byId('pdf-to').value);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>pdf.numPages){status(t('Choose a valid page range between 1 and {n}.',{n:pdf.numPages}),true);return;}
  busy=true;controls();let emptyPages=0;const pages=[];
  try{
   for(let p=from;p<=to;p++){status(t('Reading page {p} of {n}…',{p,n:to}));const page=await pdf.getPage(p);const text=await CuePdf.extractPageText(page);if(!text.trim())emptyPages++;pages.push(text);page.cleanup();}
   const text=pages.join('\n');if(!text.trim())throw Error(t('No selectable text was found. This looks like a scanned PDF. Run text recognition (OCR) in your PDF app, save it as a searchable PDF, and try again. Your current script has been kept.'));
   showDraft(text,pdfName);
   status(t('Extracted {n} pages.',{n:to-from+1})+(emptyPages?t(' {n} page(s) had no text and were omitted; review the PDF for missing dialogue.',{n:emptyPages}):'')+t(' Review the draft below before saving.'));
  }catch(error){status(error.message||t('Couldn’t extract this PDF. Your current script has been kept. Try another file.'),true);}
  finally{busy=false;controls();}
 };
})();
