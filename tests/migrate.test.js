const test = require('node:test');
const assert = require('node:assert');
const { transform } = require('../scripts/migrate-b-to-c');

test('B -> C conversion: history moves into the record, nothing else changes, input untouched', () => {
  const rec = { id: 'r_cafe', slug: 'cafe', name: 'Café ☕ قهوة', _ver: 7, data: { settings: { name: 'x' }, history: [], items: [{ id: 'i1' }] } };
  const hist = [{ closedAt: 20, total: 2 }, { closedAt: 10, total: 1 }];
  const out = transform(rec, hist);
  assert.deepEqual(out.data.history.map((h) => h.total), [1, 2], 'sorted by time');
  assert.equal(out._ver, undefined); assert.equal(out.name, 'Café ☕ قهوة'); assert.deepEqual(out.data.items, [{ id: 'i1' }]); assert.equal(out.id, 'r_cafe');
  assert.equal(rec._ver, 7); assert.deepEqual(rec.data.history, [], 'original not modified');
  assert.deepEqual(transform({ id: 'x', slug: 'x' }, undefined).data.history, [], 'works for a record with no data or history');
});
