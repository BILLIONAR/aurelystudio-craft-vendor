// Each business creates its own random private workspace. Only an auth hash and
// encrypted snapshots reach D1; there is no workspace or token discovery API.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function hash(token){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function validEnvelope(p){return p?.format===1&&/^[A-Za-z0-9_-]{16}$/.test(p.iv||'')&&typeof p.data==='string'&&p.data.length>20&&p.data.length<=810000&&/^[A-Za-z0-9_-]+$/.test(p.data)}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const headers={'Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};
  if(origin){if(!allowed.includes(origin))return json({error:'Origin not allowed.'},403);headers['Access-Control-Allow-Origin']=origin}
  const respond=(body,status=200)=>{const response=json(body,status);Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return respond({service:'AurelyStudio encrypted sync',version:3});
  if(path==='/v1/workspaces'&&request.method==='POST'){
   if(!origin||!allowed.includes(origin))return respond({error:'Open Device Sync in your AurelyStudio app.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond({error:'Use JSON.'},415);
   try{
    if(!env.ENROLL_RATE)return respond({error:'Sync setup is temporarily unavailable. Your local records are safe.'},503);
    const {success}=await env.ENROLL_RATE.limit({key:request.headers.get('CF-Connecting-IP')||'local-setup'});
    if(!success)return respond({error:'Please wait a minute before creating another workspace.'},429);
    const reader=request.body?.getReader();if(!reader)return respond({error:'Missing setup details.'},400);
    let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return respond({error:'Setup request is too large.'},413)}chunks.push(value)}
    let body;try{const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}body=JSON.parse(new TextDecoder().decode(data))}catch{return respond({error:'Invalid setup details.'},400)}
    if(!/^[A-Za-z0-9_-]{43}$/.test(body.id||'')||!/^[A-Za-z0-9_-]{43}$/.test(body.tokenHash||'')||Object.keys(body).some(k=>!['id','tokenHash'].includes(k)))return respond({error:'Invalid private workspace details.'},400);
    const existing=await env.DB.prepare('SELECT token_hash FROM workspaces WHERE id = ?').bind(body.id).first();
    if(existing)return existing.token_hash===body.tokenHash?respond({created:true},200):respond({error:'Please create a new private workspace.'},409);
    const maximum=Number(env.MAX_WORKSPACES||500);
    const row=await env.DB.prepare('INSERT INTO workspaces (id,token_hash) SELECT ?,? WHERE (SELECT count(*) FROM workspaces) < ? RETURNING id').bind(body.id,body.tokenHash,maximum).first();
    if(!row)return respond({error:'Sync setup is temporarily unavailable. Your records are saved here; contact AurelyStudio for help.'},503);
    return respond({created:true},201);
   }catch{return respond({error:'Sync setup is temporarily unavailable. Records remain saved on your device.'},503)}
  }
  const match=path.match(/^\/v1\/workspaces\/([A-Za-z0-9_-]{20,64})$/);
  if(!match)return respond({error:'Not found.'},404);
  if(!['GET','PUT'].includes(request.method))return respond({error:'Method not allowed.'},405);
  const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token)return respond({error:'A private connection code is required.'},401);
  try{
   const id=match[1],tokenHash=await hash(token),row=await env.DB.prepare('SELECT revision,payload,updated_at FROM workspaces WHERE id = ? AND token_hash = ?').bind(id,tokenHash).first();
   if(!row)return respond({error:'Connection code not recognized.'},401);
   if(request.method==='GET')return respond({revision:row.revision,payload:row.payload?JSON.parse(row.payload):null,updatedAt:row.updated_at});
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond({error:'Use JSON.'},415);
   if(Number(request.headers.get('Content-Length')||0)>820000)return respond({error:'Workspace exceeds the sync size limit.'},413);
   const reader=request.body?.getReader();if(!reader)return respond({error:'Missing body.'},400);
   let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>820000){await reader.cancel();return respond({error:'Workspace exceeds the sync size limit.'},413)}chunks.push(value)}
   let body;try{const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}body=JSON.parse(new TextDecoder().decode(data))}catch{return respond({error:'Invalid JSON.'},400)}
   if(!Number.isSafeInteger(body.revision)||body.revision<0||!validEnvelope(body.payload))return respond({error:'Invalid encrypted snapshot.'},400);
   const payload=JSON.stringify(body.payload);
   const result=await env.DB.prepare("UPDATE workspaces SET payload = ?,revision = revision + 1,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND token_hash = ? AND revision = ? RETURNING revision,updated_at").bind(payload,id,tokenHash,body.revision).first();
   if(!result)return respond({error:'Another device saved first. Fetch the current revision and merge.'},409);
   return respond({revision:result.revision,updatedAt:result.updated_at});
  }catch{return respond({error:'Sync is temporarily unavailable. Records remain saved on your device.'},503)}
 }
};
