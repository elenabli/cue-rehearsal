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

 async function remove(){const a=store.get();if(!a)return;await call('/account/delete',{},a.token);store.set(null);}

 // Guests (no account) may read one play with AI; natural voices need an account. Kept on this phone only,
 // so it is a soft limit; the proxy's daily limits per address are the real cap.
 const local={get:k=>{try{return root.localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{root.localStorage.setItem(k,v);}catch{}}};
 const guest={
  canReadWithAI:()=>!!store.get()||local.get('cue-guest-ai')!=='1',
  readWithAI:()=>{if(!store.get())local.set('cue-guest-ai','1');},
  // Natural (cloud) character voices come with an account. Guests hear the phone's own voice; the demo scene (no id) keeps them as a sample.
  voicesFor:playId=>!!store.get()||!playId,
 };

 // The account button at the top of every screen, and the account screen.
 let showReason=()=>{};
 function open(reason){showReason(reason||'');if(typeof root.showView==='function')root.showView('account');}
 function bind(doc=root.document){
  const $=id=>doc.getElementById(id);if(!$('account')||!$('account-button'))return;
  const initial=n=>([...String(n).trim()][0]||'·').toUpperCase();
  const show=()=>{const a=store.get();$('account-out').hidden=!!a;$('account-in').hidden=!a;
   const b=$('account-button');b.classList.toggle('signed-in',!!a);b.textContent=a?initial(a.name):t('Sign in');
   b.setAttribute('aria-label',a?t('Account: {name}',{name:a.name}):t('Sign in or create an account'));
   $('account-title').textContent=a?t('Account'):t('Your account');
   if(a){$('account-who').textContent=a.name;$('account-avatar').textContent=initial(a.name);$('account-reason').hidden=true;}};
  showReason=r=>{const el=$('account-reason');el.textContent=r;el.hidden=!r||!!store.get();};
  const say=m=>{$('account-message').textContent=m||'';};
  const busy=on=>{for(const id of ['account-create','account-signin','account-signout','account-delete'])$(id).disabled=on;};
  const run=async job=>{say('');if(!supported()){say(t('This browser can’t use passkeys. Open Cue in Safari or Chrome.'));return;}busy(true);try{await job();$('account-name').value='';}catch(e){if(!cancelled(e))say(e.message||t('Something went wrong. Try again.'));}finally{busy(false);show();}};
  $('account-button').onclick=()=>{say('');showReason('');open();};
  $('account-create').onclick=()=>{const name=$('account-name').value.trim();if(!name){say(t('Type your name.'));$('account-name').focus();return;}run(()=>create(name));};
  $('account-name').onkeydown=e=>{if(e.key==='Enter')$('account-create').click();};
  $('account-signin').onclick=()=>run(signIn);
  $('account-signout').onclick=async()=>{busy(true);await signOut();busy(false);say('');show();};
  $('account-delete').onclick=async()=>{if(!root.confirm(t('Delete your account? Your plays stay on this phone.')))return;say('');busy(true);
   try{await remove();say(t('Account deleted. You can also remove the Cue passkey in your phone’s password settings.'));}catch(e){say(e.message);}finally{busy(false);show();}};
  if(root.CueI18n){const set=root.CueI18n.setLang;root.CueI18n.setLang=l=>{set(l);show();};}
  show();refresh().then(show);}

 root.CueAccount={get current(){return store.get();},create,signIn,signOut,remove,refresh,bind,open,guest,_json:{creationOptions,requestOptions,credentialJSON,toB64,toBytes}};
 if(root.document)bind();
})(typeof window!=='undefined'?window:globalThis);
