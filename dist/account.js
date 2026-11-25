/* Cue account: create one or sign in with a passkey (Face ID, Touch ID or a fingerprint), no password or email.
   The proxy keeps the account (proxy/accounts.js); this phone keeps only the session in localStorage 'cue-account'.
   Everything else in the app works the same signed in or out. */
(function(root){
 const PROXY='https://cue-proxy.elena-blinova.workers.dev';
 const STORE='cue-account';
 const t=(s,v)=>root.CueI18n?root.CueI18n.t(s,v):s;
 const store={get(){try{const a=JSON.parse(root.localStorage.getItem(STORE));return a&&typeof a.token==='string'?a:null;}catch{return null;}},
  set(a){try{a?root.localStorage.setItem(STORE,JSON.stringify(a)):root.localStorage.removeItem(STORE);}catch{}}};

 // base64url <-> bytes, for the WebAuthn JSON the proxy speaks.
 const toBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const toB64=buf=>{const b=new Uint8Array(buf);let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
 function creationOptions(o){return {...o,challenge:toBytes(o.challenge),user:{...o.user,id:toBytes(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:toBytes(c.id)}))};}
 function requestOptions(o){return {...o,challenge:toBytes(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:toBytes(c.id)}))};}
 function credentialJSON(c){const r=c.response,out={id:c.id,rawId:toB64(c.rawId),type:c.type,clientExtensionResults:c.getClientExtensionResults?c.getClientExtensionResults():{},authenticatorAttachment:c.authenticatorAttachment||undefined,response:{clientDataJSON:toB64(r.clientDataJSON)}};
  if(r.attestationObject){out.response.attestationObject=toB64(r.attestationObject);out.response.transports=r.getTransports?r.getTransports():[];}
  else{out.response.authenticatorData=toB64(r.authenticatorData);out.response.signature=toB64(r.signature);if(r.userHandle)out.response.userHandle=toB64(r.userHandle);}
  return out;}

 async function call(path,body,token){
  let r;try{r=await fetch(PROXY+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});}
  catch{throw new Error(t('No connection. Try again when you are online.'));}
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(t(data.error||'Something went wrong. Try again.'));e.status=r.status;throw e;}
  return data;}
 // A cancelled Face ID prompt is not an error worth a message.
 const cancelled=e=>e&&(e.name==='NotAllowedError'||e.name==='AbortError');
 const supported=()=>!!(root.PublicKeyCredential&&root.navigator?.credentials);

 async function create(name){
  const {user,options}=await call('/account/register/options',{name});
  const cred=await navigator.credentials.create({publicKey:creationOptions(options)});
  const a=await call('/account/register/verify',{user,response:credentialJSON(cred)});
  store.set({token:a.token,name:a.name});return a;}
 async function signIn(){
  const {options}=await call('/account/login/options',{});
  const cred=await navigator.credentials.get({publicKey:requestOptions(options)});
  const a=await call('/account/login/verify',{response:credentialJSON(cred)});
  store.set({token:a.token,name:a.name});return a;}
 async function signOut(){const a=store.get();store.set(null);if(a)try{await call('/account/logout',{},a.token);}catch{}}
 // Check the session now and then; a session ended elsewhere signs this phone out.
 async function refresh(){const a=store.get();if(!a)return null;try{const me=await call('/account',null,a.token);if(me.name!==a.name)store.set({...a,name:me.name});return store.get();}catch(e){if(e.status===401){store.set(null);return null;}return a;}}

 // The account row on the home screen and its sheet.
 function bind(doc=root.document){
  const $=id=>doc.getElementById(id);if(!$('account-row')||!$('account-dialog'))return;
  const dialog=$('account-dialog');
  const show=()=>{const a=store.get();$('account-out').hidden=!!a;$('account-in').hidden=!a;
   $('account-row').classList.toggle('signed-in',!!a);
   $('account-avatar').textContent=a?([...a.name.trim()][0]||'·').toUpperCase():'';
   $('account-label').textContent=a?a.name:t('Not signed in');
   $('account-action').textContent=a?'›':t('Sign in');
   $('account-row').setAttribute('aria-label',a?t('Account: {name}',{name:a.name}):t('Sign in or create an account'));
   if(a)$('account-who').textContent=a.name;};
  const say=m=>{$('account-message').textContent=m||'';};
  const busy=on=>{for(const id of ['account-create','account-signin','account-signout'])$(id).disabled=on;};
  const close=()=>{if(dialog.open)dialog.close();};
  const run=async job=>{say('');if(!supported()){say(t('This browser can’t use passkeys. Open Cue in Safari or Chrome.'));return;}busy(true);try{await job();$('account-name').value='';close();}catch(e){if(!cancelled(e))say(e.message||t('Something went wrong. Try again.'));}finally{busy(false);show();}};
  $('account-row').onclick=()=>{say('');show();dialog.showModal();};
  $('account-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  $('account-create').onclick=()=>{const name=$('account-name').value.trim();if(!name){say(t('Type your name.'));$('account-name').focus();return;}run(()=>create(name));};
  $('account-name').onkeydown=e=>{if(e.key==='Enter')$('account-create').click();};
  $('account-signin').onclick=()=>run(signIn);
  $('account-signout').onclick=async()=>{busy(true);await signOut();busy(false);say('');show();close();};
  if(root.CueI18n){const set=root.CueI18n.setLang;root.CueI18n.setLang=l=>{set(l);show();};}
  show();refresh().then(show);}

 root.CueAccount={get current(){return store.get();},create,signIn,signOut,refresh,bind,_json:{creationOptions,requestOptions,credentialJSON,toB64,toBytes}};
 if(root.document)bind();
})(typeof window!=='undefined'?window:globalThis);
