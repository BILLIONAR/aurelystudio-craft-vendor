import {collections,blank} from './model.js';
import {validateBusiness,assertMergeStock} from './business-model.js';

const encoder=new TextEncoder(),decoder=new TextDecoder();
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
export const base64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
export const unbase64=s=>{if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid connection code.');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))};
export const randomSecret=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function tokenHash(token){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))))}
export function connectionCode(c){return 'AURELY3.'+base64url(encoder.encode(JSON.stringify({id:c.id,token:c.token,key:c.key,endpoint:c.endpoint})))}
export function parseConnection(value,expectedEndpoint){
 let code=String(value||'').trim();
 if(code.includes('#connect='))code=decodeURIComponent(code.split('#connect=')[1]);
 if(!code.startsWith('AURELY3.')||code.length>1500)throw Error('Use the connection code or private link supplied with your app.');
 let c;try{c=JSON.parse(decoder.decode(unbase64(code.slice(8))))}catch{throw Error('The connection code is incomplete. Copy it again.')}
 const endpoint=String(c.endpoint||'').replace(/\/$/,'');
 if(endpoint!==expectedEndpoint.replace(/\/$/,''))throw Error('This code belongs to a different app service.');
 if(!/^[a-zA-Z0-9_-]{20,64}$/.test(c.id)||![c.token,c.key].every(s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(s)))throw Error('Invalid connection code.');
 if(unbase64(c.key).length!==32)throw Error('Invalid encryption key.');
 return {id:c.id,token:c.token,key:c.key,endpoint};
}
async function aesKey(key){return crypto.subtle.importKey('raw',unbase64(key),'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(db,key,id){
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=encoder.encode(JSON.stringify(db));
 if(data.length>600000)throw Error('This workspace is too large to sync. Export a backup and remove unused image data. Your local records are safe.');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('AurelyStudio/v3/'+id)},await aesKey(key),data));
 return {format:1,iv:base64url(iv),data:base64url(ciphertext)};
}
export async function unseal(envelope,key,id){
 if(!envelope||envelope.format!==1||typeof envelope.data!=='string'||typeof envelope.iv!=='string')throw Error('The synced data format is invalid.');
 let bytes;try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv),additionalData:encoder.encode('AurelyStudio/v3/'+id)},await aesKey(key),unbase64(envelope.data))}catch{throw Error('The connection key cannot unlock this workspace. Check your private code.')}
 return validateBusiness(JSON.parse(decoder.decode(bytes)));
}
export function mergeWorkspaces(base,local,remote,choices={}){
 const conflicts=[],merged={...remote};
 const pick=(key,a,l,r)=>{
  if(same(l,r)||same(l,a))return structuredClone(r);
  if(same(r,a))return structuredClone(l);
  if(choices[key]==='local')return structuredClone(l);
  if(choices[key]==='remote')return structuredClone(r);
  conflicts.push({key,base:a,local:l,remote:r});return structuredClone(r);
 };
 const allFields=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
 for(const field of allFields){
  if(collections.includes(field)){
   const a=new Map((base[field]||[]).map(r=>[r.id,r])),l=new Map((local[field]||[]).map(r=>[r.id,r])),r=new Map((remote[field]||[]).map(r=>[r.id,r]));
   merged[field]=[];for(const id of new Set([...r.keys(),...l.keys(),...a.keys()])){const v=pick(field+'/'+id,a.get(id),l.get(id),r.get(id));if(v!==undefined)merged[field].push(v)}
  }else if(field==='settings'){
   merged.settings={};for(const k of new Set([...Object.keys(base.settings||{}),...Object.keys(local.settings||{}),...Object.keys(remote.settings||{})])){const v=pick('settings/'+k,base.settings?.[k],local.settings?.[k],remote.settings?.[k]);if(v!==undefined)merged.settings[k]=v}
  }else if(!['version','demo'].includes(field)){const v=pick(field,base[field],local[field],remote[field]);if(v!==undefined)merged[field]=v}
 }
 merged.version=3;delete merged.demo;
 if(!conflicts.length){validateBusiness(merged);assertMergeStock(base,merged)}
 return {db:merged,conflicts};
}
export const equalWorkspace=same;
export const emptyWorkspace=()=>blank();
