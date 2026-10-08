const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name],console,Response});return exports}
test('shipment reconciliation uses existing order IDs and ignores unshipped and pre-cutoff orders',async()=>{
 let call;const {syncMarshShipmentInventory}=load('lib/marsh-shipment-inventory.ts',{'./mat-availability':{designKey:()=> 'whatupdoe'},'./supabase-admin':{getSupabaseAdmin:()=>({rpc:async(name,args)=>{call=args;return {data:{processedShipments:1}}}})}});
 const order={id:'427810423',quantity:2,status:'shipped',shipDate:'2026-10-08T12:00:00Z',item:'Whatupdoe'};
 await syncMarshShipmentInventory([order,{...order,id:'pending',status:'pending'},{...order,id:'old',shipDate:'2026-09-01T12:00:00Z'}]);
 assert.equal(call.p_shipments.length,1);assert.equal(call.p_shipments[0].id,'427810423');assert.equal(call.p_shipments[0].designs[0].quantity,2);
});
test('inventory sync cannot apply client-invented shipments',async()=>{
 const trusted=[{id:'trusted'}];let synced;
 const {POST}=load('app/api/inventory/route.ts',{'@/lib/auth':{getPortalSession:async()=>({role:'partner'})},'@/lib/supabase-admin':{},'@/lib/shipstation':{getShipStationOrders:async()=>({orders:trusted,connected:true})},'@/lib/marsh-shipment-inventory':{syncMarshShipmentInventory:async orders=>{synced=orders;return {ok:true}}}});
 const result=await POST({json:async()=>({shipments:[{id:'invented',units:999}]})});assert.equal(result.status,200);assert.equal(synced,trusted);
});
