const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, Response, Request, Date, require: name => {
    if (name in dependencies) return dependencies[name];
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  return exports;
}
const permissions = load('lib/portal-permissions.ts');
const anthony = { userId: 'faee73b9-e4ff-458d-97cf-114a8a11ea45', name: 'Anthony', role: 'admin', mustChangePin: false };
const otherAdmin = { ...anthony, userId: 'other-admin', name: 'Anthony' };

test('owner permission requires the verified account, active admin session, and completed PIN change', () => {
  assert.equal(permissions.isAnthony(anthony), true);
  assert.equal(permissions.isAnthony(otherAdmin), false);
  assert.equal(permissions.isAnthony({ ...anthony, role: 'partner' }), false);
  assert.equal(permissions.isAnthony({ ...anthony, mustChangePin: true }), false);
  assert.equal(permissions.isAnthony(null), false);
});

function routes(session) {
  const writes = [];
  const db = {
    from: table => ({ delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => {
      writes.push(table); return { data: { id: 'ledger-record' }, error: null };
    } }) }) }) }),
    rpc: async (name, args) => { writes.push({ name, args }); return { data: { id: args.p_id }, error: null }; },
  };
  const deps = {
    '@/lib/auth': { getPortalSession: async () => session },
    '@/lib/portal-permissions': permissions,
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/inbound-tracking': {},
  };
  return { writes, operations: load('app/api/operations/route.ts', deps), defects: load('app/api/defective-mats/route.ts', deps) };
}
const request = (method, body) => new Request('https://portal.test/api', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

for (const type of ['payment', 'charge']) {
  test(`another admin cannot delete a ${type}, including by spoofing Anthony in the body`, async () => {
    const { operations, writes } = routes(otherAdmin);
    const response = await operations.DELETE(request('DELETE', { type, id: 'ledger-record', userId: anthony.userId }));
    assert.equal(response.status, 403);
    assert.equal(writes.length, 0);
  });
  test(`Anthony can delete a ${type}`, async () => {
    const { operations, writes } = routes(anthony);
    assert.equal((await operations.DELETE(request('DELETE', { type, id: 'ledger-record' }))).status, 200);
    assert.equal(writes[0], type === 'payment' ? 'marsh_payments' : 'marsh_charges');
  });
}

test('another admin cannot create defective mats or trigger inventory deductions', async () => {
  const { defects, writes } = routes(otherAdmin);
  assert.equal((await defects.POST(request('POST', { userId: anthony.userId }))).status, 403);
  assert.equal(writes.length, 0);
});

test('Anthony can record defective mats using his authenticated identity', async () => {
  const { defects, writes } = routes(anthony);
  const response = await defects.POST(request('POST', { id: 'aabbccdd-1234-4234-8234-123456789abc', quantity: 2, reason: 'Damaged backing', receivedDate: '2026-10-08', removeInventory: true }));
  assert.equal(response.status, 200);
  assert.equal(writes[0].name, 'record_marsh_defective_mats');
  assert.equal(writes[0].args.p_actor, anthony.userId);
});

test('signed-out users cannot delete ledger entries or add defective mats', async () => {
  const { operations, defects, writes } = routes(null);
  assert.equal((await operations.DELETE(request('DELETE', { type: 'payment', id: 'ledger-record' }))).status, 401);
  assert.equal((await defects.POST(request('POST', {}))).status, 401);
  assert.equal(writes.length, 0);
});
