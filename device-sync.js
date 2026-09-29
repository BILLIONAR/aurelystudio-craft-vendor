import {blank} from './model.js';
import {validateBusiness} from './business-model.js';
import {parseConnection,connectionCode,seal,unseal,mergeWorkspaces,equalWorkspace,randomSecret,tokenHash} from './sync-core.js';
import {SYNC_API} from './sync-config.js';

export function createDeviceSync(ctx){
 const $=s=>document.querySelector(s),endpoint=ctx.endpoint??(SYNC_API||(location.hostname==='127.0.0.1'||location.hostname==='localhost'?'http://127.0.0.1:8787':'')),sessionKey=ctx.key+'-private-sync',{esc,btn,toast,render,modal}=ctx;
 let session=null,state='disconnected',message='Not connected · saved on this device',timer=null,busy=false,dirty=false,conflict=null,paused=false,lastSync='',pendingCode='',generation=0;
 try{const s=JSON.parse(localStorage.getItem(sessionKey));if(s?.connection){s.connection=parseConnection(connectionCode(s.connection),endpoint);if(s.base)validateBusiness(s.base);session=s;dirty=!equalWorkspace(ctx.getDb(),s.base);state=dirty?'pending':'connecting';message=dirty?'Changes saved here · waiting to sync':'Checking your other device…';lastSync=s.lastSync||''}}catch{message='Connection needs checking · local records are safe'}
 function status(next,copy){state=next;message=copy;document.querySelectorAll('[data-sync-state]').forEach(el=>{el.dataset.state=state;el.textContent=label();el.title=message});document.querySelectorAll('[data-sync-message]').forEach(el=>el.textContent=message)}
 function label(){return ({disconnected:'Connect devices',connecting:'Connecting…',syncing:'Syncing…',synced:'Synced',pending:'Saved · sync pending',offline:'Offline · saved',error:'Sync needs attention',conflict:'Review device changes',paused:'Sync paused'})[state]||'Saved here'}
 function persist(){if(session)localStorage.setItem(sessionKey,JSON.stringify(session));else localStorage.removeItem(sessionKey)}
 function schedule(delay=600){clearTimeout(timer);if(!paused&&session&&!conflict)timer=setTimeout(()=>sync(),delay)}
 function localChanged(){if(!session)return;generation++;dirty=true;status(navigator.onLine?'pending':'offline',navigator.onLine?'Changes saved on this device · syncing shortly':'Offline · changes stay on this device until you reconnect');schedule()}
 async function api(method,body,connection=session?.connection){
  if(!connection)throw Error('Connect this device first.');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(connection.endpoint+'/v1/workspaces/'+connection.id,{method,headers:{Authorization:'Bearer '+connection.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});let value;try{value=await r.json()}catch{throw Error('The sync service did not return a valid response.')};if(r.status===409){const err=Error('Another device saved first.');err.conflict=true;throw err}if(!r.ok)throw Error(value.error||'Sync is temporarily unavailable.');return value}finally{clearTimeout(timeout)}
 }
 function apply(db){ctx.applyRemote(db);dirty=false}
 async function sync(choices){
  if(!session||paused||busy||conflict&&!choices)return;
  if(!navigator.onLine){status('offline','Offline · saved changes will sync when you reconnect');return}
  if($('#modal')?.open&&!choices){schedule(2500);return}
  busy=true;status('syncing','Checking and saving encrypted changes…');
  try{
   for(let attempt=0;attempt<3;attempt++){
    const savedGeneration=generation,remote=await api('GET'),remoteDb=remote.payload?await unseal(remote.payload,session.connection.key,session.connection.id):blank(),local=structuredClone(ctx.getDb()),base=session.base||blank();
    if(choices&&conflict&&!equalWorkspace(remoteDb,conflict.remote)){choices=null;conflict=null;status('connecting','The other device changed again. Checking the latest details…')}
    const result=mergeWorkspaces(base,local,remoteDb,choices||{});
    if(result.conflicts.length){conflict={base,local,remote:remoteDb,revision:remote.revision,items:result.conflicts};status('conflict','Both devices changed the same record. Choose which details to keep.');render();return}
    const merged=result.db;
    if(equalWorkspace(merged,remoteDb)){
     if(generation!==savedGeneration){dirty=true;continue}
     if(!equalWorkspace(local,merged))apply(merged);
     session.base=merged;session.revision=remote.revision;session.lastSync=new Date().toISOString();lastSync=session.lastSync;persist();dirty=false;conflict=null;status('synced','Saved changes are up to date in your synced workspace');if(!equalWorkspace(local,merged)||choices)render();return;
    }
    const encrypted=await seal(merged,session.connection.key,session.connection.id);
    let pushed;try{pushed=await api('PUT',{revision:remote.revision,payload:encrypted})}catch(err){if(err.conflict)continue;throw err}
    session.base=merged;session.revision=pushed.revision;session.lastSync=new Date().toISOString();lastSync=session.lastSync;persist();conflict=null;
    if(generation===savedGeneration){if(!equalWorkspace(ctx.getDb(),merged))apply(merged);dirty=false;status('synced','Saved changes are up to date in your synced workspace');if(!equalWorkspace(local,merged)||choices)render();return}
    dirty=true;status('pending','New changes saved here · syncing next');
   }
   status('pending','The other device is active · changes are safe here and will retry');schedule(2000);
  }catch(err){status(navigator.onLine?'error':'offline',err.name==='AbortError'?'Sync timed out · records are saved here':err.message+' Your local records are kept.')}finally{busy=false;if(dirty&&!conflict&&state!=='error')schedule(1200)}
 }
 async function connect(code){
  if(ctx.demo||ctx.getDb().demo)throw Error('Use your real workspace to connect devices. Sample data stays separate.');
  if(!endpoint)throw Error('Device sync is not configured in this build. Your local records are saved.');
  const connection=parseConnection(code,endpoint),remote=await api('GET',null,connection),remoteDb=remote.payload?await unseal(remote.payload,connection.key,connection.id):blank(),local=ctx.getDb();
  // Joining a workspace imports remote records and retains unique local records.
  // Existing identical IDs with different values are reviewed, never overwritten.
  const result=mergeWorkspaces(blank(),local,remoteDb);
  localStorage.setItem(ctx.key+'-before-sync',JSON.stringify(local));
  session={connection,revision:remote.revision,base:blank(),lastSync:''};persist();dirty=true;generation++;
  if(result.conflicts.length){conflict={base:blank(),local:structuredClone(local),remote:remoteDb,revision:remote.revision,items:result.conflicts};status('conflict','Some settings or records differ. Choose which version to keep.');render();return}
  // Set the observed remote snapshot as the merge baseline only after the join
  // has been validated and committed locally.
  apply(result.db);session.base=remoteDb;persist();dirty=!equalWorkspace(result.db,remoteDb);status('connecting','Connecting this device…');render();await sync();
 }
 async function create(){
  if(ctx.demo||ctx.getDb().demo)throw Error('Use your real workspace to connect devices. Sample data stays separate.');
  if(!endpoint)throw Error('Device sync is unavailable. Your local records are saved.');
  const pendingKey=sessionKey+'-pending-setup';let connection;
  try{connection=parseConnection(localStorage.getItem(pendingKey)||'',endpoint)}catch{connection={id:randomSecret(),token:randomSecret(),key:randomSecret(),endpoint};localStorage.setItem(pendingKey,connectionCode(connection))}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(endpoint+'/v1/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:connection.id,tokenHash:await tokenHash(connection.token)}),signal:controller.signal});
   const value=await response.json();if(!response.ok)throw Error(value.error||'Sync setup is unavailable right now.');
   await connect(connectionCode(connection));localStorage.removeItem(pendingKey);toast('Your private workspace is connected. Use Connect another device on your iPad or iPhone.');
  }finally{clearTimeout(timeout)}
 }
 function view(){
  if(ctx.demo||ctx.getDb().demo)return `<article class="panel sync-panel"><p class="eyebrow">ONE BUSINESS · BOTH DEVICES</p><h2>Device sync</h2><p>The full app gives each business its own private workspace. Create it once, then connect your iPhone and iPad with your private link.</p><p>Sample records stay separate and do not upload to a private workspace.${ctx.demo?' This public demo resets on reload.':' Leave the sample workspace to connect your own records.'}</p></article>`;
  const current=session?`<div class="sync-current"><strong data-sync-state data-state="${state}">${esc(label())}</strong><p data-sync-message>${esc(message)}</p>${lastSync?`<small>Last checked ${esc(new Date(lastSync).toLocaleString('en-US'))}</small>`:''}</div><div class="quick-actions">${btn('Sync now','sync-now','primary')}${btn('Connect another device','sync-share','secondary')}${btn('Disconnect this device','sync-disconnect','text')}</div>`:`<div class="sync-current"><strong>Connect your iPhone and iPad</strong><p>Create your private workspace on the first device, then connect your other device with its private link. You only need to do this once.</p></div><div class="quick-actions">${btn('Create my private workspace','sync-create','primary')}</div><p>Already connected on another device? Paste its private code or link below.</p><form id="connectDevicesForm"><label>Private connection code or link<textarea name="code" required spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste the code from your other device" maxlength="1600">${esc(pendingCode)}</textarea></label><p class="form-error" role="alert"></p><button class="primary">Connect this device</button></form>`;
  const problems=conflict?`<form id="syncConflictForm"><h3>Keep the right details</h3><p>Both devices changed these records. Your records remain saved here while you choose.</p>${conflict.items.map((c,i)=>`<section class="sync-conflict"><h3>${esc(c.local?.name||c.remote?.name||c.key)}</h3><div class="sync-conflict-choices">${[['local','This device',c.local],['remote','Other device',c.remote]].map(([value,label,record])=>`<label><input type="radio" name="choice${i}" value="${value}" required><span><b>${label}</b><pre>${esc(record===undefined?'Deleted record':JSON.stringify(record,null,2))}</pre></span></label>`).join('')}</div></section>`).join('')}<p class="form-error" role="alert"></p><button class="primary">Save choices and sync</button><div class="quick-actions">${btn('Export this device’s backup','export','secondary')}</div></form>`:'';
  return `<article class="panel sync-panel"><p class="eyebrow">ONE BUSINESS · BOTH DEVICES</p><h2>Device sync</h2><p>Add stock on your iPad. Check orders on your iPhone. Connected devices automatically share saved changes while you’re online.</p>${current}${problems}<details class="space"><summary>How this works</summary><ol><li>On your first device, choose Create my private workspace. Your existing records stay with you.</li><li>Choose Connect another device and copy the private link.</li><li>Open that link on your other device, then connect.</li></ol><p class="sync-privacy">Records are encrypted on your device before reaching the sync service. Anyone with your private link can connect, so keep it private. No app email account or payment details are required.</p><p class="sync-privacy">Offline changes stay on the device and sync when it reconnects. On iPhone and iPad, use the same installed app or Safari workspace consistently. Browsers and Home Screen installs can have separate local storage; connect each one you use.</p><p class="sync-privacy">A backup contains your business records, not your connection key. Keep a separate copy of your private code so you can reconnect after clearing browser storage.</p></details></article>`;
 }
 function share(){
  if(!session)return;const code=connectionCode(session.connection),link=location.origin+location.pathname+'#connect='+encodeURIComponent(code);
  modal(`<div class="modal-head"><h2>Connect another device</h2>${btn('×','close','icon','type="button" aria-label="Close"')}</div><p>Open this private link on your other device. Anyone with it can read and change this workspace.</p><div class="quick-actions">${btn('Copy private link','sync-copy','primary')}</div><label>Private connection code<textarea id="privateSyncCode" readonly spellcheck="false">${esc(code)}</textarea></label><details><summary>Private QR code</summary><div id="deviceSyncQR"></div></details><p class="sync-privacy">Keep this code separate from your exported backups.</p>`);
  $('#privateSyncCode').style.width='100%';
  document.querySelector('[data-action="sync-copy"]').onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Private link copied. Open it on your other device.')}catch{$('#privateSyncCode').select();toast('Select and copy the connection code.')}};
  try{const qr=window.qrcode(0,'M');qr.addData(link);qr.make();$('#deviceSyncQR').innerHTML=qr.createSvgTag({cellSize:3,margin:15,scalable:true});$('#deviceSyncQR svg').style.maxWidth='250px'}catch{$('#deviceSyncQR').textContent='Use the copy button or connection code.'}
 }
 function bind(){
  $('#connectDevicesForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button'),error=form.querySelector('.form-error');button.disabled=true;error.textContent='';try{await connect(new FormData(form).get('code'));toast('Device connected. Saved changes sync automatically.')}catch(err){error.textContent=err.message}finally{button.disabled=false}});
  $('#syncConflictForm')?.addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.target),choices={};conflict.items.forEach((c,i)=>choices[c.key]=data.get('choice'+i));try{const check=mergeWorkspaces(conflict.base,conflict.local,conflict.remote,choices);if(check.conflicts.length)throw Error('Choose a version for each record.');await sync(choices);if(state==='error')e.target.querySelector('.form-error').textContent=message}catch(err){e.target.querySelector('.form-error').textContent=err.message}});
 }
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='sync-create'){b.disabled=true;try{await create()}catch(err){toast(err.name==='AbortError'?'Setup timed out. Your records are saved here. Try again.':err.message)}finally{b.disabled=false}}if(b.dataset.action==='sync-now')await sync();if(b.dataset.action==='sync-share')share();if(b.dataset.action==='sync-disconnect'){if(!await ctx.ask('Disconnect this device? Its business records stay here. The other device keeps syncing.'))return;session=null;conflict=null;clearTimeout(timer);persist();status('disconnected','Disconnected · records saved on this device');render()}});
 window.addEventListener('online',()=>schedule(0));window.addEventListener('offline',()=>{if(session)status('offline','Offline · saved changes will sync when you reconnect')});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0)});setInterval(()=>{if(document.visibilityState==='visible'&&session&&!paused&&!conflict)sync()},20000);
 function init(){const raw=location.hash.startsWith('#connect=')?location.hash.slice(9):'';if(raw){try{pendingCode=decodeURIComponent(raw)}catch{}history.replaceState(null,'',location.pathname+location.search+'#device-sync');ctx.go('device-sync')}if(session)schedule(100)}
 return {view,bind,init,localChanged,connect,create,sync,get connected(){return !!session},get message(){return message},get state(){return state},label,pause(value){paused=value;if(value){clearTimeout(timer);status('paused','Sync paused while sample data is open')}else{status('pending','Checking your real workspace…');schedule(0)}}};
}
