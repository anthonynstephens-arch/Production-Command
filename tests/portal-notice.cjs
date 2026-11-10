const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let session = { userId: 'user-1', role: 'admin' };
let notice = null;
const acknowledgments = new Set();
const db = { from(table) {
 const filters = {}; let action = 'select', values;
 const query = {
  select() { return query; }, eq(k,v) { filters[k]=v; return query; },
  insert(v) { action='insert'; values=v; return query; },
  update(v) { action='update'; values=v; return query; },
  upsert(v) { action='upsert'; values=v; return query; },
  maybeSingle() { return query; }, single() { return query; },
  then(resolve) {
   if(table === 'marsh_portal_notice') {
    if(action==='insert') notice=values;
    if(action==='update' && notice?.revision===filters.revision) notice=values;
    return Promise.resolve({data:notice,error:null}).then(resolve);
   }
   if(action==='upsert') acknowledgments.add(`${values.revision}:${values.user_id}`);
   return Promise.resolve({data:acknowledgments.has(`${filters.revision}:${filters.user_id}`)?{user_id:filters.user_id}:null,error:null}).then(resolve);
  }
 }; return query;
}};
const exportsObj = {};
const compiled = ts.transpileModule(fs.readFileSync('app/api/portal-notice/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(compiled,{exports:exportsObj,Response,Date,require(name){if(name==='crypto')return require('node:crypto');if(name==='@/lib/auth')return{getPortalSession:async()=>session};if(name==='@/lib/supabase-admin')return{getSupabaseAdmin:()=>db};throw Error(name);}});
const req = body => new Request('https://portal.test/api/portal-notice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 session=null;assert.equal((await exportsObj.GET()).status,401);
 session={userId:'user-1',role:'partner'};assert.equal((await exportsObj.PUT(req({enabled:true,title:'Hi',message:'Read me'}))).status,403);
 session={userId:'user-1',role:'admin'};assert.equal((await exportsObj.PUT(req({enabled:true,title:'',message:''}))).status,400);
 assert.equal((await exportsObj.PUT(req({enabled:true,title:'Notice',message:'Read me',expectedRevision:null}))).status,200);
 const first=notice.revision;
 assert.equal((await (await exportsObj.GET()).json()).acknowledged,false);
 assert.equal((await exportsObj.POST(req({revision:first,acknowledged:false}))).status,409);
 assert.equal((await exportsObj.POST(req({revision:first,acknowledged:true}))).status,200);
 assert.equal((await (await exportsObj.GET()).json()).acknowledged,true);
 session={userId:'user-2',role:'partner'};assert.equal((await (await exportsObj.GET()).json()).acknowledged,false);
 session={userId:'user-1',role:'admin'};
 assert.equal((await exportsObj.PUT(req({enabled:true,title:'Updated notice',message:'New message',expectedRevision:first}))).status,200);
 assert.notEqual(notice.revision,first);
 assert.equal((await (await exportsObj.GET()).json()).acknowledged,false);
 assert.equal((await exportsObj.POST(req({revision:first,acknowledged:true}))).status,409);
 assert.equal((await exportsObj.PUT(req({enabled:true,title:'Stale',message:'Stale',expectedRevision:first}))).status,409);
 assert.equal((await exportsObj.PUT(req({enabled:false,title:'Updated notice',message:'New message',expectedRevision:notice.revision}))).status,200);
 assert.equal((await (await exportsObj.GET()).json()).notice.enabled,false);
 console.log('Passed: unauthenticated access, admin-only editing, required content, per-user acknowledgment, revision renewal, stale requests, disable.');
})().catch(e=>{console.error(e);process.exitCode=1});
