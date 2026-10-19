const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/fulfillment-timing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exports_});
const {fulfillmentTiming}=exports_;
const now=Date.parse('2026-10-18T12:00:00Z');
const base={orderDate:'2026-10-10T12:00:00Z',shipDate:'2026-10-12T12:00:00Z',status:'delivered',tracking:{deliveredAt:'2026-10-15T12:00:00Z'}};
test('averages order milestones independently and ages pending orders including holds',()=>{
 const result=fulfillmentTiming([base,{...base,status:'shipped',shipDate:'2026-10-14T12:00:00Z'},{...base,status:'pending',shipDate:'2026-10-12T12:00:00Z'}],now);
 assert.equal(result.fulfillment.days,3);assert.equal(result.fulfillment.count,2);
 assert.equal(result.delivery.days,5);assert.equal(result.transit.days,3);
 assert.equal(result.pending.days,8);assert.equal(result.oldestPending,8);
});
test('does not treat missing dates, ETAs, reversed or future milestones as zero-day completions',()=>{
 const result=fulfillmentTiming([
  {...base,orderDate:'invalid'},
  {...base,shipDate:'2026-10-09T12:00:00Z',tracking:undefined},
  {...base,shipDate:'2026-10-19T12:00:00Z',tracking:undefined},
  {...base,tracking:{etaStart:'2026-10-15T12:00:00Z'}},
  {...base,shipDate:'2026-10-16T12:00:00Z'},
  {...base,status:'pending',orderDate:'2026-10-19T12:00:00Z'}
 ],now);
 assert.equal(result.delivery.count,0);assert.equal(result.transit.count,0);
 assert.equal(result.pending.count,0);assert.equal(result.pending.days,null);
 assert.equal(fulfillmentTiming([],now).fulfillment.days,null);
});
test('delivery can use confirmed dates without a ship date and true same-day durations stay zero',()=>{
 const result=fulfillmentTiming([{...base,shipDate:undefined},{...base,shipDate:base.orderDate,tracking:{deliveredAt:base.orderDate}}],now);
 assert.equal(result.fulfillment.days,0);assert.equal(result.fulfillment.count,1);
 assert.equal(result.delivery.days,2.5);assert.equal(result.delivery.count,2);
 assert.equal(result.transit.days,0);assert.equal(result.transit.count,1);
});
