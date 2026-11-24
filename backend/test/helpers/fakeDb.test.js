const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('./fakeDb');

test('fakeDb returns the queued recordset and records the call', async () => {
    const db = createFakeDb([{ recordset: [{ lot_no: 'L1' }] }]);
    const out = await db.query('SELECT 1', { a: 1 });
    assert.deepStrictEqual(out.recordset, [{ lot_no: 'L1' }]);
    assert.strictEqual(db.calls.length, 1);
    assert.strictEqual(db.calls[0].sql, 'SELECT 1');
    assert.deepStrictEqual(db.calls[0].params, { a: 1 });
});

test('fakeDb throws when a query is made with no queued response', async () => {
    const db = createFakeDb([]);
    await assert.rejects(() => db.query('SELECT 1'), /no queued response/);
});

test('fakeDb transaction runs the callback and records calls', async () => {
    const db = createFakeDb([{ recordset: [] }]);
    const out = await db.transaction(async (tx) => {
        await tx.query('SELECT 1');
        return 'done';
    });
    assert.strictEqual(out, 'done');
    assert.strictEqual(db.calls.length, 1);
});
