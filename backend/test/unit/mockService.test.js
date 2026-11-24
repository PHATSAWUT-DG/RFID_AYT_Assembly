const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('../helpers/fakeDb');
const { listMockDone, addMockDone, removeMockDone } = require('../../services/mockService');

test('listMockDone returns rows newest first', async () => {
    const db = createFakeDb([{ recordset: [{ lot_no: 'L2' }, { lot_no: 'L1' }] }]);
    const rows = await listMockDone(db);
    assert.strictEqual(rows.length, 2);
    assert.match(db.calls[0].sql, /ORDER BY created_at DESC/);
});

test('addMockDone reports a duplicate without inserting', async () => {
    const db = createFakeDb([{ recordset: [{ n: 1 }] }]);
    assert.deepStrictEqual(await addMockDone(db, 'L1'), { result: 'ALREADY_EXISTS' });
    assert.strictEqual(db.calls.length, 1);
});

test('addMockDone inserts when the lot is new', async () => {
    const db = createFakeDb([{ recordset: [] }, { rowsAffected: [1] }]);
    assert.deepStrictEqual(await addMockDone(db, 'L1'), { result: 'OK' });
    assert.match(db.calls[1].sql, /INSERT INTO tb_assy_mock_done/);
});

test('removeMockDone reports how many rows went', async () => {
    const db = createFakeDb([{ rowsAffected: [0] }]);
    assert.deepStrictEqual(await removeMockDone(db, 'L1'), { result: 'NOT_FOUND' });
});
