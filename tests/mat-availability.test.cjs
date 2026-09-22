const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/mat-availability.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject });
const { getMatAvailability } = exportsObject;
const order = (id, name = 'Whatupdoe', quantity = 1, status = 'pending', items) => ({
  id, orderNumber: id, customer: 'Test', item: name, quantity, status,
  orderDate: `2026-09-${id === 'old' ? '01' : '02'}T12:00:00Z`, items,
});

test('matching printed stock covers orders even with zero blanks', () => {
  const result = getMatAvailability([order('one')], 0, [{ design_key: 'whatupdoe', quantity: 1 }]);
  assert.equal(result.blockedOrderIds.size, 0);
  assert.equal(result.blankDemand, 0);
});

test('wrong-design stock cannot cover a pending order', () => {
  const result = getMatAvailability([order('one')], 0, [{ design_key: 'marsh-supply', quantity: 40 }]);
  assert.equal(result.blockedOrderIds.size, 1);
  assert.equal(result.missingMats, 1);
  assert.equal(result.shortages[0].name, 'Whatupdoe');
});

test('shared stock is reserved oldest first, regardless of input order', () => {
  const result = getMatAvailability([order('new'), order('old')], 0, [{ design_key: 'whatupdoe', quantity: 1 }]);
  assert.equal(result.blockedOrderIds.has('new'), true);
  assert.equal(result.blockedOrderIds.has('old'), false);
  assert.equal(result.missingMats, 1);
});

test('printed and blank mats combine without double-counting blank commitments', () => {
  const result = getMatAvailability([order('one', 'Whatupdoe', 3)], 2, [{ design_key: 'whatupdoe', quantity: 2 }]);
  assert.equal(result.blockedOrderIds.size, 0);
  assert.equal(result.blankDemand, 1);
  assert.equal(result.availableBlanks, 1);
});

test('multi-design shortages count an order once and exclude discounts', () => {
  const result = getMatAvailability([order('one', '', 5, 'pending', [
    { name: 'Whatupdoe', quantity: 3 },
    { name: 'Did You Call First?', quantity: 2 },
    { name: 'Marsh Supply discount', quantity: 1 },
  ])], 1, [{ design_key: 'whatupdoe', quantity: 1 }]);
  assert.equal(result.blockedOrderIds.size, 1);
  assert.equal(result.missingMats, 3);
  assert.equal(result.shortages.length, 2);
});

test('shipped and delivered orders do not reserve pending stock', () => {
  const result = getMatAvailability([order('old', 'Whatupdoe', 20, 'shipped'), order('done', 'Whatupdoe', 20, 'delivered'), order('new')], 1, []);
  assert.equal(result.blockedOrderIds.size, 0);
  assert.equal(result.blankDemand, 1);
});

test('replenishment clears shortages and empty queues have no alert', () => {
  assert.equal(getMatAvailability([order('one', 'Whatupdoe', 2)], 0, []).blockedOrderIds.size, 1);
  assert.equal(getMatAvailability([order('one', 'Whatupdoe', 2)], 40, []).blockedOrderIds.size, 0);
  assert.equal(getMatAvailability([], 0, []).blockedOrderIds.size, 0);
});
